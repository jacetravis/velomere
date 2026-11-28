import { MOTION_SCHEMA, isShuffleStyle, type MotionEvent, type MotionSource, type PhysicalShuffleTrace, type PickupEvent, type ShuffleStyle, type SlideEvent, type SquareEvent, type TransferEvent } from "./events";
import { replayPhysicalShuffle } from "./replay";

/**
 * Six grips. The event list is the shuffle. Nothing here may be re-rolled on replay.
 *
 * original — one visible cut from the pass ratio, never from packet thickness.
 *   A rotation, not a random shuffle. The deck drag is the explicit cut.
 * overhand — hold the stock and strip top packets onto the top of the other hand
 *   until it is empty. Thickness chooses a handful, not a fraction of the stock.
 *   The thickest strip still leaves cards behind, so one pass cannot be a no-op.
 * riffle_bridge — split at the pass ratio. Thickness only changes how many cards
 *   leave a half together. It does not move the split. The bridge squares; it does not reorder.
 * hindu — bottom-strip grip. Thickness chooses each bottom pull. The last stock
 *   is placed underneath. A pull never takes the whole stock.
 * table_wash — discrete kinematic wash. Thickness sets how far the cards spread
 *   and which way they are gathered. Not a contact simulation.
 * three_packet_cut — two boundaries from the pass ratio or an explicit cut.
 *   Thickness does not move them. No trailing rotation. Two cards make two packets.
 */

export type ShufflePlan = {
  style: ShuffleStyle;
  before: readonly number[];
  ratio?: number;
  turn?: number;
  /** 0 = thinnest legal packets, 1 = thickest, omitted = the stage 2 ratio formulas. */
  thickness?: number;
  seed?: number;
  packetSizes?: readonly number[] | null;
  cutPoints?: readonly [number, number] | null;
  pickupOrder?: readonly number[] | null;
  /** Ratios chosen once for this shuffle-count run. This pass must use `cutSequence[cutSequenceIndex]`. */
  cutSequence?: readonly number[] | null;
  cutSequenceIndex?: number;
  originalDeckCount?: number;
  /** Explicit packet, cut, pickup, or ratio values chosen by the reader rather than this planner. */
  readerChoices?: {
    packetSizes?: boolean;
    cutPoints?: boolean;
    pickupOrder?: boolean;
    /** False when the pass ratio is a section chosen for the run, not a finger cut. */
    ratio?: boolean;
    /** True only when the reader named the cut ratios themselves. */
    cutSequence?: boolean;
    /** True when the reader chose how many passes, not the depth of each one. */
    passCount?: boolean;
  };
};

type Work = {
  zones: Map<string, number[]>;
  pos: Map<number, { x: number; y: number }>;
};

