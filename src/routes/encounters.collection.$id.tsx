import { createFileRoute } from "@tanstack/react-router";
import { EncounterStyleDeck } from "@/components/encounter-style-deck";

export const Route = createFileRoute("/encounters/collection/$id")({
  component: EncounterCollectionPage,
});

function EncounterCollectionPage() {
  const { id } = Route.useParams();
  return <EncounterStyleDeck collectionId={id} />;
}
