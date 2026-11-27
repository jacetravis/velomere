export type ShuffleAnimationId =
  | "original"
  | "overhand"
  | "riffle_bridge"
  | "hindu"
  | "table_wash"
  | "three_packet_cut";

export const SHUFFLE_ANIMATIONS: { id: ShuffleAnimationId; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "overhand", label: "Overhand" },
  { id: "riffle_bridge", label: "Riffle & Bridge" },
  { id: "hindu", label: "Hindu" },
  { id: "table_wash", label: "Table Wash (Default)" },
  { id: "three_packet_cut", label: "Three-Packet Cut" },
];

const KEY = "solace-shuffle-style";
export const DEFAULT_SHUFFLE_ANIMATION: ShuffleAnimationId = "table_wash";
const listeners = new Set<() => void>();

export function isShuffleAnimation(value: string | null | undefined): value is ShuffleAnimationId {
  return SHUFFLE_ANIMATIONS.some((item) => item.id === value);
}

export function shuffleAnimation(): ShuffleAnimationId {
  if (typeof window === "undefined") return DEFAULT_SHUFFLE_ANIMATION;
  const stored = window.localStorage.getItem(KEY);
  return isShuffleAnimation(stored) ? stored : DEFAULT_SHUFFLE_ANIMATION;
}

export function setShuffleAnimation(id: ShuffleAnimationId) {
  window.localStorage.setItem(KEY, id);
  listeners.forEach((listener) => listener());
}

export function subscribeShuffleAnimation(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
