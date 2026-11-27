import assert from "node:assert/strict";
import test from "node:test";
import { cutCards, shuffleByStyle } from "../cards/order.ts";
import {
  applyCut,
  applyDrawSingle,
  applyPutBack,
  applyRealizedShuffle,
  bootPhysical,
  physicalPause,
  physicalState,
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
