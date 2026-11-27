import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/deck")({
  component: function DeckLayout() {
    return <Outlet />;
  },
});
