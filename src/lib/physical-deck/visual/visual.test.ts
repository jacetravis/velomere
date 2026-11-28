import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SHUFFLE_STYLES, type PhysicalShuffleTrace, type ShuffleStyle } from "../motion/events.ts";
import { planPhysicalShuffle } from "../motion/mechanics.ts";
import { inspectMotion, replayPhysicalShuffle } from "../motion/replay.ts";
import { cutIndex } from "../state.ts";
import { completedVisual, compileVisualPass, sampleVisual, settledOrder } from "./compile.ts";
import { compileCutVisual } from "./cut.ts";
import { playbackCues, playbackDuration, playbackGroups, playbackIndex, PLAYBACK_PROGRESS, renderSamples } from "./playback.ts";

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
  const playback = readFileSync(new URL("./playback.ts", import.meta.url), "utf8");
  assert.equal(source.includes("shuffleSplit"), false);
  assert.equal(source.includes("sheetsForSplit"), false);
  assert.equal(source.includes("riffleRun"), false);
  assert.equal(motion.includes("shuffleSplit"), false);
  assert.match(source, /compileVisualPass/);
  assert.match(source, /compileCutVisual/);
  assert.match(source, /PhysicalShuffleMotion/);
  assert.match(motion, /data-motion-faithful/);
  assert.equal(source.split("cutSections(").length - 1, 1);
  const countPass = source.slice(source.indexOf("const runCountPass"), source.indexOf("const runHoldPass"));
  assert.equal(countPass.includes("cutSections"), false);
  assert.match(countPass, /countPlan/);
  assert.match(countPass, /passCount: true/);
  assert.match(motion, /compileFluid/);
  assert.match(motion, /element\.animate|actor\.element\.animate|\.animate\(/);
  assert.equal(motion.includes("renderSamples"), false);
  assert.equal(motion.includes("calibratedPacket"), false);
  assert.equal(motion.includes("gripPacketTarget"), false);
  assert.equal(playback.includes("Math.min(2400"), false);
});

function between(from: { x: number; y: number }, to: { x: number; y: number }, at: { x: number; y: number }, progress: number) {
  const expectedX = from.x + (to.x - from.x) * progress;
  const expectedY = from.y + (to.y - from.y) * progress;
  return Math.abs(at.x - expectedX) < 1e-6 && Math.abs(at.y - expectedY) < 1e-6;
}

function compressedHits(scene: Parameters<typeof sampleVisual>[0], duration: number) {
  const hit = new Set<number>();
  const frameMs = 1000 / 60;
  for (let elapsed = 0; elapsed <= duration + frameMs; elapsed += frameMs) {
    const sample = sampleVisual(scene, Math.min(1, elapsed / Math.max(duration, 1)));
    if (sample.action !== "spread_on_workspace" || sample.seq == null) continue;
    const frame = scene.frames[sample.seq];
    if (!frame?.slideFrom || !frame.slideTo || frame.cardId == null) continue;
    const at = sample.positions[String(frame.cardId)];
    if (!at) continue;
    const dx = frame.slideTo.x - frame.slideFrom.x;
    const dy = frame.slideTo.y - frame.slideFrom.y;
    const span = dx * dx + dy * dy;
    const along = dx * (at.x - frame.slideFrom.x) + dy * (at.y - frame.slideFrom.y);
    if (span > 1e-8 && along > span * 0.08 && along < span * 0.92) hit.add(frame.seq);
  }
  return hit;
}

