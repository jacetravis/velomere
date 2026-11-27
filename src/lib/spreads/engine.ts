export type QuarterTurn = 0 | 90 | 180 | 270;
export type Location = "staged_draw" | "waiting_stack" | "table";
export type Face = "down" | "up";
export type Status = "collecting" | "collected" | "staged" | "revealing" | "complete";

export type SpreadPosition = {
  id: string;
  order: number;
  name: string;
  question: string;
  meaningApplication: string;
  x: number;
  y: number;
  rotationDeg: QuarterTurn;
  zIndex: number;
  angleNotes: Record<"0" | "90" | "180" | "270", string>;
  intentionalOverlapWith?: string[];
};

export type SpreadDefinition = {
  id: string;
  name: string;
  description: string;
  openingQuestion: string;
  revision: number;
  factoryTemplateId?: string;
  categoryId: "standard" | "my-spreads";
  positions: SpreadPosition[];
  tile: string;
};

export type DrawnCard = {
  deckId: number;
  deckName: string;
  cardId: number;
  cardName: string;
  upright: string;
  reversed: string;
  imageUrl: string | null;
  keywords: string;
  suit: string;
  rank: string;
};

export type Assignment = {
  positionId: string;
  positionOrder: number;
  drawIndex: number;
  deckId: number;
  deckName: string;
  cardId: number;
  cardName: string;
  upright: string;
  reversed: string;
  imageUrl: string | null;
  keywords: string;
  suit: string;
  rank: string;
  physicalAngle: QuarterTurn;
  location: Location;
  face: Face;
  revealedAt?: string;
  deliveredAt?: string;
};

export type Session = {
  id: string;
  status: Status;
  version: number;
  spread: SpreadDefinition;
  drawnCount: number;
  nextOrderToDeliver: number;
  assignments: Assignment[];
  requests: Record<string, number>;
  pullReason?: string;
};

export class SpreadCommandError extends Error {}

function now() {
  return new Date().toISOString();
}

function byOrder(session: Session, order: number) {
  return session.assignments.find((item) => item.positionOrder === order);
}

export function startSession(spread: SpreadDefinition): Session {
  if (!spread.positions.length) throw new SpreadCommandError("A spread needs a position.");
  return {
    id: crypto.randomUUID(),
    status: "collecting",
    version: 1,
    spread,
    drawnCount: 0,
    nextOrderToDeliver: 1,
    assignments: [],
    requests: {},
  };
}

export function drawNext(session: Session, requestId: string, card: DrawnCard): Session {
  const prior = session.requests[requestId];
  if (prior != null) return session;
  const total = session.spread.positions.length;
  if (session.status !== "collecting") throw new SpreadCommandError("The draw is already finished.");
  if (session.drawnCount >= total) throw new SpreadCommandError("Every card for this spread is already drawn.");
  const order = session.drawnCount + 1;
  const position = session.spread.positions.find((item) => item.order === order);
  if (!position) throw new SpreadCommandError("That position is missing.");
  const assignment: Assignment = {
    positionId: position.id,
    positionOrder: order,
    drawIndex: order,
    deckId: card.deckId,
    deckName: card.deckName,
    cardId: card.cardId,
    cardName: card.cardName,
    upright: card.upright,
    reversed: card.reversed,
    imageUrl: card.imageUrl,
    keywords: card.keywords,
    suit: card.suit,
    rank: card.rank,
    physicalAngle: position.rotationDeg,
    location: "waiting_stack",
    face: "down",
  };
  return {
    ...session,
    status: order === total ? "collected" : "collecting",
    version: session.version + 1,
    drawnCount: order,
    nextOrderToDeliver: 1,
    assignments: [...session.assignments, assignment],
    requests: { ...session.requests, [requestId]: session.version + 1 },
  };
}

export function returnLatestWaiting(session: Session): { session: Session; cardId: number } | null {
  if (session.status !== "collecting" && session.status !== "collected") return null;
  const waiting = session.assignments.filter((item) => item.location === "waiting_stack");
  const top = waiting[waiting.length - 1];
  if (!top) return null;
  const assignments = session.assignments.filter((item) => item.positionId !== top.positionId);
  return {
    cardId: top.cardId,
    session: {
      ...session,
      status: "collecting",
      version: session.version + 1,
      drawnCount: assignments.length,
      nextOrderToDeliver: 1,
      assignments,
    },
  };
}

/** After the last native draw has joined the bottom of the stack, move only card 1 onto the table. */
export function stageSpread(session: Session, requestId: string): Session {
  const prior = session.requests[requestId];
  if (prior != null) return session;
  if (session.status !== "collected") throw new SpreadCommandError("The side stack is not ready to be laid out.");
  const total = session.spread.positions.length;
  if (session.assignments.length !== total) throw new SpreadCommandError("Not every card has been drawn.");
  const assignments = session.assignments.map((item) =>
    item.positionOrder === 1 ? { ...item, location: "table" as const, face: "down" as const } : item,
  );
  return {
    ...session,
    status: "staged",
    version: session.version + 1,
    nextOrderToDeliver: 1,
    assignments,
    requests: { ...session.requests, [requestId]: session.version + 1 },
  };
}

