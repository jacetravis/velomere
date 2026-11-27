export type TableHand = "left" | "right";

const READING_KEY = "lumen-hand";
const VELOMERE_KEY = "velomere-hand";

const listeners = new Set<() => void>();

function read(key: string): TableHand {
  if (typeof window === "undefined") return "right";
  return window.localStorage.getItem(key) === "left" ? "left" : "right";
}

function write(key: string, hand: TableHand) {
  window.localStorage.setItem(key, hand);
  listeners.forEach((listener) => listener());
}

export function subscribeHands(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readingHand(): TableHand {
  return read(READING_KEY);
}

export function velomereHand(): TableHand {
  return read(VELOMERE_KEY);
}

export function setReadingHand(hand: TableHand) {
  write(READING_KEY, hand);
}

export function setVelomereHand(hand: TableHand) {
  write(VELOMERE_KEY, hand);
}
