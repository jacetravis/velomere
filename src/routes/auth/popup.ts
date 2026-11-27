import { createFileRoute } from "@tanstack/react-router";
import { handleAuthPopupRequest } from "@/lib/auth/popup.server";

// Server-only. No component — a React page here would paint the app shell
// inside the sign-in window. The dev server answers this path first; this
// handler is what the published app uses.
export const Route = createFileRoute("/auth/popup")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthPopupRequest(request),
    },
  },
});
