import assert from "node:assert/strict";
import test from "node:test";
import { isShuffleAnimation } from "./shuffle-animation.ts";

test("a missing or unknown shuffle animation is not a saved style", () => {
  assert.equal(isShuffleAnimation(null), false);
  assert.equal(isShuffleAnimation(undefined), false);
  assert.equal(isShuffleAnimation("rite"), false);
  assert.equal(isShuffleAnimation("original"), true);
  assert.equal(isShuffleAnimation("table_wash"), true);
});