export function flipFirst(session: Session, expectedVersion: number, requestId: string): Session {
  const prior = session.requests[requestId];
  if (prior != null) return session;
  if (expectedVersion !== session.version) throw new SpreadCommandError("This reading moved on another screen.");
  if (session.status !== "staged") throw new SpreadCommandError("The first card is not waiting face down.");
  const first = byOrder(session, 1);
  if (!first || first.location !== "table" || first.face !== "down") throw new SpreadCommandError("The first card is not on the table.");
  const total = session.spread.positions.length;
  const at = now();
  const assignments = session.assignments.map((item) =>
    item.positionOrder === 1 ? { ...item, location: "table" as const, face: "up" as const, revealedAt: at, deliveredAt: at } : item,
  );
  return {
    ...session,
    status: total === 1 ? "complete" : "revealing",
    version: session.version + 1,
    nextOrderToDeliver: 2,
    assignments,
    requests: { ...session.requests, [requestId]: session.version + 1 },
  };
}

export function revealNextFromStack(session: Session, expectedOrder: number, expectedVersion: number, requestId: string): Session {
  const prior = session.requests[requestId];
  if (prior != null) return session;
  if (expectedVersion !== session.version) throw new SpreadCommandError("This reading moved on another screen.");
  if (session.status !== "revealing") throw new SpreadCommandError("The side stack is not ready.");
  if (expectedOrder !== session.nextOrderToDeliver) throw new SpreadCommandError("That is not the next card.");
  const card = byOrder(session, expectedOrder);
  if (!card || card.location !== "waiting_stack" || card.face !== "down") throw new SpreadCommandError("That card is not in the side stack.");
  const at = now();
  const assignments = session.assignments.map((item) =>
    item.positionOrder === expectedOrder
      ? { ...item, location: "table" as const, face: "up" as const, revealedAt: at, deliveredAt: at }
      : item,
  );
  const total = session.spread.positions.length;
  const done = expectedOrder >= total;
  return {
    ...session,
    status: done ? "complete" : "revealing",
    version: session.version + 1,
    nextOrderToDeliver: expectedOrder + 1,
    assignments,
    requests: { ...session.requests, [requestId]: session.version + 1 },
  };
}

export type NextAction = "draw" | "flip_first" | "reveal_next_from_stack" | "journal_or_solace";

export type SafePosition = {
  position: SpreadPosition;
  visual: "ghost" | "first_face_down" | "revealed_face_up";
  revealed?: {
    cardId: number;
    cardName: string;
    deckId: number;
    deckName: string;
    imageUrl: string | null;
    upright: string;
    reversed: string;
    keywords: string;
    suit: string;
    rank: string;
    physicalAngle: QuarterTurn;
  };
};

/** Identities of hidden cards are omitted. */
export function project(session: Session | null, required: number) {
  if (!session) {
    return {
      deckVisible: true,
      drawnCount: 0,
      requiredCount: required,
      waitingStackRemaining: 0,
      nextAction: "draw" as NextAction,
      positions: [] as SafePosition[],
    };
  }
  const waiting = session.assignments.filter((item) => item.location === "waiting_stack").length;
  const next = session.spread.positions.find((item) => item.order === (session.status === "collected" ? 1 : session.nextOrderToDeliver));
  const nextAction: NextAction =
    session.status === "collecting" || session.status === "collected"
      ? "draw"
      : session.status === "staged"
        ? "flip_first"
        : session.status === "revealing"
          ? "reveal_next_from_stack"
          : "journal_or_solace";
  const positions: SafePosition[] = [...session.spread.positions]
    .sort((a, b) => a.zIndex - b.zIndex || a.order - b.order)
    .map((position) => {
      const card = session.assignments.find((item) => item.positionId === position.id);
      if (card?.location === "table" && card.face === "up") {
        return {
          position,
          visual: "revealed_face_up" as const,
          revealed: {
            cardId: card.cardId,
            cardName: card.cardName,
            deckId: card.deckId,
            deckName: card.deckName,
            imageUrl: card.imageUrl,
            upright: card.upright,
            reversed: card.reversed,
            keywords: card.keywords,
            suit: card.suit,
            rank: card.rank,
            physicalAngle: card.physicalAngle,
          },
        };
      }
      if (card?.location === "table" && card.face === "down") return { position, visual: "first_face_down" as const };
      return { position, visual: "ghost" as const };
    });
  return {
    deckVisible: session.status === "collecting" || session.status === "collected",
    drawnCount: session.drawnCount,
    requiredCount: session.spread.positions.length,
    waitingStackRemaining: waiting,
    nextAction,
    nextPosition: next && nextAction !== "journal_or_solace" ? { id: next.id, order: next.order, name: next.name } : undefined,
    positions,
  };
}
