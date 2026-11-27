import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SHUFFLE_STYLES, type ShuffleStyle } from "./events.ts";
import { planPhysicalShuffle } from "./mechanics.ts";
import { MAX_MOTION_BYTES, inspectMotion, replayPhysicalShuffle } from "./replay.ts";

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => 101 + 17 * index);
}

function sameInventory(left: readonly number[], right: readonly number[]) {
  assert.deepEqual([...left].sort((a, b) => a - b), [...right].sort((a, b) => a - b));
}

for (const count of [1, 2, 3, 7, 22, 52, 78, 91]) {
  for (const style of SHUFFLE_STYLES) {
    test(`${style} conserves and replays ${count} nonconsecutive ids`, () => {
      const deck = ids(count);
      const trace = planPhysicalShuffle({ style, before: deck, ratio: 0.37, turn: 2, seed: 0xcaffee01 });
      sameInventory(deck, trace.afterOrder);
      assert.equal(trace.afterOrder.length, count);
      assert.deepEqual(replayPhysicalShuffle(deck, trace), trace.afterOrder);
      assert.deepEqual(deck, ids(count));
      if (count < 2) {
        assert.deepEqual(trace.events, []);
        return;
      }
      assert.ok(trace.events.length > 0);
      assert.equal(trace.events.some((event) => event.kind === "square"), true);
      const zones = inspectMotion(deck, trace.events);
      for (const view of zones) {
        const seen = Object.values(view.zones).flat();
        sameInventory(deck, seen);
        assert.equal(new Set(seen).size, seen.length);
      }
      for (const event of trace.events) {
        if (event.kind === "transfer") assert.equal(event.cards.length, event.count);
      }
    });
  }
}

test("original is a visible packet cut, not a hidden permutation", () => {
  const deck = ids(10);
  const trace = planPhysicalShuffle({ style: "original", before: deck, ratio: 0.4, seed: 12 });
  const cut = Math.ceil(0.4 * (deck.length - 1));
  assert.deepEqual(trace.afterOrder, [...deck.slice(cut), ...deck.slice(0, cut)]);
  assert.equal(trace.events.some((event) => event.action === "tuck_upper_under"), true);
  assert.equal(trace.events.some((event) => /hidden|fisher|nudge/i.test(event.action)), false);
  const other = planPhysicalShuffle({ style: "original", before: deck, ratio: 0.8, seed: 12 });
  assert.notDeepEqual(other.afterOrder, trace.afterOrder);
});

test("overhand reverses stripped packets and keeps cards inside each packet", () => {
  const deck = ids(6);
  const trace = planPhysicalShuffle({ style: "overhand", before: deck, packetSizes: [2, 3, 1], seed: 3 });
  assert.deepEqual(trace.afterOrder, [deck[5]!, ...deck.slice(2, 5), ...deck.slice(0, 2)]);
  assert.deepEqual(
    trace.events.filter((event) => event.action === "strip_top_to_receiver_top").map((event) => event.kind === "transfer" ? event.cards : []),
    [[deck[0], deck[1]], [deck[2], deck[3], deck[4]], [deck[5]]],
  );
});

test("hindu strips from the bottom and places the last stock underneath", () => {
  const deck = ids(6);
  const trace = planPhysicalShuffle({ style: "hindu", before: deck, packetSizes: [2, 1, 1], seed: 3 });
  const strips = trace.events.filter((event) => event.action === "strip_bottom_to_receiver_top");
  assert.deepEqual(strips.map((event) => (event.kind === "transfer" ? event.cards : [])), [deck.slice(4), [deck[3]], [deck[2]]]);
  assert.deepEqual(trace.afterOrder, [deck[2], deck[3], deck[4], deck[5], deck[0], deck[1]]);
  assert.equal(trace.events.some((event) => event.action === "place_remaining_below_receiver"), true);
});

