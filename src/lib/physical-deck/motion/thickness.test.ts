import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planPhysicalShuffle } from "./mechanics.ts";
import { replayPhysicalShuffle } from "./replay.ts";
import { interruptThickness, releaseThickness, sampleThickness, THUMB_INTERRUPTIONS, thicknessFromDrag, thicknessFromPointer } from "./thickness.ts";

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
  const frozen = sampleThickness(0.9);
  for (const reason of THUMB_INTERRUPTIONS) {
    const parked = interruptThickness(reason);
    assert.equal(parked.holding, false);
    assert.equal(parked.thickness, 0.5);
    assert.equal(parked.movement, null);
    assert.equal(frozen, 0.9);
  }
});

function strips(trace: ReturnType<typeof plan>, action: string) {
  return trace.events.filter((event) => event.action === action && event.kind === "transfer").map((event) => event.kind === "transfer" ? event.count : 0);
}

test("the hold samples thickness apart from cut depth and parks on an interrupted gesture", () => {
  const source = readFileSync(new URL("../../../components/reading-table.tsx", import.meta.url), "utf8");
  assert.match(source, /commitMotion\(ratio, count, sampled, \{ ratio: false \}\)/);
  assert.equal(source.includes("recordShuffle(sampled, count, sampled)"), false);
  assert.equal(source.includes("dragThickness"), false);
  assert.match(source, /lockedThickness/);
  assert.match(source, /countThickness/);
  assert.match(source, /if \(holding\.current \|\| thicknessDrag\.current\) return/);
  const move = source.slice(source.indexOf("onPointerMove"), source.indexOf("onPointerUp"));
  assert.equal(move.includes("thicknessRef"), false);
  assert.equal(move.includes("moveThickness"), false);
  for (const reason of ["release", "cancel", "lost-capture", "blur", "key"] as const) {
    assert.match(source, new RegExp(`parkThickness\\("${reason}"\\)|parkRef\\.current\\("${reason}"\\)`));
  }
});