for (const count of [52, 78, 91]) {
  test(`a ${count}-card wash paints every placement, stroke, and gather instead of skipping them`, () => {
    const { scene } = sceneOf("table_wash", count, { thickness: 0.72, seed: 21 });
    assert.equal(scene.grammarOk, true, scene.grammarError ?? "");
    assert.equal(scene.claim, "matched");
    const groups = playbackGroups(scene.frames);
    assert.deepEqual(groups.flatMap((group) => group.seqs), scene.frames.map((frame) => frame.seq));
    const samples = renderSamples(scene, false);
    assert.equal(samples.length, 1 + groups.length * 2);
    const again = renderSamples(scene, false);
    assert.equal(again.length, samples.length);
    assert.deepEqual(again.map((sample) => sample.packetIds), samples.map((sample) => sample.packetIds));
    const spreads = scene.frames.filter((frame) => frame.action === "spread_on_workspace");
    const pickups = scene.frames.filter((frame) => frame.action === "gather_from_table");
    let spreadHits = 0;
    let pickupHits = 0;
    groups.forEach((group, index) => {
      const mid = samples[1 + index * 2]!;
      const done = samples[2 + index * 2]!;
      const covered = Object.values(mid.zones).flat();
      assert.equal(new Set(covered).size, count, `${group.action} dropped a card`);
      assert.equal(covered.length, count);
      if (group.role === "place") {
        const spread = group.frames[1]!;
        const at = mid.positions[String(spread.cardId)];
        assert.ok(at);
        assert.equal(between(spread.slideFrom!, spread.slideTo!, at, PLAYBACK_PROGRESS), true);
        assert.equal(mid.zones.draw?.includes(spread.cardId!) ?? false, false);
        assert.deepEqual(done.positions[String(spread.cardId)], spread.slideTo);
        assert.deepEqual(done.zones, spread.zones);
        spreadHits += 1;
      } else if (group.role === "stroke") {
        assert.equal(mid.packetIds.length, count);
        for (const frame of group.frames) {
          const at = mid.positions[String(frame.cardId)];
          assert.ok(at);
          assert.equal(between(frame.slideFrom!, frame.slideTo!, at, PLAYBACK_PROGRESS), true);
          assert.deepEqual(done.positions[String(frame.cardId)], frame.slideTo);
        }
        assert.equal(done.action, group.action);
      } else if (group.frames[0]!.kind === "pickup") {
        assert.equal(mid.travel?.kind, "pickup");
        assert.ok((mid.travel?.progress ?? 0) > 0 && (mid.travel?.progress ?? 1) < 1);
        assert.deepEqual(mid.travel?.ids, group.frames[0]!.packetIds);
        assert.deepEqual(done.zones.draw?.at(-1), group.frames[0]!.cardId);
        pickupHits += 1;
      }
      assert.deepEqual(samples.at(-1)!.zones.draw, scene.after);
    });
    assert.equal(spreadHits, spreads.length);
    assert.equal(pickupHits, pickups.length);
    assert.equal(groups.filter((group) => group.role === "stroke").length, 3);
    const oldDuration = Math.min(2400, 880 + scene.frames.filter((frame) => frame.kind === "slide" || frame.kind === "pickup").length * 2.4);
    const skipped = compressedHits(scene, oldDuration);
    assert.ok(skipped.size < spreads.length / 2, `old clock still showed ${skipped.size} of ${spreads.length}`);
    assert.ok(playbackDuration(scene, false) > oldDuration);
    const reduced = renderSamples(scene, true);
    assert.equal(reduced.length, 2);
    assert.deepEqual(reduced.at(-1)!.zones.draw, scene.after);
  });
}

test("a cut keeps its pace, and a late frame cannot skip a recorded sample", () => {
  const before = ids(10);
  const scene = compileCutVisual(before, 4, null);
  const duration = playbackDuration(scene, false);
  assert.equal(duration, 980);
  const samples = renderSamples(scene, false);
  assert.equal(playbackIndex(samples.length, duration, 0, 0), 0);
  assert.ok(playbackIndex(samples.length, duration, 160, 0) < 3);
  assert.notEqual(playbackIndex(samples.length, duration, 160, 0), samples.length - 1);
  let step = 0;
  const seen: number[] = [0];
  for (let elapsed = 0; elapsed < duration + samples.length * (1000 / 60); elapsed += 1000 / 60) {
    const next = playbackIndex(samples.length, duration, elapsed, step);
    assert.ok(next <= step + 1);
    if (next !== step) seen.push(next);
    step = next;
  }
  assert.deepEqual(seen, samples.map((_, index) => index));
  const wash = sceneOf("table_wash", 52, { thickness: 0.72, seed: 21 }).scene;
  let washStep = 0;
  const washSeen: number[] = [0];
  const washDuration = playbackDuration(wash, false);
  const washSamples = renderSamples(wash, false);
  for (let elapsed = 0; elapsed < washDuration + washSamples.length * (1000 / 60); elapsed += 1000 / 60) {
    const next = playbackIndex(washSamples.length, washDuration, elapsed, washStep);
    assert.ok(next <= washStep + 1);
    if (next !== washStep) washSeen.push(next);
    washStep = next;
  }
  assert.equal(washSeen.length, washSamples.length);
  assert.equal(washStep, washSamples.length - 1);
});

test("full-deck grips other than a wash still paint each recorded packet in flight", () => {
  for (const style of SHUFFLE_STYLES) {
    if (style === "table_wash") continue;
    const { scene } = sceneOf(style, 52, { thickness: 0.85, ratio: 0.37, seed: 14 });
    assert.equal(scene.claim, "matched");
    const groups = playbackGroups(scene.frames);
    const samples = renderSamples(scene, false);
    assert.deepEqual(groups.flatMap((group) => group.seqs), scene.frames.map((frame) => frame.seq));
    assert.equal(groups.every((group) => group.role === "event"), true);
    groups.forEach((group, index) => {
      const frame = group.frames[0]!;
      const mid = samples[1 + index * 2]!;
      const done = samples[2 + index * 2]!;
      assert.equal(new Set(Object.values(mid.zones).flat()).size, 52);
      if (frame.kind === "transfer" || frame.kind === "pickup") {
        assert.equal(mid.seq, frame.seq);
        assert.ok(mid.travel);
        assert.ok(mid.travel.progress > 0 && mid.travel.progress < 1);
        assert.deepEqual(mid.travel.ids, frame.packetIds);
      }
      assert.deepEqual(done.zones, frame.zones);
      assert.deepEqual(done.packetIds, frame.packetIds);
    });
    assert.deepEqual(samples.at(-1)!.zones.draw, scene.after);
  }
});
