import { createFileRoute } from "@tanstack/react-router";
import { ArchiveSettings } from "@/components/archive-settings";

export const Route = createFileRoute("/settings")({
  component: ArchiveSettings,
});