for (const count of [2, 3, 22, 52, 78]) {
  test(`packet thickness stays inside a real grip for ${count} cards`, () => {
    const before = deck(count);
    const thinOver = plan("overhand", count, 0);
    const thickOver = plan("overhand", count, 1);
    const neutralOver = plan("overhand", count, 0.5);
    const thinStrips = strips(thinOver, "strip_top_to_receiver_top");
    const thickStrips = strips(thickOver, "strip_top_to_receiver_top");
    const neutralStrips = strips(neutralOver, "strip_top_to_receiver_top");
    assert.equal(thinStrips[0], 1);
    assert.ok(thickStrips[0]! < count, "a thick overhand must not take the whole stock");
    assert.equal(thinOver.orderChanged, true);
    assert.equal(thickOver.orderChanged, true);
    assert.notDeepEqual(thickOver.afterOrder, before);
    assert.equal(thinOver.input.inputAttribution.packetSizes, "derived");
    assert.equal(thinOver.input.inputAttribution.variation, undefined);
    assert.notEqual(thinOver.input.inputAttribution.packetSizes, "reader");
    if (count === 2) {
      assert.equal(thickStrips[0], 1);
      assert.deepEqual(thinOver.afterOrder, thickOver.afterOrder);
    } else {
      assert.ok(thickStrips[0]! > 1);
      assert.notDeepEqual(thinOver.afterOrder, thickOver.afterOrder);
      if (count >= 22) assert.ok(neutralStrips[0]! < count / 3, "neutral overhand is a handful, not half the deck");
    }

    const thinWash = plan("table_wash", count, 0);
    const thickWash = plan("table_wash", count, 1);
    assert.equal(thinWash.input.inputAttribution.positions, "derived");
    assert.equal(thinWash.input.inputAttribution.pickupAxis, "derived");
    assert.equal(thinWash.input.inputAttribution.positionVariation, "algorithm-selected");
    assert.notDeepEqual(
      thinWash.events.filter((event) => event.kind === "pickup").map((event) => event.kind === "pickup" ? event.cardId : 0),
      thickWash.events.filter((event) => event.kind === "pickup").map((event) => event.kind === "pickup" ? event.cardId : 0),
    );
    assert.notDeepEqual(thinWash.afterOrder, thickWash.afterOrder);
    assert.equal(thickWash.orderChanged, thickWash.afterOrder.some((id, index) => id !== before[index]));
    if (count >= 3) assert.equal(thickWash.orderChanged, true);

    const thinCut = plan("original", count, 0);
    const thickCut = plan("original", count, 1);
    assert.deepEqual(thinCut.input.packetSizes, thickCut.input.packetSizes);
    assert.deepEqual(thinCut.afterOrder, thickCut.afterOrder);
    assert.equal(thinCut.input.inputAttribution.packetSizes, "reader");
    assert.equal(thinCut.orderChanged, true);

    const thinRiffle = plan("riffle_bridge", count, 0);
    const thickRiffle = plan("riffle_bridge", count, 1);
    assert.deepEqual(thinRiffle.input.packetSizes, thickRiffle.input.packetSizes);
    assert.equal(thinRiffle.input.inputAttribution.releases, "derived");
    assert.equal(thinRiffle.input.inputAttribution.releaseVariation, "algorithm-selected");
    const runsOf = (trace: ReturnType<typeof plan>) =>
      trace.events.filter((event) => event.action.startsWith("riffle_release_") && event.kind === "transfer").map((event) => event.kind === "transfer" ? event.count : 0);
    const sidesOf = (trace: ReturnType<typeof plan>) =>
      trace.events.filter((event) => event.action.startsWith("riffle_release_") && event.kind === "transfer").map((event) => event.kind === "transfer" ? event.from : "");
    assert.equal(Math.max(...runsOf(thinRiffle)), 1);
    const thickRun = Math.max(...runsOf(thickRiffle));
    const half = Math.max(...(thickRiffle.input.packetSizes ?? [1]));
    if (half > 1) assert.ok(thickRun < half);
    if (count >= 22) {
      assert.ok(thickRun > 1);
      assert.ok(thickRun <= 4);
      assert.notDeepEqual(thinRiffle.afterOrder, thickRiffle.afterOrder);
      const sides = sidesOf(thickRiffle);
      const firstOther = sides.findIndex((side) => side !== sides[0]);
      assert.ok(firstOther > 0 && firstOther < sides.length);
      assert.ok(sides.slice(firstOther).includes(sides[0]!));
      assert.equal(thickRiffle.orderChanged, true);
    }

    if (count >= 3) {
      const thinHindu = plan("hindu", count, 0);
      const thickHindu = plan("hindu", count, 1);
      const thinBottom = strips(thinHindu, "strip_bottom_to_receiver_top");
      const thickBottom = strips(thickHindu, "strip_bottom_to_receiver_top");
      assert.equal(thinBottom[0], 1);
      assert.ok(thickBottom[0]! < count);
      assert.equal(thinHindu.input.inputAttribution.packetSizes, "derived");
      assert.equal(thinHindu.orderChanged, true);
      assert.equal(thickHindu.orderChanged, true);
      if (count >= 22) {
        assert.ok(thickBottom[0]! > 1);
        assert.notEqual(thinBottom[0], thickBottom[0]);
        assert.notDeepEqual(thinHindu.input.groups, thickHindu.input.groups);
      }
    }

    if (count >= 4) {
      const thinThird = plan("three_packet_cut", count, 0);
      const thickThird = plan("three_packet_cut", count, 1);
      assert.deepEqual(thinThird.input.cutPoints, thickThird.input.cutPoints);
      assert.equal(thinThird.input.inputAttribution.cutPoints, "algorithm-selected");
      assert.equal(thinThird.events.some((event) => /nudge|rotate/i.test(event.action)), false);
    }
  });
}

