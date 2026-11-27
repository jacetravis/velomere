import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { cutCards, shuffleByStyle } from "../cards/order.ts";
import { cut, drawWaiting, legacyShuffleEndpoint, newState, verify, type PhysicalState } from "./state.ts";
import {
  applyCut,
  applyDrawSingle,
  applyDrawWaiting,
  applyPutBack,
  applyRealizedShuffle,
  applyReturnWaiting,
  bootPhysical,
  observeExternalJournal,
  physicalOutbox,
  physicalPause,
  physicalSpread,
  physicalState,
  resetPhysicalForTests,
  retryPhysicalSync,
  setPhysicalLookupForTests,
  setPhysicalRemoteForTests,
  setPhysicalTransportForTests,
  settlePhysicalForTests,
} from "./runtime.ts";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
  },
});

describe("physical runtime", { concurrency: 1 }, () => {
test("a reload restores the same order and does not shuffle again", () => {
  const first = bootPhysical("reader-a", 41, [4, 9, 15, 20, 28]);
  assert.ok(first);
  assert.equal(first.operations.filter((item) => item.meta.attribution === "system_initial_preparation").length, 1);
  assert.equal(physicalPause(), null);
  const again = bootPhysical("reader-a", 41, [4, 9, 15, 20, 28]);
  assert.ok(again);
  assert.equal(again.sessionId, first.sessionId);
  assert.deepEqual(again.drawPile, first.drawPile);
  assert.equal(again.revision, first.revision);
  assert.equal(again.operations.length, first.operations.length);
});

test("the drawn card leaves the pile until that same card is put back", () => {
  const opened = bootPhysical("reader-a", 42, [7, 11, 18]);
  assert.ok(opened);
  const top = opened.drawPile[0]!;
  const drawn = applyDrawSingle(180);
  assert.equal(drawn.table.single?.cardId, top);
  assert.equal(drawn.drawPile.includes(top), false);
  assert.equal(drawn.orientations[String(top)], 180);
  const returned = applyPutBack();
  assert.equal(returned.drawPile[0], top);
  assert.equal(returned.mode, "ready");
});

test("a shuffle records the realized order from the existing style", () => {
  const opened = bootPhysical("reader-a", 43, [3, 6, 9, 12, 15, 18]);
  assert.ok(opened);
  const before = opened.drawPile;
  const realized = shuffleByStyle("table_wash", before.map((id) => ({ id })), 0.42, () => 0.2, 2).map((card) => card.id);
  const next = applyRealizedShuffle(before, realized, "table_wash");
  assert.deepEqual(next.drawPile, realized);
  assert.equal(next.operations.at(-1)?.meta.style, "table_wash");
  assert.deepEqual(next.operations.at(-1)?.meta.realizedOrder, realized);
});

test("a cut records the same order the table already shows", () => {
  const opened = bootPhysical("reader-a", 44, [2, 4, 6, 8, 10]);
  assert.ok(opened);
  const next = applyCut(opened.drawPile, 0.4);
  assert.deepEqual(next.drawPile, cutCards(opened.drawPile, 0.4));
});

test("two readers do not share a deck, and a changed deck pauses", () => {
  const alpha = bootPhysical("alpha", 50, [1, 2, 3, 4]);
  const beta = bootPhysical("beta", 50, [1, 2, 3, 4]);
  assert.ok(alpha);
  assert.ok(beta);
  assert.notEqual(alpha.sessionId, beta.sessionId);
  const restored = bootPhysical("alpha", 50, [1, 2, 3, 4]);
  assert.deepEqual(restored?.drawPile, alpha.drawPile);
  const paused = bootPhysical("alpha", 50, [1, 2, 3, 4, 99]);
  assert.equal(paused?.sessionId, alpha.sessionId);
  assert.equal(physicalPause(), "This deck's cards changed. The saved order is paused.");
  assert.throws(() => applyCut(physicalState()?.drawPile ?? [], 0.5));
});

function zones(state: PhysicalState) {
  const placed = Object.values(state.table).map((item) => item.cardId);
  const slipped = state.slippedCard == null ? [] : [state.slippedCard];
  return [...state.drawPile, ...state.waitingStack, ...placed, ...slipped];
}

test("offline actions stay in the outbox across a reload and flush in order", async () => {
  memory.delete("solace-physical-v1:reader-offline:80");
  resetPhysicalForTests();
  const opened = bootPhysical("reader-offline", 80, [1, 2, 3, 4, 5]);
  assert.ok(opened);
  const first = opened.drawPile[0]!;
  const second = opened.drawPile[1]!;
  applyDrawWaiting();
  applyDrawWaiting();
  const returned = applyReturnWaiting();
  assert.deepEqual(returned.waitingStack, [first]);
  assert.equal(returned.drawPile[0], second);
  const before = physicalState();
  assert.ok(before);
  const pending = physicalOutbox().map((item) => item.operation.id);
  assert.equal(pending.length, 4);
  assert.deepEqual(pending.slice(1), pending.slice(1));
  for (const item of physicalOutbox()) assert.equal(verify(item.snapshot), true);
  assert.deepEqual([...zones(before)].sort((a, b) => a - b), [1, 2, 3, 4, 5]);

  resetPhysicalForTests();
  const restored = bootPhysical("reader-offline", 80, [1, 2, 3, 4, 5]);
  assert.ok(restored);
  assert.equal(physicalPause(), null);
  assert.deepEqual(restored.drawPile, before.drawPile);
  assert.deepEqual(restored.waitingStack, [first]);
  assert.deepEqual(physicalOutbox().map((item) => item.operation.id), pending);
  assert.deepEqual(physicalOutbox().map((item) => item.operation.revisionTo), [1, 2, 3, 4]);

  let calls = 0;
  setPhysicalTransportForTests(async (input) => {
    calls += 1;
    if (calls === 2) throw new Error("offline");
    return { status: "saved", revision: input.operation.revisionTo };
  });
  await flushAndSettle();
  assert.equal(physicalPause(), null);
  assert.deepEqual(physicalOutbox().map((item) => item.operation.revisionFrom), [1, 2, 3]);
  assert.deepEqual(physicalState()?.drawPile, before.drawPile);

  const seen: string[] = [];
  setPhysicalTransportForTests(async (input) => {
    seen.push(input.operation.id);
    return { status: "saved", revision: input.operation.revisionTo };
  });
  await flushAndSettle();
  assert.deepEqual(seen, pending.slice(1));
  assert.equal(physicalOutbox().length, 0);
  const raw = memory.get("solace-physical-v1:reader-offline:80");
  assert.ok(raw);
  assert.equal(JSON.parse(raw).outbox.length, 0);
  assert.deepEqual([...zones(physicalState()!)].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

async function flushAndSettle() {
  await settlePhysicalForTests();
}

test("a conflict or a full browser keeps the unsent action", async () => {
  memory.delete("solace-physical-v1:reader-conflict:81");
  resetPhysicalForTests();
  const opened = bootPhysical("reader-conflict", 81, [8, 9, 10, 11]);
  assert.ok(opened);
  const cutState = applyCut(opened.drawPile, 0.5);
  const pending = physicalOutbox().length;
  setPhysicalTransportForTests(async () => ({ status: "conflict", revision: 0, reason: "The stored deck is at a different revision." }));
  await settlePhysicalForTests();
  assert.match(physicalPause() ?? "", /different revision/);
  assert.equal(physicalOutbox().length, pending);
  assert.deepEqual(physicalState()?.drawPile, cutState.drawPile);

  memory.delete("solace-physical-v1:reader-full:82");
  resetPhysicalForTests();
  const fresh = bootPhysical("reader-full", 82, [3, 6, 9, 12]);
  assert.ok(fresh);
  const pile = [...fresh.drawPile];
  const original = memory.set.bind(memory);
  const storage = globalThis.localStorage;
  storage.setItem = () => {
    throw new Error("full");
  };
  try {
    assert.throws(() => applyCut(pile, 0.4));
    assert.match(physicalPause() ?? "", /could not save/);
    assert.deepEqual(physicalState()?.drawPile, pile);
    assert.equal(physicalOutbox().length, 1);
  } finally {
    storage.setItem = (key: string, value: string) => original(key, value);
  }
});

test("another tab cannot replace the local order or its outbox", () => {
  memory.delete("solace-physical-v1:reader-tab:83");
  resetPhysicalForTests();
  const opened = bootPhysical("reader-tab", 83, [2, 4, 6, 8]);
  assert.ok(opened);
  applyCut(opened.drawPile, 0.5);
  const pile = [...(physicalState()?.drawPile ?? [])];
  const pending = physicalOutbox().map((item) => item.operation.id);
  const key = "solace-physical-v1:reader-tab:83";
  const tampered = `${memory.get(key)} `;
  memory.set(key, tampered);
  assert.throws(() => applyCut(pile, 0.4), /another tab/);
  assert.match(physicalPause() ?? "", /another tab/);
  assert.deepEqual(physicalState()?.drawPile, pile);
  assert.deepEqual(physicalOutbox().map((item) => item.operation.id), pending);
  assert.equal(memory.get(key), tampered);

  memory.delete("solace-physical-v1:reader-tab:89");
  resetPhysicalForTests();
  const second = bootPhysical("reader-tab", 89, [2, 4, 6, 8]);
  assert.ok(second);
  applyCut(second.drawPile, 0.5);
  const kept = [...(physicalState()?.drawPile ?? [])];
  const keptIds = physicalOutbox().map((item) => item.operation.id);
  const forged: PhysicalState = {
    ...second,
    revision: second.revision + 5,
    drawPile: [...second.drawPile].reverse(),
    operations: [],
  };
  observeExternalJournal(JSON.stringify({ version: 2, ownerId: "reader-tab", snapshot: forged, outbox: [], reading: null }));
  assert.match(physicalPause() ?? "", /another tab/);
  assert.deepEqual(physicalState()?.drawPile, kept);
  assert.deepEqual(physicalOutbox().map((item) => item.operation.id), keptIds);
  assert.throws(() => applyCut(kept, 0.4));
});

test("account reconciliation flushes unsent work and will not adopt over it", async () => {
  memory.delete("solace-physical-v1:reader-account:84");
  resetPhysicalForTests();
  const opened = bootPhysical("reader-account", 84, [1, 2, 3, 4]);
  assert.ok(opened);
  const remote = legacyShuffleEndpoint(
    newState(84, "account-session", [1, 2, 3, 4]),
    "account-prep",
    [4, 3, 2, 1],
    "initial_preparation",
    "system_initial_preparation",
  );
  setPhysicalRemoteForTests(async () => remote);
  resetPhysicalForTests();
  setPhysicalRemoteForTests(async () => remote);
  const prepOnly = bootPhysical("reader-account", 84, [1, 2, 3, 4]);
  assert.ok(prepOnly);
  await settlePhysicalForTests();
  assert.equal(physicalPause(), null);
  assert.equal(physicalState()?.sessionId, "account-session");
  assert.deepEqual(physicalState()?.drawPile, [4, 3, 2, 1]);
  assert.equal(physicalOutbox().length, 0);

  memory.delete("solace-physical-v1:reader-account:85");
  resetPhysicalForTests();
  const mine = bootPhysical("reader-account", 85, [1, 2, 3, 4]);
  assert.ok(mine);
  const kept = applyCut(mine.drawPile, 0.5);
  const sent: string[] = [];
  setPhysicalTransportForTests(async (input) => {
    sent.push(input.operation.id);
    return { status: "saved", revision: input.operation.revisionTo };
  });
  setPhysicalRemoteForTests(async () => ({ ...mine, operations: mine.operations.slice(-1) }));
  resetPhysicalForTests();
  setPhysicalTransportForTests(async (input) => {
    sent.push(input.operation.id);
    return { status: "saved", revision: input.operation.revisionTo };
  });
  setPhysicalRemoteForTests(async () => ({ ...mine, operations: mine.operations.slice(-1) }));
  const again = bootPhysical("reader-account", 85, [1, 2, 3, 4]);
  assert.ok(again);
  await settlePhysicalForTests();
  assert.equal(physicalPause(), null);
  assert.deepEqual(physicalState()?.drawPile, kept.drawPile);
  assert.equal(physicalOutbox().length, 0);
  assert.equal(sent[0]?.startsWith("prep-"), true);
  assert.equal(sent.at(-1)?.startsWith("cut-"), true);

  memory.delete("solace-physical-v1:reader-account:86");
  resetPhysicalForTests();
  const userDeck = bootPhysical("reader-account", 86, [1, 2, 3, 4]);
  assert.ok(userDeck);
  const userOrder = applyCut(userDeck.drawPile, 0.5).drawPile;
  const other = cut(newState(86, "other-session", [1, 2, 3, 4]), "other-cut", 1);
  setPhysicalRemoteForTests(async () => other);
  resetPhysicalForTests();
  setPhysicalRemoteForTests(async () => other);
  bootPhysical("reader-account", 86, [1, 2, 3, 4]);
  await settlePhysicalForTests();
  assert.match(physicalPause() ?? "", /somewhere else/);
  assert.deepEqual(physicalState()?.drawPile, userOrder);
  assert.ok(physicalOutbox().length >= 2);
});

test("a version 1 journal is replayed into the outbox without a second shuffle", () => {
  const saved = cut(
    legacyShuffleEndpoint(newState(87, "v1-session", [1, 2, 3, 4]), "prep-v1", [4, 3, 2, 1], "initial_preparation", "system_initial_preparation"),
    "cut-v1",
    1,
  );
  memory.set("solace-physical-v1:reader-v1:87", JSON.stringify({ version: 1, ownerId: "reader-v1", snapshot: saved }));
  resetPhysicalForTests();
  const restored = bootPhysical("reader-v1", 87, [1, 2, 3, 4]);
  assert.ok(restored);
  assert.equal(physicalPause(), null);
  assert.deepEqual(restored.drawPile, saved.drawPile);
  assert.deepEqual(physicalOutbox().map((item) => item.operation.id), ["prep-v1", "cut-v1"]);
  assert.equal(restored.operations.length, 1);
  assert.equal(restored.operations[0]?.meta.attribution, undefined);

  const broken = { ...saved, operations: [{ ...saved.operations[0]!, afterHash: "00".repeat(32) }] };
  memory.set("solace-physical-v1:reader-v1:88", JSON.stringify({ version: 1, ownerId: "reader-v1", snapshot: broken }));
  resetPhysicalForTests();
  const paused = bootPhysical("reader-v1", 88, [1, 2, 3, 4]);
  assert.equal(physicalPause()?.includes("could not be replayed"), true);
  assert.deepEqual(paused?.drawPile, saved.drawPile);
  assert.equal(physicalOutbox().length, 0);
});

test("a server outage is not an empty account, and the first offline deck waits to be confirmed", async () => {
  memory.delete("solace-physical-v1:reader-outage:110");
  resetPhysicalForTests();
  const calls: string[] = [];
  let phase: "down" | "absent" | "found" = "down";
  const account = legacyShuffleEndpoint(
    newState(110, "account-session", [1, 2, 3, 4]),
    "account-prep",
    [4, 3, 2, 1],
    "initial_preparation",
    "system_initial_preparation",
  );
  setPhysicalLookupForTests(async (deckId) => {
    assert.equal(deckId, 110);
    if (phase === "down") return { status: "unavailable", snapshot: null, spread: null };
    if (phase === "absent") return { status: "absent", snapshot: null, spread: null };
    return { status: "found", snapshot: account, spread: null };
  });
  setPhysicalTransportForTests(async (input) => {
    calls.push(input.operation.id);
    if (phase === "down") throw new Error("offline");
    return { status: "saved", revision: input.operation.revisionTo };
  });
  assert.equal(bootPhysical("reader-outage", 110, [1, 2, 3, 4]), null);
  await settlePhysicalForTests();
  const opened = physicalState();
  assert.ok(opened);
  assert.equal(calls.length, 0);
  const cutState = applyCut(opened.drawPile, 0.5);
  const pile = [...cutState.drawPile];
  const pending = physicalOutbox().map((item) => item.operation.id);
  assert.equal(pending.length, 2);
  assert.equal(calls.length, 0);
  assert.deepEqual([...zones(cutState)].sort((a, b) => a - b), [1, 2, 3, 4]);
  await retryPhysicalSync();
  assert.equal(calls.length, 0);
  assert.deepEqual(physicalState()?.drawPile, pile);

  phase = "absent";
  await retryPhysicalSync();
  assert.deepEqual(calls, pending);
  assert.deepEqual(physicalState()?.drawPile, pile);
  assert.equal(physicalOutbox().length, 0);
  assert.equal(physicalPause(), null);

  memory.delete("solace-physical-v1:reader-outage:111");
  resetPhysicalForTests();
  phase = "down";
  calls.length = 0;
  setPhysicalLookupForTests(async () => (
    phase === "down"
      ? { status: "unavailable", snapshot: null, spread: null }
      : { status: "found", snapshot: account, spread: null }
  ));
  setPhysicalTransportForTests(async () => {
    calls.push("sent");
    return { status: "saved", revision: 1 };
  });
  assert.equal(bootPhysical("reader-outage", 111, [1, 2, 3, 4]), null);
  await settlePhysicalForTests();
  const local = physicalState();
  assert.ok(local);
  applyCut(local.drawPile, 0.5);
  const kept = [...(physicalState()?.drawPile ?? [])];
  phase = "found";
  await retryPhysicalSync();
  assert.equal(calls.length, 0);
  assert.match(physicalPause() ?? "", /somewhere else/);
  assert.deepEqual(physicalState()?.drawPile, kept);
  assert.equal(physicalOutbox().length, 2);
});

test("a delayed reply for one deck cannot change the deck you switched to", async () => {
  memory.delete("solace-physical-v1:switch:101");
  memory.delete("solace-physical-v1:switch:102");
  resetPhysicalForTests();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  const seen: number[] = [];
  setPhysicalTransportForTests(async (input) => {
    seen.push(input.deckId);
    if (input.deckId === 101) await gate;
    return { status: "saved", revision: input.operation.revisionTo };
  });
  const first = bootPhysical("switch", 101, [1, 2, 3, 4]);
  assert.ok(first);
  applyCut(first.drawPile, 0.5);
  const firstPile = [...(physicalState()?.drawPile ?? [])];
  const second = bootPhysical("switch", 102, [5, 6, 7, 8]);
  assert.ok(second);
  applyCut(second.drawPile, 0.5);
  const secondPile = [...(physicalState()?.drawPile ?? [])];
  const secondIds = physicalOutbox().map((item) => item.operation.id);
  release();
  await settlePhysicalForTests();
  assert.equal(physicalState()?.deckId, 102);
  assert.deepEqual(physicalState()?.drawPile, secondPile);
  assert.deepEqual([...zones(physicalState()!)].sort((a, b) => a - b), [5, 6, 7, 8]);
  const firstJournal = JSON.parse(memory.get("solace-physical-v1:switch:101") ?? "{}") as { snapshot?: PhysicalState; outbox?: unknown[] };
  const secondJournal = JSON.parse(memory.get("solace-physical-v1:switch:102") ?? "{}") as { snapshot?: PhysicalState; outbox?: { operation: { id: string } }[] };
  assert.deepEqual(firstJournal.snapshot?.drawPile, firstPile);
  assert.equal(firstJournal.outbox?.length, 0);
  assert.deepEqual(secondJournal.snapshot?.drawPile, secondPile);
  assert.deepEqual(secondJournal.outbox?.map((item) => item.operation.id) ?? secondIds, []);
  assert.equal(physicalOutbox().length, 0);
  assert.ok(seen.includes(101));
  assert.ok(seen.includes(102));
  assert.equal(seen.filter((id) => id === 102).every((id) => id === 102), true);
});

test("a found account spread is restored without using another layout or drawing cards", async () => {
  memory.delete("solace-physical-v1:reader-spread:120");
  resetPhysicalForTests();
  let physical = drawWaiting(drawWaiting(newState(120, "account-session", [11, 22, 33, 44]), "d1"), "d2");
  const spread = {
    id: "hearth",
    name: "Hearth",
    description: "kept",
    openingQuestion: "Where?",
    revision: 4,
    positions: [1, 2, 3].map((order) => ({
      id: `hearth-${order}`,
      order,
      name: `Hearth ${order}`,
      question: "Stay",
      meaningApplication: "Home",
      x: order / 10,
      y: 0.5,
      rotationDeg: 0 as const,
      zIndex: order,
      angleNotes: { "0": "up", "90": "", "180": "", "270": "" },
    })),
  };
  const calls: string[] = [];
  setPhysicalLookupForTests(async () => ({ status: "found", snapshot: physical, spread }));
  setPhysicalTransportForTests(async (input) => {
    calls.push(input.sessionId);
    return { status: "saved", revision: input.operation.revisionTo };
  });
  assert.equal(bootPhysical("reader-spread", 120, [11, 22, 33, 44]), null);
  await settlePhysicalForTests();
  assert.equal(calls.length, 0);
  assert.equal(physicalState()?.sessionId, "account-session");
  assert.deepEqual(physicalState()?.waitingStack, [11, 22]);
  assert.equal(physicalSpread()?.id, "hearth");
  assert.equal(physicalSpread()?.positions[0]?.name, "Hearth 1");
  assert.equal(physicalSpread()?.positions[0]?.meaningApplication, "Home");
  assert.equal(physicalOutbox().length, 0);
  assert.deepEqual([...zones(physicalState()!)].sort((a, b) => a - b), [11, 22, 33, 44]);
});
});
