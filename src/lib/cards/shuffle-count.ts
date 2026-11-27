export const SHUFFLE_MIN = 1;
export const SHUFFLE_MAX = 20;

/** How far past the halfway mark the finger must travel before the count changes.
 *  Holding still asks for more movement. A quicker slide asks for less.
 */
export function shuffleStick(velocity: number): number {
  const speed = Math.min(1, Math.abs(velocity) / 12);
  return 0.34 - speed * 0.28;
}

export function latchShuffleCount(current: number, raw: number, velocity: number): number {
  const clamped = Math.min(SHUFFLE_MAX, Math.max(SHUFFLE_MIN, raw));
  const here = Math.min(SHUFFLE_MAX, Math.max(SHUFFLE_MIN, Math.round(current)));
  const stick = shuffleStick(velocity);
  if (clamped >= here + 0.5 + stick) {
    const stepped = Math.floor(clamped + 0.5 - stick);
    return Math.min(SHUFFLE_MAX, Math.max(here + 1, stepped));
  }
  if (clamped <= here - 0.5 - stick) {
    const stepped = Math.ceil(clamped - 0.5 + stick);
    return Math.max(SHUFFLE_MIN, Math.min(here - 1, stepped));
  }
  return here;
}

export function cutDepth(ratio: number): number {
  return Math.max(1, Math.min(7, Math.round(ratio * 7)));
}

const PACE_AT_10 = 420;
const PACE_AT_20 = 160;

/** How long one cut takes. One is the baseline. Each count up through ten is 20% faster than the one before it, landing on the ten-cut pace. After that it keeps speeding up to twenty. */
export function cutPace(count: number): number {
  const n = Math.min(SHUFFLE_MAX, Math.max(SHUFFLE_MIN, Math.round(count)));
  const t = (n - 10) / 10;
  const pace = n <= 10 ? PACE_AT_10 * 1.2 ** (10 - n) : PACE_AT_10 + (PACE_AT_20 - PACE_AT_10) * t ** 1.15;
  const raw = Math.max(48, Math.round(pace / 1.3));
  const climb = n <= 8 ? 0 : Math.min(1, (n - 8) / 12);
  const factor = 1.62 - 0.62 * climb ** 1.85;
  return Math.round(raw * factor);
}

/** Distinct cut depths, in a shuffled order so the same section never repeats back to back. */
export function cutSections(count: number, random: () => number = Math.random): number[] {
  const n = Math.min(SHUFFLE_MAX, Math.max(SHUFFLE_MIN, Math.round(count)));
  const depths: number[] = [];
  while (depths.length < n) {
    const bag = [1, 2, 3, 4, 5, 6, 7];
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const swap = bag[i]!;
      bag[i] = bag[j]!;
      bag[j] = swap;
    }
    if (depths.length > 0 && bag[0] === depths[depths.length - 1]) {
      const other = bag.findIndex((depth) => depth !== depths[depths.length - 1]);
      if (other > 0) {
        const first = bag[0]!;
        bag[0] = bag[other]!;
        bag[other] = first;
      }
    }
    depths.push(...bag);
  }
  return depths.slice(0, n).map((depth) => depth / 7);
}