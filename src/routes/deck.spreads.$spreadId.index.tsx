import { createFileRoute } from "@tanstack/react-router";
import { SpreadDetail } from "@/components/spread-detail";

export const Route = createFileRoute("/deck/spreads/$spreadId/")({
  component: function SpreadDetailRoute() {
    const { spreadId } = Route.useParams();
    return <SpreadDetail spreadId={spreadId} />;
  },
});
