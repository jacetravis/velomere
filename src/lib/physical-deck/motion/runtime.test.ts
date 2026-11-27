import assert from "node:assert/strict";
import test from "node:test";
import { replayPhysicalShuffle } from "./replay.ts";
import {
  applyCut,
  applyDrawWaiting,
  applyEject,
  applyPhysicalMotionShuffle,
  bootPhysical,
  physicalOutbox,
  physicalPause,
  physicalState,
  resetPhysicalForTests,
  setPhysicalTransportForTests,
  settlePhysicalForTests,
} from "../runtime.ts";

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

test("a reader shuffle is one durable movement operation and reloads to the same order", async () => {
  memory.clear();
  resetPhysicalForTests();
  const opened = bootPhysical("motion-reader", 140, [4, 9, 15, 20, 28, 33, 41, 50, 62, 70]);
  assert.ok(opened);
  assert.equal(opened.operations[0]?.meta.attribution, "system_initial_preparation");
  assert.equal(opened.operations[0]?.kind, "legacy_shuffle_realized");
  const before = [...opened.drawPile];
  const next = applyPhysicalMotionShuffle({ before, style: "riffle_bridge", ratio: 0.42, turn: 1, seed: 99 });
  const operation = next.operations.at(-1);
  assert.equal(operation?.kind, "motion_shuffle");
  assert.equal(operation?.meta.attribution, "user");
  assert.equal(operation?.meta.motion?.input.seed, 99);
  assert.deepEqual(next.drawPile, operation?.meta.motion ? replayPhysicalShuffle(before, operation.meta.motion, next.inventory.length) : []);
  assert.notDeepEqual(next.drawPile, before);
  const id = operation?.id;
  const saved = [...next.drawPile];
  resetPhysicalForTests();
  const again = bootPhysical("motion-reader", 140, [4, 9, 15, 20, 28, 33, 41, 50, 62, 70]);
  assert.deepEqual(again?.drawPile, saved);
  assert.equal(again?.operations.at(-1)?.id, id);
  assert.equal(physicalOutbox().some((item) => item.operation.id === id), true);
  assert.equal(physicalOutbox()[0]?.operation.meta.attribution, "system_initial_preparation");
});

test("a second pass is saved only when the first pass is the pile it starts from", () => {
  memory.clear();
  resetPhysicalForTests();
  const opened = bootPhysical("motion-pass", 141, [3, 6, 9, 12, 15, 18, 21]);
  assert.ok(opened);
  const first = applyPhysicalMotionShuffle({ before: opened.drawPile, style: "original", ratio: 0.3, turn: 1, seed: 4 });
  const second = applyPhysicalMotionShuffle({ before: first.drawPile, style: "original", ratio: 0.7, turn: 2, seed: 4 });
  assert.notDeepEqual(first.drawPile, second.drawPile);
  assert.equal(physicalOutbox().filter((item) => item.operation.kind === "motion_shuffle").length, 2);
  assert.throws(() => applyPhysicalMotionShuffle({ before: [1, 2, 3], style: "overhand", ratio: 0.5, turn: 3, seed: 4 }));
  assert.deepEqual(physicalState()?.drawPile, second.drawPile);
  assert.equal(physicalOutbox().filter((item) => item.operation.kind === "motion_shuffle").length, 2);
  const cut = applyCut(second.drawPile, 0.25);
  assert.equal(cut.operations.at(-1)?.kind, "cut");
  assert.notDeepEqual(cut.drawPile, second.drawPile);
});

test("a conflict keeps the unsent movement and does not invent another order", async () => {
  memory.clear();
  resetPhysicalForTests();
  const opened = bootPhysical("motion-conflict", 142, [8, 9, 10, 11, 12, 13]);
  assert.ok(opened);
  const next = applyPhysicalMotionShuffle({ before: opened.drawPile, style: "hindu", ratio: 0.55, turn: 1, seed: 12 });
  const pending = physicalOutbox().map((item) => item.operation.id);
  setPhysicalTransportForTests(async () => ({ status: "conflict", revision: 0, reason: "The stored deck is at a different revision." }));
  await settlePhysicalForTests();
  assert.match(physicalPause() ?? "", /different revision/);
  assert.deepEqual(physicalOutbox().map((item) => item.operation.id), pending);
  assert.deepEqual(physicalState()?.drawPile, next.drawPile);
  assert.equal(physicalState()?.operations.at(-1)?.kind, "motion_shuffle");
});

test("a failed write keeps the movement, and the retry does not shuffle again", async () => {
  memory.clear();
  resetPhysicalForTests();
  const opened = bootPhysical("motion-delay", 143, [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.ok(opened);
  let attempts = 0;
  setPhysicalTransportForTests(async (input) => {
    attempts += 1;
    if (attempts === 1) throw new Error("offline");
    return { status: "saved", revision: input.operation.revisionTo };
  });
  const next = applyPhysicalMotionShuffle({ before: opened.drawPile, style: "three_packet_cut", ratio: 0.5, turn: 2, seed: 7 });
  const order = [...next.drawPile];
  const ids = physicalOutbox().map((item) => item.operation.id);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(physicalOutbox().map((item) => item.operation.id), ids);
  await settlePhysicalForTests();
  assert.equal(physicalOutbox().length, 0);
  assert.deepEqual(physicalState()?.drawPile, order);
  assert.ok(attempts >= 2);
  resetPhysicalForTests();
  const again = bootPhysical("motion-delay", 143, [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.deepEqual(again?.drawPile, order);
});

test("drawing and slipping leave those cards out of the shuffle", () => {
  memory.clear();
  resetPhysicalForTests();
  const opened = bootPhysical("motion-hold", 144, [5, 10, 15, 20, 25, 30, 35, 40]);
  assert.ok(opened);
  const first = opened.drawPile[0]!;
  const collected = applyDrawWaiting();
  assert.deepEqual(collected.waitingStack, [first]);
  const heldIndex = 1;
  const held = collected.drawPile[heldIndex]!;
  const slipped = applyEject(heldIndex);
  assert.equal(slipped.slippedCard, held);
  const next = applyPhysicalMotionShuffle({ before: slipped.drawPile, style: "table_wash", ratio: 0.2, turn: 1, seed: 21 });
  assert.deepEqual(next.waitingStack, [first]);
  assert.equal(next.slippedCard, held);
  assert.equal(next.drawPile.includes(first), false);
  assert.equal(next.drawPile.includes(held), false);
  assert.equal(next.operations.at(-1)?.meta.motion?.drawPileCount, slipped.drawPile.length);
});

test("one card left in the draw pile does not append a shuffle", () => {
  memory.clear();
  resetPhysicalForTests();
  const opened = bootPhysical("motion-single", 145, [19, 28, 37]);
  assert.ok(opened);
  applyDrawWaiting();
  const left = applyDrawWaiting();
  assert.equal(left.drawPile.length, 1);
  const revision = left.revision;
  const same = applyPhysicalMotionShuffle({ before: left.drawPile, style: "original", ratio: 0.5, turn: 1, seed: 1 });
  assert.equal(same.revision, revision);
  assert.equal(same.drawPile.length, 1);
  assert.equal(physicalOutbox().some((item) => item.operation.kind === "motion_shuffle"), false);
});
