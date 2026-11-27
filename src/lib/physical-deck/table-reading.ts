import type { Session, SpreadDefinition } from "@/lib/spreads/engine";
import type { SpreadSnapshot } from "./spread-record";
import { spreadForRecovery } from "./spread-record";
import { repairSpreadSession, type RepairCard, type SpreadRepair } from "./spread-sync";
import type { PhysicalState } from "./state";

/** What the Table shows. The saved library selection is separate from an open reading. */
export type TableReading = {
  session: Session | null;
  spread: SpreadDefinition | null;
  name: string;
};

/**
 * The open physical reading wins, including a custom spread this device has never saved.
 * Otherwise the Table shows the reading only when it is the selected spread.
 * The selected preference is left untouched either way.
 */
export function displayedTableReading(input: {
  session: Session | null;
  selectedId: string;
  selected: SpreadDefinition | null;
  recorded: SpreadSnapshot | null;
}): TableReading {
  const session = input.session;
  if (session && input.recorded && session.spread.id === input.recorded.id) {
    return { session, spread: session.spread, name: session.spread.name };
  }
  if (session && session.spread.id === input.selectedId) {
    const size = input.selected?.positions.length ?? 1;
    if (session.spread.positions.length === size) {
      return { session, spread: session.spread, name: session.spread.name };
    }
  }
  return {
    session: null,
    spread: input.selected,
    name: input.selected?.name ?? "this spread",
  };
}

/** The Table replaces the deck with the spread layout only for this reading. */
export function tableLaysReading(displayed: TableReading) {
  const size = displayed.spread?.positions.length ?? 1;
  const session = displayed.session;
  return size > 1 && !!session && (session.status === "staged" || session.status === "revealing" || session.status === "complete");
}

/**
 * Rebuild the open reading from the physical session.
 * This adopts that reading only. It does not write the library, its meanings, or the selected spread.
 */
export function resumeTableReading(input: {
  physical: PhysicalState;
  session: Session | null;
  cards: readonly RepairCard[];
  recorded: SpreadSnapshot | null;
  deckId: number;
  deckName: string;
  adopt: (session: Session | null) => void;
}): SpreadRepair {
  const sessionSpread = input.session?.assignments.some((item) => item.deckId === input.deckId) ? input.session.spread : null;
  const spread = spreadForRecovery(input.recorded, sessionSpread);
  const plan = repairSpreadSession(input.physical, input.session, input.cards, spread, input.deckId, input.deckName);
  if (plan.action === "clear") input.adopt(null);
  if (plan.action === "replace") input.adopt(plan.session);
  return plan;
}