test("riffle releases bottoms and the bridge does not reorder the merged pack", () => {
  const deck = ids(8);
  const trace = planPhysicalShuffle({ style: "riffle_bridge", before: deck, ratio: 0.5, seed: 101 });
  const releases = trace.events.filter((event) => event.action.startsWith("riffle_release_"));
  assert.ok(releases.length >= 4);
  assert.ok(releases.every((event) => event.kind === "transfer" && event.take === "bottom" && event.place === "top" && (event.from === "left" || event.from === "right")));
  const cut = Math.ceil(0.5 * (deck.length - 1));
  const left = deck.slice(0, cut);
  const right = deck.slice(cut);
  const seenLeft: number[] = [];
  const seenRight: number[] = [];
  for (const event of releases) {
    if (event.kind !== "transfer") continue;
    const bucket = event.from === "left" ? seenLeft : seenRight;
    const source = event.from === "left" ? left : right;
    const remaining = source.filter((id) => !bucket.includes(id));
    assert.deepEqual(event.cards, remaining.slice(-event.count));
    bucket.push(...event.cards);
  }
  assert.deepEqual([...seenLeft].sort((a, b) => a - b), [...left].sort((a, b) => a - b));
  assert.deepEqual([...seenRight].sort((a, b) => a - b), [...right].sort((a, b) => a - b));
  const views = inspectMotion(deck, trace.events);
  const squareAt = trace.events.findIndex((event) => event.kind === "square");
  assert.deepEqual(views[squareAt]?.zones, views[squareAt - 1]?.zones);
  const deeper = planPhysicalShuffle({ style: "riffle_bridge", before: deck, ratio: 0.7, seed: 101 });
  assert.notDeepEqual(deeper.afterOrder, trace.afterOrder);
});

test("three-packet pickup has no trailing rotation and no phantom third packet", () => {
  const deck = ids(9);
  const trace = planPhysicalShuffle({
    style: "three_packet_cut",
    before: deck,
    cutPoints: [3, 6],
    pickupOrder: [2, 0, 1],
    seed: 11,
  });
  assert.deepEqual(trace.afterOrder, [...deck.slice(6), ...deck.slice(0, 3), ...deck.slice(3, 6)]);
  assert.equal(trace.events.some((event) => /nudge|rotate/i.test(event.action)), false);
  const two = planPhysicalShuffle({ style: "three_packet_cut", before: ids(2), seed: 0 });
  assert.equal(two.events.some((event) => event.kind === "transfer" && event.to === "packet2"), false);
  assert.equal(two.afterOrder.length, 2);
});

test("wash gathers by the recorded sweep and rejects a card that is not next", () => {
  const deck = ids(22);
  const trace = planPhysicalShuffle({ style: "table_wash", before: deck, ratio: 0.4, seed: 1234 });
  assert.ok(trace.events.filter((event) => event.kind === "slide").length >= deck.length * 3);
  assert.equal(trace.events.filter((event) => event.kind === "pickup").length, deck.length);
  const pair = planPhysicalShuffle({ style: "table_wash", before: ids(2), ratio: 0.25, seed: 9 });
  const moved = new Set(pair.events.flatMap((event) => (event.kind === "transfer" ? event.cards : event.kind === "slide" || event.kind === "pickup" ? [event.cardId] : [])));
  assert.deepEqual([...moved].sort((a, b) => a - b), ids(2));
  assert.equal(pair.events.some((event) => event.kind === "transfer" && /packet[2-3]/.test(event.to)), false);
  const corrupted = structuredClone(trace);
  const pickup = corrupted.events.find((event) => event.kind === "pickup");
  assert.ok(pickup && pickup.kind === "pickup");
  pickup.cardId = 1234567;
  assert.throws(() => replayPhysicalShuffle(deck, corrupted), /spatial pickup order/);
  const escaped = structuredClone(trace);
  const slide = escaped.events.find((event) => event.kind === "slide");
  assert.ok(slide && slide.kind === "slide");
  slide.to = { x: 4, y: 0.2 };
  assert.throws(() => replayPhysicalShuffle(deck, escaped), /escapes table|slide origin|teleport/);
});

