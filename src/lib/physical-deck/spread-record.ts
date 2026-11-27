import type { SpreadDefinition, SpreadPosition } from "@/lib/spreads/engine";

/** Layout and meanings captured with a physical reading. This is not a library edit. */
export type SpreadSnapshot = {
  id: string;
  name: string;
  description: string;
  openingQuestion: string;
  revision: number;
  positions: Array<Omit<SpreadPosition, "intentionalOverlapWith"> & { intentionalOverlapWith?: string[] }>;
};

const EMPTY_NOTES = { "0": "", "90": "", "180": "", "270": "" };

export function captureSpread(spread: SpreadDefinition): SpreadSnapshot {
  return {
    id: spread.id,
    name: spread.name,
    description: spread.description,
    openingQuestion: spread.openingQuestion,
    revision: spread.revision,
    positions: spread.positions.map((position) => ({
      id: position.id,
      order: position.order,
      name: position.name,
      question: position.question,
      meaningApplication: position.meaningApplication,
      x: position.x,
      y: position.y,
      rotationDeg: position.rotationDeg,
      zIndex: position.zIndex,
      angleNotes: { ...EMPTY_NOTES, ...position.angleNotes },
      intentionalOverlapWith: position.intentionalOverlapWith ? [...position.intentionalOverlapWith] : undefined,
    })),
  };
}

export function definitionFromSnapshot(snapshot: SpreadSnapshot): SpreadDefinition {
  return {
    id: snapshot.id,
    name: snapshot.name,
    description: snapshot.description,
    openingQuestion: snapshot.openingQuestion,
    revision: snapshot.revision,
    categoryId: "my-spreads",
    tile: "",
    positions: snapshot.positions.map((position) => ({
      ...position,
      angleNotes: { ...EMPTY_NOTES, ...position.angleNotes },
      intentionalOverlapWith: position.intentionalOverlapWith ? [...position.intentionalOverlapWith] : undefined,
    })),
  };
}

/**
 * The spread saved with this physical session wins.
 * A device's currently selected layout is not a substitute.
 * The session's own definition is used only when nothing was recorded.
 */
export function spreadForRecovery(recorded: SpreadSnapshot | null, sessionSpread: SpreadDefinition | null): SpreadDefinition | null {
  if (recorded) return definitionFromSnapshot(recorded);
  return sessionSpread;
}
