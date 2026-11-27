import { createFileRoute } from "@tanstack/react-router";
import { DeckIndex } from "@/components/deck-index";

export const Route = createFileRoute("/deck/")({
  component: DeckIndex,
});