test("a forged packet, a missing move, or a fabricated order is rejected", () => {
  const before = ids(10);
  const trace = planPhysicalShuffle({ style: "overhand", before, seed: 19 });
  const altered = structuredClone(trace);
  const transfer = altered.events.find((event) => event.kind === "transfer");
  assert.ok(transfer && transfer.kind === "transfer");
  transfer.cards[0] = 999;
  assert.throws(() => replayPhysicalShuffle(before, altered), /packet/);
  const vanished = structuredClone(trace);
  vanished.events = vanished.events.filter((event) => event.action !== "finish_overhand").map((event, seq) => ({ ...event, seq }));
  assert.throws(() => replayPhysicalShuffle(before, vanished), /not accounted|not fully|Packet/);
  const switched = structuredClone(trace);
  switched.afterOrder = [...switched.afterOrder].reverse();
  assert.throws(() => replayPhysicalShuffle(before, switched), /Claimed result/);
  const script = structuredClone(trace);
  script.events = [];
  assert.throws(() => replayPhysicalShuffle(before, script), /no movements/);
});

test("the same physical choices replay without a random source, and different choices differ", () => {
  const before = ids(78);
  const first = planPhysicalShuffle({ style: "riffle_bridge", before, ratio: 0.48, seed: 123 });
  const second = planPhysicalShuffle({ style: "riffle_bridge", before, ratio: 0.48, seed: 123 });
  const third = planPhysicalShuffle({ style: "riffle_bridge", before, ratio: 0.48, seed: 456 });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.afterOrder, third.afterOrder);
  const random = Math.random;
  Math.random = () => {
    throw new Error("replay consulted a random source");
  };
  try {
    assert.deepEqual(replayPhysicalShuffle(before, first), first.afterOrder);
  } finally {
    Math.random = random;
  }
  assert.equal(first.input.inputAttribution.releases, "algorithm-selected");
  assert.equal(first.input.inputAttribution.ratio, "reader");
});

test("varied ratios and seeds keep the exact drawing pile", () => {
  for (let count = 2; count <= 12; count += 1) {
    for (const style of SHUFFLE_STYLES) {
      const before = ids(count);
      const trace = planPhysicalShuffle({ style, before, ratio: ((count * 23) % 97) / 97, turn: count % 3, seed: 997 });
      sameInventory(before, trace.afterOrder);
      assert.deepEqual(replayPhysicalShuffle(before, trace), trace.afterOrder);
    }
  }
});

test("a valid wash stays inside the size cap and repeated passes replay", () => {
  let pile = ids(78);
  const trace = planPhysicalShuffle({ style: "table_wash", before: pile, ratio: 0.33, seed: 77 });
  const bytes = JSON.stringify(trace).length;
  assert.ok(bytes < MAX_MOTION_BYTES, `wash transcript is ${bytes} bytes`);
  assert.equal(trace.events.length, replayCount(trace.events.length));
  const started = performance.now();
  for (let pass = 0; pass < 20; pass += 1) {
    const next = planPhysicalShuffle({ style: "table_wash", before: pile, ratio: (pass % 5) / 5, turn: pass, seed: 1000 + pass });
    pile = replayPhysicalShuffle(pile, next);
  }
  const elapsed = performance.now() - started;
  assert.equal(pile.length, 78);
  assert.ok(elapsed < 3000, `20 wash passes took ${elapsed.toFixed(1)}ms`);
});

function replayCount(count: number) {
  return count;
}

test("the table asks the movement engine, not the old style permutation", () => {
  const source = readFileSync(new URL("../../../components/reading-table.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("shuffleByStyle"), false);
  assert.equal(source.includes("applyRealizedShuffle"), false);
  assert.match(source, /applyPhysicalMotionShuffle/);
  assert.equal(source.includes("shuffleSplit"), false);
  assert.match(source, /compileVisualPass/);
});

test("algorithm packet sizes are labeled, and an explicit reader packet is labeled", () => {
  const deck = ids(8);
  const generated = planPhysicalShuffle({ style: "overhand", before: deck, ratio: 0.2, seed: 5 });
  const chosen = planPhysicalShuffle({
    style: "overhand",
    before: deck,
    packetSizes: [1, 1, 1, 1, 1, 1, 1, 1],
    readerChoices: { packetSizes: true },
    seed: 5,
  });
  assert.equal(generated.input.inputAttribution.packetSizes, "algorithm-selected");
  assert.equal(chosen.input.inputAttribution.packetSizes, "reader");
  assert.notDeepEqual(generated.afterOrder, chosen.afterOrder);
  const styles: ShuffleStyle[] = [...SHUFFLE_STYLES];
  assert.deepEqual(styles, ["original", "overhand", "riffle_bridge", "hindu", "table_wash", "three_packet_cut"]);
});
