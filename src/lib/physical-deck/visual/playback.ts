import type { CutScene } from "./cut";
import type { VisualScene } from "./compile";

export type PicturedScene = VisualScene | CutScene;

/** Shorten the picture without choosing a different packet. Reduced motion still ends on the committed order. */
export function playbackDuration(scene: PicturedScene, reduced: boolean) {
  if (reduced) return 160;
  if (scene.kind === "cut") return 980;
  const slides = scene.frames.filter((frame) => frame.kind === "slide" || frame.kind === "pickup").length;
  if (slides > 12) return Math.min(2400, 880 + slides * 2.4);
  return Math.min(2200, 720 + scene.frames.length * 42);
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Every recorded movement stays addressable. Playback may compress time; it does not drop a seq. */
export function playbackCues(scene: PicturedScene) {
  return scene.frames.map((frame) => ({
    seq: frame.seq,
    action: frame.action,
    packetIds: [...frame.packetIds],
    count: frame.count,
    at: frame.windowEnd,
  }));
}
