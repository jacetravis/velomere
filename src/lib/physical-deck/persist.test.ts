import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyPhysicalCommit, type PhysicalCommit } from "./commit.ts";
import { checkpoint, cut, drawSingle, legacyShuffleEndpoint, newState, replayOperation, sampleHash, verify, type PhysicalState } from "./state.ts";

function adapter(pg: PGlite) {
  return {
    query: async <T>(text: string, params: unknown[] = []) => {
      const result = await pg.query<T>(text, params);
      return result.rows;
    },
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
  const root = new URL("../../../migrations/", import.meta.url);
  await pg.exec(readFileSync(new URL("0013_physical_deck.sql", root), "utf8"));
  await pg.exec(readFileSync(new URL("0014_physical_deck_checkpoint.sql", root), "utf8"));
  return { pg, sql: adapter(pg) };
}

test("physical commits are owner scoped, idempotent, and reject a stale revision", async () => {
  const { pg, sql } = await database();
  const first = cut(newState(8, "session-a", [10, 20, 30, 40]), "cut-a", 2);
  const saved = await applyPhysicalCommit(sql, "user-a", commitOf(first));
  assert.equal(saved.status, "saved");
  assert.equal(saved.revision, 1);
  const repeat = await applyPhysicalCommit(sql, "user-a", commitOf(first));
  assert.equal(repeat.status, "saved");
  const rows = await sql.query<{ revision: number }>("select revision from physical_deck_sessions where user_id = $1", ["user-a"]);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0]?.revision), 1);

  const stale = cut(first, "cut-b", 1);
  const conflict = await applyPhysicalCommit(sql, "user-a", { ...commitOf(stale), expectedRevision: 0 });
  assert.equal(conflict.status, "conflict");

  const secondUser = cut(newState(8, "session-b", [10, 20, 30, 40]), "cut-b2", 1);
  await applyPhysicalCommit(sql, "user-b", commitOf(secondUser));
  const visible = await sql.query<{ user_id: string }>(
    "select user_id from physical_deck_sessions where user_id = $1 and deck_id = $2 and active = true",
    ["user-a", 8],
  );
  assert.deepEqual(visible.map((row) => row.user_id), ["user-a"]);
  await pg.close();
});

