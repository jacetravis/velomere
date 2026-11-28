import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SHUFFLE_STYLES } from "../motion/events.ts";
import { gripPacketTarget, planPhysicalShuffle } from "../motion/mechanics.ts";
import { replayPhysicalShuffle } from "../motion/replay.ts";
import { compileCutVisual } from "./cut.ts";
import { compileVisualPass } from "./compile.ts";
import { compileFluid, cutEdgeCounts, washProxyBudget } from "./choreography.ts";

function deck(count: number) {
  return Array.from({ length: count }, (_, index) => 101 + 17 * index);
}

function same(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

test("one card has no invented packet", () => {
  const trace = planPhysicalShuffle({ style: "overhand", before: deck(1), thickness: 1, seed: 1 });
  assert.equal(trace.events.length, 0);
  assert.equal(trace.input.groups, undefined);
  assert.equal(gripPacketTarget("overhand", 1, 1), null);
});

for (const count of [2, 3, 22, 52, 78, 91]) {
  test(`touch-down thickness locks real groups for ${count} cards`, () => {
    for (const style of ["overhand", "hindu", "riffle_bridge"] as const) {
      const target = {
        left: gripPacketTarget(style, count, 0),
        center: gripPacketTarget(style, count, 0.5),
        right: gripPacketTarget(style, count, 1),
      };
      assert.equal(target.left, 1);
      assert.ok(target.right != null && target.right >= target.left);
      assert.ok(target.center != null && target.center >= target.left && target.center <= target.right!);
      if (count >= 22 && style !== "riffle_bridge") assert.ok(target.right! > 1);
      if (count >= 52 && style === "riffle_bridge") assert.ok(target.right! > 1 && target.right! <= 4);
      for (const thickness of [0, 0.5, 1] as const) {
        const chosen: number = thickness === 0 ? target.left! : thickness === 1 ? target.right! : target.center!;
        const before = deck(count);
        const trace = planPhysicalShuffle({ style, before, thickness, ratio: 0.5, seed: 9, turn: 1 });
        const driftedThickness = Math.min(1, thickness + 0.37);
        const drifted = planPhysicalShuffle({ style, before, thickness: driftedThickness, ratio: 0.5, seed: 9, turn: 1 });
        assert.equal(trace.input.thickness, thickness);
        assert.notEqual(trace.input.inputAttribution.groups, "reader");
        assert.ok(trace.input.groups);
        assert.equal(trace.input.groups!.flat().length, count);
        assert.equal(new Set(trace.input.groups!.flat()).size, count);
        assert.deepEqual(replayPhysicalShuffle(before, trace), trace.afterOrder);
        if (gripPacketTarget(style, count, driftedThickness) !== chosen) assert.notDeepEqual(trace.input.groups, drifted.input.groups);
        if (style !== "riffle_bridge") {
          assert.ok(trace.input.groups!.every((group) => group.length <= chosen));
          assert.equal(trace.input.groups![0]!.length, chosen);
          const again = planPhysicalShuffle({ style, before: trace.afterOrder, thickness, ratio: 0.5, seed: 9, turn: 2 });
          assert.equal(again.input.groups![0]!.length, chosen);
          assert.deepEqual(trace.input.groups, planPhysicalShuffle({ style, before, thickness, ratio: 0.5, seed: 9, turn: 1 }).input.groups);
        } else {
          assert.ok(trace.input.groups!.every((group) => group.length <= chosen));
          assert.deepEqual(trace.input.packetSizes, drifted.input.packetSizes);
          const half = Math.max(...(trace.input.packetSizes ?? [1]));
          if (half >= chosen) assert.equal(Math.max(...trace.input.groups!.map((group) => group.length)), chosen);
        }
        const scene = compileVisualPass(before, trace);
        const show = compileFluid(scene, 1, false);
        const shown = show.actors.flatMap((actor) => actor.ids);
        assert.equal(new Set(shown).size, count);
        assert.equal(shown.length, count);
        if (style === "overhand" || style === "hindu") assert.deepEqual(show.actors.map((actor) => actor.ids), trace.input.groups);
        assert.ok(show.duration < 8000);
        if (show.actors.length > 1) assert.ok(show.actors[1]!.delay < show.actors[0]!.delay + show.actors[0]!.duration);
        assert.equal(compileFluid(scene, 1, true).driver, "reduced");
        assert.equal(compileFluid(scene, 1, true).duration, 180);
      }
    }
    const before = deck(count);
    const cut = planPhysicalShuffle({ style: "original", before, thickness: 0, ratio: 0.37, seed: 3 });
    const cutThick = planPhysicalShuffle({ style: "original", before, thickness: 1, ratio: 0.37, seed: 3 });
    assert.deepEqual(cut.input.groups, cutThick.input.groups);
    assert.deepEqual(cut.afterOrder, cutThick.afterOrder);
    const third = planPhysicalShuffle({ style: "three_packet_cut", before, thickness: 0, ratio: 0.4, seed: 3, turn: 1 });
    const thirdThick = planPhysicalShuffle({ style: "three_packet_cut", before, thickness: 1, ratio: 0.4, seed: 3, turn: 1 });
    assert.deepEqual(third.input.groups, thirdThick.input.groups);
    assert.deepEqual(third.afterOrder, thirdThick.afterOrder);
    const wash = planPhysicalShuffle({ style: "table_wash", before, thickness: 0.2, ratio: 0.5, seed: 4 });
    const scene = compileVisualPass(before, wash);
    const show = compileFluid(scene, 1, false);
    const covered = show.actors.flatMap((actor) => actor.ids);
    assert.equal(covered.length, count);
    assert.equal(new Set(covered).size, count);
    assert.equal(show.actors.length, washProxyBudget(count));
    if (count >= 22) assert.ok(show.actors.length >= 9 && show.actors.length <= 14);
    assert.ok(show.actors.every((actor) => actor.display === "single-card" && actor.mode === "spatial-representation"));
    assert.ok(show.duration <= 3200);
    assert.ok(show.duration < 2000);
    const historical = structuredClone(wash);
    delete historical.input.groups;
    assert.deepEqual(replayPhysicalShuffle(before, historical), wash.afterOrder);
    assert.equal(same(replayPhysicalShuffle(before, cut), cut.afterOrder), true);
  });
}

test("fluid actors follow recorded packets for every grip, including a manual cut", () => {
  for (const style of SHUFFLE_STYLES) {
    const before = deck(22);
    const trace = planPhysicalShuffle({ style, before, thickness: 0.8, ratio: 0.42, seed: 6, turn: 2 });
    const scene = compileVisualPass(before, trace);
    const show = compileFluid(scene, -1, false);
    const ids = show.actors.flatMap((actor) => actor.ids);
    assert.equal(new Set(ids).size, before.length);
    assert.equal(ids.length, before.length);
    for (const actor of show.actors) {
      assert.equal(actor.display, "single-card");
      assert.ok(actor.frames.at(-1)!.offset === 1);
      if (style === "riffle_bridge") assert.equal(actor.mode, "rigid-packet");
    }
    if (style === "three_packet_cut") {
      assert.ok(show.actors.length >= 2);
      assert.ok(show.actors.every((actor) => actor.delay === 0));
      assert.ok(show.duration > 1400 && show.duration < 1800);
      assert.ok(show.actors.filter((actor) => actor.ids.length > 1).every((actor) => (actor.edges ?? 0) >= 2 && (actor.edges ?? 0) <= 4));
      assert.ok(show.actors.some((actor) => actor.frames.some((frame) => frame.transform.includes(", 100%"))));
    }
    if (style === "hindu") {
      assert.ok(show.actors.every((actor) => actor.delay === 0));
      assert.ok(show.actors.every((actor) => actor.frames.every((frame) => !frame.transform.includes(", -118%"))));
      assert.ok(show.actors.slice(0, -1).every((actor) => actor.frames.some((frame) => /118%/.test(frame.transform))));
    }
    if (style === "riffle_bridge") {
      const releases = trace.events.filter((event) => event.kind === "transfer" && event.action.startsWith("riffle_release_"));
      assert.deepEqual(
        show.actors.map((actor) => actor.ids),
        releases.map((event) => (event.kind === "transfer" ? event.cards : [])),
      );
      assert.ok(show.actors.every((actor) => actor.delay === 0));
      assert.ok(show.actors.every((actor) => actor.frames.some((frame) => /112%/.test(frame.transform))));
    }
    assert.equal(show.driver, "fluid");
  }
  const before = deck(22);
  const cut = compileCutVisual(before, 7, null);
  const show = compileFluid(cut, 1, false);
  assert.deepEqual(show.actors[0]!.ids, before.slice(0, 7));
  assert.deepEqual(show.actors[1]!.ids, before.slice(7));
  assert.ok(show.duration < 2000);
  assert.ok((show.actors[0]!.frames.at(-1)!.zIndex ?? 0) < (show.actors[1]!.frames.at(-1)!.zIndex ?? 0));
  assert.ok(show.duration <= 1100);
  assert.match(show.actors[0]!.frames.map((frame) => frame.transform).join(" "), /122%/);
  assert.equal(show.actors[1]!.frames.every((frame) => frame.transform.includes("translate3d(0%, 0%, 0)")), true);
  assert.equal(compileFluid(cut, 1, true).duration, 180);
  const original = compileFluid(compileVisualPass(before, planPhysicalShuffle({ style: "original", before, ratio: 0.4, seed: 4 })), 1, false);
  const lifted = original.actors.find((actor) => actor.key === "original-upper");
  const stock = original.actors.find((actor) => actor.key === "original-lower");
  assert.ok(lifted && stock);
  assert.ok((lifted.frames[1]!.zIndex ?? 0) > 1);
  assert.ok((lifted.frames.at(-1)!.zIndex ?? 0) < (stock.frames.at(-1)!.zIndex ?? 0));
  assert.notEqual(lifted.edges, stock.edges);
  assert.match(lifted.frames.map((frame) => frame.transform).join(" "), /122%/);
  assert.equal(stock.frames.every((frame) => frame.transform.includes("translate3d(0%, 0%, 0)")), true);
  assert.deepEqual(cutEdgeCounts([20, 58]), [3, 6]);
  const washOnly = compileFluid(compileVisualPass(before, planPhysicalShuffle({ style: "table_wash", before, seed: 4 })), 1, false);
  assert.ok(washOnly.actors.every((actor) => actor.edges == null));
});

test("a later pointer position is not the value the hold locked", () => {
  const before = deck(52);
  const locked = 0.18;
  const drifted = 0.92;
  const first = planPhysicalShuffle({ style: "overhand", before, thickness: locked, seed: 2, turn: 1 });
  const moved = planPhysicalShuffle({ style: "overhand", before, thickness: drifted, seed: 2, turn: 1 });
  assert.notEqual(first.input.groups![0]!.length, moved.input.groups![0]!.length);
  const frozen = structuredClone(first);
  const second = planPhysicalShuffle({ style: "overhand", before: first.afterOrder, thickness: locked, seed: 2, turn: 2 });
  assert.deepEqual(first, frozen);
  assert.equal(second.input.groups![0]!.length, first.input.groups![0]!.length);
  assert.equal(second.input.thickness, locked);
});

test("painted proxies are one card back, never a stack of edges", () => {
  const motion = readFileSync(new URL("../../../components/physical-shuffle-motion.tsx", import.meta.url), "utf8");
  const table = readFileSync(new URL("../../../components/reading-table.tsx", import.meta.url), "utf8");
  assert.equal(motion.includes("data-lip"), false);
  assert.match(motion, /\[scene, generation, reduced, dir\]/);
  assert.equal(motion.includes("trace-proxy"), true);
  assert.equal(motion.includes("dataset.groupSize"), false);
  assert.match(table, /activePointer/);
  assert.match(table, /visibilitychange/);
  assert.match(table, /event\.isPrimary/);
  assert.match(table, /Hold to shuffle/);
  const before = deck(78);
  const wash = compileFluid(compileVisualPass(before, planPhysicalShuffle({ style: "table_wash", before, thickness: 1, seed: 3, ratio: 0.5 })), 1, false);
  assert.equal(wash.actors.length, 12);
  assert.ok(wash.duration < 2000);
  const spread = wash.actors.map((actor) => actor.frames[1]!.transform);
  assert.equal(new Set(spread).size, spread.length);
  assert.ok(spread.some((transform) => /translate3d\(-?\d{2}/.test(transform)));
  const over = compileFluid(compileVisualPass(before, planPhysicalShuffle({ style: "overhand", before, thickness: 1, seed: 3, ratio: 0.5 })), 1, false);
  assert.ok(over.actors.every((actor) => actor.display === "single-card" && actor.ids.length >= 1));
  assert.ok(over.duration < 4000);
});
