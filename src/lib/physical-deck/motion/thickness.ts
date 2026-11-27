/** Reader packet thickness. 0 is the thinnest legal packet, 1 the thickest, 0.5 neutral. */

export function clampThickness(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/** Half of the 44px thumb. The thumb center stays this far inside the track. */
export const THICKNESS_INSET = 22;

/** Map a horizontal pointer to thickness. The thumb travel is inset so it stays on the track. */
export function thicknessFromPointer(clientX: number, left: number, width: number, inset = THICKNESS_INSET) {
  const span = Math.max(1, width - inset * 2);
  return clampThickness((clientX - left - inset) / span);
}

/** Move the thumb by a finger delta. Width is the track; travel matches the thumb inset. */
export function thicknessFromDrag(start: number, deltaX: number, width: number, inset = THICKNESS_INSET) {
  const span = Math.max(1, width - inset * 2);
  return clampThickness(start + deltaX / span);
}

/** Freeze the thumb for one upcoming pass. Later movement does not change this sample. */
export function sampleThickness(live: number) {
  return clampThickness(live);
}

/** Releasing, cancelling, or otherwise losing the thumb parks it at neutral and records no card movement. */
export const THUMB_INTERRUPTIONS = ["release", "cancel", "lost-capture", "blur", "key"] as const;
export type ThumbInterrupt = (typeof THUMB_INTERRUPTIONS)[number];

export function interruptThickness(reason: ThumbInterrupt) {
  return { holding: false as const, thickness: 0.5, reason, movement: null };
}

/** Releasing the thumb ends the hold and parks it at neutral. It does not describe a card movement. */
export function releaseThickness() {
  const parked = interruptThickness("release");
  return { holding: parked.holding, thickness: parked.thickness };
}
