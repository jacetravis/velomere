import { sha256 } from "./hash";

/** One physical card. Identity is the deck's Card.id, never its name or position. */
export type CardId = number;
export type Face = "down" | "up";
export type Side = 0 | 180;
export type PlacedCard = { cardId: CardId; drawIndex: number; face: Face };
export type OperationMeta = {
  index?: number;
  style?: string;
  attribution?: string;
  realizedOrder?: number[];
  destination?: "single" | "waiting";
  side?: Side;
  position?: number;
};
export type Operation = {
  id: string;
  kind: string;
  revisionFrom: number;
  revisionTo: number;
  beforeHash: string;
  afterHash: string;
  meta: OperationMeta;
};
export type PhysicalState = {
  deckId: number;
  sessionId: string;
  inventory: CardId[];
  revision: number;
  drawPile: CardId[];
  waitingStack: CardId[];
  slippedCard: CardId | null;
  table: Record<string, PlacedCard>;
  orientations: Record<string, Side>;
  drawHistory: CardId[];
  mode: "ready" | "single" | "collecting" | "revealing" | "complete";
  operations: Operation[];
};

function requireThat(ok: unknown, why: string): asserts ok {
  if (!ok) throw new Error(why);
}
function unique(values: CardId[]) {
  return new Set(values).size === values.length;
}
function canonical(state: PhysicalState) {
  return JSON.stringify({
    deckId: state.deckId,
    sessionId: state.sessionId,
    inventory: [...state.inventory].sort((a, b) => a - b),
    revision: state.revision,
    drawPile: state.drawPile,
    waitingStack: state.waitingStack,
    slippedCard: state.slippedCard,
    table: Object.entries(state.table).sort(([a], [b]) => a.localeCompare(b)),
    orientations: Object.entries(state.orientations).sort(([a], [b]) => a.localeCompare(b)),
    drawHistory: state.drawHistory,
    mode: state.mode,
  });
}

export function fingerprint(ids: readonly CardId[]) {
  return sha256([...ids].sort((a, b) => a - b).join(","));
}

export function sampleHash(state: PhysicalState) {
  return sha256(canonical(state));
}

export function verify(state: PhysicalState) {
  requireThat(Number.isInteger(state.deckId), "Bad deck ID");
  requireThat(unique(state.inventory), "Duplicate original IDs");
  requireThat(unique(state.drawPile) && unique(state.waitingStack), "Duplicate zone IDs");
  const positions = Object.values(state.table).map((item) => item.cardId);
  const slipped = state.slippedCard == null ? [] : [state.slippedCard];
  const actual = [...state.drawPile, ...state.waitingStack, ...positions, ...slipped];
  requireThat(unique(actual), "A card is duplicated across zones");
  requireThat(actual.length === state.inventory.length, "Card count changed");
  requireThat(actual.every((id) => state.inventory.includes(id)), "Foreign card ID");
  requireThat(state.inventory.every((id) => actual.includes(id)), "Missing original card");
  requireThat(unique(state.drawHistory), "Duplicate draw history");
  requireThat(state.drawHistory.every((id) => state.inventory.includes(id)), "Unknown drawn card");
  requireThat(!state.table.single || state.mode === "single", "Single-card display mode mismatch");
  return true;
}

export function newState(deckId: number, sessionId: string, preparedOrder: CardId[]): PhysicalState {
  requireThat(deckId > 0 && sessionId.trim().length > 0, "Invalid session");
  requireThat(preparedOrder.length > 0 && unique(preparedOrder), "Invalid physical inventory");
  const state: PhysicalState = {
    deckId,
    sessionId,
    inventory: [...preparedOrder],
    revision: 0,
    drawPile: [...preparedOrder],
    waitingStack: [],
    slippedCard: null,
    table: {},
    orientations: Object.fromEntries(preparedOrder.map((id) => [String(id), 0])) as Record<string, Side>,
    drawHistory: [],
    mode: "ready",
    operations: [],
  };
  verify(state);
  return state;
}

