import { createFileRoute } from "@tanstack/react-router";
import { SpreadEditor } from "@/components/spread-editor";

export const Route = createFileRoute("/deck/spreads/$spreadId/edit")({
  component: function SpreadEditRoute() {
    const { spreadId } = Route.useParams();
    return <SpreadEditor spreadId={spreadId} />;
  },
});
