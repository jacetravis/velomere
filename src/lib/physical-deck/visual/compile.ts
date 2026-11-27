import type { MotionEvent, PhysicalShuffleTrace, ShuffleStyle } from "../motion/events";
import { inspectMotion, replayPhysicalShuffle } from "../motion/replay";
import { validateStyleGrammar } from "./validate";

export type ZoneMap = Record<string, number[]>;

export type MotionIdentity = {
  operationId: string;
  sessionId: string;
  revisionFrom: number;
  revisionTo: number;
  beforeHash: string;
  afterHash: string;
};

export type VisualFrame = {
  eventIndex: number;
  seq: number;
  kind: MotionEvent["kind"];
  action: string;
  recordedT: number;
  windowStart: number;
  windowEnd: number;
  packetIds: number[];
  count: number;
  from?: string;
  to?: string;
  take?: "top" | "bottom";
  place?: "top" | "bottom";
  cardId?: number;
  slideFrom?: { x: number; y: number };
  slideTo?: { x: number; y: number };
  axis?: [number, number];
  beforeZones: ZoneMap;
  zones: ZoneMap;
  positions: Record<string, { x: number; y: number }>;
};

export type VisualScene = {
  kind: "motion";
  style: ShuffleStyle;
  before: number[];
  after: number[];
  frames: VisualFrame[];
  grammarOk: boolean;
  grammarError: string | null;
  /** `legacy` when the recorded movements are not the named grip. The picture still follows the events. */
  claim: "matched" | "legacy";
  identity: MotionIdentity | null;
  inputAttribution: PhysicalShuffleTrace["input"]["inputAttribution"];
};

export type VisualTravel = {
  kind: "transfer" | "pickup";
  ids: number[];
  from: string;
  to: string;
  progress: number;
  place?: "top" | "bottom";
};

export type VisualSample = {
  time: number;
  eventIndex: number | null;
  seq: number | null;
  action: string | null;
  packetIds: number[];
  count: number;
  zones: ZoneMap;
  positions: Record<string, { x: number; y: number }>;
  travel: VisualTravel | null;
};

function copyZones(zones: ZoneMap): ZoneMap {
  const next: ZoneMap = {};
  for (const [name, cards] of Object.entries(zones)) if (cards.length) next[name] = [...cards];
  return next;
}

function zonesFrom(view: { zones: Record<string, number[]> }): ZoneMap {
  return copyZones(view.zones);
}

function idleSample(before: readonly number[]): VisualSample {
  return {
    time: 0,
    eventIndex: null,
    seq: null,
    action: null,
    packetIds: [],
    count: 0,
    zones: { draw: [...before] },
    positions: {},
    travel: null,
  };
}

