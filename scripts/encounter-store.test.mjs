import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import {
  approveDraft,
  beginDraft,
  cancelStyle,
  commitPair,
  createCollection,
  listCollections,
  openSession,
  paintReservedPair,
  previewStyle,
  publishStyle,
  pullPair,
  readArtPreferences,
  readSession,
  reserveInitialCut,
  revealPair,
  saveArtPreferences,
  setCompanionDriver,
  setLock,
} from "../src/lib/encounters/store.mjs";
import { CANON_HASH } from "../src/lib/encounters/event-time.mjs";

function sqlOf(pg) {
  return {
    query: async (text, params = []) => {
      const result = await pg.query(text, params);
      return result.rows;
    },
  };
}

function companionOf(tag) {
  return async ({ geometryPng }) => {
    const source = createHash("sha256").update(geometryPng).digest("hex");
    const png = Buffer.from(`companion-${tag}-${source.slice(0, 12)}`);
    return {
      png,
      sha256: createHash("sha256").update(png).digest("hex"),
      provider: "xai",
      model: "grok-imagine-image-2.0",
      promptVersion: "v19",
      requestId: `test-${tag}`,
      sourcePngSha256: source,
      transmitted: true,
      inputType: "image_url",
      width: 1400,
      height: 2300,
      mime: "image/png",
    };
  };
}

const MIGRATIONS = ["0002_cards.sql", "0003_decks.sql", "0005_owners.sql", "0008_encounters.sql", "0009_generation_events.sql", "0010_cut_reservation.sql", "0011_companion_art.sql"];

async function migrate(pg) {
  for (const name of MIGRATIONS) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
    await pg.exec(sql);
  }
}

