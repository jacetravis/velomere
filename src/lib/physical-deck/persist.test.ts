import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyPhysicalCommit } from "./commit.ts";
import { cut, newState, type PhysicalState } from "./state.ts";

function adapter(pg: PGlite) {
  return {
    query: async <T>(text: string, params: unknown[] = []) => {
      const result = await pg.query<T>(text, params);
      return result.rows;
    },
  };
}

function commitOf(snapshot: PhysicalState) {
  const operation = snapshot.operations.at(-1);
  if (!operation) throw new Error("missing operation");
  return {
    deckId: snapshot.deckId,
    sessionId: snapshot.sessionId,
    expectedRevision: operation.revisionFrom,
    snapshot,
    operation,
  };
}

test("physical commits are owner scoped, idempotent, and reject a stale revision", async () => {
  const pg = new PGlite();
  await pg.exec(readFileSync(new URL("../../../migrations/0013_physical_deck.sql", import.meta.url), "utf8"));
  const sql = adapter(pg);
  const first = cut(newState(8, "session-a", [10, 20, 30, 40]), "cut-a", 2);
  const saved = await applyPhysicalCommit(sql, "user-a", commitOf(first));
  assert.equal(saved.status, "saved");
  assert.equal(saved.revision, 1);
  const repeat = await applyPhysicalCommit(sql, "user-a", commitOf(first));
  assert.equal(repeat.status, "saved");
  const rows = await sql.query<{ revision: number }>("select revision from physical_deck_sessions where user_id = $1", ["user-a"]);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0]?.revision), 1);

  const stale = cut(first, "cut-b", 1);
  const conflict = await applyPhysicalCommit(sql, "user-a", { ...commitOf(stale), expectedRevision: 0 });
  assert.equal(conflict.status, "conflict");

  const secondUser = cut(newState(8, "session-b", [10, 20, 30, 40]), "cut-b2", 1);
  await applyPhysicalCommit(sql, "user-b", commitOf(secondUser));
  const visible = await sql.query<{ user_id: string }>(
    "select user_id from physical_deck_sessions where user_id = $1 and deck_id = $2 and active = true",
    ["user-a", 8],
  );
  assert.deepEqual(visible.map((row) => row.user_id), ["user-a"]);
  await pg.close();
});
