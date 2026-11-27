/** Stage 2 movement transcript. Replay of `events` is the only order authority. */

export const MOTION_SCHEMA = "physical-shuffle/2" as const;

export const SHUFFLE_STYLES = [
  "original",
  "overhand",
  "riffle_bridge",
  "hindu",
  "table_wash",
  "three_packet_cut",
] as const;

export type ShuffleStyle = (typeof SHUFFLE_STYLES)[number];
export type MotionEnd = "top" | "bottom";
export type MotionSource = "reader" | "algorithm-selected";

export type TransferEvent = {
  kind: "transfer";
  seq: number;
  t: number;
  action: string;
  from: string;
  to: string;
  count: number;
  take: MotionEnd;
  place: MotionEnd;
  cards: number[];
};

export type SlideEvent = {
  kind: "slide";
  seq: number;
  t: number;
  action: string;
  cardId: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type PickupEvent = {
  kind: "pickup";
  seq: number;
  t: number;
  action: string;
  cardId: number;
  axis: [number, number];
};

export type SquareEvent = {
  kind: "square";
  seq: number;
  t: number;
  action: string;
  zones: string[];
};

export type MotionEvent = TransferEvent | SlideEvent | PickupEvent | SquareEvent;

export type PhysicalShuffleTrace = {
  schema: typeof MOTION_SCHEMA;
  style: ShuffleStyle;
  source: MotionSource;
  drawPileCount: number;
  originalDeckCount: number;
  input: {
    ratio?: number;
    turn?: number;
    packetSizes?: number[];
    cutPoints?: [number, number];
    pickupOrder?: number[];
    seed?: number;
    inputAttribution: Record<string, MotionSource>;
  };
  events: MotionEvent[];
  /** Diagnostic only. A commit is valid only when replay reproduces this order. */
  afterOrder: number[];
};

export function isShuffleStyle(value: string): value is ShuffleStyle {
  return (SHUFFLE_STYLES as readonly string[]).includes(value);
}