function fail(message: string): never {
  throw new Error(message);
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

function rounded(value: number) {
  return Math.round(value * 100000) / 100000;
}

function same(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function randomSeed(seed: number) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) fail("A finite uint32 seed is required");
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

function cutIndex(length: number, ratio: number) {
  if (length < 2) return 0;
  return clamp(Math.ceil(clamp(ratio, 0, 1) * (length - 1)), 1, length - 1);
}

/** Packet size from the thumb, inside a grip's real range. The chosen size stays fixed; a remainder may be smaller. */
function calibratedPacket(
  remaining: number,
  deckSize: number,
  thickness: number,
  bounds: { min: number; max: number },
  leave = 0,
) {
  const room = remaining - leave;
  if (room < 1) fail("Cannot move empty packet");
  let hi = Math.min(bounds.max, room);
  const lowBound = Math.min(bounds.min, hi);
  const untouched = remaining === deckSize && leave === 0;
  if (untouched && hi >= remaining) hi = Math.max(1, remaining - 1);
  const low = Math.min(lowBound, hi);
  const t = clamp(thickness, 0, 1);
  return clamp(Math.round(low + (hi - low) * t), low, hi);
}

/** Overhand handful. Thick is clumsy, never the whole stock. */
function overhandBounds(deckSize: number) {
  if (deckSize <= 2) return { min: 1, max: 1 };
  return { min: 1, max: clamp(Math.round(deckSize * 0.14), 2, Math.min(12, deckSize - 1)) };
}

/** Hindu bottom pull. Always leaves a stock, and more than one card on a larger deck. */
function hinduBounds(deckSize: number) {
  if (deckSize <= 3) return { min: 1, max: 1 };
  return { min: 1, max: clamp(Math.round(deckSize * 0.16), 2, Math.min(16, deckSize - 2)) };
}

/** Riffle release. A few cards at a time so the halves still weave. */
function riffleBounds(deckSize: number) {
  if (deckSize < 8) return { min: 1, max: 1 };
  if (deckSize < 22) return { min: 1, max: 2 };
  if (deckSize < 52) return { min: 1, max: 3 };
  return { min: 1, max: 4 };
}

/** The packet size a touch-down thickness asks for. Null when this grip does not take thickness. */
export function gripPacketTarget(style: ShuffleStyle, deckSize: number, thickness: number) {
  if (deckSize < 2 || !Number.isFinite(thickness)) return null;
  if (style === "overhand") return calibratedPacket(deckSize, deckSize, thickness, overhandBounds(deckSize));
  if (style === "hindu") return calibratedPacket(deckSize, deckSize, thickness, hinduBounds(deckSize), 1);
  if (style === "riffle_bridge") return calibratedPacket(deckSize, deckSize, thickness, riffleBounds(deckSize));
  return null;
}

function zone(state: Work, name: string) {
  let cards = state.zones.get(name);
  if (!cards) {
    cards = [];
    state.zones.set(name, cards);
  }
  return cards;
}

function recordedGroups(style: ShuffleStyle, events: readonly MotionEvent[]): number[][] {
  const take = (event: MotionEvent) => (event.kind === "transfer" ? [[...event.cards]] : []);
  if (style === "overhand") return events.flatMap((event) => (event.kind === "transfer" && event.action === "strip_top_to_receiver_top" ? take(event) : []));
  if (style === "hindu") {
    return events.flatMap((event) =>
      event.kind === "transfer" && (event.action === "strip_bottom_to_receiver_top" || event.action === "place_remaining_below_receiver") ? take(event) : [],
    );
  }
  if (style === "riffle_bridge") return events.flatMap((event) => (event.kind === "transfer" && event.action.startsWith("riffle_release_") ? take(event) : []));
  if (style === "original") {
    return events.flatMap((event) =>
      event.kind === "transfer" && (event.action === "lift_upper_packet" || event.action === "put_lower_on_result") ? take(event) : [],
    );
  }
  if (style === "three_packet_cut") {
    return events.flatMap((event) => (event.kind === "transfer" && event.action.startsWith("make_") ? take(event) : []));
  }
  return [];
}

function conserve(before: readonly number[], state: Work) {
  const seen = [...state.zones.values()].flat();
  if (seen.length !== before.length || new Set(seen).size !== seen.length) fail("Planner lost a card");
}

function pickupCandidate(state: Work, axis: readonly [number, number]) {
  const wash = zone(state, "wash");
  const [ax, ay] = axis;
  return [...wash].sort((a, b) => {
    const ap = state.pos.get(a)!;
    const bp = state.pos.get(b)!;
    const along = ap.x * ax + ap.y * ay - (bp.x * ax + bp.y * ay);
    if (Math.abs(along) > 1e-9) return along;
    const across = ap.y * ax - ap.x * ay - (bp.y * ax - bp.x * ay);
    if (Math.abs(across) > 1e-9) return across;
    return wash.indexOf(b) - wash.indexOf(a);
  })[0]!;
}

function apply(state: Work, event: MotionEvent, before: readonly number[]) {
  if (event.kind === "transfer") {
    const from = zone(state, event.from);
    const packet = event.take === "top" ? from.splice(0, event.count) : from.splice(from.length - event.count, event.count);
    if (event.place === "top") zone(state, event.to).unshift(...packet);
    else zone(state, event.to).push(...packet);
    if (event.to === "wash") for (const id of packet) state.pos.set(id, { x: 0.5, y: 0.5 });
    if (event.from === "wash") for (const id of packet) state.pos.delete(id);
  } else if (event.kind === "slide") {
    state.pos.set(event.cardId, { ...event.to });
  } else if (event.kind === "pickup") {
    const wash = zone(state, "wash");
    wash.splice(wash.indexOf(event.cardId), 1);
    state.pos.delete(event.cardId);
    zone(state, "draw").push(event.cardId);
  }
  conserve(before, state);
}

export function planPhysicalShuffle(plan: ShufflePlan): PhysicalShuffleTrace {
  if (!isShuffleStyle(plan.style)) fail("Unknown style");
  const ratio = plan.ratio ?? 0.5;
  const turn = plan.turn ?? 0;
  const seed = plan.seed ?? 1;
  const thickness = plan.thickness;
  if (!Number.isFinite(ratio)) fail("Invalid ratio");
  if (thickness != null && !Number.isFinite(thickness)) fail("Invalid packet thickness");
  if (!Number.isInteger(turn) || turn < 0) fail("Invalid turn");
  const before = [...plan.before];
  if (before.some((id) => !Number.isInteger(id)) || new Set(before).size !== before.length) fail("Invalid draw pile");
  const rng = randomSeed(seed);
  const state: Work = { zones: new Map([["draw", [...before]]]), pos: new Map() };
  const events: MotionEvent[] = [];
  const attribution: Record<string, MotionSource> = {
    style: "reader",
    ratio: "reader",
    turn: "algorithm-selected",
    seed: "algorithm-selected",
    ...(thickness != null ? { thickness: "reader" as const } : {}),
  };
  if (plan.readerChoices?.ratio === false) attribution.ratio = "algorithm-selected";

type Draft = Omit<TransferEvent, "seq" | "t"> | Omit<SlideEvent, "seq" | "t"> | Omit<PickupEvent, "seq" | "t"> | Omit<SquareEvent, "seq" | "t">;

  const push = (event: Draft) => {
    const stamped = { ...event, seq: events.length, t: 0 } as MotionEvent;
    apply(state, stamped, before);
    events.push(stamped);
    return stamped;
  };
  const transfer = (from: string, to: string, count: number, take: "top" | "bottom", place: "top" | "bottom", action: string) => {
    const cards = zone(state, from);
    if (count <= 0 || count > cards.length) fail("Cannot move empty packet");
    const packet = take === "top" ? cards.slice(0, count) : cards.slice(-count);
    return push({ kind: "transfer", action, from, to, count, take, place, cards: [...packet] });
  };
  const slide = (id: number, x: number, y: number, action: string) => {
    const from = state.pos.get(id);
    if (!from) fail("Cannot slide a card that is not on the table");
    return push({
      kind: "slide",
      action,
      cardId: id,
      from: { ...from },
      to: { x: rounded(clamp(x, 0, 1)), y: rounded(clamp(y, 0, 1)) },
    });
  };
  const pickup = (axis: [number, number]) => {
    const id = pickupCandidate(state, axis);
    return push({ kind: "pickup", action: "gather_from_table", cardId: id, axis: [...axis] });
  };
  const square = (...zones: string[]) => push({ kind: "square", action: "square_without_reordering", zones });

  const n = before.length;
  const originalDeckCount = plan.originalDeckCount ?? n;
  let packetSizes: number[] | undefined;
  let cutPoints: [number, number] | undefined;
  let pickupOrder: number[] | undefined;
  let cutSequence: number[] | undefined;
  let cutSequenceIndex: number | undefined;
  if (plan.cutSequence) {
    const sequence = [...plan.cutSequence];
    const index = plan.cutSequenceIndex ?? 0;
    if (sequence.length < 1 || sequence.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) fail("Invalid cut sequence");
    if (!Number.isInteger(index) || index < 0 || index >= sequence.length) fail("This pass is outside the planned cuts");
    if (Math.abs(sequence[index]! - ratio) > 1e-9) fail("This pass left its planned cut");
    cutSequence = sequence;
    cutSequenceIndex = index;
    attribution.cutSequence = plan.readerChoices?.cutSequence ? "reader" : "algorithm-selected";
    attribution.passCount = plan.readerChoices?.passCount ? "reader" : "algorithm-selected";
  }

  if (n >= 2) {
    switch (plan.style) {
      case "original": {
        const cut = cutIndex(n, ratio);
        packetSizes = [cut, n - cut];
        attribution.packetSizes = attribution.ratio;
        transfer("draw", "upper", cut, "top", "bottom", "lift_upper_packet");
        transfer("draw", "result", n - cut, "top", "bottom", "put_lower_on_result");
        transfer("upper", "result", cut, "top", "bottom", "tuck_upper_under");
        transfer("result", "draw", n, "top", "bottom", "square_original_cut");
        square("draw");
        break;
      }
      case "overhand": {
        transfer("draw", "held", n, "top", "bottom", "hold_deck");
        const sizes: number[] = [];
        let strip = 0;
        while (zone(state, "held").length) {
          const left = zone(state, "held").length;
          const suggested = plan.packetSizes?.[strip];
          const portion = 0.08 + 0.1 * clamp(ratio, 0, 1) + 0.12 * rng();
          const count = suggested == null
            ? thickness == null
              ? Math.min(left, Math.max(1, Math.round(n * portion)))
              : calibratedPacket(left, n, thickness, overhandBounds(n))
            : suggested;
          transfer("held", "receive", count, "top", "top", "strip_top_to_receiver_top");
          sizes.push(count);
          strip += 1;
        }
        packetSizes = sizes;
        attribution.packetSizes = plan.packetSizes
          ? plan.readerChoices?.packetSizes ? "reader" : "algorithm-selected"
          : thickness == null ? "algorithm-selected" : "derived";
        transfer("receive", "draw", n, "top", "bottom", "finish_overhand");
        square("draw");
        break;
      }
      case "hindu": {
        transfer("draw", "held", n, "top", "bottom", "hold_deck");
        const sizes: number[] = [];
        let strip = 0;
        while (zone(state, "held").length > 1) {
          if (plan.packetSizes && strip >= plan.packetSizes.length) break;
          const remaining = zone(state, "held").length;
          const suggested = plan.packetSizes?.[strip];
          const portion = 0.1 + 0.12 * clamp(ratio, 0, 1) + 0.1 * rng();
          const count = suggested == null
            ? thickness == null
              ? Math.min(remaining - 1, Math.max(1, Math.round(n * portion)))
              : calibratedPacket(remaining, n, thickness, hinduBounds(n), 1)
            : suggested;
          if (count <= 0 || count >= remaining) fail("Hindu must leave the final packet to place underneath");
          transfer("held", "receive", count, "bottom", "top", "strip_bottom_to_receiver_top");
          sizes.push(count);
          strip += 1;
          if (thickness == null && !plan.packetSizes && strip >= Math.max(1, Math.min(5, n - 1))) break;
        }
        const rest = zone(state, "held").length;
        sizes.push(rest);
        packetSizes = sizes;
        attribution.packetSizes = plan.packetSizes
          ? plan.readerChoices?.packetSizes ? "reader" : "algorithm-selected"
          : thickness == null ? "algorithm-selected" : "derived";
        transfer("held", "receive", rest, "top", "bottom", "place_remaining_below_receiver");
        transfer("receive", "draw", n, "top", "bottom", "finish_hindu");
        square("draw");
        break;
      }
      case "riffle_bridge": {
        const cut = cutIndex(n, ratio);
        packetSizes = [cut, n - cut];
        attribution.packetSizes = attribution.ratio;
        attribution.releases = thickness == null ? "algorithm-selected" : "derived";
        if (thickness != null) attribution.releaseVariation = "algorithm-selected";
        transfer("draw", "left", cut, "top", "bottom", "split_left");
        transfer("draw", "right", n - cut, "top", "bottom", "split_right");
        let turnIndex = 0;
        while (zone(state, "left").length || zone(state, "right").length) {
          const left = zone(state, "left").length;
          const right = zone(state, "right").length;
          const side = left === 0 ? "right" : right === 0 ? "left" : rng() < left / (left + right) ? "left" : "right";
          const available = zone(state, side).length;
          const run = thickness == null
            ? Math.min(available, 1 + (rng() < 0.22 ? 1 : 0))
            : Math.min(available, calibratedPacket(available, n, thickness, riffleBounds(n)));
          transfer(side, "merged", run, "bottom", "top", `riffle_release_${turnIndex}`);
          turnIndex += 1;
        }
        square("merged");
        transfer("merged", "draw", n, "top", "bottom", "square_riffle");
        break;
      }
      case "three_packet_cut": {
        if (n === 2) {
          packetSizes = [1, 1];
          attribution.packetSizes = "reader";
          transfer("draw", "packet0", 1, "top", "bottom", "make_first_packet");
          transfer("draw", "packet1", 1, "top", "bottom", "make_second_packet");
          transfer("packet1", "draw", 1, "top", "bottom", "pick_second_first");
          transfer("packet0", "draw", 1, "top", "bottom", "pick_first_second");
          square("draw");
          break;
        }
        const first = plan.cutPoints?.[0] ?? clamp(Math.round(n * (0.2 + 0.32 * clamp(ratio, 0, 1))), 1, n - 2);
        const second = plan.cutPoints?.[1] ?? clamp(Math.round(n * (0.55 + 0.27 * clamp(ratio, 0, 1))), first + 1, n - 1);
        if (!Number.isInteger(first) || !Number.isInteger(second) || first <= 0 || second <= first || second >= n) {
          fail("Invalid three-packet cut boundaries");
        }
        cutPoints = [first, second];
        attribution.cutPoints = plan.cutPoints
          ? plan.readerChoices?.cutPoints ? "reader" : "algorithm-selected"
          : "algorithm-selected";
        transfer("draw", "packet0", first, "top", "bottom", "make_top_packet");
        transfer("draw", "packet1", second - first, "top", "bottom", "make_middle_packet");
        transfer("draw", "packet2", n - second, "top", "bottom", "make_bottom_packet");
        const presets = [
          [1, 2, 0],
          [2, 0, 1],
          [2, 1, 0],
        ] as const;
        const chosen = plan.pickupOrder ? [...plan.pickupOrder] : [...presets[turn % 3]!];
        if (!same([...chosen].sort((a, b) => a - b), [0, 1, 2])) fail("Three packet pickup order invalid");
        pickupOrder = chosen;
        attribution.pickupOrder = plan.readerChoices?.pickupOrder ? "reader" : "algorithm-selected";
        for (const packet of chosen) {
          transfer(`packet${packet}`, "draw", zone(state, `packet${packet}`).length, "top", "bottom", `pickup_packet_${packet}`);
        }
        square("draw");
        break;
      }
      case "table_wash": {
        const thumb = thickness == null ? null : clamp(thickness, 0, 1);
        attribution.positions = thumb == null ? "algorithm-selected" : "derived";
        attribution.pickupAxis = thumb == null ? "reader" : "derived";
        if (thumb != null) attribution.positionVariation = "algorithm-selected";
        if (thumb == null) {
          for (const id of before) {
            transfer("draw", "wash", 1, "top", "top", "release_single_card_to_table");
            slide(id, 0.2 + 0.6 * rng(), 0.2 + 0.6 * rng(), "spread_on_workspace");
          }
          for (let beat = 0; beat < 3; beat += 1) {
            for (const id of before) {
              const current = state.pos.get(id)!;
              slide(id, current.x + (rng() - 0.5) * 0.18, current.y + (rng() - 0.5) * 0.18, `wash_stroke_${beat}`);
            }
          }
          const angle = Math.PI * 2 * clamp(ratio, 0, 1);
          const axis: [number, number] = [rounded(Math.cos(angle)), rounded(Math.sin(angle))];
          for (let i = 0; i < n; i += 1) pickup(axis);
        } else {
          const radius = 0.12 + 0.28 * thumb;
          before.forEach((id, index) => {
            transfer("draw", "wash", 1, "top", "top", "release_single_card_to_table");
            const angle = (Math.PI * 2 * index) / n;
            slide(
              id,
              0.5 + Math.cos(angle) * radius + (rng() - 0.5) * 0.02,
              0.5 + Math.sin(angle) * radius + (rng() - 0.5) * 0.02,
              "spread_on_workspace",
            );
          });
          for (let beat = 0; beat < 3; beat += 1) {
            for (const id of before) {
              const current = state.pos.get(id)!;
              slide(id, current.x + (rng() - 0.5) * 0.012, current.y + (rng() - 0.5) * 0.012, `wash_stroke_${beat}`);
            }
          }
          const axis: [number, number] = [rounded(Math.cos(Math.PI * thumb)), rounded(Math.sin(Math.PI * thumb))];
          for (let i = 0; i < n; i += 1) pickup(axis);
        }
        square("draw");
        break;
      }
      default:
        fail("Unknown style");
    }
  }

  const last = Math.max(1, events.length - 1);
  for (const event of events) event.t = rounded(event.seq / last);
  const after = [...(state.zones.get("draw") ?? [])];
  if (after.length !== n) fail("Planner did not reassemble the draw pile");
  const groups = recordedGroups(plan.style, events);
  if (groups.length) {
    const flat = groups.flat();
    if (flat.length !== n || new Set(flat).size !== n) fail("Recorded groups lost a card");
    if (plan.style === "riffle_bridge") attribution.groups = attribution.releases ?? "derived";
    else if (plan.style === "three_packet_cut") attribution.groups = attribution.cutPoints ?? attribution.packetSizes ?? "algorithm-selected";
    else attribution.groups = attribution.packetSizes ?? "derived";
  }
  const trace: PhysicalShuffleTrace = {
    schema: MOTION_SCHEMA,
    style: plan.style,
    source: "reader",
    drawPileCount: n,
    originalDeckCount,
    input: {
      ratio,
      turn,
      seed,
      ...(thickness != null ? { thickness: clamp(thickness, 0, 1) } : {}),
      ...(packetSizes ? { packetSizes } : {}),
      ...(groups.length ? { groups } : {}),
      ...(cutPoints ? { cutPoints } : {}),
      ...(pickupOrder ? { pickupOrder } : {}),
      ...(cutSequence ? { cutSequence, cutSequenceIndex, passCount: cutSequence.length } : {}),
      inputAttribution: attribution,
    },
    events,
    orderChanged: !same(before, after),
    afterOrder: after,
  };
  const replayed = replayPhysicalShuffle(before, trace, originalDeckCount);
  if (!same(replayed, after)) fail("Planner and independent replay disagree");
  return trace;
}
