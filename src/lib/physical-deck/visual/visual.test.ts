import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SHUFFLE_STYLES, type PhysicalShuffleTrace, type ShuffleStyle } from "../motion/events.ts";
import { planPhysicalShuffle } from "../motion/mechanics.ts";
import { inspectMotion, replayPhysicalShuffle } from "../motion/replay.ts";
import { cutIndex } from "../state.ts";
import { completedVisual, compileVisualPass, sampleVisual, settledOrder } from "./compile.ts";
import { compileCutVisual } from "./cut.ts";
import { playbackCues } from "./playback.ts";

function ids(count: number, step = 9) {
  return Array.from({ length: count }, (_, index) => 100 + index * step);
}

function plan(style: ShuffleStyle, count: number, extra: { thickness?: number; ratio?: number; seed?: number } = {}) {
  const before = ids(count);
  const trace = planPhysicalShuffle({
    style,
    before,
    ratio: extra.ratio ?? 0.5,
    turn: 2,
    seed: extra.seed ?? 21,
    ...(extra.thickness != null ? { thickness: extra.thickness } : {}),
  });
  return { before, trace };
}

function sceneOf(style: ShuffleStyle, count: number, extra?: { thickness?: number; ratio?: number; seed?: number }) {
  const { before, trace } = plan(style, count, extra);
  const scene = compileVisualPass(before, trace, {
    operationId: `op-${style}-${count}`,
    sessionId: "session",
    revisionFrom: 4,
    revisionTo: 5,
    beforeHash: "before",
    afterHash: "after",
  });
  return { before, trace, scene };
}

test("a one-card deck records no picture and invents no packet", () => {
  const before = ids(1);
  const trace = planPhysicalShuffle({ style: "original", before, ratio: 0.5, seed: 1 });
  assert.equal(trace.events.length, 0);
  const scene = compileVisualPass(before, trace);
  assert.equal(scene.grammarOk, true);
  assert.deepEqual(scene.after, before);
  assert.equal(scene.frames.length, 0);
  assert.deepEqual(sampleVisual(scene, 1).zones, { draw: before });
});

for (const count of [2, 3, 7, 22, 52, 78, 91]) {
  for (const style of SHUFFLE_STYLES) {
    test(`${style} pictures the recorded movements for ${count} cards`, () => {
      const { before, trace, scene } = sceneOf(style, count, { thickness: style === "table_wash" && count >= 52 ? 0.5 : 0.35 });
      assert.equal(scene.grammarOk, true, scene.grammarError ?? "");
      assert.deepEqual(scene.after, replayPhysicalShuffle(before, trace, trace.originalDeckCount));
      assert.equal(scene.frames.length, trace.events.length);
      assert.equal(scene.inputAttribution.turn, "algorithm-selected");
      const views = inspectMotion(before, trace.events);
      for (const frame of scene.frames) {
        const event = trace.events[frame.seq]!;
        assert.equal(frame.action, event.action);
        assert.equal(frame.recordedT, event.t);
        const done = completedVisual(scene, frame.seq);
        assert.deepEqual(done.zones, views[frame.seq]!.zones);
        if (event.kind === "transfer") {
          assert.deepEqual(frame.packetIds, event.cards);
          assert.equal(frame.count, event.count);
          assert.equal(done.packetIds.length, event.count);
        } else if (event.kind === "slide") {
          assert.deepEqual(frame.packetIds, [event.cardId]);
          assert.deepEqual(frame.slideFrom, event.from);
          assert.deepEqual(frame.slideTo, event.to);
          assert.deepEqual(done.positions[String(event.cardId)], event.to);
        } else if (event.kind === "pickup") {
          assert.deepEqual(frame.packetIds, [event.cardId]);
          assert.deepEqual(done.zones.draw?.at(-1), event.cardId);
        } else {
          assert.deepEqual(done.zones, completedVisual(scene, frame.seq - 1).zones);
          assert.deepEqual(frame.packetIds, []);
        }
      }
      assert.deepEqual(sampleVisual(scene, 1).zones.draw, scene.after);
      const cues = playbackCues(scene);
      assert.deepEqual(cues.map((cue) => cue.seq), trace.events.map((event) => event.seq));
      assert.deepEqual(settledOrder(scene), scene.after);
    });
  }
}

test("thickness changes pictured packets for a grip and not the original cut", () => {
  const thin = sceneOf("overhand", 52, { thickness: 0, seed: 9 });
  const thick = sceneOf("overhand", 52, { thickness: 1, seed: 9 });
  const thinStrip = thin.scene.frames.find((frame) => frame.action === "strip_top_to_receiver_top");
  const thickStrip = thick.scene.frames.find((frame) => frame.action === "strip_top_to_receiver_top");
  assert.equal(thinStrip?.count, 1);
  assert.ok((thickStrip?.count ?? 0) > 1);
  assert.ok((thickStrip?.count ?? 0) < 52);
  assert.equal(thin.scene.inputAttribution.packetSizes, "derived");
  assert.notEqual(thin.scene.inputAttribution.packetSizes, "reader");
  const grown = completedVisual(thick.scene, thickStrip!.seq);
  assert.equal(grown.zones.receive?.length, thickStrip?.count);
  const originalThin = sceneOf("original", 52, { thickness: 0, ratio: 0.4, seed: 9 });
  const originalThick = sceneOf("original", 52, { thickness: 1, ratio: 0.4, seed: 9 });
  assert.deepEqual(
    originalThin.trace.events.map((event) => (event.kind === "transfer" ? event.count : 0)),
    originalThick.trace.events.map((event) => (event.kind === "transfer" ? event.count : 0)),
  );
  const thirdThin = sceneOf("three_packet_cut", 52, { thickness: 0, ratio: 0.4, seed: 9 });
  const thirdThick = sceneOf("three_packet_cut", 52, { thickness: 1, ratio: 0.4, seed: 9 });
  assert.deepEqual(thirdThin.trace.input.cutPoints, thirdThick.trace.input.cutPoints);
});

