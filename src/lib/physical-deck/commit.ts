import { fingerprint, type Operation, type PhysicalState } from "./state";

export type Queryable = {
  query: <T>(text: string, params?: unknown[]) => Promise<T[]>;
};

export type PhysicalCommit = {
  deckId: number;
  sessionId: string;
  expectedRevision: number;
  snapshot: PhysicalState;
  operation: Operation;
};

export async function applyPhysicalCommit(sql: Queryable, userId: string, data: PhysicalCommit) {
  const existing = await sql.query<{ to_revision: number }>(
    `select to_revision from physical_deck_operations
      where user_id = $1 and session_id = $2 and operation_id = $3`,
    [userId, data.sessionId, data.operation.id],
  );
  if (existing.length) return { status: "saved" as const, revision: Number(existing[0]?.to_revision ?? data.snapshot.revision) };

  const rows = await sql.query<{ revision: number }>(
    `select revision from physical_deck_sessions
      where user_id = $1 and session_id = $2
      for update`,
    [userId, data.sessionId],
  );
  const current = rows[0] ? Number(rows[0].revision) : null;
  if (current != null && current !== data.expectedRevision) return { status: "conflict" as const, revision: current };
  if (current == null && data.expectedRevision !== 0) return { status: "conflict" as const, revision: 0 };

  if (current == null) {
    await sql.query(
      `update physical_deck_sessions set active = false, updated_at = now()
        where user_id = $1 and deck_id = $2 and active = true and session_id <> $3`,
      [userId, data.deckId, data.sessionId],
    );
    await sql.query(
      `insert into physical_deck_sessions
         (user_id, deck_id, session_id, revision, deck_fingerprint, snapshot_json, active)
       values ($1, $2, $3, $4, $5, $6::jsonb, true)`,
      [userId, data.deckId, data.sessionId, data.snapshot.revision, fingerprint(data.snapshot.inventory), JSON.stringify(data.snapshot)],
    );
  } else {
    const updated = await sql.query<{ revision: number }>(
      `update physical_deck_sessions
          set revision = $4, snapshot_json = $5::jsonb, deck_fingerprint = $6, updated_at = now()
        where user_id = $1 and session_id = $2 and revision = $3
        returning revision`,
      [userId, data.sessionId, data.expectedRevision, data.snapshot.revision, JSON.stringify(data.snapshot), fingerprint(data.snapshot.inventory)],
    );
    if (!updated.length) return { status: "conflict" as const, revision: current };
  }
  await sql.query(
    `insert into physical_deck_operations
       (user_id, session_id, operation_id, from_revision, to_revision, before_hash, after_hash, kind, operation_json)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      userId,
      data.sessionId,
      data.operation.id,
      data.operation.revisionFrom,
      data.operation.revisionTo,
      data.operation.beforeHash,
      data.operation.afterHash,
      data.operation.kind,
      JSON.stringify(data.operation),
    ],
  );
  return { status: "saved" as const, revision: data.snapshot.revision };
}