test("cut depth and packet thickness are different inputs", () => {
  const before = deck(52);
  const shallow = planPhysicalShuffle({ style: "riffle_bridge", before, ratio: 0.15, thickness: 1, seed: 11 });
  const deep = planPhysicalShuffle({ style: "riffle_bridge", before, ratio: 0.9, thickness: 1, seed: 11 });
  assert.notDeepEqual(shallow.input.packetSizes, deep.input.packetSizes);
  const sameSplit = planPhysicalShuffle({ style: "riffle_bridge", before, ratio: 0.9, thickness: 0, seed: 11 });
  assert.deepEqual(sameSplit.input.packetSizes, deep.input.packetSizes);
  assert.notDeepEqual(
    sameSplit.events.filter((event) => event.action.startsWith("riffle_release_")).map((event) => event.kind === "transfer" ? event.count : 0),
    deep.events.filter((event) => event.action.startsWith("riffle_release_")).map((event) => event.kind === "transfer" ? event.count : 0),
  );

  const lowCut = planPhysicalShuffle({ style: "original", before, ratio: 0.1, thickness: 1, seed: 4 });
  const highCut = planPhysicalShuffle({ style: "original", before, ratio: 0.9, thickness: 0, seed: 4 });
  assert.notDeepEqual(lowCut.input.packetSizes, highCut.input.packetSizes);
  assert.equal(lowCut.input.packetSizes?.[0], 6);
  assert.equal(highCut.input.packetSizes?.[0], 46);

  const lowThird = planPhysicalShuffle({ style: "three_packet_cut", before, ratio: 0.1, thickness: 1, seed: 4 });
  const highThird = planPhysicalShuffle({ style: "three_packet_cut", before, ratio: 0.9, thickness: 0, seed: 4 });
  assert.notDeepEqual(lowThird.input.cutPoints, highThird.input.cutPoints);
  const explicit = planPhysicalShuffle({
    style: "three_packet_cut",
    before,
    ratio: 0.9,
    thickness: 0,
    cutPoints: [10, 30],
    readerChoices: { cutPoints: true },
    seed: 4,
  });
  assert.deepEqual(explicit.input.cutPoints, [10, 30]);
  assert.equal(explicit.input.inputAttribution.cutPoints, "reader");

  const section = planPhysicalShuffle({
    style: "original",
    before: deck(22),
    ratio: 3 / 7,
    thickness: 0.8,
    readerChoices: { ratio: false },
    seed: 2,
  });
  assert.equal(section.input.inputAttribution.ratio, "algorithm-selected");
  assert.equal(section.input.inputAttribution.packetSizes, "algorithm-selected");
  assert.equal(section.input.inputAttribution.thickness, "reader");
});

test("extreme thumbs stay put, and a whole-deck packet is detected as unchanged", () => {
  const before = deck(52);
  for (const seed of [1, 11, 99, 400]) {
    const thin = planPhysicalShuffle({ style: "overhand", before, thickness: 0, seed, ratio: 0.5 });
    const thick = planPhysicalShuffle({ style: "overhand", before, thickness: 1, seed, ratio: 0.5 });
    assert.equal(strips(thin, "strip_top_to_receiver_top")[0], 1);
    assert.equal(strips(thick, "strip_top_to_receiver_top")[0], 7);
    assert.equal(thin.orderChanged, true);
    assert.equal(thick.orderChanged, true);
    const again = planPhysicalShuffle({ style: "overhand", before, thickness: 1, seed, ratio: 0.5 });
    assert.deepEqual(again.events, thick.events);
    assert.deepEqual(replayPhysicalShuffle(before, thick), thick.afterOrder);
  }
  const identity = planPhysicalShuffle({
    style: "overhand",
    before: deck(8),
    packetSizes: [8],
    readerChoices: { packetSizes: true },
    seed: 2,
  });
  assert.equal(identity.orderChanged, false);
  assert.deepEqual(identity.afterOrder, deck(8));
  assert.equal(identity.input.inputAttribution.packetSizes, "reader");
});

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