test("riffle pictures the recorded halves and releases, and the bridge does not reorder", () => {
  const { before, trace, scene } = sceneOf("riffle_bridge", 22, { thickness: 1, ratio: 0.2, seed: 4 });
  assert.equal(scene.grammarOk, true, scene.grammarError ?? "");
  const left = scene.frames[0]!;
  const right = scene.frames[1]!;
  assert.equal(left.action, "split_left");
  assert.equal(right.action, "split_right");
  assert.equal(left.count + right.count, 22);
  assert.notEqual(left.count, right.count);
  const releases = scene.frames.filter((frame) => frame.action.startsWith("riffle_release_"));
  assert.ok(releases.length > 2);
  for (const release of releases) assert.ok(release.count >= 1 && release.count <= 4);
  const beforeBridge = completedVisual(scene, releases.at(-1)!.seq);
  const square = scene.frames.find((frame) => frame.kind === "square")!;
  const afterBridge = completedVisual(scene, square.seq);
  assert.deepEqual(beforeBridge.zones.merged, afterBridge.zones.merged);
  assert.deepEqual(scene.after, replayPhysicalShuffle(before, trace));
});

test("two cards never grow a third packet, and three-packet pickup follows the trace", () => {
  const two = sceneOf("three_packet_cut", 2, { seed: 3 });
  assert.equal(two.scene.grammarOk, true, two.scene.grammarError ?? "");
  assert.equal(two.scene.frames.some((frame) => frame.action.includes("packet2")), false);
  assert.deepEqual(two.scene.frames[0]!.packetIds, [two.before[0]]);
  assert.deepEqual(two.scene.frames[1]!.packetIds, [two.before[1]]);
  const three = sceneOf("three_packet_cut", 22, { seed: 5, ratio: 0.5 });
  const picks = three.trace.events.filter((event) => event.action.startsWith("pickup_packet_"));
  const pictured = three.scene.frames.filter((frame) => frame.action.startsWith("pickup_packet_"));
  assert.deepEqual(pictured.map((frame) => frame.action), picks.map((event) => event.action));
  assert.deepEqual(pictured.map((frame) => frame.packetIds), picks.map((event) => (event.kind === "transfer" ? event.cards : [])));
});

test("a legal overhand labeled as a riffle is rejected as that grip", () => {
  const { before, trace } = plan("overhand", 22, { thickness: 0.8 });
  const mislabeled = { ...trace, style: "riffle_bridge" } as PhysicalShuffleTrace;
  assert.deepEqual(replayPhysicalShuffle(before, mislabeled), trace.afterOrder);
  const scene = compileVisualPass(before, mislabeled);
  assert.equal(scene.grammarOk, false);
  assert.match(scene.grammarError ?? "", /Expected split_left|Riffle|split/i);
  assert.equal(scene.frames.length, trace.events.length);
  assert.deepEqual(scene.frames[1]!.packetIds, trace.events[1]!.kind === "transfer" ? trace.events[1]!.cards : []);
});

test("manual cut pictures the committed index, including ratios that round differently", () => {
  const before = ids(10);
  for (const ratio of [0.001, 0.12, 0.5, 0.94, 0.999]) {
    const index = cutIndex(before.length, ratio);
    const scene = compileCutVisual(before, index, { operationId: "cut-1", revisionFrom: 1, revisionTo: 2, index });
    assert.equal(scene.frames[0]!.count, index);
    assert.deepEqual(scene.frames[0]!.packetIds, before.slice(0, index));
    assert.deepEqual(scene.after, [...before.slice(index), ...before.slice(0, index)]);
    assert.deepEqual(completedVisual(scene, 0).zones.upper, before.slice(0, index));
    assert.deepEqual(completedVisual(scene, 1).zones.draw, scene.after);
    assert.deepEqual(completedVisual(scene, 2).zones.draw, scene.after);
    assert.deepEqual(settledOrder(scene), scene.after);
  }
  assert.throws(() => compileCutVisual(before, 0), /Invalid physical cut/);
  assert.throws(() => compileCutVisual(before, before.length), /Invalid physical cut/);
});

test("sampling a later movement does not rewrite an earlier packet", () => {
  const { scene } = sceneOf("overhand", 22, { thickness: 0 });
  const first = scene.frames.find((frame) => frame.action === "strip_top_to_receiver_top")!;
  const frozen = [...first.packetIds];
  sampleVisual(scene, 0.95);
  assert.deepEqual(completedVisual(scene, first.seq).packetIds, frozen);
});

test("the active table does not paint shuffle packets from the old sheet split", () => {
  const source = readFileSync(new URL("../../../components/reading-table.tsx", import.meta.url), "utf8");
  const motion = readFileSync(new URL("../../../components/physical-shuffle-motion.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("shuffleSplit"), false);
  assert.equal(source.includes("sheetsForSplit"), false);
  assert.equal(source.includes("riffleRun"), false);
  assert.equal(motion.includes("shuffleSplit"), false);
  assert.match(source, /compileVisualPass/);
  assert.match(source, /compileCutVisual/);
  assert.match(source, /PhysicalShuffleMotion/);
  assert.match(motion, /data-motion-faithful/);
});
