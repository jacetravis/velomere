import {
  MOTION_SCHEMA,
  isShuffleStyle,
  type MotionEvent,
  type PhysicalShuffleTrace,
} from "./events";

export const MAX_MOTION_EVENTS = 5000;
export const MAX_MOTION_BYTES = 1_500_000;

type Work = {
  zones: Map<string, number[]>;
  pos: Map<number, { x: number; y: number }>;
};

function fail(message: string): never {
  throw new Error(message);
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sameIds(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

function sorted(ids: readonly number[]) {
  return [...ids].sort((a, b) => a - b);
}

function zoneName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
}

function allCards(state: Work) {
  return [...state.zones.values()].flat();
}

function conserve(before: readonly number[], state: Work) {
  const seen = allCards(state);
  if (seen.length !== before.length) fail("Card count changed");
  if (new Set(seen).size !== seen.length) fail("A card occupies multiple zones");
  if (!sameIds(sorted(seen), sorted(before))) fail("Card identity changed");
  for (const id of state.pos.keys()) {
    if (!state.zones.get("wash")?.includes(id)) fail("A table position belongs to a card that is not on the table");
  }
}

function zone(state: Work, name: string) {
  if (!zoneName(name)) fail("Invalid zone");
  let cards = state.zones.get(name);
  if (!cards) {
    cards = [];
    state.zones.set(name, cards);
  }
  return cards;
}

function takeFrom(cards: number[], count: number, side: unknown) {
  if (!integer(count) || count <= 0 || count > cards.length) fail("Packet exceeds source");
  if (side !== "top" && side !== "bottom") fail("Unrecognized take side");
  return side === "top" ? cards.splice(0, count) : cards.splice(cards.length - count, count);
}

function putInto(cards: number[], packet: number[], side: unknown) {
  if (side !== "top" && side !== "bottom") fail("Unrecognized placement side");
  if (side === "top") cards.unshift(...packet);
  else cards.push(...packet);
}

function point(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  const x = (value as { x?: unknown }).x;
  const y = (value as { y?: unknown }).y;
  if (!finite(x) || !finite(y)) return null;
  return { x, y };
}

function samePoint(left: { x: number; y: number }, right: { x: number; y: number }) {
  return left.x === right.x && left.y === right.y;
}

/** Lowest sweep projection first. Exact position ties keep the earlier release, which sits deeper in the pile. */
export function pickupCandidate(state: Work, axis: readonly number[]) {
  const wash = zone(state, "wash");
  if (!wash.length) fail("No cards to gather");
  const ax = axis[0] ?? 0;
  const ay = axis[1] ?? 0;
  return [...wash].sort((a, b) => {
    const ap = state.pos.get(a);
    const bp = state.pos.get(b);
    if (!ap || !bp) fail("A table card has no position");
    const along = ap.x * ax + ap.y * ay - (bp.x * ax + bp.y * ay);
    if (Math.abs(along) > 1e-9) return along;
    const across = ap.y * ax - ap.x * ay - (bp.y * ax - bp.x * ay);
    if (Math.abs(across) > 1e-9) return across;
    return wash.indexOf(b) - wash.indexOf(a);
  })[0]!;
}

function applyEvent(state: Work, event: MotionEvent) {
  if (!event || typeof event.action !== "string" || event.action.trim() === "") fail("A movement has no physical action");
  switch (event.kind) {
    case "transfer": {
      if (event.from === event.to) fail("Source and target must differ");
      const from = zone(state, event.from);
      const packet = takeFrom(from, event.count, event.take);
      if (!sameIds(packet, event.cards)) fail("Event card identities do not match the source packet");
      putInto(zone(state, event.to), packet, event.place);
      if (event.to === "wash") for (const id of packet) state.pos.set(id, { x: 0.5, y: 0.5 });
      if (event.from === "wash") for (const id of packet) state.pos.delete(id);
      break;
    }
    case "slide": {
      if (!integer(event.cardId)) fail("Cannot slide an unavailable card");
      if (!zone(state, "wash").includes(event.cardId)) fail("Cannot slide an unavailable card");
      const old = state.pos.get(event.cardId);
      const origin = point(event.from);
      const next = point(event.to);
      if (!old || !origin || !samePoint(old, origin)) fail("Incorrect slide origin");
      if (!next || next.x < 0 || next.x > 1 || next.y < 0 || next.y > 1) fail("Slide escapes table");
      if (Math.hypot(next.x - old.x, next.y - old.y) > 0.65) fail("A single slide teleported too far");
      state.pos.set(event.cardId, next);
      break;
    }
    case "pickup": {
      if (!Array.isArray(event.axis) || event.axis.length !== 2 || !event.axis.every(finite)) fail("Invalid pickup axis");
      const [ax, ay] = event.axis;
      if (ax * ax + ay * ay <= 0.01) fail("Degenerate pickup sweep");
      const id = pickupCandidate(state, event.axis);
      if (id !== event.cardId) fail("Picked card differs from spatial pickup order");
      const wash = zone(state, "wash");
      wash.splice(wash.indexOf(id), 1);
      state.pos.delete(id);
      zone(state, "draw").push(id);
      break;
    }
    case "square": {
      if (!Array.isArray(event.zones) || !event.zones.every(zoneName)) fail("Invalid square event");
      break;
    }
    default:
      fail(`Unknown physical event: ${String((event as { kind?: unknown }).kind)}`);
  }
}

function finish(state: Work, before: readonly number[]) {
  conserve(before, state);
  if (state.zones.get("wash")?.length) fail("Wash cards not gathered");
  for (const [name, cards] of state.zones) {
    if (name !== "draw" && cards.length) fail(`Packet ${name} not accounted for`);
  }
  const draw = state.zones.get("draw") ?? [];
  if (draw.length !== before.length) fail("Deck not fully assembled");
  return [...draw];
}

function start(before: readonly number[]): Work {
  if (!before.every(integer)) fail("Card IDs must be integers");
  if (new Set(before).size !== before.length) fail("Duplicate input IDs");
  return { zones: new Map([["draw", [...before]]]), pos: new Map() };
}

/** Replay recorded movements. This function never reads a seed and never calls a random source. */
export function replayPhysicalShuffle(
  before: readonly number[],
  trace: PhysicalShuffleTrace,
  inventoryLength = trace.originalDeckCount,
): number[] {
  if (trace?.schema !== MOTION_SCHEMA) fail("Unknown trace schema");
  if (!isShuffleStyle(trace.style)) fail("Invalid style");
  if (trace.source !== "reader" && trace.source !== "algorithm-selected") fail("Invalid movement source");
  if (!integer(trace.drawPileCount) || trace.drawPileCount !== before.length) fail("The shuffle does not start from this draw pile");
  if (!integer(trace.originalDeckCount) || trace.originalDeckCount !== inventoryLength) fail("The shuffle does not match this deck");
  if (inventoryLength < before.length) fail("The draw pile is larger than the deck");
  if (!Array.isArray(trace.events)) fail("Events must be an array");
  if (trace.events.length > MAX_MOTION_EVENTS) fail("Trace too large");
  const bytes = JSON.stringify(trace.events).length;
  if (bytes > MAX_MOTION_BYTES) fail("Trace too large");
  if (before.length < 2) {
    if (trace.events.length) fail("A one-card shuffle cannot invent a movement");
  } else if (!trace.events.length) {
    fail("The shuffle recorded no movements");
  }
  let previousTime = -1;
  const state = start(before);
  trace.events.forEach((event, index) => {
    if (!integer(event?.seq) || event.seq !== index) fail("Movement sequence is not the recorded order");
    if (!finite(event.t) || event.t < 0 || event.t > 1 || event.t + 1e-9 < previousTime) fail("Movement timing is not ordered");
    previousTime = event.t;
    applyEvent(state, event);
    conserve(before, state);
  });
  const after = finish(state, before);
  if (!Array.isArray(trace.afterOrder) || !sameIds(after, trace.afterOrder)) fail("Claimed result differs from replay");
  return after;
}

export type ZoneView = { index: number; zones: Record<string, number[]> };

/** Zone contents after every event, for conservation tests. Replay rules are the same. */
export function inspectMotion(before: readonly number[], events: readonly MotionEvent[]): ZoneView[] {
  const state = start(before);
  return events.map((event, index) => {
    applyEvent(state, event);
    conserve(before, state);
    const zones: Record<string, number[]> = {};
    for (const [name, cards] of state.zones) if (cards.length) zones[name] = [...cards];
    return { index, zones };
  });
}
