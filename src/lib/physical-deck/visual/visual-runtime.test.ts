import assert from "node:assert/strict";
import test from "node:test";
import { replayPhysicalShuffle } from "../motion/replay.ts";
import { applyCut, applyPhysicalMotionShuffle, bootPhysical, physicalState, resetPhysicalForTests } from "../runtime.ts";
import { compileVisualPass, completedVisual, settledOrder } from "./compile.ts";
import { compileCutVisual } from "./cut.ts";
import { SHUFFLE_STYLES, type ShuffleStyle } from "../motion/events.ts";

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

test("a committed shuffle is pictured from the saved operation, once, and survives reload", () => {
  memory.clear();
  resetPhysicalForTests();
  const cards = Array.from({ length: 22 }, (_, index) => 300 + index * 3);
  const opened = bootPhysical("visual-reader", 42, cards);
  assert.ok(opened);
  const before = [...opened.drawPile];
  const next = applyPhysicalMotionShuffle({
    before,
    style: "riffle_bridge",
    ratio: 0.37,
    turn: 1,
    seed: 19,
    thickness: 1,
    readerChoices: { ratio: false },
  });
  const operation = next.operations.at(-1);
  assert.equal(operation?.kind, "motion_shuffle");
  assert.ok(operation?.meta.motion);
  const scene = compileVisualPass(before, operation.meta.motion, {
    operationId: operation.id,
    sessionId: next.sessionId,
    revisionFrom: operation.revisionFrom,
    revisionTo: operation.revisionTo,
    beforeHash: operation.beforeHash,
    afterHash: operation.afterHash,
  });
  assert.equal(scene.grammarOk, true, scene.grammarError ?? "");
  assert.equal(scene.identity?.operationId, operation.id);
  assert.equal(scene.inputAttribution.ratio, "algorithm-selected");
  assert.equal(scene.inputAttribution.turn, "algorithm-selected");
  assert.equal(scene.inputAttribution.releases, "derived");
  assert.deepEqual(scene.after, next.drawPile);
  assert.deepEqual(scene.after, replayPhysicalShuffle(before, operation.meta.motion, next.inventory.length));
  const left = scene.frames[0]!;
  const right = scene.frames[1]!;
  assert.equal(left.action, "split_left");
  assert.equal(right.action, "split_right");
  assert.deepEqual(completedVisual(scene, 0).zones.left, left.packetIds);
  const again = compileVisualPass(before, operation.meta.motion, scene.identity);
  assert.deepEqual(again.frames.map((frame) => frame.packetIds), scene.frames.map((frame) => frame.packetIds));
  const restored = bootPhysical("visual-reader", 42, cards);
  assert.deepEqual(restored?.drawPile, next.drawPile);
  assert.equal(physicalState()?.operations.at(-1)?.id, operation.id);
  assert.deepEqual(settledOrder(scene), restored?.drawPile);
});

test("a committed cut pictures meta.index and not a second cut", () => {
  memory.clear();
  resetPhysicalForTests();
  const cards = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const opened = bootPhysical("cut-reader", 7, cards);
  assert.ok(opened);
  const before = [...opened.drawPile];
  const next = applyCut(before, 0.12);
  const operation = next.operations.at(-1);
  assert.equal(operation?.kind, "cut");
  assert.equal(operation?.meta.index, 2);
  const scene = compileCutVisual(before, operation.meta.index!, {
    operationId: operation.id,
    revisionFrom: operation.revisionFrom,
    revisionTo: operation.revisionTo,
    index: operation.meta.index!,
  });
  assert.deepEqual(scene.frames[0]!.packetIds, before.slice(0, 2));
  assert.deepEqual(scene.after, next.drawPile);
  assert.equal(next.operations.filter((item) => item.kind === "cut").length, 1);
});

test("every grip's persisted trace passes grammar", () => {
  for (const style of SHUFFLE_STYLES) {
    memory.clear();
    resetPhysicalForTests();
    const cards = Array.from({ length: style === "table_wash" ? 7 : 12 }, (_, index) => 10 + index);
    const opened = bootPhysical(`grip-${style}`, 3, cards);
    assert.ok(opened);
    const next = applyPhysicalMotionShuffle({
      before: opened.drawPile,
      style: style as ShuffleStyle,
      ratio: 0.4,
      turn: 1,
      seed: 8,
      thickness: style === "original" || style === "three_packet_cut" ? undefined : 0.8,
      readerChoices: { ratio: false },
    });
    const operation = next.operations.at(-1)!;
    const scene = compileVisualPass(opened.drawPile, operation.meta.motion!, {
      operationId: operation.id,
      sessionId: next.sessionId,
      revisionFrom: operation.revisionFrom,
      revisionTo: operation.revisionTo,
      beforeHash: operation.beforeHash,
      afterHash: operation.afterHash,
    });
    assert.equal(scene.grammarOk, true, `${style}: ${scene.grammarError}`);
    assert.deepEqual(completedVisual(scene, scene.frames.length - 1).zones.draw, next.drawPile);
  }
});
