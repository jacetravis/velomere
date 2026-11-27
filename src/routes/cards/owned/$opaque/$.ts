import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { readOwnedFile } from "@/lib/cards/owned-art";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/cards/owned/$opaque/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const match = /^\/cards\/owned\/([a-f0-9]{32})\/([a-z0-9./_-]+)$/i.exec(url.pathname);
        if (!match) return new Response("Not found", { status: 404 });
        const opaque = match[1].toLowerCase();
        const relpath = match[2];
        if (relpath.includes("..") || relpath.startsWith("/")) {
          return new Response("Not found", { status: 404 });
        }
        const session = await auth.api.getSession({ headers: request.headers });
        const userId = session?.user?.id;
        if (!userId) return new Response("Sign in to see this card.", { status: 401 });
        const sql = await getSql();
        const file = await readOwnedFile(sql, userId, opaque, relpath);
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(Buffer.from(file.bytes), {
          headers: {
            "content-type": file.mime,
            "cache-control": "private, max-age=86400",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
