import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { bytesOf } from "@/lib/cards/owned-art";
import { getSql } from "@/lib/db";
import { ensureArtSchema } from "@/lib/encounters/store.mjs";

export const Route = createFileRoute("/encounters/art/$id")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const match = /^\/encounters\/art\/([a-f0-9]{32})$/i.exec(url.pathname);
        if (!match) return new Response("Not found", { status: 404 });
        const session = await auth.api.getSession({ headers: request.headers });
        const userId = session?.user?.id;
        if (!userId) return new Response("Sign in to see this card.", { status: 401 });
        const sql = await getSql();
        await ensureArtSchema(sql);
        const rows = await sql.query<{ bytes: unknown; mime?: string | null }>(
          `select bytes, mime from vel_art_renders where id = $1 and owner_id = $2`,
          [match[1].toLowerCase(), userId],
        );
        const bytes = bytesOf(rows[0]?.bytes);
        if (!bytes) return new Response("Not found", { status: 404 });
        const mime = rows[0]?.mime === "image/jpeg" ? "image/jpeg" : "image/png";
        return new Response(Buffer.from(bytes), {
          headers: {
            "content-type": mime,
            "cache-control": "private, max-age=86400",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});