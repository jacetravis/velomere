import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

const MAX_LIBRARY = 8_000_000;

export const getLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<{ data: unknown }>(
      `select data from user_libraries where user_id = $1`,
      [context.userId],
    );
    return rows[0]?.data ?? null;
  });

export const saveLibrary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const text = JSON.stringify(input ?? null);
    if (text.length > MAX_LIBRARY) throw new Error("That library is too large to save.");
    return text;
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    await sql.query(
      `insert into user_libraries (user_id, data, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (user_id) do update
         set data = excluded.data,
             updated_at = now()`,
      [context.userId, data],
    );
    return { ok: true as const };
  });
