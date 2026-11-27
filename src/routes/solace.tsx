import { createFileRoute } from "@tanstack/react-router";
import { EncounterAdoption } from "@/components/encounter-adoption";
import { SolacePage } from "@/components/solace-page";

export const Route = createFileRoute("/solace")({
  validateSearch: (search: Record<string, unknown>): { draft?: string; card?: string } => {
    const draft = typeof search.draft === "string" && /^[a-f0-9]{32}$/.test(search.draft) ? search.draft : "";
    const card = typeof search.card === "string" && /^[a-f0-9]{32}$/.test(search.card) ? search.card : "";
    return {
      ...(draft ? { draft } : {}),
      ...(card ? { card } : {}),
    };
  },
  component: function SolaceRoute() {
    const { draft, card } = Route.useSearch();
    if (draft && card) return <EncounterAdoption draftId={draft} cardId={card} />;
    return <SolacePage />;
  },
});
