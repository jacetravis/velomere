import { sampleVisual, type VisualFrame, type VisualSample } from "./compile";
import type { CutScene } from "./cut";
import type { VisualScene } from "./compile";

export type PicturedScene = VisualScene | CutScene;

/** In-flight point the painter is required to show. Not an endpoint. */
export const PLAYBACK_PROGRESS = 0.42;
const FRAME_MS = 1000 / 60;

export type PlaybackGroup = {
  /** A wash placement or stroke shares one picture. Every other recorded event stays alone. */
  role: "place" | "stroke" | "event";
  action: string;
  seqs: number[];
  frames: VisualFrame[];
};

/**
 * Group only movements that are one physical gesture in the trace.
 * A table release and its spread are one placement. One wash stroke's slides
 * share an action and move together from their own recorded endpoints.
 * Nothing else is merged, and no sequence number is dropped.
 */
export function playbackGroups(frames: readonly VisualFrame[]): PlaybackGroup[] {
  const groups: PlaybackGroup[] = [];
  let index = 0;
  while (index < frames.length) {
    const frame = frames[index]!;
    const next = frames[index + 1];
    if (
      frame.action === "release_single_card_to_table" &&
      next?.action === "spread_on_workspace" &&
      next.cardId != null &&
      frame.packetIds[0] === next.cardId
    ) {
      groups.push({ role: "place", action: next.action, seqs: [frame.seq, next.seq], frames: [frame, next] });
      index += 2;
      continue;
    }
    if (frame.kind === "slide" && frame.action.startsWith("wash_stroke_")) {
      const run = [frame];
      let cursor = index + 1;
      while (cursor < frames.length && frames[cursor]!.action === frame.action && frames[cursor]!.kind === "slide") {
        run.push(frames[cursor]!);
        cursor += 1;
      }
      groups.push({ role: "stroke", action: frame.action, seqs: run.map((item) => item.seq), frames: run });
      index = cursor;
      continue;
    }
    groups.push({ role: "event", action: frame.action, seqs: [frame.seq], frames: [frame] });
    index += 1;
  }
  return groups;
}

function copyZones(zones: VisualFrame["zones"]) {
  const next: VisualFrame["zones"] = {};
  for (const [name, cards] of Object.entries(zones)) next[name] = [...cards];
  return next;
}

function mixPoint(from: { x: number; y: number }, to: { x: number; y: number }, progress: number) {
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
}

function sampleFrame(scene: { before: readonly number[]; frames: readonly VisualFrame[] }, frame: VisualFrame, progress: number) {
  if (progress >= 1) return sampleVisual(scene, frame.windowEnd);
  const span = frame.windowEnd - frame.windowStart || 1;
  const time = Math.min(frame.windowEnd - 1e-12, frame.windowStart + span * progress);
  return sampleVisual(scene, Math.max(frame.windowStart + span * 1e-6, time));
}

function samplePlace(
  scene: { before: readonly number[]; frames: readonly VisualFrame[] },
  group: PlaybackGroup,
  progress: number,
): VisualSample {
  const release = group.frames[0]!;
  const spread = group.frames[1]!;
  if (progress >= 1 || spread.cardId == null || !spread.slideFrom || !spread.slideTo) return sampleFrame(scene, spread, 1);
  const positions = { ...(scene.frames[release.eventIndex - 1]?.positions ?? {}) };
  positions[String(spread.cardId)] = mixPoint(spread.slideFrom, spread.slideTo, progress);
  return {
    time: spread.windowStart + (spread.windowEnd - spread.windowStart) * progress,
    eventIndex: spread.eventIndex,
    seq: spread.seq,
    action: spread.action,
    packetIds: [spread.cardId],
    count: 1,
    zones: copyZones(release.zones),
    positions,
    travel: null,
  };
}

function sampleStroke(
  scene: { before: readonly number[]; frames: readonly VisualFrame[] },
  group: PlaybackGroup,
  progress: number,
): VisualSample {
  const first = group.frames[0]!;
  const last = group.frames[group.frames.length - 1]!;
  if (progress >= 1) return sampleFrame(scene, last, 1);
  const positions = { ...(scene.frames[first.eventIndex - 1]?.positions ?? {}) };
  const packetIds: number[] = [];
  for (const frame of group.frames) {
    if (frame.cardId == null || !frame.slideFrom || !frame.slideTo) continue;
    packetIds.push(frame.cardId);
    positions[String(frame.cardId)] = mixPoint(frame.slideFrom, frame.slideTo, progress);
  }
  return {
    time: first.windowStart,
    eventIndex: first.eventIndex,
    seq: first.seq,
    action: first.action,
    packetIds,
    count: packetIds.length,
    zones: copyZones(first.beforeZones),
    positions,
    travel: null,
  };
}

function sampleGroup(
  scene: { before: readonly number[]; frames: readonly VisualFrame[] },
  group: PlaybackGroup,
  progress: number,
): VisualSample {
  if (group.role === "place") return samplePlace(scene, group, progress);
  if (group.role === "stroke") return sampleStroke(scene, group, progress);
  return sampleFrame(scene, group.frames[0]!, progress);
}

/**
 * Samples the table paints, one per frame, in order.
 * Reduced motion stays a short outline and still ends on the committed order.
 * Full playback visits every group in flight and at its recorded end, so a long
 * wash cannot skip cards by compressing the clock.
 */
export function renderSamples(scene: PicturedScene, reduced: boolean): VisualSample[] {
  if (reduced) return [sampleVisual(scene, 0.05), sampleVisual(scene, 1)];
  if (!scene.frames.length) return [sampleVisual(scene, 0), sampleVisual(scene, 1)];
  const samples = [sampleVisual(scene, 0)];
  for (const group of playbackGroups(scene.frames)) {
    samples.push(sampleGroup(scene, group, PLAYBACK_PROGRESS));
    samples.push(sampleGroup(scene, group, 1));
  }
  return samples;
}

/** Wall-clock length of the samples the painter actually shows. Washes are not capped. */
export function playbackDuration(scene: PicturedScene, reduced: boolean) {
  if (reduced) return 160;
  if (!scene.frames.length) return 480;
  if (scene.kind === "cut") return 980;
  const slides = scene.frames.filter((frame) => frame.kind === "slide" || frame.kind === "pickup").length;
  const watched = slides > 12
    ? 880 + scene.frames.length * FRAME_MS
    : Math.min(2200, 720 + scene.frames.length * 42);
  const steps = Math.max(1, renderSamples(scene, false).length - 1);
  return Math.max(48, Math.round(Math.max(watched, steps * FRAME_MS)));
}

/**
 * Which recorded sample to paint. Time may hold a sample. It may not skip one
 * when a frame arrives late: the index advances by at most one.
 */
export function playbackIndex(sampleCount: number, duration: number, elapsed: number, previous: number) {
  const count = Math.max(1, sampleCount);
  const current = Math.max(0, Math.min(previous, count - 1));
  if (count === 1) return 0;
  const span = Math.max(1, duration);
  const target = elapsed >= span ? count - 1 : Math.min(count - 1, Math.floor((Math.max(0, elapsed) / span) * count));
  return Math.min(count - 1, Math.max(current, Math.min(target, current + 1)));
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Every recorded movement stays addressable. Grouping does not delete a seq. */
export function playbackCues(scene: PicturedScene) {
  return scene.frames.map((frame) => ({
    seq: frame.seq,
    action: frame.action,
    packetIds: [...frame.packetIds],
    count: frame.count,
    at: frame.windowEnd,
  }));
}
