import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyPhysicalCommit, explainPhysicalCommit, type PhysicalCommit } from "../commit.ts";
import { planPhysicalShuffle } from "./mechanics.ts";
import {
  checkpoint,
  cut,
  drawSingle,
  drawWaiting,
  ejectSlip,
  legacyShuffleEndpoint,
  motionShuffle,
  newState,
  putBackSingle,
  replayOperation,
  sampleHash,
  type PhysicalState,
} from "../state.ts";

function adapter(pg: PGlite) {
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  };
}

function commitOf(snapshot: PhysicalState, operation = snapshot.operations.at(-1)): PhysicalCommit {
  if (!operation) throw new Error("missing operation");
  return {
    deckId: snapshot.deckId,
    sessionId: snapshot.sessionId,
    expectedRevision: operation.revisionFrom,
    snapshot: checkpoint(snapshot),
    operation,
  };
}

async function database() {
  const pg = new PGlite();
  const root = new URL("../../../../migrations/", import.meta.url);
  await pg.exec(readFileSync(new URL("0013_physical_deck.sql", root), "utf8"));
  await pg.exec(readFileSync(new URL("0014_physical_deck_checkpoint.sql", root), "utf8"));
  await pg.exec(readFileSync(new URL("0015_physical_deck_spread.sql", root), "utf8"));
  return { pg, sql: adapter(pg) };
}

const pile = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110];

test("the server replays movements and keeps a legacy preparation beside them", async () => {
  const { pg, sql } = await database();
  const opened = newState(9, "motion-session", pile);
  const prepared = legacyShuffleEndpoint(opened, "prep", [...pile].reverse(), "initial_preparation", "system_initial_preparation");
  const trace = planPhysicalShuffle({
    style: "overhand",
    before: prepared.drawPile,
    packetSizes: [2, 3, 5],
    seed: 4,
    originalDeckCount: prepared.inventory.length,
  });
  const shuffled = motionShuffle(prepared, "motion-1", trace);
  assert.equal(shuffled.operations.at(-1)?.kind, "motion_shuffle");
  assert.equal(shuffled.operations.at(-1)?.meta.realizedOrder, undefined);
  const first = await applyPhysicalCommit(sql, "user-a", commitOf(prepared));
  const second = await applyPhysicalCommit(sql, "user-a", commitOf(shuffled));
  assert.equal(first.status, "saved");
  assert.equal(second.status, "saved");
  assert.equal((await applyPhysicalCommit(sql, "user-a", commitOf(shuffled))).status, "saved");

  const history = await sql.query<{ operation_json: string | { id: string } }>(
    "select operation_json from physical_deck_operations where session_id = $1 order by to_revision",
    ["motion-session"],
  );
  let cursor = newState(9, "motion-session", pile);
  for (const row of history) {
    const operation = typeof row.operation_json === "string" ? JSON.parse(row.operation_json) : row.operation_json;
    cursor = replayOperation(cursor, operation);
  }
  assert.deepEqual(cursor.drawPile, shuffled.drawPile);
  assert.equal(sampleHash(cursor), sampleHash(shuffled));
  assert.equal(cursor.operations[0]?.meta.attribution, "system_initial_preparation");
  assert.equal(cursor.operations.at(-1)?.kind, "motion_shuffle");

  const other = motionShuffle(newState(9, "other-session", pile), "motion-b", planPhysicalShuffle({
    style: "original",
    before: pile,
    ratio: 0.5,
    seed: 2,
    originalDeckCount: pile.length,
  }));
  await applyPhysicalCommit(sql, "user-b", commitOf(other));
  const visible = await sql.query<{ user_id: string }>(
    "select user_id from physical_deck_sessions where deck_id = $1 and active = true order by user_id",
    [9],
  );
  assert.deepEqual(visible.map((row) => row.user_id), ["user-a", "user-b"]);
  await pg.close();
});

