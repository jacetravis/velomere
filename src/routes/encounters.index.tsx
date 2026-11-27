import { createFileRoute } from "@tanstack/react-router";
import { EncounterTable } from "@/components/encounter-table";

export const Route = createFileRoute("/encounters/")({
  component: EncounterTable,
});
