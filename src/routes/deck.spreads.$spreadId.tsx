import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/deck/spreads/$spreadId")({
  component: function SpreadIdLayout() {
    return <Outlet />;
  },
});
