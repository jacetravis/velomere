import assert from "node:assert/strict";
import test from "node:test";
import { replayPhysicalShuffle } from "../motion/replay.ts";
import { applyCut, applyPhysicalMotionShuffle, bootPhysical, physicalState, resetPhysicalForTests } from "../runtime.ts";
import { compileVisualPass, completedVisual, settledOrder } from "./compile.ts";
import { compileCutVisual } from "./cut.ts";
import { SHUFFLE_STYLES, type ShuffleStyle } from "../motion/events.ts";
import { planPhysicalShuffle } from "../motion/mechanics.ts";
import { motionClaim } from "./validate.ts";
import { cutSections } from "../../cards/shuffle-count.ts";
import { explainPhysicalCommit, type PhysicalCommit } from "../commit.ts";
import { checkpoint, motionShuffle, newState, type Operation } from "../state.ts";

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
    assert.equal(scene.claim, "matched");
    assert.equal(operation.meta.grammar, "matched");
    assert.equal(motionClaim(operation), "matched");
    assert.deepEqual(completedVisual(scene, scene.frames.length - 1).zones.draw, next.drawPile);
  }
});

test("one shuffle-count run keeps the same cut sequence on every pass", () => {
  memory.clear();
  resetPhysicalForTests();
  const cards = Array.from({ length: 22 }, (_, index) => index + 1);
  let state = bootPhysical("cut-run", 9, cards);
  assert.ok(state);
  const ratios = cutSections(8, () => 0.3);
  const seen: Operation[] = [];
  for (let index = 0; index < ratios.length; index += 1) {
    const ratio = ratios[index]!;
    state = applyPhysicalMotionShuffle({
      before: state.drawPile,
      style: index % 2 === 0 ? "original" : "three_packet_cut",
      ratio,
      turn: index + 1,
      seed: 70 + index,
      cutSequence: ratios,
      cutSequenceIndex: index,
      readerChoices: { ratio: false, passCount: true },
    });
    const operation = state.operations.at(-1);
    assert.ok(operation?.meta.motion);
    seen.push(operation);
  }
  for (let index = 0; index < seen.length; index += 1) {
    const trace = seen[index]!.meta.motion!;
    assert.equal(trace.input.cutSequenceIndex, index);
    assert.deepEqual(trace.input.cutSequence, ratios);
    assert.equal(trace.input.passCount, ratios.length);
    assert.equal(trace.input.ratio, ratios[index]);
    assert.equal(trace.input.inputAttribution.cutSequence, "algorithm-selected");
    assert.equal(trace.input.inputAttribution.passCount, "reader");
    assert.equal(trace.input.inputAttribution.ratio, "algorithm-selected");
    assert.notEqual(trace.input.inputAttribution.cutSequence, "reader");
    assert.equal(seen[index]!.meta.grammar, "matched");
  }
  for (let index = 1; index < ratios.length; index += 1) assert.notEqual(ratios[index], ratios[index - 1]);
  const restored = bootPhysical("cut-run", 9, cards);
  assert.deepEqual(restored?.drawPile, state.drawPile);
  assert.deepEqual(restored?.operations.at(-1)?.meta.motion?.input.cutSequence, ratios);
  assert.equal(restored?.operations.at(-1)?.meta.grammar, "matched");
  assert.throws(
    () => planPhysicalShuffle({
      style: "original",
      before: cards,
      ratio: ratios[1]!,
      seed: 1,
      cutSequence: ratios,
      cutSequenceIndex: 0,
    }),
    /planned cut/,
  );
});

test("a new shuffle cannot be saved as a different grip, and an old mismatch stays replayable", () => {
  const pile = [11, 22, 33, 44, 55, 66, 77, 88];
  const opened = newState(9, "grammar-session", pile);
  const trace = planPhysicalShuffle({
    style: "overhand",
    before: pile,
    thickness: 0.25,
    seed: 4,
    originalDeckCount: pile.length,
  });
  const saved = motionShuffle(opened, "motion-ok", trace);
  const accepted = saved.operations.at(-1)!;
  assert.equal(accepted.meta.grammar, "matched");
  assert.equal(motionClaim(accepted), "matched");
  const mislabeled = { ...trace, style: "riffle_bridge" as const };
  assert.throws(() => motionShuffle(opened, "motion-bad", mislabeled), /split_left|Riffle|split/);
  assert.equal(opened.revision, 0);

  const historical = structuredClone(accepted);
  historical.id = "motion-historical";
  delete historical.meta.grammar;
  historical.meta.style = "riffle_bridge";
  historical.meta.motion = { ...trace, style: "riffle_bridge" };
  const replayed = motionShuffle(opened, historical.id, historical.meta.motion, { mode: "replay" });
  assert.deepEqual(replayed.drawPile, trace.afterOrder);
  assert.equal(replayed.operations.at(-1)?.meta.grammar, undefined);
  assert.equal(replayed.operations.at(-1)?.meta.style, "riffle_bridge");
  assert.equal(motionClaim(historical), "legacy");
  const commit: PhysicalCommit = {
    deckId: opened.deckId,
    sessionId: opened.sessionId,
    expectedRevision: 0,
    snapshot: checkpoint({ ...replayed, operations: [historical] }),
    operation: historical,
  };
  assert.match(explainPhysicalCommit(opened, commit) ?? "", /split_left|Riffle|split/);
  const honest = {
    deckId: saved.deckId,
    sessionId: saved.sessionId,
    expectedRevision: 0,
    snapshot: checkpoint(saved),
    operation: accepted,
  };
  assert.equal(explainPhysicalCommit(opened, honest), null);
});
