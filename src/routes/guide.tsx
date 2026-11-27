import { createFileRoute } from "@tanstack/react-router";
import { VelomereGuide } from "@/components/velomere-guide";

export const Route = createFileRoute("/guide")({
  validateSearch: (search: Record<string, unknown>): { card?: string } => {
    const card = typeof search.card === "string" ? search.card.trim().slice(0, 80) : "";
    return card ? { card } : {};
  },
  component: function GuideRoute() {
    const { card } = Route.useSearch();
    return <VelomereGuide focus={card ?? ""} />;
  },
});
