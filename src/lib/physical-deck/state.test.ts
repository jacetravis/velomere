import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { sha256 } from "./hash.ts";
import { cutCards } from "../cards/order.ts";
import {
  acceptSlip,
  clearSpreadToTop,
  cut,
  cutIndex,
  deliverNext,
  drawSingle,
  drawWaiting,
  ejectSlip,
  flipFirst,
  gatherAll,
  legacyShuffleEndpoint,
  newState,
  putBackSingle,
  returnLatestWaiting,
  returnUntappedSlip,
  sampleHash,
  stageFirst,
  verify,
} from "./state.ts";

test("physical hash matches SHA-256", () => {
  const message = "solace-physical";
  assert.equal(sha256(message), createHash("sha256").update(message).digest("hex"));
});

for (const n of [1, 2, 3, 7, 22, 52, 78, 91]) {
  test(`conserve every card for a ${n}-card deck with nonconsecutive IDs`, () => {
    const ids = Array.from({ length: n }, (_, index) => index * 17 + 101);
    let state = newState(42, `s${n}`, ids);
    if (n > 1) state = cut(state, `cut-${n}`, Math.floor(n / 2));
    const reversed = [...state.drawPile].reverse();
    state = legacyShuffleEndpoint(state, `shuffle-${n}`, reversed, "legacy");
    assert.equal(state.drawPile[0], reversed[0]);
    assert.equal(verify(state), true);
    state = drawSingle(state, `draw-${n}`);
    assert.equal(state.drawPile.includes(state.table.single!.cardId), false);
    state = putBackSingle(state, `return-${n}`);
    assert.deepEqual(state.drawPile, reversed);
    assert.equal(verify(state), true);
  });
}

test("cut is exact and one operation ID cannot be committed twice", () => {
  const state = newState(7, "fixed", [5, 12, 28, 40, 60]);
  const next = cut(state, "op-cut", 2);
  assert.deepEqual(next.drawPile, [28, 40, 60, 5, 12]);
  assert.equal(cut(next, "op-cut", 3), next);
  assert.equal(next.revision, 1);
  assert.notEqual(sampleHash(state), sampleHash(next));
});

test("three-card waiting stack keeps first draw on top, latest returns from bottom", () => {
  let state = newState(8, "spread", [11, 22, 33, 44, 55]);
  state = drawWaiting(state, "d1");
  state = drawWaiting(state, "d2");
  state = drawWaiting(state, "d3");
  assert.deepEqual(state.waitingStack, [11, 22, 33]);
  assert.deepEqual(state.drawPile, [44, 55]);
  state = returnLatestWaiting(state, "undo");
  assert.deepEqual(state.waitingStack, [11, 22]);
  assert.deepEqual(state.drawPile, [33, 44, 55]);
  state = drawWaiting(state, "redraw");
  assert.deepEqual(state.waitingStack, [11, 22, 33]);
  state = stageFirst(state, "stage", 3);
  assert.equal(state.table["spread:1"]?.cardId, 11);
  assert.equal(state.table["spread:1"]?.face, "down");
  state = flipFirst(state, "flip");
  state = deliverNext(state, "p2", 2);
  state = deliverNext(state, "p3", 3);
  assert.equal(state.mode, "complete");
  assert.deepEqual(Object.values(state.table).map((item) => item.cardId), [11, 22, 33]);
  state = clearSpreadToTop(state, "clear");
  assert.deepEqual(state.drawPile, [11, 22, 33, 44, 55]);
  assert.equal(state.waitingStack.length, 0);
  assert.equal(verify(state), true);
});

test("prohibit foreign, missing, duplicated cards and impossible movement", () => {
  const state = newState(2, "invalid", [1, 3, 9]);
  assert.throws(() => legacyShuffleEndpoint(state, "bad1", [1, 3, 3], "legacy"));
  assert.throws(() => legacyShuffleEndpoint(state, "bad2", [1, 3, 99], "legacy"));
  assert.throws(() => cut(state, "bad3", 3));
  assert.throws(() => stageFirst(state, "bad4", 3));
  const bad = { ...state, waitingStack: [1] };
  assert.throws(() => verify(bad));
});

test("readings never reselect from unavailable drawn cards", () => {
  let state = newState(2, "draws", [100, 200, 300]);
  state = drawWaiting(state, "a");
  state = legacyShuffleEndpoint(state, "mid-shuffle", [300, 200], "legacy");
  state = drawWaiting(state, "b");
  assert.deepEqual(state.drawHistory, [100, 300]);
  assert.deepEqual(state.drawPile, [200]);
  assert.equal(verify(state), true);
});

test("a slipped middle card occupies its own zone until tapped or returned", () => {
  let state = newState(3, "slip", [10, 20, 30, 40, 50]);
  state = ejectSlip(state, "eject", 2);
  assert.equal(state.slippedCard, 30);
  assert.deepEqual(state.drawPile, [10, 20, 40, 50]);
  assert.equal(verify(state), true);
  state = acceptSlip(state, "tap", "waiting");
  assert.equal(state.slippedCard, null);
  assert.deepEqual(state.waitingStack, [30]);
  assert.deepEqual(state.drawPile, [10, 20, 40, 50]);
  state = clearSpreadToTop(state, "gather");
  assert.deepEqual(state.drawPile, [30, 10, 20, 40, 50]);
});

test("an untapped slipped card returns to the top", () => {
  let state = newState(3, "slip-return", [10, 20, 30]);
  state = ejectSlip(state, "eject", 1);
  state = returnUntappedSlip(state, "return");
  assert.deepEqual(state.drawPile, [20, 10, 30]);
  assert.equal(verify(state), true);
});

test("the physical cut index matches the table cut", () => {
  const ids = [2, 5, 8, 13, 21, 34, 55, 89];
  for (const ratio of [0, 0.08, 0.2, 0.4, 0.5, 0.83, 0.92, 1]) {
    const state = cut(newState(1, `cut-${ratio}`, ids), `op-${ratio}`, cutIndex(ids.length, ratio));
    assert.deepEqual(state.drawPile, cutCards(ids, ratio));
  }
});

test("gathering a spread is one revision and returns draws to the top", () => {
  let state = newState(4, "gather", [1, 2, 3, 4, 5]);
  state = drawWaiting(state, "d1");
  state = drawWaiting(state, "d2");
  state = ejectSlip(state, "slip", 1);
  const revision = state.revision;
  state = gatherAll(state, "gather");
  assert.equal(state.revision, revision + 1);
  assert.equal(state.mode, "ready");
  assert.equal(state.slippedCard, null);
  assert.deepEqual(state.drawPile, [1, 2, 4, 3, 5]);
  assert.equal(verify(state), true);
});
