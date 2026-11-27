import { cleanConversationTurns, useJournal, type ConversationTurn, type Reading } from "@/lib/journal/store";
import { cleanOrigin, sameOrigin, type CardOrigin, type ConversationOrigin } from "@/lib/solace/origin";
import { requestFlipSave } from "@/lib/solace/flip-prompt";
import { useSolace, type SolaceTurn } from "@/lib/solace/store";

export function threadNeedsSave(messages: SolaceTurn[], journalId: string | null): boolean {
  const turns = cleanConversationTurns(messages);
  if (turns.length === 0) return false;
  if (!journalId) return true;
  const saved = (useJournal.getState().conversations ?? []).find((conversation) => conversation.id === journalId);
  if (!saved) return true;
  return !sameTurns(saved.turns, turns);
}

export function keepCurrentThread(origin?: ConversationOrigin | null): "saved" | "updated" | "empty" {
  const { messages, journalId, setJournalId, shared } = useSolace.getState();
  const turns = cleanConversationTurns(messages);
  if (turns.length === 0) return "empty";
  const kept = cleanOrigin(origin === undefined ? shared?.source : origin);
  const vowAt = useSolace.getState().vowAt || undefined;
  const journal = useJournal.getState();
  if (journalId && journal.updateConversation(journalId, turns, kept, vowAt)) return "updated";
  const saved = journal.addConversation(turns, kept, vowAt);
  if (!saved) return "empty";
  setJournalId(saved.id);
  return "saved";
}

export async function saveCurrentThread(): Promise<"saved" | "updated" | "empty" | "cancelled"> {
  const state = useSolace.getState();
  const turns = cleanConversationTurns(state.messages);
  if (turns.length === 0) return "empty";
  let origin = state.shared?.source ?? null;
  if (origin?.kind === "card" && origin.from === "flip") {
    const match = flipReading(origin);
    if (match) {
      if (origin.readingId !== match.id) origin = { ...origin, readingId: match.id };
    } else {
      const choice = await requestFlipSave();
      if (!choice) return "cancelled";
      if (choice === "both") {
        const reading = useJournal.getState().addReading({
          cardId: origin.cardId,
          cardName: origin.cardName,
          suit: origin.suit,
          rank: origin.rank,
          orientation: origin.orientation,
          keywords: origin.keywords,
          meaningSnapshot: origin.meaning,
          notes: "",
          question: origin.question,
          pulledAt: origin.pulledAt || undefined,
          deckId: origin.deckId,
          deckName: origin.deckName,
          manual: false,
        });
        origin = { ...origin, readingId: reading.id };
      }
    }
    const live = useSolace.getState().shared?.source;
    const liveId = live?.kind === "card" ? live.readingId : null;
    if (origin.readingId !== liveId && sameOrigin(live, origin)) useSolace.getState().setSource(origin);
  }
  return keepCurrentThread(origin);
}

function flipReading(origin: CardOrigin): Reading | undefined {
  const readings = useJournal.getState().readings ?? [];
  if (origin.readingId) {
    const byId = readings.find((reading) => reading.id === origin.readingId);
    if (byId) return byId;
  }
  if (!origin.pulledAt) return undefined;
  return readings.find(
    (reading) =>
      !reading.manual &&
      reading.pulledAt === origin.pulledAt &&
      reading.cardId === origin.cardId &&
      (reading.deckId ?? null) === (origin.deckId ?? null),
  );
}

function sameTurns(saved: ConversationTurn[], next: ConversationTurn[]) {
  if (saved.length !== next.length) return false;
  return saved.every((turn, index) => turn.role === next[index]?.role && turn.content === next[index]?.content);
}