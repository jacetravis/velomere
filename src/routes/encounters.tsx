import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/encounters")({
  component: function EncounterLayout() {
    return <Outlet />;
  },
});
