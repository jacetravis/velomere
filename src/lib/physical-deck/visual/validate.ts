import type { MotionEvent, PhysicalShuffleTrace, TransferEvent } from "../motion/events";

/**
 * Style grammar. Replay proves a trace is a legal movement.
 * This proves the movements are the named grip, and it does not rewrite old traces.
 */

export type MotionClaim = "matched" | "legacy";

/** Read-time label. A legacy preparation, a legacy stamp, or movements that are not the named grip. */
export function motionClaim(operation: {
  kind: string;
  meta: { grammar?: string; motion?: PhysicalShuffleTrace };
}): MotionClaim | null {
  if (operation.kind === "legacy_shuffle_realized") return "legacy";
  if (operation.kind !== "motion_shuffle") return null;
  if (operation.meta.grammar === "legacy") return "legacy";
  const trace = operation.meta.motion;
  if (!trace) return "legacy";
  try {
    validateStyleGrammar(trace);
  } catch {
    return "legacy";
  }
  return "matched";
}

function fail(message: string): never {
  throw new Error(message);
}

function transfer(event: MotionEvent | undefined, action: string): TransferEvent {
  if (!event || event.kind !== "transfer" || event.action !== action) fail(`Expected ${action}`);
  return event;
}

function isTransfer(event: MotionEvent | undefined, action: string): event is TransferEvent {
  return !!event && event.kind === "transfer" && event.action === action;
}

export function validateStyleGrammar(trace: PhysicalShuffleTrace) {
  const events = trace.events;
  const n = trace.drawPileCount;
  if (n < 2) {
    if (events.length) fail("A one-card shuffle cannot invent a movement");
    return;
  }
  if (!events.length) fail("The shuffle recorded no movements");
  switch (trace.style) {
    case "original":
      return validateOriginal(events, n);
    case "overhand":
      return validateOverhand(events, n);
    case "hindu":
      return validateHindu(events, n);
    case "riffle_bridge":
      return validateRiffle(events, n);
    case "table_wash":
      return validateWash(events, n);
    case "three_packet_cut":
      return validateThree(events, n);
    default:
      fail("Unknown style");
  }
}

function endOnSquare(events: readonly MotionEvent[]) {
  const last = events.at(-1);
  if (!last || last.kind !== "square" || last.action !== "square_without_reordering") fail("The grip does not square the deck");
  if (!last.zones.includes("draw") && !last.zones.includes("merged")) fail("The square does not name a real packet");
}

function validateOriginal(events: readonly MotionEvent[], n: number) {
  if (events.length !== 5) fail("Original is one cut, not a mixed shuffle");
  const lift = transfer(events[0], "lift_upper_packet");
  const lower = transfer(events[1], "put_lower_on_result");
  const tuck = transfer(events[2], "tuck_upper_under");
  const back = transfer(events[3], "square_original_cut");
  if (lift.from !== "draw" || lift.to !== "upper" || lift.take !== "top" || lift.place !== "bottom") fail("Original lift is not the top packet");
  if (lower.from !== "draw" || lower.to !== "result" || lower.count !== n - lift.count) fail("Original did not keep the lower stock");
  if (tuck.from !== "upper" || tuck.to !== "result" || tuck.place !== "bottom" || tuck.count !== lift.count) fail("Original tuck changed the lifted packet");
  if (back.from !== "result" || back.to !== "draw" || back.count !== n) fail("Original did not return the cut deck");
  endOnSquare(events);
}

function validateOverhand(events: readonly MotionEvent[], n: number) {
  const hold = transfer(events[0], "hold_deck");
  if (hold.from !== "draw" || hold.to !== "held" || hold.count !== n || hold.take !== "top") fail("Overhand did not pick up the draw pile");
  let index = 1;
  let moved = 0;
  while (isTransfer(events[index], "strip_top_to_receiver_top")) {
    const strip = events[index] as TransferEvent;
    if (strip.from !== "held" || strip.to !== "receive" || strip.take !== "top" || strip.place !== "top") fail("Overhand strip is not a top packet onto the receiver");
    moved += strip.count;
    index += 1;
  }
  if (moved !== n) fail("Overhand did not move the held stock by its recorded strips");
  const finish = transfer(events[index], "finish_overhand");
  if (finish.from !== "receive" || finish.to !== "draw" || finish.count !== n) fail("Overhand finish is not the receiver");
  if (events.length !== index + 2) fail("Overhand has movements that are not strips");
  endOnSquare(events);
}

function validateHindu(events: readonly MotionEvent[], n: number) {
  const hold = transfer(events[0], "hold_deck");
  if (hold.from !== "draw" || hold.to !== "held" || hold.count !== n) fail("Hindu did not pick up the draw pile");
  let index = 1;
  let stripped = 0;
  while (isTransfer(events[index], "strip_bottom_to_receiver_top")) {
    const strip = events[index] as TransferEvent;
    if (strip.from !== "held" || strip.to !== "receive" || strip.take !== "bottom" || strip.place !== "top") fail("Hindu pull is not a bottom packet");
    stripped += strip.count;
    index += 1;
  }
  if (stripped < 1 || stripped >= n) fail("Hindu must leave a final packet to place underneath");
  const rest = transfer(events[index], "place_remaining_below_receiver");
  if (rest.from !== "held" || rest.to !== "receive" || rest.take !== "top" || rest.place !== "bottom" || rest.count !== n - stripped) {
    fail("Hindu remainder was not placed underneath");
  }
  const finish = transfer(events[index + 1], "finish_hindu");
  if (finish.from !== "receive" || finish.to !== "draw" || finish.count !== n) fail("Hindu finish is not the receiver");
  if (events.length !== index + 3) fail("Hindu has movements that are not its pulls");
  endOnSquare(events);
}

