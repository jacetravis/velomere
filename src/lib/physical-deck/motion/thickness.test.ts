import assert from "node:assert/strict";
import test from "node:test";
import { planPhysicalShuffle } from "./mechanics.ts";
import { replayPhysicalShuffle } from "./replay.ts";
import { releaseThickness, sampleThickness, thicknessFromDrag, thicknessFromPointer } from "./thickness.ts";

function deck(count: number) {
  return Array.from({ length: count }, (_, index) => 101 + 17 * index);
}

function plan(style: "original" | "overhand" | "riffle_bridge" | "hindu" | "table_wash" | "three_packet_cut", count: number, thickness: number) {
  const before = deck(count);
  const trace = planPhysicalShuffle({ style, before, ratio: 0.5, turn: 1, seed: 11, thickness });
  assert.equal(trace.input.thickness, thickness);
  assert.equal(trace.input.inputAttribution.thickness, "reader");
  assert.deepEqual(replayPhysicalShuffle(before, trace), trace.afterOrder);
  return trace;
}

test("the thumb maps across the track and release parks at neutral without a movement", () => {
  const width = 320;
  const inset = 22;
  assert.equal(thicknessFromPointer(inset, 0, width), 0);
  assert.equal(thicknessFromPointer(inset + (width - inset * 2) / 2, 0, width), 0.5);
  assert.equal(thicknessFromPointer(width - inset, 0, width), 1);
  assert.equal(thicknessFromDrag(0.5, -(width - inset * 2) / 2, width), 0);
  assert.equal(thicknessFromDrag(0.5, 0, width), 0.5);
  assert.equal(thicknessFromDrag(0.5, (width - inset * 2) / 2, width), 1);
  const live = 0.82;
  const sampled = sampleThickness(live);
  const moved = 0.1;
  assert.equal(sampled, 0.82);
  assert.notEqual(sampled, moved);
  assert.deepEqual(releaseThickness(), { holding: false, thickness: 0.5 });
});

for (const count of [2, 3, 22, 52, 78]) {
  test(`packet thickness changes the recorded movements for ${count} cards`, () => {
    const thinOver = plan("overhand", count, 0);
    const thickOver = plan("overhand", count, 1);
    const thinStrips = thinOver.events.filter((event) => event.action === "strip_top_to_receiver_top");
    const thickStrips = thickOver.events.filter((event) => event.action === "strip_top_to_receiver_top");
    assert.equal(thinStrips[0]?.kind === "transfer" ? thinStrips[0].count : 0, 1);
    assert.ok((thickStrips[0]?.kind === "transfer" ? thickStrips[0].count : 0) > 1);
    assert.notDeepEqual(thinOver.afterOrder, thickOver.afterOrder);
    assert.equal(thinOver.input.inputAttribution.packetSizes, "reader");
    assert.equal(thinOver.input.inputAttribution.variation, "algorithm-selected");

    const thinWash = plan("table_wash", count, 0);
    const thickWash = plan("table_wash", count, 1);
    assert.notDeepEqual(
      thinWash.events.filter((event) => event.kind === "pickup").map((event) => event.kind === "pickup" ? event.cardId : 0),
      thickWash.events.filter((event) => event.kind === "pickup").map((event) => event.kind === "pickup" ? event.cardId : 0),
    );
    assert.notDeepEqual(thinWash.afterOrder, thickWash.afterOrder);
    assert.equal(thickWash.events.filter((event) => event.kind === "pickup").length, count);

    if (count >= 3) {
      const thinCut = plan("original", count, 0);
      const thickCut = plan("original", count, 1);
      const thinLift = thinCut.events.find((event) => event.action === "lift_upper_packet");
      const thickLift = thickCut.events.find((event) => event.action === "lift_upper_packet");
      assert.equal(thinLift?.kind === "transfer" ? thinLift.count : 0, 1);
      assert.equal(thickLift?.kind === "transfer" ? thickLift.count : 0, count - 1);
      assert.notDeepEqual(thinCut.afterOrder, thickCut.afterOrder);

      const thinRiffle = plan("riffle_bridge", count, 0);
      const thickRiffle = plan("riffle_bridge", count, 1);
      const thinRun = Math.max(...thinRiffle.events.filter((event) => event.action.startsWith("riffle_release_")).map((event) => event.kind === "transfer" ? event.count : 0));
      const thickRun = Math.max(...thickRiffle.events.filter((event) => event.action.startsWith("riffle_release_")).map((event) => event.kind === "transfer" ? event.count : 0));
      assert.equal(thinRun, 1);
      assert.ok(thickRun > thinRun);
      if (count >= 4) assert.notDeepEqual(thinRiffle.afterOrder, thickRiffle.afterOrder);

      const thinHindu = plan("hindu", count, 0);
      const thickHindu = plan("hindu", count, 1);
      const thinBottom = thinHindu.events.find((event) => event.action === "strip_bottom_to_receiver_top");
      const thickBottom = thickHindu.events.find((event) => event.action === "strip_bottom_to_receiver_top");
      assert.equal(thinBottom?.kind === "transfer" ? thinBottom.count : 0, 1);
      assert.ok((thickBottom?.kind === "transfer" ? thickBottom.count : 0) > 1);
      // Bottom strips that still leave one card are the same permutation whether
      // taken as singles or as one block. Past the five-strip cap, thickness
      // changes how much stock is placed underneath, so the order changes.
      if (count > 6) assert.notDeepEqual(thinHindu.afterOrder, thickHindu.afterOrder);
      else assert.deepEqual(thinHindu.afterOrder, thickHindu.afterOrder);
    }

    if (count >= 4) {
      const thinThird = plan("three_packet_cut", count, 0);
      const thickThird = plan("three_packet_cut", count, 1);
      assert.notDeepEqual(thinThird.input.cutPoints, thickThird.input.cutPoints);
      assert.equal(thinThird.input.inputAttribution.cutPoints, "reader");
      assert.notDeepEqual(thinThird.afterOrder, thickThird.afterOrder);
      assert.equal(thinThird.events.some((event) => /nudge|rotate/i.test(event.action)), false);
    }
  });
}

test("a later thumb position does not rewrite an earlier pass", () => {
  const before = deck(10);
  const first = planPhysicalShuffle({ style: "overhand", before, thickness: 0.15, seed: 4, turn: 1 });
  const frozen = structuredClone(first);
  const second = planPhysicalShuffle({ style: "overhand", before: first.afterOrder, thickness: 0.9, seed: 4, turn: 2 });
  assert.deepEqual(first, frozen);
  assert.notDeepEqual(second.afterOrder, first.afterOrder);
  assert.equal(first.input.thickness, 0.15);
  assert.equal(second.input.thickness, 0.9);
});

test("omitted thickness keeps the stage 2 formulas, and an explicit packet still wins", () => {
  const before = deck(8);
  const plain = planPhysicalShuffle({ style: "overhand", before, ratio: 0.2, seed: 5 });
  assert.equal(plain.input.thickness, undefined);
  assert.equal(plain.input.inputAttribution.packetSizes, "algorithm-selected");
  const chosen = planPhysicalShuffle({
    style: "overhand",
    before,
    thickness: 1,
    packetSizes: [1, 1, 1, 1, 1, 1, 1, 1],
    readerChoices: { packetSizes: true },
    seed: 5,
  });
  assert.deepEqual(
    chosen.events.filter((event) => event.action === "strip_top_to_receiver_top").map((event) => event.kind === "transfer" ? event.count : 0),
    [1, 1, 1, 1, 1, 1, 1, 1],
  );
});
