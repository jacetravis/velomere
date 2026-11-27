import type { VisualFrame, ZoneMap } from "./compile";

export type CutIdentity = {
  operationId: string;
  revisionFrom: number;
  revisionTo: number;
  index: number;
};

export type CutScene = {
  kind: "cut";
  before: number[];
  after: number[];
  index: number;
  frames: VisualFrame[];
  identity: CutIdentity | null;
};

function zones(partial: ZoneMap): ZoneMap {
  const next: ZoneMap = {};
  for (const [name, cards] of Object.entries(partial)) if (cards.length) next[name] = [...cards];
  return next;
}

/**
 * Picture a cut that was already committed at `index`.
 * This does not cut the deck again. Top `index` cards finish underneath the rest.
 */
export function compileCutVisual(before: readonly number[], index: number, identity: CutIdentity | null = null): CutScene {
  if (!Number.isInteger(index) || index <= 0 || index >= before.length) throw new Error("Invalid physical cut");
  const lifted = before.slice(0, index);
  const rest = before.slice(index);
  const after = [...rest, ...lifted];
  const frames: VisualFrame[] = [
    {
      eventIndex: 0,
      seq: 0,
      kind: "transfer",
      action: "lift_cut_packet",
      recordedT: 0,
      windowStart: 0,
      windowEnd: 1 / 3,
      packetIds: [...lifted],
      count: lifted.length,
      from: "draw",
      to: "upper",
      take: "top",
      place: "bottom",
      beforeZones: zones({ draw: [...before] }),
      zones: zones({ draw: [...rest], upper: [...lifted] }),
      positions: {},
    },
    {
      eventIndex: 1,
      seq: 1,
      kind: "transfer",
      action: "tuck_cut_under",
      recordedT: 0.5,
      windowStart: 1 / 3,
      windowEnd: 2 / 3,
      packetIds: [...lifted],
      count: lifted.length,
      from: "upper",
      to: "draw",
      take: "top",
      place: "bottom",
      beforeZones: zones({ draw: [...rest], upper: [...lifted] }),
      zones: zones({ draw: [...after] }),
      positions: {},
    },
    {
      eventIndex: 2,
      seq: 2,
      kind: "square",
      action: "square_cut",
      recordedT: 1,
      windowStart: 2 / 3,
      windowEnd: 1,
      packetIds: [],
      count: 0,
      beforeZones: zones({ draw: [...after] }),
      zones: zones({ draw: [...after] }),
      positions: {},
    },
  ];
  return { kind: "cut", before: [...before], after, index, frames, identity };
}
