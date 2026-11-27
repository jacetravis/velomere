import assert from "node:assert/strict";
import test from "node:test";
import { cardFrame } from "./shape.ts";
import {
  borderWindow,
  contentAspect,
  dimsForAspect,
  fitPicture,
  placeInFrame,
  planFromExample,
  printedBox,
  TIGHT_INSET,
  withBleed,
} from "./fit.ts";

const full = { x: 0, y: 0, w: 1, h: 1 };

function near(actual: number, expected: number, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps, `${actual} !~ ${expected}`);
}

test("a tall picture sets a taller deck", () => {
  const dims = dimsForAspect("long-tarot", 720 / 1355, 55);
  assert.ok(Math.abs(dims.aspect - 720 / 1355) < 0.02);
  assert.ok(dims.cardLength > dims.cardWidth);
  assert.equal(cardFrame("long-tarot", dims.cardWidth, dims.cardLength).aspect, dims.aspect);
});

test("a matching picture sits at full size with no shift", () => {
  const placed = fitPicture("contain", 0.53, { imageAspect: 0.53, content: full });
  assert.equal(placed.imageScale, 100);
  assert.equal(placed.imageX, 0);
  assert.equal(placed.imageY, 0);
});

test("a picture inside a wider frame is scaled until the side gaps close", () => {
  const frame = cardFrame("long-tarot", 55, 55).aspect;
  const placed = fitPicture("contain", frame, { imageAspect: 0.531, content: full });
  assert.ok(placed.imageScale > 100);
  assert.equal(placed.imageX, 0);
  assert.equal(placed.imageY, 0);
});

test("a white edge is cropped out and the art stays centered", () => {
  const picture = { imageAspect: 0.6, content: { x: 0.05, y: 0.04, w: 0.9, h: 0.92 } };
  const placed = fitPicture("contain", contentAspect(picture), picture);
  assert.ok(placed.imageScale > 100);
  assert.ok(Math.abs(placed.imageX) < 20);
  assert.ok(Math.abs(placed.imageY) < 20);
});

test("border 100 keeps the printed card and border 0 pulls in toward the art", () => {
  const card = borderWindow(full, 100);
  near(card.x, 0);
  near(card.y, 0);
  near(card.w, 1);
  near(card.h, 1);
  const tight = borderWindow(full, 0);
  near(tight.x, TIGHT_INSET);
  near(tight.y, TIGHT_INSET);
  near(tight.w, 1 - TIGHT_INSET * 2);
  near(tight.h, 1 - TIGHT_INSET * 2);
});

test("the border uses the same inset on every card's own printed box", () => {
  const example = { x: 0.02, y: 0.01, w: 0.96, h: 0.97 };
  const other = { x: 0.08, y: 0.04, w: 0.84, h: 0.9 };
  const a = borderWindow(example, 40);
  const b = borderWindow(other, 40);
  near((a.x - example.x) / example.w, (b.x - other.x) / other.w);
  near((a.y - example.y) / example.h, (b.y - other.y) / other.h);
  near(a.w / example.w, b.w / other.w);
});

test("a uniform border does not change the example's card shape", () => {
  const picture = { imageAspect: 720 / 1355, content: { x: 0.014, y: 0.006, w: 0.968, h: 0.988 } };
  const tight = planFromExample("long-tarot", picture, 0, 55);
  const whole = planFromExample("long-tarot", picture, 100, 55);
  near(tight.window.w / tight.window.h, whole.window.w / whole.window.h, 1e-9);
  assert.equal(tight.cardWidth, whole.cardWidth);
  assert.equal(tight.cardLength, whole.cardLength);
});

test("the example window fills the frame and a lower border crops closer", () => {
  const picture = { imageAspect: 0.53, content: full };
  const plan = planFromExample("long-tarot", picture, 0, 55);
  const placed = placeInFrame(plan.aspect, picture, 0);
  assert.equal(placed.imageX, 0);
  assert.equal(placed.imageY, 0);
  assert.ok(placed.imageScale > 100);
  const kept = placeInFrame(plan.aspect, picture, 100);
  assert.ok(kept.imageScale < placed.imageScale);
});

test("bleed only scales the art and leaves its position", () => {
  const fitted = { imageScale: 100, imageX: 4, imageY: -6 };
  assert.deepEqual(withBleed(fitted, 0), fitted);
  const full = withBleed(fitted, 100);
  assert.equal(full.imageScale, 150);
  assert.equal(full.imageX, 4);
  assert.equal(full.imageY, -6);
});

test("a thin white border stays on the card and a wide scan margin does not", () => {
  assert.equal(printedBox({ x: 0.039, y: 0.017, w: 0.922, h: 0.968 }), null);
  const scanned = printedBox({ x: 0.12, y: 0.1, w: 0.76, h: 0.8 });
  assert.ok(scanned);
  near(scanned.x, 0.12);
  near(scanned.y, 0.1);
  near(scanned.w, 0.76);
  near(scanned.h, 0.8);
});
