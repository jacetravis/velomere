import {
  checkpoint,
  fingerprint,
  newState,
  replayOperation,
  sampleHash,
  verify,
  type Operation,
  type PhysicalState,
} from "./state";

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

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function sameOperation(left: Operation, right: Operation) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function canonicalMeta(meta: Operation["meta"]): Operation["meta"] {
  const next: Operation["meta"] = { ...meta };
  if (next.side !== 180) delete next.side;
  return next;
}

/** Same transition, treating an omitted side as upright. Duplicate rows still use exact payload equality. */
export function equivalentOperation(left: Operation, right: Operation) {
  if (left.id !== right.id || left.kind !== right.kind) return false;
  if (left.revisionFrom !== right.revisionFrom || left.revisionTo !== right.revisionTo) return false;
  if (left.beforeHash !== right.beforeHash || left.afterHash !== right.afterHash) return false;
  return JSON.stringify(stable(canonicalMeta(left.meta))) === JSON.stringify(stable(canonicalMeta(right.meta)));
}

/** Why a commit is not a legal next step, or null when it is. */
export function explainPhysicalCommit(previous: PhysicalState | null, data: PhysicalCommit): string | null {
  try {
    verify(data.snapshot);
  } catch (err) {
    return err instanceof Error ? err.message : "The deck checkpoint is not valid.";
  }
  if (data.snapshot.deckId !== data.deckId || data.snapshot.sessionId !== data.sessionId) {
    return "The deck update does not match its session.";
  }
  if (data.operation.revisionFrom !== data.expectedRevision) return "The deck revision does not match.";
  if (data.operation.revisionTo !== data.operation.revisionFrom + 1) return "The revision skipped ahead.";
  if (data.snapshot.revision !== data.operation.revisionTo) return "The checkpoint revision does not match the operation.";
  if (data.snapshot.operations.at(-1)?.id !== data.operation.id) return "The deck update is missing its operation.";
  if (previous && previous.revision !== data.expectedRevision) return "The stored deck is at a different revision.";
  if (!previous && data.expectedRevision !== 0) return "The first operation must start at revision 0.";

  const baseline = previous ?? newState(data.deckId, data.sessionId, [...data.snapshot.inventory].sort((a, b) => a - b));
  if (sampleHash(baseline) !== data.operation.beforeHash) return "The previous deck does not match this operation.";
  let replayed: PhysicalState;
  try {
    replayed = replayOperation(baseline, data.operation);
  } catch (err) {
    return err instanceof Error ? err.message : "That transition is not possible.";
  }
  const produced = replayed.operations.at(-1);
  if (!produced || !equivalentOperation(produced, data.operation)) return "The operation does not match the deck transition.";
  if (data.operation.kind === "legacy_shuffle_realized" && data.operation.meta.attribution !== produced.meta.attribution) {
    return "The legacy shuffle attribution was changed.";
  }
  if (sampleHash(replayed) !== data.operation.afterHash || sampleHash(replayed) !== sampleHash(data.snapshot)) {
    return "The next deck does not match this operation.";
  }
  return null;
}

function parseOperation(value: Operation | string): Operation {
  return typeof value === "string" ? JSON.parse(value) as Operation : value;
}

function parseState(value: PhysicalState | string): PhysicalState {
  return typeof value === "string" ? JSON.parse(value) as PhysicalState : value;
}

function conflict(revision: number, reason: string) {
  return { status: "conflict" as const, revision, reason };
}

export async function applyPhysicalCommit(sql: Queryable, userId: string, data: PhysicalCommit) {
  const existing = await sql.query<{ to_revision: number; operation_json: Operation | string }>(
    `select to_revision, operation_json from physical_deck_operations
      where user_id = $1 and session_id = $2 and operation_id = $3`,
    [userId, data.sessionId, data.operation.id],
  );
  if (existing.length) {
    const stored = parseOperation(existing[0]!.operation_json);
    const revision = Number(existing[0]?.to_revision ?? data.snapshot.revision);
    if (!sameOperation(stored, data.operation)) return conflict(revision, "This operation was already saved with a different payload.");
    return { status: "saved" as const, revision };
  }

  const rows = await sql.query<{ revision: number; snapshot_json: PhysicalState | string }>(
    `select revision, snapshot_json from physical_deck_sessions
      where user_id = $1 and session_id = $2
      for update`,
    [userId, data.sessionId],
  );
  const row = rows[0];
  const current = row ? Number(row.revision) : null;
  if (current != null && current !== data.expectedRevision) return conflict(current, "The stored deck is at a different revision.");
  if (current == null && data.expectedRevision !== 0) return conflict(0, "The first operation must start at revision 0.");

  let previous: PhysicalState | null = null;
  if (row) {
    try {
      previous = parseState(row.snapshot_json);
      verify(previous);
    } catch {
      return conflict(current ?? 0, "The stored deck checkpoint is not valid.");
    }
  }
  const reason = explainPhysicalCommit(previous, data);
  if (reason) return conflict(current ?? 0, reason);

  const saved = checkpoint({ ...data.snapshot, operations: [data.operation] });
  const hash = sampleHash(saved);
  if (current == null) {
    await sql.query(
      `update physical_deck_sessions set active = false, updated_at = now()
        where user_id = $1 and deck_id = $2 and active = true and session_id <> $3`,
      [userId, data.deckId, data.sessionId],
    );
    await sql.query(
      `insert into physical_deck_sessions
         (user_id, deck_id, session_id, revision, deck_fingerprint, snapshot_json, checkpoint_hash, active)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, true)`,
      [userId, data.deckId, data.sessionId, saved.revision, fingerprint(saved.inventory), JSON.stringify(saved), hash],
    );
  } else {
    const updated = await sql.query<{ revision: number }>(
      `update physical_deck_sessions
          set revision = $4, snapshot_json = $5::jsonb, deck_fingerprint = $6, checkpoint_hash = $7, updated_at = now()
        where user_id = $1 and session_id = $2 and revision = $3
        returning revision`,
      [userId, data.sessionId, data.expectedRevision, saved.revision, JSON.stringify(saved), fingerprint(saved.inventory), hash],
    );
    if (!updated.length) return conflict(current, "The stored deck is at a different revision.");
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
  return { status: "saved" as const, revision: saved.revision };
}