function change(
  state: PhysicalState,
  id: string,
  kind: string,
  update: (next: PhysicalState) => void,
  meta: OperationMeta = {},
): PhysicalState {
  requireThat(id.trim() !== "", "Operation ID required");
  if (state.operations.some((item) => item.id === id)) return state;
  verify(state);
  const beforeHash = sampleHash(state);
  const next: PhysicalState = {
    ...state,
    drawPile: [...state.drawPile],
    waitingStack: [...state.waitingStack],
    slippedCard: state.slippedCard,
    table: Object.fromEntries(Object.entries(state.table).map(([key, value]) => [key, { ...value }])),
    orientations: { ...state.orientations },
    drawHistory: [...state.drawHistory],
    operations: [...state.operations],
  };
  update(next);
  next.revision += 1;
  verify(next);
  const operation: Operation = {
    id,
    kind,
    revisionFrom: state.revision,
    revisionTo: next.revision,
    beforeHash,
    afterHash: sampleHash(next),
    meta,
  };
  next.operations = [...next.operations, operation].slice(-24);
  return next;
}

/** Same cut index the Table already uses in cutCards. */
export function cutIndex(length: number, ratio: number) {
  if (length < 2) return 0;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.min(length - 1, Math.max(1, Math.ceil(clamped * (length - 1))));
}

export function cut(state: PhysicalState, op: string, index: number): PhysicalState {
  return change(state, op, "cut", (next) => {
    requireThat(next.mode === "ready", "Deck not ready");
    requireThat(Number.isInteger(index) && index > 0 && index < next.drawPile.length, "Invalid physical cut");
    next.drawPile = [...next.drawPile.slice(index), ...next.drawPile.slice(0, index)];
  }, { index });
}

export function legacyShuffleEndpoint(state: PhysicalState, op: string, output: CardId[], style: string, attribution = "user"): PhysicalState {
  return change(state, op, "legacy_shuffle_realized", (next) => {
    requireThat(next.mode === "ready" || next.mode === "collecting", "Deck not available");
    requireThat(output.length === next.drawPile.length && unique(output), "Permutation invalid");
    requireThat(output.every((id) => next.drawPile.includes(id)), "Permutation changed inventory");
    next.drawPile = [...output];
  }, { style, attribution, realizedOrder: [...output] });
}

export function ejectSlip(state: PhysicalState, op: string, index: number): PhysicalState {
  return change(state, op, "slip_ejected_from_drawpile", (next) => {
    requireThat(next.mode === "ready" || next.mode === "collecting", "Cannot slip now");
    requireThat(next.slippedCard == null, "Already have a slipped card");
    requireThat(Number.isInteger(index) && index >= 0 && index < next.drawPile.length, "Bad slip index");
    const [id] = next.drawPile.splice(index, 1);
    requireThat(id !== undefined, "Slip card missing");
    next.slippedCard = id;
  }, { index });
}

export function acceptSlip(state: PhysicalState, op: string, destination: "single" | "waiting", side: Side = 0): PhysicalState {
  return change(state, op, "slip_tapped", (next) => {
    const id = next.slippedCard;
    requireThat(id != null, "No slipped card");
    if (destination === "single") {
      requireThat(next.mode === "ready", "Single card not ready");
      next.table.single = { cardId: id, drawIndex: 1, face: "up" };
      next.orientations[String(id)] = side;
      next.mode = "single";
    } else {
      requireThat(next.mode === "ready" || next.mode === "collecting", "Cannot collect");
      next.waitingStack.push(id);
      next.drawHistory.push(id);
      next.mode = "collecting";
    }
    next.slippedCard = null;
  }, { destination, side });
}

export function returnUntappedSlip(state: PhysicalState, op: string): PhysicalState {
  return change(state, op, "slip_return_top", (next) => {
    requireThat(next.slippedCard != null, "No slipped card");
    next.drawPile.unshift(next.slippedCard);
    next.slippedCard = null;
  });
}

