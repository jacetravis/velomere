import { createFileRoute } from "@tanstack/react-router";
import { JournalPage } from "@/components/journal-page";

export const Route = createFileRoute("/journal")({
  validateSearch: (search: Record<string, unknown>): { deck?: number; card?: number; dream?: string; ritual?: string; reading?: string; chat?: string } => {
    const deck = Number(search.deck);
    const card = Number(search.card);
    const dream = typeof search.dream === "string" ? search.dream.trim().slice(0, 80) : "";
    const ritual = typeof search.ritual === "string" ? search.ritual.trim().slice(0, 80) : "";
    const reading = typeof search.reading === "string" ? search.reading.trim().slice(0, 80) : "";
    const chat = typeof search.chat === "string" ? search.chat.trim().slice(0, 80) : "";
    return {
      ...(Number.isFinite(deck) && deck > 0 ? { deck } : {}),
      ...(Number.isFinite(card) && card > 0 ? { card } : {}),
      ...(dream ? { dream } : {}),
      ...(ritual ? { ritual } : {}),
      ...(reading ? { reading } : {}),
      ...(chat ? { chat } : {}),
    };
  },
  component: function JournalRoute() {
    const { deck, card, dream, ritual, reading, chat } = Route.useSearch();
    return <JournalPage deckId={deck} cardId={card} dreamId={dream} ritualId={ritual} readingId={reading} chatId={chat} />;
  },
});