function validateRiffle(events: readonly MotionEvent[], n: number) {
  const left = transfer(events[0], "split_left");
  const right = transfer(events[1], "split_right");
  if (left.from !== "draw" || left.to !== "left" || left.take !== "top" || right.from !== "draw" || right.to !== "right") {
    fail("Riffle split is not the recorded halves");
  }
  if (left.count + right.count !== n || left.count < 1 || right.count < 1) fail("Riffle halves do not make the deck");
  let index = 2;
  let fromLeft = 0;
  let fromRight = 0;
  let release = 0;
  while (events[index]?.kind === "transfer" && /^riffle_release_\d+$/.test(events[index].action)) {
    const drop = events[index] as TransferEvent;
    if (drop.action !== `riffle_release_${release}`) fail("Riffle releases are out of order");
    if ((drop.from !== "left" && drop.from !== "right") || drop.to !== "merged" || drop.take !== "bottom" || drop.place !== "top") {
      fail("Riffle release is not the bottom of a half onto the merge");
    }
    if (drop.from === "left") fromLeft += drop.count;
    else fromRight += drop.count;
    release += 1;
    index += 1;
  }
  if (release < 1 || fromLeft !== left.count || fromRight !== right.count) fail("Riffle releases do not match the halves");
  const square = events[index];
  if (!square || square.kind !== "square" || !square.zones.includes("merged")) fail("The bridge is not a square of the merged deck");
  const back = transfer(events[index + 1], "square_riffle");
  if (back.from !== "merged" || back.to !== "draw" || back.count !== n) fail("Riffle square changed the merged order");
  if (events.length !== index + 2) fail("Riffle has movements after the bridge");
}

function validateWash(events: readonly MotionEvent[], n: number) {
  let index = 0;
  for (let card = 0; card < n; card += 1) {
    const release = transfer(events[index], "release_single_card_to_table");
    if (release.count !== 1 || release.from !== "draw" || release.to !== "wash" || release.take !== "top") fail("Wash release is not one draw card");
    const spread = events[index + 1];
    if (!spread || spread.kind !== "slide" || spread.action !== "spread_on_workspace" || spread.cardId !== release.cards[0]) {
      fail("Wash spread does not follow that card");
    }
    index += 2;
  }
  for (let beat = 0; beat < 3; beat += 1) {
    for (let card = 0; card < n; card += 1) {
      const stroke = events[index];
      if (!stroke || stroke.kind !== "slide" || stroke.action !== `wash_stroke_${beat}`) fail("Wash stroke is missing");
      index += 1;
    }
  }
  const picked: number[] = [];
  for (let card = 0; card < n; card += 1) {
    const pickup = events[index];
    if (!pickup || pickup.kind !== "pickup" || pickup.action !== "gather_from_table") fail("Wash pickup is not the recorded gather");
    picked.push(pickup.cardId);
    index += 1;
  }
  if (new Set(picked).size !== n) fail("Wash pickup skipped or repeated a card");
  if (events.length !== index + 1) fail("Wash has movements that are not the recorded wash");
  endOnSquare(events);
}

function validateThree(events: readonly MotionEvent[], n: number) {
  if (n === 2) {
    if (events.length !== 5) fail("A two-card cut is two packets");
    const first = transfer(events[0], "make_first_packet");
    const second = transfer(events[1], "make_second_packet");
    const pickSecond = transfer(events[2], "pick_second_first");
    const pickFirst = transfer(events[3], "pick_first_second");
    if (first.count !== 1 || second.count !== 1 || first.to !== "packet0" || second.to !== "packet1") fail("Two cards became the wrong packets");
    if (pickSecond.from !== "packet1" || pickFirst.from !== "packet0" || pickSecond.count !== 1 || pickFirst.count !== 1) {
      fail("Two-card pickup order is not the recorded order");
    }
    endOnSquare(events);
    return;
  }
  const top = transfer(events[0], "make_top_packet");
  const middle = transfer(events[1], "make_middle_packet");
  const bottom = transfer(events[2], "make_bottom_packet");
  if (top.to !== "packet0" || middle.to !== "packet1" || bottom.to !== "packet2") fail("Three-packet cut did not make three packets");
  if (top.count + middle.count + bottom.count !== n || top.count < 1 || middle.count < 1 || bottom.count < 1) {
    fail("Three-packet sizes do not make the deck");
  }
  const seen = new Set<number>();
  for (let index = 3; index < events.length - 1; index += 1) {
    const pick = events[index];
    if (!pick || pick.kind !== "transfer" || !/^pickup_packet_[012]$/.test(pick.action)) fail("Three-packet pickup is not a recorded packet");
    const packet = Number(pick.action.slice(-1));
    if (seen.has(packet) || pick.from !== `packet${packet}` || pick.to !== "draw") fail("Three-packet pickup repeated or retargeted a packet");
    const expected = packet === 0 ? top.count : packet === 1 ? middle.count : bottom.count;
    if (pick.count !== expected) fail("Three-packet pickup changed a packet");
    seen.add(packet);
  }
  if (seen.size !== 3 || events.length !== 7) fail("Three-packet cut added or dropped a movement");
  endOnSquare(events);
}