/** Project one committed trace. Replay stays the order authority. This adds no randomness and no second plan. */
export function compileVisualPass(
  before: readonly number[],
  trace: PhysicalShuffleTrace,
  identity: MotionIdentity | null = null,
): VisualScene {
  const after = replayPhysicalShuffle([...before], trace, trace.originalDeckCount);
  const views = trace.events.length ? inspectMotion([...before], trace.events) : [];
  let grammarError: string | null = null;
  try {
    validateStyleGrammar(trace);
  } catch (error) {
    grammarError = error instanceof Error ? error.message : "This trace is not the named grip";
  }
  const positions = new Map<number, { x: number; y: number }>();
  const total = Math.max(1, trace.events.length);
  const frames: VisualFrame[] = trace.events.map((event, index) => {
    const beforeZones = index === 0 ? { draw: [...before] } : zonesFrom(views[index - 1]!);
    if (event.kind === "transfer") {
      if (event.to === "wash") for (const id of event.cards) positions.set(id, { x: 0.5, y: 0.5 });
      if (event.from === "wash") for (const id of event.cards) positions.delete(id);
    } else if (event.kind === "slide") {
      positions.set(event.cardId, { x: event.to.x, y: event.to.y });
    } else if (event.kind === "pickup") {
      positions.delete(event.cardId);
    }
    const packetIds = event.kind === "transfer" ? [...event.cards] : event.kind === "slide" || event.kind === "pickup" ? [event.cardId] : [];
    return {
      eventIndex: index,
      seq: event.seq,
      kind: event.kind,
      action: event.action,
      recordedT: event.t,
      windowStart: index / total,
      windowEnd: (index + 1) / total,
      packetIds,
      count: event.kind === "transfer" ? event.count : packetIds.length,
      from: event.kind === "transfer" ? event.from : undefined,
      to: event.kind === "transfer" ? event.to : undefined,
      take: event.kind === "transfer" ? event.take : undefined,
      place: event.kind === "transfer" ? event.place : undefined,
      cardId: event.kind === "slide" || event.kind === "pickup" ? event.cardId : undefined,
      slideFrom: event.kind === "slide" ? { ...event.from } : undefined,
      slideTo: event.kind === "slide" ? { ...event.to } : undefined,
      axis: event.kind === "pickup" ? [...event.axis] : undefined,
      beforeZones,
      zones: zonesFrom(views[index]!),
      positions: Object.fromEntries([...positions].map(([id, point]) => [String(id), { ...point }])),
    };
  });
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    const view = views[index]!;
    if (frame.seq !== index || view.index !== index) throw new Error("Visual frame left the recorded sequence");
    for (const [name, cards] of Object.entries(view.zones)) {
      const shown = frame.zones[name];
      if (!shown || shown.length !== cards.length || shown.some((id, at) => id !== cards[at])) {
        throw new Error("Visual zone left the recorded cards");
      }
    }
  }
  return {
    kind: "motion",
    style: trace.style,
    before: [...before],
    after: [...after],
    frames,
    grammarOk: grammarError == null,
    grammarError,
    claim: grammarError == null ? "matched" : "legacy",
    identity,
    inputAttribution: { ...trace.input.inputAttribution },
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

/** Sample the committed picture. Time may ease; it cannot reorder events or change membership at a completed frame. */
export function sampleVisual(scene: { before: readonly number[]; frames: readonly VisualFrame[] }, time: number): VisualSample {
  if (!scene.frames.length || time <= 0) return idleSample(scene.before);
  const t = clamp01(time);
  if (t >= 1) {
    const last = scene.frames[scene.frames.length - 1]!;
    return {
      time: 1,
      eventIndex: last.eventIndex,
      seq: last.seq,
      action: last.action,
      packetIds: [...last.packetIds],
      count: last.count,
      zones: copyZones(last.zones),
      positions: { ...last.positions },
      travel: null,
    };
  }
  let lo = 0;
  let hi = scene.frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scene.frames[mid]!.windowEnd < t) lo = mid + 1;
    else hi = mid;
  }
  const frame = scene.frames[lo]!;
  const span = frame.windowEnd - frame.windowStart || 1;
  const progress = clamp01((t - frame.windowStart) / span);
  const done = progress >= 1;
  const positions: Record<string, { x: number; y: number }> = done
    ? { ...frame.positions }
    : { ...(scene.frames[lo - 1]?.positions ?? {}) };
  if (!done && frame.kind === "slide" && frame.cardId != null && frame.slideFrom && frame.slideTo) {
    positions[String(frame.cardId)] = {
      x: mix(frame.slideFrom.x, frame.slideTo.x, progress),
      y: mix(frame.slideFrom.y, frame.slideTo.y, progress),
    };
  }
  const travel: VisualTravel | null = done
    ? null
    : frame.kind === "transfer" && frame.from && frame.to
      ? { kind: "transfer", ids: [...frame.packetIds], from: frame.from, to: frame.to, progress, place: frame.place }
      : frame.kind === "pickup" && frame.cardId != null
        ? { kind: "pickup", ids: [frame.cardId], from: "wash", to: "draw", progress }
        : null;
  return {
    time: t,
    eventIndex: frame.eventIndex,
    seq: frame.seq,
    action: frame.action,
    packetIds: [...frame.packetIds],
    count: frame.count,
    zones: copyZones(done ? frame.zones : frame.beforeZones),
    positions,
    travel,
  };
}

export function completedVisual(scene: { before: readonly number[]; frames: readonly VisualFrame[] }, seq: number) {
  const frame = scene.frames[seq];
  if (!frame) throw new Error("That movement was not recorded");
  return sampleVisual(scene, frame.windowEnd);
}

/** Where a picture lands when playback is abandoned. It does not create a movement. */
export function settledOrder(scene: { after: readonly number[] }) {
  return [...scene.after];
}