test("encounter commit is once, adoption needs approval, style cancel keeps the picture", async () => {
  setCompanionDriver(companionOf("keep"));
  const pg = new PGlite();
  await pg.waitReady;
  await migrate(pg);
  const db = sqlOf(pg);
  const owner = "user-a";
  const other = "user-b";
  const session = await openSession(db, owner, { date: "2026-11-14", affinity: 0 });
  assert.equal(session.status, "EMPTY");
  const pair = await pullPair(db, owner, {
    sessionId: session.id,
    expectedVersion: 0,
    idempotencyKey: "pull-1",
    acceptedAtUtc: "2026-11-15T09:59:00.000Z",
    timeZone: "Pacific/Honolulu",
  });
  assert.equal(pair.active.length, 2);
  assert.notEqual(pair.active[0].id, pair.active[1].id);
  assert.equal(pair.active[0].artLabel, "Geometric Base");
  const events = await db.query(
    "select local_date, affinity, seed_digest from vel_generation_events where session_id = $1",
    [session.id],
  );
  assert.equal(events[0].local_date, "2026-11-14");
  assert.equal(Number(events[0].affinity), 0);
  const kept = await db.query("select recipe_date, affinity from vel_encounter_sessions where id = $1", [session.id]);
  assert.equal(kept[0].recipe_date, "2026-11-14");
  assert.equal(Number(kept[0].affinity), 0);
  const compounds = await db.query("select compound_json from vel_encounter_cards where session_id = $1", [session.id]);
  for (const row of compounds) {
    const compound = JSON.parse(row.compound_json);
    assert.equal(compound.recipeDate, "2026-11-14");
    assert.equal(compound.affinity, 0);
    assert.equal(compound.seedDigest, events[0].seed_digest);
  }
  const again = await pullPair(db, owner, { sessionId: session.id, expectedVersion: 0, idempotencyKey: "pull-1" });
  assert.equal(again.active[0].id, pair.active[0].id);
  await assert.rejects(
    () => commitPair(db, other, { sessionId: session.id, expectedVersion: pair.version, idempotencyKey: "commit-1" }),
    /not yours/,
  );
  const committed = await commitPair(db, owner, { sessionId: session.id, expectedVersion: pair.version, idempotencyKey: "commit-1" });
  assert.equal(committed.alreadyCommitted, false);
  assert.equal(committed.active.length, 1);
  assert.equal(committed.active[0].kind, "emergent");
  const repeat = await commitPair(db, owner, { sessionId: session.id, expectedVersion: committed.version, idempotencyKey: "commit-1" });
  assert.equal(repeat.alreadyCommitted, true);
  assert.equal(repeat.active[0].id, committed.active[0].id);
  const rows = await db.query("select count(*)::int as n from vel_encounter_commits where session_id = $1", [session.id]);
  assert.equal(Number(rows[0].n), 1);
  const draft = await beginDraft(db, owner, committed.active[0].id);
  await assert.rejects(
    () => approveDraft(db, owner, { draftId: draft.id, personal: { name: "Mine", core: "Core", upright: "Up", shadow: "Sh", keywords: ["one"] }, explicitApproval: false }),
    /Approve/,
  );
  const collectionsBefore = await db.query("select count(*)::int as n from vel_collection_memberships");
  assert.equal(Number(collectionsBefore[0].n), 0);
  const saved = await approveDraft(db, owner, {
    draftId: draft.id,
    personal: { name: "Mine", core: "A core I wrote", upright: "I look toward it", shadow: "I look away", keywords: ["mine"] },
    explicitApproval: true,
    reviewed: true,
  });
  assert.equal(saved.collectionName, "Landing Zone");
  const listed = await listCollections(db, owner);
  assert.equal(listed[0].landing, true);
  assert.equal(listed[0].cards, 1);
  const named = await createCollection(db, owner, "Night work");
  await assert.rejects(
    () => previewStyle(db, owner, { collectionId: saved.collectionId, scope: "unlocked_only", presetId: "forged_relief", idempotencyKey: "style-1", confirmUnlockAll: false }),
    /No unlocked/,
  );
  const detail = await db.query("select id, render_id, scene_hash from vel_collection_memberships where collection_id = $1", [saved.collectionId]);
  const before = detail[0].render_id;
  await setLock(db, owner, { membershipId: detail[0].id, locked: false });
  const preview = await previewStyle(db, owner, {
    collectionId: saved.collectionId,
    scope: "unlocked_only",
    presetId: "forged_relief",
    idempotencyKey: "style-2",
    confirmUnlockAll: false,
  });
  assert.equal(preview.candidates.length, 1);
  assert.notEqual(preview.candidates[0].renderId, before);
  assert.equal(preview.candidates[0].promptVersion, "v19");
  assert.equal(preview.candidates[0].interpretiveFreedom, 50);
  assert.equal(preview.candidates[0].freedomSource, "system-default");
  assert.equal(preview.candidates[0].provider, "xai");
  assert.equal(preview.candidates[0].sceneHash, detail[0].scene_hash);
  assert.notEqual(preview.candidates[0].geometryRenderId, preview.candidates[0].renderId);
  await cancelStyle(db, owner, preview.jobId);
  const after = await db.query("select render_id, style_locked, art_role from vel_collection_memberships where id = $1", [detail[0].id]);
  assert.equal(after[0].render_id, before);
  assert.equal(Number(after[0].style_locked), 0);
  assert.notEqual(after[0].art_role, "companion");
  setCompanionDriver(async () => {
    throw new Error("Image generation unavailable — down");
  });
  await assert.rejects(
    () => previewStyle(db, owner, { collectionId: saved.collectionId, scope: "unlocked_only", presetId: "veiled_luminescence", idempotencyKey: "style-3", confirmUnlockAll: false }),
    /Image generation unavailable/,
  );
  const failed = await db.query("select render_id, style_locked from vel_collection_memberships where id = $1", [detail[0].id]);
  assert.equal(failed[0].render_id, before);
  assert.equal(Number(failed[0].style_locked), 0);
  setCompanionDriver(companionOf("save"));
  const staged = await previewStyle(db, owner, {
    collectionId: saved.collectionId,
    scope: "unlocked_only",
    presetId: "veiled_luminescence",
    idempotencyKey: "style-4",
    confirmUnlockAll: false,
  });
  await publishStyle(db, owner, { jobId: staged.jobId, approved: true });
  const published = await db.query("select render_id, art_role, geometry_render_id, style_locked from vel_collection_memberships where id = $1", [detail[0].id]);
  assert.equal(published[0].render_id, staged.candidates[0].renderId);
  assert.equal(published[0].art_role, "companion");
  assert.equal(published[0].geometry_render_id, staged.candidates[0].geometryRenderId);
  assert.notEqual(published[0].render_id, published[0].geometry_render_id);
  assert.equal(Number(published[0].style_locked), 1);
  const beforeMeta = await db.query("select quality_json from vel_art_renders where id = $1", [staged.candidates[0].renderId]);
  const savedPrefs = await saveArtPreferences(db, owner, { style: "cyber_matrix", freedom: 100 });
  assert.equal(savedPrefs.freedom, 100);
  assert.equal(savedPrefs.style, "cyber_matrix");
  assert.equal((await readArtPreferences(db, owner)).saved, true);
  const afterMeta = await db.query("select quality_json from vel_art_renders where id = $1", [staged.candidates[0].renderId]);
  assert.equal(afterMeta[0].quality_json, beforeMeta[0].quality_json);
  assert.equal(published[0].render_id, staged.candidates[0].renderId);
  await setLock(db, owner, { membershipId: detail[0].id, locked: false });
  setCompanionDriver(companionOf("after-pref"));
  const inherited = await previewStyle(db, owner, {
    collectionId: saved.collectionId,
    scope: "unlocked_only",
    presetId: "forged_relief",
    styleTouched: false,
    interpretiveFreedom: 0,
    freedomTouched: false,
    idempotencyKey: "style-5",
    confirmUnlockAll: false,
  });
  const inheritedRender = await db.query("select style_id, quality_json from vel_art_renders where id = $1", [inherited.candidates[0].renderId]);
  assert.equal(inheritedRender[0].style_id, "veiled_luminescence");
  const inheritedMeta = JSON.parse(inheritedRender[0].quality_json).companion;
  assert.equal(inheritedMeta.interpretiveFreedom, 100);
  assert.equal(inheritedMeta.freedomSource, "user-default");
  assert.equal(inheritedMeta.styleSource, "deck");
  assert.equal(afterMeta[0].quality_json, beforeMeta[0].quality_json);
  const otherDeck = await db.query("select count(*)::int as n from vel_collection_memberships where collection_id = $1", [named.id]);
  assert.equal(Number(otherDeck[0].n), 0);
  await assert.rejects(
    () => previewStyle(db, owner, { collectionId: named.id, scope: "unlock_all", presetId: "a custom prompt", idempotencyKey: "bad", confirmUnlockAll: true }),
    /four|Custom|no cards/i,
  );
  await pg.close();
});

