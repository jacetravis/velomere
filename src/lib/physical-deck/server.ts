import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction } from "@/lib/db";
import { applyPhysicalCommit } from "./commit";
import type { SpreadSnapshot } from "./spread-record";
import { verify, type Operation, type PhysicalState } from "./state";

type CommitInput = {
  deckId: number;
  sessionId: string;
  expectedRevision: number;
  snapshot: PhysicalState;
  operation: Operation;
  supersede?: boolean;
  spread?: SpreadSnapshot | null;
};

function readCommit(input: unknown): CommitInput {
  const raw = (input ?? {}) as Partial<CommitInput>;
  const snapshot = raw.snapshot;
  const operation = raw.operation;
  if (!snapshot || !operation || !operation.id || !operation.kind || raw.deckId == null || raw.sessionId == null) {
    throw new Error("The deck update was incomplete.");
  }
  return {
    deckId: Number(raw.deckId),
    sessionId: String(raw.sessionId),
    expectedRevision: Number(raw.expectedRevision),
    snapshot,
    operation,
    supersede: raw.supersede === true,
    spread: raw.spread ?? null,
  };
}

function readSpread(input: unknown) {
  const raw = (input ?? {}) as { deckId?: unknown; sessionId?: unknown; spread?: SpreadSnapshot | null };
  const deckId = Number(raw.deckId);
  if (!Number.isInteger(deckId) || deckId <= 0 || !raw.sessionId || !raw.spread?.id || !Array.isArray(raw.spread.positions)) {
    throw new Error("The spread could not be saved.");
  }
  return { deckId, sessionId: String(raw.sessionId), spread: raw.spread };
}

async function assertDeck(userId: string, deckId: number, inventory: number[]) {
  const sql = await getSql();
  const decks = await sql.query<{ id: number }>("select id from decks where id = $1 and user_id = $2", [deckId, userId]);
  if (!decks.length) throw new Error("That deck is not yours.");
  const cards = await sql.query<{ id: number }>("select id from cards where deck_id = $1", [deckId]);
  const known = new Set(cards.map((row) => Number(row.id)));
  if (inventory.length !== known.size || inventory.some((id) => !known.has(id))) {
    throw new Error("The deck's cards no longer match this reading.");
  }
}

async function assertDeckOwner(userId: string, deckId: number) {
  const sql = await getSql();
  const decks = await sql.query<{ id: number }>("select id from decks where id = $1 and user_id = $2", [deckId, userId]);
  if (!decks.length) throw new Error("That deck is not yours.");
}

export const commitPhysicalDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(readCommit)
  .handler(async ({ data, context }) => {
    try {
      await assertDeck(context.userId, data.deckId, data.snapshot.inventory);
    } catch (err) {
      return {
        status: "conflict" as const,
        revision: 0,
        reason: err instanceof Error ? err.message : "The deck update was rejected.",
      };
    }
    return withTransaction(async (sql) => applyPhysicalCommit(sql, context.userId, data));
  });

export const recordPhysicalSpread = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(readSpread)
  .handler(async ({ data, context }) => {
    await assertDeckOwner(context.userId, data.deckId);
    const sql = await getSql();
    const rows = await sql.query<{ session_id: string }>(
      `update physical_deck_sessions
          set spread_json = $4::jsonb, updated_at = now()
        where user_id = $1 and deck_id = $2 and session_id = $3 and active = true
        returning session_id`,
      [context.userId, data.deckId, data.sessionId, JSON.stringify(data.spread)],
    );
    return { status: rows.length ? "saved" as const : "pending" as const };
  });

export const loadPhysicalDeck = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const deckId = Number((input as { deckId?: unknown } | null)?.deckId);
    if (!Number.isInteger(deckId) || deckId <= 0) throw new Error("A deck is required.");
    return { deckId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const rows = await sql.query<{ revision: number; snapshot_json: PhysicalState | string; spread_json: SpreadSnapshot | string | null }>(
      `select revision, snapshot_json, spread_json from physical_deck_sessions
        where user_id = $1 and deck_id = $2 and active = true
        order by updated_at desc
        limit 1`,
      [context.userId, data.deckId],
    );
    const row = rows[0];
    if (!row) return null;
    const snapshot = typeof row.snapshot_json === "string" ? JSON.parse(row.snapshot_json) as PhysicalState : row.snapshot_json;
    verify(snapshot);
    const spread = !row.spread_json ? null : typeof row.spread_json === "string" ? JSON.parse(row.spread_json) as SpreadSnapshot : row.spread_json;
    return { revision: Number(row.revision), snapshot, spread };
  });
