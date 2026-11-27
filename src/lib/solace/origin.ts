export type CardOrigin = {
  kind: "card";
  from: "flip" | "deck" | "journal";
  cardName: string;
  cardId: number;
  deckId: number | null;
  deckName: string;
  suit: string;
  rank: string;
  orientation: "upright" | "reversed";
  keywords: string;
  imageUrl: string | null;
  pulledAt: string;
  question: string;
  meaning: string;
  readingId: string | null;
};

export type EntryOrigin = {
  kind: "dream" | "ritual";
  entryId: string;
  title: string;
};

export type ConversationOrigin = CardOrigin | EntryOrigin;

export function shortImage(url: string | null | undefined) {
  if (!url || url.startsWith("data:") || url.length > 500) return null;
  return url;
}

export function cleanOrigin(value: unknown): ConversationOrigin | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind === "dream" || raw.kind === "ritual") {
    const entryId = typeof raw.entryId === "string" ? raw.entryId.trim().slice(0, 80) : "";
    if (!entryId) return null;
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
    return { kind: raw.kind, entryId, title: title || (raw.kind === "dream" ? "A dream" : "A ritual") };
  }
  if (raw.kind !== "card") return null;
  const from = raw.from === "deck" || raw.from === "journal" || raw.from === "flip" ? raw.from : null;
  const cardName = typeof raw.cardName === "string" ? raw.cardName.trim().slice(0, 160) : "";
  if (!from || !cardName) return null;
  const cardId = typeof raw.cardId === "number" && Number.isFinite(raw.cardId) ? raw.cardId : 0;
  const deckId = typeof raw.deckId === "number" && Number.isFinite(raw.deckId) ? raw.deckId : null;
  return {
    kind: "card",
    from,
    cardName,
    cardId,
    deckId,
    deckName: typeof raw.deckName === "string" ? raw.deckName.trim().slice(0, 80) : "",
    suit: typeof raw.suit === "string" ? raw.suit.slice(0, 40) : "",
    rank: typeof raw.rank === "string" ? raw.rank.slice(0, 40) : "",
    orientation: raw.orientation === "reversed" ? "reversed" : "upright",
    keywords: typeof raw.keywords === "string" ? raw.keywords.slice(0, 200) : "",
    imageUrl: shortImage(typeof raw.imageUrl === "string" ? raw.imageUrl : null),
    pulledAt: typeof raw.pulledAt === "string" ? raw.pulledAt.slice(0, 40) : "",
    question: typeof raw.question === "string" ? raw.question.slice(0, 2000) : "",
    meaning: typeof raw.meaning === "string" ? raw.meaning.slice(0, 4000) : "",
    readingId: typeof raw.readingId === "string" && raw.readingId.trim() ? raw.readingId.trim().slice(0, 80) : null,
  };
}

export function sameOrigin(a: ConversationOrigin | null | undefined, b: ConversationOrigin | null | undefined) {
  const left = cleanOrigin(a);
  const right = cleanOrigin(b);
  if (!left && !right) return true;
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === "card" && right.kind === "card") {
    if (left.from !== right.from || left.deckId !== right.deckId || left.cardId !== right.cardId || left.pulledAt !== right.pulledAt) return false;
    if (left.readingId && right.readingId && left.readingId !== right.readingId) return false;
    return true;
  }
  if (left.kind !== "card" && right.kind !== "card") return left.entryId === right.entryId;
  return false;
}

export function carryReadingId(current: ConversationOrigin | null | undefined, next: ConversationOrigin | null) {
  if (
    next?.kind !== "card" ||
    current?.kind !== "card" ||
    next.readingId ||
    !current.readingId ||
    current.from !== next.from ||
    current.deckId !== next.deckId ||
    current.cardId !== next.cardId ||
    current.pulledAt !== next.pulledAt
  ) {
    return next;
  }
  return { ...next, readingId: current.readingId };
}
