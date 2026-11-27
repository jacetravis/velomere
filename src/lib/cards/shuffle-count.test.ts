import assert from "node:assert/strict";
import test from "node:test";
import { cutDepth, cutPace, cutSections, latchShuffleCount } from "./shuffle-count.ts";

test("a slow drag stays on the current count past the halfway point", () => {
  assert.equal(latchShuffleCount(5, 5.8, 0), 5);
  assert.equal(latchShuffleCount(12, 11.3, 0), 12);
});

test("a slow drag changes only after the extra movement", () => {
  assert.equal(latchShuffleCount(5, 5.9, 0), 6);
  assert.equal(latchShuffleCount(12, 11.1, 0), 11);
});

test("a quick slide changes with less extra movement", () => {
  assert.equal(latchShuffleCount(5, 5.6, 12), 6);
  assert.equal(latchShuffleCount(5, 5.55, 0), 5);
});

test("a quick slide can cross several counts", () => {
  assert.equal(latchShuffleCount(5, 12.2, 20), 12);
});

test("the count stays inside 1 to 20", () => {
  assert.equal(latchShuffleCount(1, 0.2, 0), 1);
  assert.equal(latchShuffleCount(20, 20.8, 30), 20);
});

test("each count from 1 to 10 is 20% faster, and 10 keeps its pace", () => {
  assert.equal(cutPace(10), Math.round(Math.round(420 / 1.3) * (1.62 - 0.62 * (2 / 12) ** 1.85)));
  assert.equal(cutPace(1), Math.round(Math.round((420 * 1.2 ** 9) / 1.3) * 1.62));
  for (let count = 1; count < 10; count += 1) {
    const ratio = cutPace(count) / cutPace(count + 1);
    assert.ok(ratio > 1.17 && ratio < 1.23, `${count} to ${count + 1} was ${ratio}`);
  }
  assert.ok(cutPace(20) <= 170);
  assert.ok(cutPace(20) < cutPace(10) / 2);
  assert.ok(cutPace(12) < cutPace(10));
  assert.ok(cutPace(12) > cutPace(20));
});

test("each cut in a run is a different section from the one before it", () => {
  const ratios = cutSections(12, () => 0.3);
  assert.equal(ratios.length, 12);
  const depths = ratios.map(cutDepth);
  for (let i = 1; i < depths.length; i += 1) {
    assert.notEqual(depths[i], depths[i - 1]);
  }
  assert.equal(new Set(cutSections(7, () => 0.2).map(cutDepth)).size, 7);
});