test("a settled cut keeps the true top and bottom, and hides them until both are revealed", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await migrate(pg);
  const db = sqlOf(pg);
  const owner = "user-cut";
  const session = await openSession(db, owner, { date: "2020-01-01", affinity: 3 });
  const order = Array.from({ length: 78 }, (_, index) => 77 - index);
  const clock = {
    acceptedAtUtc: "2026-11-15T09:59:00.000Z",
    timeZone: "Pacific/Honolulu",
    tzSource: "device",
  };
  await assert.rejects(
    () => reserveInitialCut(db, owner, { sessionId: session.id, order: order.slice(0, 77), hand: "LEFT", shuffleCount: 1, idempotencyKey: "cut-bad", ...clock }),
    /whole deck/,
  );
  const reserved = await reserveInitialCut(db, owner, { sessionId: session.id, order, hand: "LEFT", shuffleCount: 2, idempotencyKey: "cut-1", ...clock });
  assert.equal(reserved.remaining, 76);
  assert.equal(reserved.reused, false);
  const again = await reserveInitialCut(db, owner, {
    sessionId: session.id,
    order,
    hand: "RIGHT",
    shuffleCount: 9,
    idempotencyKey: "cut-1",
    acceptedAtUtc: "2026-11-15T10:00:02.000Z",
    timeZone: "Pacific/Honolulu",
    tzSource: "device",
  });
  assert.equal(again.reused, true);
  const pendingRows = await db.query("select pending_json, draw_pool_json, status, pair_revealed from vel_encounter_sessions where id = $1", [session.id]);
  const pending = JSON.parse(pendingRows[0].pending_json);
  assert.equal(pending.kind, "pair");
  assert.equal(pending.above, 77);
  assert.equal(pending.below, 0);
  assert.equal(pending.hand, "LEFT");
  assert.equal(pending.localDate, "2026-11-14");
  assert.equal(pending.cutContract, "as-above-so-below/17.3");
  assert.equal(pending.orderHash, createHash("sha256").update(order.join("\0")).digest("hex"));
  assert.equal(JSON.parse(pendingRows[0].draw_pool_json).length, 76);
  assert.equal(Number(pendingRows[0].pair_revealed), 0);
  const painted = await paintReservedPair(db, owner, { sessionId: session.id });
  assert.equal(painted.revealed, false);
  assert.equal(painted.left.face, "BACK");
  assert.equal(painted.right.face, "BACK");
  assert.equal(painted.left.side, "ABOVE");
  assert.equal(painted.right.side, "BELOW");
  const hidden = await readSession(db, owner, session.id);
  assert.equal(hidden.revealed, false);
  assert.equal(hidden.active[0].face, "BACK");
  assert.equal(hidden.active[1].face, "BACK");
  assert.equal(hidden.active[0].name, undefined);
  const shown = await revealPair(db, owner, session.id);
  assert.equal(shown.revealed, true);
  assert.ok(shown.active[0].name);
  assert.ok(shown.active[1].name);
  assert.notEqual(shown.active[0].face, "BACK");
  const cards = await db.query("select canonical_index from vel_encounter_cards where session_id = $1 order by created_at asc", [session.id]);
  assert.equal(Number(cards[0].canonical_index), 77);
  assert.equal(Number(cards[1].canonical_index), 0);
  await pg.close();
});