test("the server rejects forged hashes, revision jumps, and a changed duplicate", async () => {
  const { pg, sql } = await database();
  const ids = [10, 20, 30, 40, 50];
  const opened = newState(8, "session-hash", ids);
  const shuffled = legacyShuffleEndpoint(opened, "prep", [50, 40, 30, 20, 10], "initial_preparation", "system_initial_preparation");
  const first = await applyPhysicalCommit(sql, "user-a", commitOf(shuffled));
  assert.equal(first.status, "saved");
  const stored = await sql.query<{ kind: string; operation_json: { meta?: { attribution?: string } } }>(
    "select kind, operation_json from physical_deck_operations where operation_id = $1",
    ["prep"],
  );
  assert.equal(stored[0]?.kind, "legacy_shuffle_realized");
  assert.equal(stored[0]?.operation_json.meta?.attribution, "system_initial_preparation");

  const forgedHash = commitOf(shuffled);
  forgedHash.operation = { ...forgedHash.operation, afterHash: "0".repeat(64) };
  assert.equal((await applyPhysicalCommit(sql, "user-a", forgedHash)).status, "conflict");

  const replayed = commitOf(shuffled);
  replayed.snapshot = { ...replayed.snapshot, drawPile: [...ids] };
  const replayedResult = await applyPhysicalCommit(sql, "user-a", replayed);
  assert.equal(replayedResult.status, "saved");
  const untouched = await sql.query<{ snapshot_json: PhysicalState }>(
    "select snapshot_json from physical_deck_sessions where session_id = $1",
    ["session-hash"],
  );
  assert.deepEqual(untouched[0]?.snapshot_json.drawPile, shuffled.drawPile);

  const forgedNext = commitOf(cut(shuffled, "forged-new", 1));
  forgedNext.operation = { ...forgedNext.operation, afterHash: "ab".repeat(32) };
  forgedNext.snapshot = { ...forgedNext.snapshot, operations: [forgedNext.operation] };
  assert.equal((await applyPhysicalCommit(sql, "user-a", forgedNext)).status, "conflict");

  const jumped = commitOf(cut(shuffled, "jump", 1));
  jumped.operation = { ...jumped.operation, revisionTo: jumped.operation.revisionFrom + 3 };
  jumped.snapshot = { ...jumped.snapshot, revision: jumped.operation.revisionTo, operations: [jumped.operation] };
  const jump = await applyPhysicalCommit(sql, "user-a", jumped);
  assert.equal(jump.status, "conflict");
  assert.match(jump.reason ?? "", /skipped/);

  const different = commitOf(shuffled);
  different.operation = {
    ...different.operation,
    meta: { ...different.operation.meta, realizedOrder: [...ids], attribution: "user" },
  };
  assert.equal((await applyPhysicalCommit(sql, "user-a", different)).status, "conflict");

  const next = cut(shuffled, "cut-next", 2);
  const staleBefore = commitOf(next);
  staleBefore.operation = { ...staleBefore.operation, beforeHash: sampleHash(opened) };
  assert.equal((await applyPhysicalCommit(sql, "user-a", staleBefore)).status, "conflict");

  const held = await sql.query<{ revision: number }>("select revision from physical_deck_sessions where session_id = $1", ["session-hash"]);
  assert.equal(Number(held[0]?.revision), 1);

  const accepted = await applyPhysicalCommit(sql, "user-a", commitOf(next));
  assert.equal(accepted.status, "saved");
  const history = await sql.query<{ operation_id: string; operation_json: { kind?: string; meta?: { attribution?: string } } | string }>(
    "select operation_id, operation_json from physical_deck_operations where session_id = $1 order by to_revision",
    ["session-hash"],
  );
  assert.deepEqual(history.map((row) => row.operation_id), ["prep", "cut-next"]);
  const checkpointRow = await sql.query<{ snapshot_json: PhysicalState; checkpoint_hash: string }>(
    "select snapshot_json, checkpoint_hash from physical_deck_sessions where session_id = $1",
    ["session-hash"],
  );
  assert.equal(checkpointRow[0]?.snapshot_json.operations.length, 1);
  assert.equal(checkpointRow[0]?.snapshot_json.operations[0]?.id, "cut-next");
  assert.equal(checkpointRow[0]?.checkpoint_hash, sampleHash(checkpoint(next)));
  const still = await sql.query<{ revision: number }>("select revision from physical_deck_sessions where session_id = $1", ["session-hash"]);
  assert.equal(Number(still[0]?.revision), 2);

  let cursor = newState(8, "session-hash", ids);
  for (const row of history) {
    const operation = typeof row.operation_json === "string" ? JSON.parse(row.operation_json) : row.operation_json;
    cursor = replayOperation(cursor, operation);
    assert.equal(verify(cursor), true);
  }
  assert.equal(sampleHash(cursor), checkpointRow[0]?.checkpoint_hash);
  assert.equal(new Set(cursor.drawPile).size, ids.length);

  const upright = drawSingle(newState(8, "session-upright", ids), "draw-up", 0);
  const uprightOp = { ...upright.operations.at(-1)!, meta: {} };
  const uprightSaved = await applyPhysicalCommit(sql, "user-a", {
    deckId: 8,
    sessionId: "session-upright",
    expectedRevision: 0,
    snapshot: { ...checkpoint(upright), operations: [uprightOp] },
    operation: uprightOp,
  });
  assert.equal(uprightSaved.status, "saved");

  const reversed = drawSingle(newState(8, "session-reversed", ids), "draw-rev", 180);
  const reversedOp = { ...reversed.operations.at(-1)!, meta: {} };
  const reversedSaved = await applyPhysicalCommit(sql, "user-a", {
    deckId: 8,
    sessionId: "session-reversed",
    expectedRevision: 0,
    snapshot: { ...checkpoint(reversed), operations: [reversedOp] },
    operation: reversedOp,
  });
  assert.equal(reversedSaved.status, "conflict");

  const impossible = commitOf(next);
  impossible.operation = { ...impossible.operation, id: "not-a-deliver", kind: "deliver_next", meta: { position: 2 } };
  impossible.snapshot = { ...checkpoint(next), operations: [impossible.operation] };
  assert.equal((await applyPhysicalCommit(sql, "user-a", impossible)).status, "conflict");
  await pg.close();
});
