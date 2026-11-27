import { createFileRoute } from "@tanstack/react-router";
import { DeckPage } from "@/components/deck-page";

export const Route = createFileRoute("/deck/$deckId")({
  validateSearch: (search: Record<string, unknown>): { card?: number } => {
    const card = Number(search.card);
    if (!Number.isFinite(card) || card <= 0) return {};
    return { card };
  },
  component: function DeckRoute() {
    const { deckId } = Route.useParams();
    const { card } = Route.useSearch();
    return <DeckPage deckId={Number(deckId)} focusCardId={card} />;
  },
});