export function drawSingle(state: PhysicalState, op: string, side: Side = 0): PhysicalState {
  return change(state, op, "single_draw", (next) => {
    requireThat(next.mode === "ready" && next.slippedCard == null, "Single card not ready");
    const cardId = next.drawPile.shift();
    requireThat(cardId !== undefined, "Empty deck");
    next.table.single = { cardId, drawIndex: 1, face: "up" };
    next.orientations[String(cardId)] = side;
    next.mode = "single";
  }, { side });
}

export function putBackSingle(state: PhysicalState, op: string): PhysicalState {
  return change(state, op, "single_return_top", (next) => {
    requireThat(next.mode === "single" && next.table.single, "No single card to return");
    next.drawPile.unshift(next.table.single.cardId);
    delete next.table.single;
    next.mode = "ready";
  });
}

export function drawWaiting(state: PhysicalState, op: string): PhysicalState {
  return change(state, op, "draw_to_waiting_bottom", (next) => {
    requireThat((next.mode === "ready" || next.mode === "collecting") && next.slippedCard == null, "Cannot collect");
    const cardId = next.drawPile.shift();
    requireThat(cardId !== undefined, "Empty deck");
    next.waitingStack.push(cardId);
    next.drawHistory.push(cardId);
    next.mode = "collecting";
  });
}

export function returnLatestWaiting(state: PhysicalState, op: string): PhysicalState {
  return change(state, op, "return_waiting_bottom_to_deck_top", (next) => {
    requireThat(next.mode === "collecting", "No collecting stack");
    const cardId = next.waitingStack.pop();
    requireThat(cardId !== undefined, "No waiting card");
    requireThat(next.drawHistory.at(-1) === cardId, "Draw history mismatch");
    next.drawHistory.pop();
    next.drawPile.unshift(cardId);
    if (next.waitingStack.length === 0) next.mode = "ready";
  });
}

export function stageFirst(state: PhysicalState, op: string, count: number): PhysicalState {
  return change(state, op, "stage_first", (next) => {
    requireThat(next.mode === "collecting" && next.drawHistory.length === count, "Incomplete spread");
    const cardId = next.waitingStack.shift();
    requireThat(cardId === next.drawHistory[0], "Wrong first card");
    next.table["spread:1"] = { cardId, drawIndex: 1, face: "down" };
    next.mode = "revealing";
  });
}

export function flipFirst(state: PhysicalState, op: string): PhysicalState {
  return change(state, op, "flip_first", (next) => {
    requireThat(next.mode === "revealing" && next.table["spread:1"]?.face === "down", "Not staged");
    next.table["spread:1"]!.face = "up";
    if (next.waitingStack.length === 0) next.mode = "complete";
  });
}

export function deliverNext(state: PhysicalState, op: string, position: number): PhysicalState {
  return change(state, op, "deliver_next", (next) => {
    requireThat(next.mode === "revealing" && next.table["spread:1"]?.face === "up", "First not revealed");
    requireThat(Number.isInteger(position) && position >= 2 && !next.table[`spread:${position}`], "Bad position");
    const cardId = next.waitingStack.shift();
    requireThat(cardId === next.drawHistory[position - 1], "Wrong waiting card");
    next.table[`spread:${position}`] = { cardId, drawIndex: position, face: "up" };
    if (next.waitingStack.length === 0) next.mode = "complete";
  }, { position });
}

export function clearSpreadToTop(state: PhysicalState, op: string): PhysicalState {
  return change(state, op, "gather_spread_to_deck_top", (next) => {
    requireThat(next.mode === "collecting" || next.mode === "revealing" || next.mode === "complete", "Not a spread");
    requireThat(next.slippedCard == null, "Reconcile slipped card before clearing");
    const participating = [...next.waitingStack, ...Object.values(next.table).map((item) => item.cardId)];
    requireThat(participating.length === next.drawHistory.length, "Spread movement mismatch");
    requireThat(next.drawHistory.every((id) => participating.includes(id)), "Spread missing card");
    next.drawPile = [...next.drawHistory, ...next.drawPile];
    next.waitingStack = [];
    next.table = {};
    next.drawHistory = [];
    next.mode = "ready";
  });
}