test("forged movements, hashes, duplicate payloads, and revision jumps are rejected", async () => {
  const { pg, sql } = await database();
  const opened = newState(9, "forge-session", pile);
  const trace = planPhysicalShuffle({ style: "original", before: pile, ratio: 0.4, seed: 8, originalDeckCount: pile.length });
  const honest = motionShuffle(opened, "motion-forge", trace);
  assert.equal((await applyPhysicalCommit(sql, "user-a", commitOf(honest))).status, "saved");

  const forgedCards = structuredClone(commitOf(honest));
  const transfer = forgedCards.operation.meta.motion?.events.find((event) => event.kind === "transfer");
  assert.ok(transfer && transfer.kind === "transfer");
  transfer.cards[0] = 999;
  assert.match(explainPhysicalCommit(opened, forgedCards) ?? "", /packet/);
  forgedCards.operation = { ...forgedCards.operation, id: "motion-forged-cards" };
  assert.equal((await applyPhysicalCommit(sql, "user-a", { ...forgedCards, expectedRevision: honest.revision })).status, "conflict");

  const forgedOrder = structuredClone(commitOf(honest));
  assert.ok(forgedOrder.operation.meta.motion);
  forgedOrder.operation.meta.motion.afterOrder = [...pile];
  assert.match(explainPhysicalCommit(opened, forgedOrder) ?? "", /Claimed result/);

  const orderOnly = structuredClone(commitOf(honest));
  orderOnly.operation = {
    ...orderOnly.operation,
    meta: { style: "original", attribution: "user", source: "reader", realizedOrder: [...pile].reverse() },
  };
  assert.match(explainPhysicalCommit(opened, orderOnly) ?? "", /recorded movements/);

  const forgedHash = commitOf(honest);
  forgedHash.operation = { ...forgedHash.operation, afterHash: "0".repeat(64) };
  assert.match(explainPhysicalCommit(opened, forgedHash) ?? "", /does not match/);

  const changed = structuredClone(commitOf(honest));
  assert.ok(changed.operation.meta.motion);
  changed.operation.meta.motion.events[0]!.action = "replaced-action";
  assert.equal((await applyPhysicalCommit(sql, "user-a", changed)).status, "conflict");

  const jump = commitOf(motionShuffle(honest, "motion-next", planPhysicalShuffle({
    style: "hindu",
    before: honest.drawPile,
    packetSizes: [2, 2],
    seed: 3,
    originalDeckCount: honest.inventory.length,
  })));
  assert.equal((await applyPhysicalCommit(sql, "user-a", { ...jump, expectedRevision: 0 })).status, "conflict");
  await pg.close();
});

test("a shuffle after a draw or a slip moves only the remaining draw pile", () => {
  let state = newState(4, "partial", pile);
  state = drawWaiting(state, "wait-1");
  state = drawWaiting(state, "wait-2");
  const waiting = [...state.waitingStack];
  const trace = planPhysicalShuffle({
    style: "three_packet_cut",
    before: state.drawPile,
    cutPoints: [2, 5],
    pickupOrder: [2, 0, 1],
    turn: 1,
    seed: 6,
    originalDeckCount: state.inventory.length,
  });
  state = motionShuffle(state, "partial-shuffle", trace);
  assert.deepEqual(state.waitingStack, waiting);
  assert.deepEqual(state.drawPile, trace.afterOrder);
  assert.equal(state.drawPile.some((id) => waiting.includes(id)), false);
  assert.equal(state.mode, "collecting");

  let slipped = newState(4, "slip", pile);
  slipped = drawSingle(slipped, "face", 180);
  slipped = putBackSingle(slipped, "back");
  const turned = slipped.drawPile[0]!;
  assert.equal(slipped.orientations[String(turned)], 180);
  slipped = ejectSlip(slipped, "out", 2);
  const held = slipped.slippedCard;
  const rest = planPhysicalShuffle({
    style: "riffle_bridge",
    before: slipped.drawPile,
    ratio: 0.45,
    seed: 15,
    originalDeckCount: slipped.inventory.length,
  });
  slipped = motionShuffle(slipped, "slip-shuffle", rest);
  assert.equal(slipped.slippedCard, held);
  assert.equal(slipped.drawPile.includes(held!), false);
  assert.equal(slipped.orientations[String(turned)], 180);
  assert.deepEqual(slipped.drawPile, rest.afterOrder);

  const replayed = replayOperation(replayOperation(newState(4, "slip", pile), slipped.operations[0]!), slipped.operations[1]!);
  assert.equal(replayed.operations[0]?.kind, "single_draw");
  const again = [0, 1, 2, 3].reduce((cursor, index) => replayOperation(cursor, slipped.operations[index]!), newState(4, "slip", pile));
  assert.deepEqual(again.drawPile, slipped.drawPile);
  assert.equal(again.slippedCard, held);
});

test("one card does not become an operation, and a cut still uses the chosen depth", () => {
  const single = newState(4, "one", [8]);
  assert.equal(planPhysicalShuffle({ style: "table_wash", before: single.drawPile, seed: 1 }).events.length, 0);
  assert.throws(() => motionShuffle(single, "nope", planPhysicalShuffle({ style: "original", before: [8], seed: 1 })), /no movements/);
  const cutState = cut(newState(4, "cut", pile), "cut-1", 4);
  assert.deepEqual(cutState.drawPile, [...pile.slice(4), ...pile.slice(0, 4)]);
  assert.equal(cutState.operations.at(-1)?.kind, "cut");
});
