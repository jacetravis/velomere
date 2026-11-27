import type { Assignment, Face, Session, SpreadDefinition } from "@/lib/spreads/engine";
import type { PhysicalState } from "./state";

export type RepairCard = {
  id: number;
  name: string;
  upright: string;
  reversed: string;
  imageUrl: string | null;
  keywords: string;
  suit: string;
  rank: string;
};

export type SpreadRepair =
  | { action: "keep" }
  | { action: "clear" }
  | { action: "replace"; session: Session }
  | { action: "pause"; reason: string };

function placedSpreads(state: PhysicalState) {
  return Object.entries(state.table)
    .filter(([key]) => key.startsWith("spread:"))
    .map(([key, value]) => ({ position: Number(key.slice("spread:".length)), ...value }))
    .filter((item) => Number.isInteger(item.position));
}

function statusFor(state: PhysicalState, total: number): Session["status"] {
  const first = state.table["spread:1"];
  const placed = placedSpreads(state);
  if (state.mode === "complete" || (placed.length === total && state.waitingStack.length === 0 && first?.face === "up")) return "complete";
  if (first?.face === "up") return "revealing";
  if (first?.face === "down") return "staged";
  if (state.drawHistory.length >= total && total > 0) return "collected";
  return "collecting";
}

/**
 * Make the spread session follow the physical zones.
 * Physical order wins. A single shown card is left alone.
 * Missing metadata pauses instead of inventing a card.
 */
export function repairSpreadSession(
  physical: PhysicalState,
  session: Session | null,
  cards: readonly RepairCard[],
  spread: SpreadDefinition | null,
  deckId: number,
  deckName: string,
): SpreadRepair {
  if (physical.mode === "single" || physical.table.single) return { action: "keep" };
  const placed = placedSpreads(physical);
  const history = physical.drawHistory;
  const waiting = physical.waitingStack;
  if (history.length === 0 && placed.length === 0 && waiting.length === 0) {
    if (!session?.assignments.some((item) => item.deckId === deckId)) return { action: "keep" };
    return { action: "clear" };
  }
  if (session?.assignments.length && session.assignments.every((item) => item.deckId !== deckId)) {
    return { action: "pause", reason: "Another deck still has an open reading. Handling is paused so those cards are not mixed." };
  }
  const out = new Set([...waiting, ...placed.map((item) => item.cardId)]);
  if (out.size !== history.length || history.some((id) => !out.has(id))) {
    return { action: "pause", reason: "The spread and the deck disagree about which cards moved." };
  }
  const expectedWaiting = history.filter((_, index) => !placed.some((item) => item.position === index + 1 && item.cardId === history[index]));
  if (expectedWaiting.join(",") !== waiting.join(",")) {
    return { action: "pause", reason: "The waiting stack is not in draw order." };
  }
  const layout = session && session.assignments.some((item) => item.deckId === deckId) ? session.spread : spread;
  if (!layout || history.length > layout.positions.length) {
    return { action: "pause", reason: "The open reading does not match a known spread." };
  }
  const known = new Map(cards.map((card) => [card.id, card]));
  const assignments: Assignment[] = [];
  for (let index = 0; index < history.length; index += 1) {
    const cardId = history[index]!;
    const position = layout.positions.find((item) => item.order === index + 1);
    if (!position) return { action: "pause", reason: "That spread is missing a position." };
    const prior = session?.assignments.find((item) => item.cardId === cardId && item.deckId === deckId);
    const card = known.get(cardId);
    if (!prior && !card) return { action: "pause", reason: "A drawn card is no longer in this deck." };
    const onTable = placed.find((item) => item.position === index + 1 && item.cardId === cardId);
    assignments.push({
      positionId: position.id,
      positionOrder: position.order,
      drawIndex: index + 1,
      deckId,
      deckName: prior?.deckName || deckName,
      cardId,
      cardName: prior?.cardName || card?.name || "Card",
      upright: prior?.upright || card?.upright || "",
      reversed: prior?.reversed || card?.reversed || "",
      imageUrl: prior?.imageUrl ?? card?.imageUrl ?? null,
      keywords: prior?.keywords || card?.keywords || "",
      suit: prior?.suit || card?.suit || "",
      rank: prior?.rank || card?.rank || "",
      physicalAngle: position.rotationDeg,
      location: onTable ? "table" : "waiting_stack",
      face: (onTable?.face ?? "down") as Face,
    });
  }
  const status = statusFor(physical, layout.positions.length);
  const faceUp = placed.filter((item) => item.face === "up").length;
  const nextOrderToDeliver = status === "revealing" ? faceUp + 1 : 1;
  const same = session
    && session.spread.id === layout.id
    && session.status === status
    && session.drawnCount === history.length
    && session.assignments.length === assignments.length
    && session.assignments.every((item, index) => {
      const next = assignments[index];
      return next
        && item.cardId === next.cardId
        && item.location === next.location
        && item.face === next.face
        && item.positionOrder === next.positionOrder;
    });
  if (same) return { action: "keep" };
  return {
    action: "replace",
    session: {
      id: session?.id ?? `recovered-${physical.sessionId}`,
      status,
      version: (session?.version ?? 0) + 1,
      spread: layout,
      drawnCount: history.length,
      nextOrderToDeliver,
      assignments,
      requests: {},
      pullReason: session?.pullReason,
    },
  };
}
