import { createFileRoute } from "@tanstack/react-router";
import { SpreadLibrary } from "@/components/spread-library";

export const Route = createFileRoute("/deck/spreads/")({
  component: SpreadLibrary,
});