/** Put every card that left the draw pile back on top, as one recorded action. Undrawn cards stay put. */
export function gatherAll(state: PhysicalState, op: string): PhysicalState {
  if (state.mode === "ready" && state.slippedCard == null) return state;
  return change(state, op, "gather_all_to_deck_top", (next) => {
    if (next.slippedCard != null) {
      next.drawPile.unshift(next.slippedCard);
      next.slippedCard = null;
    }
    if (next.mode === "single" && next.table.single) {
      next.drawPile.unshift(next.table.single.cardId);
      delete next.table.single;
      next.mode = "ready";
    }
    if (next.mode === "collecting" || next.mode === "revealing" || next.mode === "complete") {
      requireThat(next.slippedCard == null, "Reconcile slipped card before clearing");
      const participating = [...next.waitingStack, ...Object.values(next.table).map((item) => item.cardId)];
      requireThat(participating.length === next.drawHistory.length, "Spread movement mismatch");
      requireThat(next.drawHistory.every((id) => participating.includes(id)), "Spread missing card");
      next.drawPile = [...next.drawHistory, ...next.drawPile];
      next.waitingStack = [];
      next.table = {};
      next.drawHistory = [];
      next.mode = "ready";
    }
  });
}

/** Compact checkpoint. The operations table keeps the full history. */
export function checkpoint(state: PhysicalState): PhysicalState {
  return {
    ...state,
    inventory: [...state.inventory],
    drawPile: [...state.drawPile],
    waitingStack: [...state.waitingStack],
    drawHistory: [...state.drawHistory],
    table: Object.fromEntries(Object.entries(state.table).map(([key, value]) => [key, { ...value }])),
    orientations: { ...state.orientations },
    operations: state.operations.slice(-1).map((operation) => ({
      ...operation,
      meta: {
        ...operation.meta,
        realizedOrder: operation.meta.realizedOrder ? [...operation.meta.realizedOrder] : undefined,
      },
    })),
  };
}

/** Replay one recorded operation. A legacy shuffle applies its realized order and attribution; it is not re-dealt card by card. */
export function replayOperation(state: PhysicalState, operation: Operation): PhysicalState {
  const id = operation.id;
  switch (operation.kind) {
    case "cut":
      return cut(state, id, operation.meta.index ?? -1);
    case "legacy_shuffle_realized":
      if (!operation.meta.realizedOrder) throw new Error("The legacy shuffle has no realized order.");
      return legacyShuffleEndpoint(
        state,
        id,
        operation.meta.realizedOrder,
        operation.meta.style ?? "legacy",
        operation.meta.attribution ?? "user",
      );
    case "slip_ejected_from_drawpile":
      return ejectSlip(state, id, operation.meta.index ?? -1);
    case "slip_tapped":
      if (operation.meta.destination !== "single" && operation.meta.destination !== "waiting") {
        throw new Error("The slipped card has no destination.");
      }
      return acceptSlip(state, id, operation.meta.destination, operation.meta.side === 180 ? 180 : 0);
    case "slip_return_top":
      return returnUntappedSlip(state, id);
    case "single_draw":
      return drawSingle(state, id, operation.meta.side === 180 ? 180 : 0);
    case "single_return_top":
      return putBackSingle(state, id);
    case "draw_to_waiting_bottom":
      return drawWaiting(state, id);
    case "return_waiting_bottom_to_deck_top":
      return returnLatestWaiting(state, id);
    case "stage_first":
      return stageFirst(state, id, state.drawHistory.length);
    case "flip_first":
      return flipFirst(state, id);
    case "deliver_next":
      return deliverNext(state, id, operation.meta.position ?? -1);
    case "gather_spread_to_deck_top":
      return clearSpreadToTop(state, id);
    case "gather_all_to_deck_top":
      return gatherAll(state, id);
    default:
      throw new Error("Unknown physical operation.");
  }
}
