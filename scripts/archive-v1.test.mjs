import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { exportVelomereArchive, importVelomereArchive, inspectArchive, sha256, STANDARD_EXPORT_LIMIT } from "../src/lib/encounters/archive.mjs";

function sqlOf(pg) {
  return {
    query: async (text, params = []) => {
      const result = await pg.query(text, params);
      return result.rows;
    },
  };
}

const MIGRATIONS = ["0002_cards.sql", "0003_decks.sql", "0005_owners.sql", "0008_encounters.sql", "0009_generation_events.sql", "0011_companion_art.sql", "0012_reader_preferences.sql"];

async function migrate(pg) {
  for (const name of MIGRATIONS) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
    await pg.exec(sql);
  }
}

function png(marker) {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(marker)]);
}

async function seed(sql) {
  const owner = "owner-a";
  const deck = await sql.query(`insert into decks (name, locked, active, user_id) values ('Shared deck', false, false, $1) returning id`, [owner]);
  const deckId = Number(deck[0].id);
  const other = await sql.query(`insert into decks (name, locked, active, user_id) values ('Second deck', false, false, $1) returning id`, [owner]);
  const otherId = Number(other[0].id);
  const geoA = png("geometry-a");
  const geoB = png("geometry-b");
  const geoC = png("geometry-c");
  const geoD = png("geometry-d");
  const geoE = png("geometry-e");
  const art1 = png("companion-one");
  const art2 = png("companion-two");
  const renders = [
    ["geo-a", "hash-a", "geometry", geoA, "veiled_luminescence"],
    ["geo-b", "hash-b", "geometry", geoB, "veiled_luminescence"],
    ["geo-c", "hash-c", "geometry", geoC, "veiled_luminescence"],
    ["geo-d", "hash-d", "geometry", geoD, "veiled_luminescence"],
    ["geo-e", "hash-e", "geometry", geoE, "veiled_luminescence"],
    ["art-1", "hash-c", "companion", art1, "living_matter"],
    ["art-2", "hash-c", "companion", art2, "forged_relief"],
  ];
  for (const [id, scene, role, bytes, style] of renders) {
    await sql.query(
      `insert into vel_art_renders
         (id, owner_id, scene_hash, style_id, style_version, backend_id, content_hash, quality_json, bytes, asset_role, mime)
       values ($1,$2,$3,$4,'v20.5','grok-imagine-image-2.0',$5,$6,$7,$8,'image/png')`,
      [id, owner, scene, style, sha256(bytes), JSON.stringify({ fidelity: { passed: true, staged: false }, artBriefVersion: "v20.4", interpretiveFreedom: role === "geometry" ? null : 50 }), bytes, role],
    );
  }
  const meaning = (name, upright) => JSON.stringify({ name, core: `${name} stands alone.`, upright, shadow: `${name} is misread when the record is enlarged.`, keywords: ["scope", "record"] });
  const geometry = (hash) => JSON.stringify({ hash, joins: hash === "hash-a" ? [] : [{ id: "join" }], roots: [{ id: "host" }, { id: "guest" }], outcome: "earned_confluence" });
  await sql.query(
    `insert into vel_encounter_cards
       (id, owner_id, session_id, kind, canon_hash, canonical_index, parent_ids_json, semantics_json, compound_json, outcome, evidence_json, scene_hash, scene_json, render_id, geometry_render_id, art_role, generation_event_id)
     values
       ('card-a',$1,'s1','canonical_draw','canon',1,'[]',$2,'{}','solo','[]','hash-a',$3,'geo-a','geo-a','geometry',null),
       ('card-b',$1,'s1','canonical_draw','canon',2,'[]',$4,'{}','solo','[]','hash-b',$10,'geo-b','geo-b','geometry',null),
       ('card-c',$1,'s1','emergent','canon',null,'["card-a","card-b"]',$5,'{}','earned_confluence','[]','hash-c',$6,'art-1','geo-c','companion','event-c'),
       ('card-d',$1,'s2','canonical_draw','canon',3,'[]',$7,'{}','solo','[]','hash-d',$11,'geo-d','geo-d','geometry',null),
       ('card-e',$1,'s2','emergent','canon',null,'["card-c","card-d"]',$8,'{}','earned_confluence','[]','hash-e',$9,'geo-e','geo-e','geometry','event-e')`,
    [
      owner,
      meaning("Card A", "A keeps its own claim. The upright is long enough to survive a restore without being shortened."),
      geometry("hash-a"),
      meaning("Card B", "B remains distinct from A."),
      meaning("Card C", "C is the narrow meeting of A and B. The meeting is specific, revisable, and smaller than either claim."),
      geometry("hash-c"),
      meaning("Card D", "D arrives later."),
      meaning("Card E", "E is C meeting D. The earlier meeting is not erased."),
      geometry("hash-e"),
      geometry("hash-b"),
      geometry("hash-d"),
    ],
  );
  await sql.query(
    `insert into vel_generation_events
       (event_id, owner_id, session_id, action, accepted_at_utc, time_zone, time_zone_source, local_date, affinity,
        seed_algorithm_version, seed_digest, engine_version, canonical_hash, request_idempotency_key,
        session_version_at_acceptance, request_payload_hash, result_ids_json, parents_json)
     values
       ('event-c',$1,'s1','encounter_commit','2026-11-14T10:00:00.000Z','Pacific/Honolulu','reader','2026-11-14',0,'v1','seed-c','velomere-encounter-v17.1','canon','idem-c',1,'payload-c','["card-c"]','["card-a","card-b"]'),
       ('event-e',$1,'s2','encounter_commit','2026-11-14T12:00:00.000Z','Pacific/Honolulu','reader','2026-11-14',0,'v1','seed-e','velomere-encounter-v17.1','canon','idem-e',2,'payload-e','["card-e"]','["card-c","card-d"]')`,
    [owner],
  );
  await sql.query(
    `insert into vel_encounter_commits
       (id, session_id, owner_id, left_parent_id, right_parent_id, child_id, outcome, commit_sha256, idempotency_key)
     values
       ('commit-c','s1',$1,'card-a','card-b','card-c','earned_confluence','sha-commit-c','idem-c'),
       ('commit-e','s2',$1,'card-c','card-d','card-e','earned_confluence','sha-commit-e','idem-e')`,
    [owner],
  );
  const personal = { name: "Kept Question", core: "The reader kept the narrow scope.", upright: "Personal upright stays personal.", shadow: "Personal shadow is not the generated shadow.", keywords: ["kept"] };
  await sql.query(
    `insert into vel_adopted_cards (id, owner_id, source_card_id, source_snapshot_json, personal_json, author_version, approval_json)
     values ('adopt-c',$1,'card-c',$2,$3,1,$4), ('adopt-e',$1,'card-e',$5,$6,1,$4)`,
    [owner, JSON.stringify({ meaning: { name: "Card C" }, sceneHash: "hash-c" }), JSON.stringify(personal), JSON.stringify({ at: "2026-11-14T18:00:00.000Z", explicitApproval: true, transcriptStored: false }), JSON.stringify({ meaning: { name: "Card E" }, sceneHash: "hash-e" }), JSON.stringify({ name: "Card E", core: "Generated default.", upright: "E upright.", shadow: "E shadow.", keywords: ["later"] })],
  );
  await sql.query(
    `insert into vel_encounter_collections (id, owner_id, name, landing_zone, style_preset, style_version, version, deck_id, description)
     values ('col-land',$1,'Landing Zone',1,'veiled_luminescence','18.1.0',3,$2,'The holding deck'),
            ('col-two',$1,'Second look',0,'living_matter','18.1.0',1,$3,'A second membership')`,
    [owner, deckId, otherId],
  );
  const reading = await sql.query(
    `insert into cards (name, suit, rank, keywords, upright, reversed, image_url, is_seed, sort_order, deck_id)
     values ('Kept Question','Encounter','Personal','kept','Personal upright stays personal.','Personal shadow is not the generated shadow.','/encounters/art/art-1',false,1,$1)
     returning id`,
    [deckId],
  );
  await sql.query(
    `insert into vel_collection_memberships
       (id, collection_id, adopted_card_id, owner_id, position, render_id, card_id, styled, style_locked, scene_hash, presentation_version, geometry_render_id, art_role)
     values
       ('mem-land','col-land','adopt-c',$1,1,'art-1',$2,1,1,'hash-c',2,'geo-c','companion'),
       ('mem-two','col-two','adopt-c',$1,1,'art-2',null,1,0,'hash-c',1,'geo-c','companion'),
       ('mem-e','col-land','adopt-e',$1,2,'geo-e',null,1,0,'hash-e',1,'geo-e','geometry')`,
    [owner, Number(reading[0].id)],
  );
  await sql.query(
    `insert into vel_reader_preferences (owner_id, default_style, interpretive_freedom) values ($1,'forged_relief',75)`,
    [owner],
  );
  await sql.query(
    `insert into vel_journal_drafts (id, owner_id, source_card_id, status, dialogue_json) values ('draft-open',$1,'card-c','DRAFT','[{"role":"user","content":"secret"}]')`,
    [owner],
  );
  const geoF = png("geometry-f");
  await sql.query(
    `insert into vel_art_renders
       (id, owner_id, scene_hash, style_id, style_version, backend_id, content_hash, quality_json, bytes, asset_role, mime)
     values ('geo-f',$1,'hash-f','veiled_luminescence','v20.5','grok-imagine-image-2.0',$2,$3,$4,'geometry','image/png')`,
    [owner, sha256(geoF), JSON.stringify({ fidelity: { passed: true, staged: false }, artBriefVersion: "v20.4" }), geoF],
  );
  await sql.query(
    `insert into vel_encounter_cards
       (id, owner_id, session_id, kind, canon_hash, canonical_index, parent_ids_json, semantics_json, compound_json, outcome, evidence_json, scene_hash, scene_json, render_id, geometry_render_id, art_role, generation_event_id)
     values ('card-f',$1,'s3','canonical_draw','canon',4,'[]',$2,'{}','solo','[]','hash-f',$3,'geo-f','geo-f','geometry',null)`,
    [owner, meaning("Card F", "F was kept even though it sits in no deck."), geometry("hash-f")],
  );
  return { owner, personal };
}

test("a Velomere archive restores lineage, bytes, and meanings without rewriting them", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await migrate(pg);
  const sql = sqlOf(pg);
  const seeded = await seed(sql);
  const journal = {
    readings: [{ id: "reading-1", cardName: "Kept Question", meaningSnapshot: "Personal upright stays personal.", pulledAt: "2026-11-14T20:00:00.000Z" }],
    dreams: [],
    rituals: [],
    labels: [],
    conversations: [{ id: "chat-1", turns: [{ role: "user", content: "do not take this by default" }] }],
  };
  const exported = await exportVelomereArchive(sql, seeded.owner, { scope: "complete", journal, includeConversations: false });
  assert.equal(exported.manifest.format, "velomere-archive-v1");
  assert.equal(exported.manifest.complete, true);
  assert.equal(exported.manifest.label, "Complete Velomere Archive");
  assert.ok(exported.manifest.exclusions.includes("solace-transcripts"));
  assert.ok(exported.manifest.exclusions.includes("saved-conversations"));
  assert.ok(exported.manifest.exclusions.includes("open-drafts"));
  assert.equal(exported.manifest.counts.cards, 6);
  assert.equal(exported.manifest.counts.commits, 2);
  const inspected = inspectArchive(exported.bytes);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.journals.conversations.length, 0);
  assert.equal(inspected.journals.readings[0].meaningSnapshot, "Personal upright stays personal.");
  const names = inspected.records.cards.map((card) => card.meaning.name).sort();
  assert.deepEqual(names, ["Card A", "Card B", "Card C", "Card D", "Card E", "Card F"]);
  const child = inspected.records.cards.find((card) => card.meaning.name === "Card E");
  assert.deepEqual(child.parentIds, ["card-c", "card-d"]);
  assert.equal(child.sessionId, "s2");
  assert.match(child.meaning.upright, /earlier meeting is not erased/);
  const orphan = inspected.records.cards.find((card) => card.meaning.name === "Card F");
  assert.equal(orphan.sessionId, "s3");
  assert.equal(inspected.records.drafts.length, 0);

  await sql.query(`insert into vel_encounter_collections (id, owner_id, name, landing_zone, style_preset, style_version, deck_id) values ('decoy','owner-b','Keep me',1,'veiled_luminescence','18.1.0',null)`);
  const opened = unzipSync(new Uint8Array(exported.bytes));
  const picture = Object.keys(opened).find((name) => name.endsWith(".png"));
  opened[picture][0] ^= 0xff;
  const broken = Buffer.from(zipSync(opened));
  await assert.rejects(importVelomereArchive(sql, "owner-b", broken), /integrity/);
  const decoy = await sql.query(`select name from vel_encounter_collections where owner_id = 'owner-b'`);
  assert.deepEqual(decoy.map((row) => row.name), ["Keep me"]);

  const restored = await importVelomereArchive(sql, "owner-b", exported.bytes, { mode: "restore", applyPreferences: false });
  assert.equal(restored.preferencesApplied, false);
  assert.equal(restored.created.cards, 6);
  const prefs = await sql.query(`select owner_id from vel_reader_preferences where owner_id = 'owner-b'`);
  assert.equal(prefs.length, 0);
  const cards = await sql.query(`select id, semantics_json, parent_ids_json, scene_hash, geometry_render_id from vel_encounter_cards where owner_id = 'owner-b'`);
  assert.equal(cards.length, 6);
  const byHash = new Map(cards.map((row) => [row.scene_hash, row]));
  const restoredE = byHash.get("hash-e");
  const restoredC = byHash.get("hash-c");
  const parents = JSON.parse(restoredE.parent_ids_json);
  assert.equal(parents.includes(restoredC.id), true);
  assert.match(JSON.parse(restoredC.semantics_json).upright, /specific, revisable, and smaller/);
  const commits = await sql.query(`select left_parent_id, right_parent_id, child_id, commit_sha256 from vel_encounter_commits where owner_id = 'owner-b' order by commit_sha256`);
  assert.equal(commits.length, 2);
  assert.equal(commits.find((row) => row.commit_sha256 === "sha-commit-e").child_id, restoredE.id);
  assert.equal(commits.find((row) => row.commit_sha256 === "sha-commit-e").left_parent_id, restoredC.id);
  const events = await sql.query(`select session_id, parents_json, result_ids_json from vel_generation_events where owner_id = 'owner-b'`);
  assert.equal(events.length, 2);
  const eventE = events.find((row) => JSON.parse(row.result_ids_json).includes(restoredE.id));
  assert.equal(eventE.session_id, "s2");
  assert.deepEqual(JSON.parse(eventE.parents_json), [restoredC.id, (await sql.query(`select id from vel_encounter_cards where owner_id = 'owner-b' and scene_hash = 'hash-d'`))[0].id]);
  assert.equal(JSON.parse(eventE.parents_json).includes("card-c"), false);
  const renders = await sql.query(`select content_hash, bytes, asset_role from vel_art_renders where owner_id = 'owner-b'`);
  assert.equal(renders.length, 8);
  const hashes = renders.map((row) => row.content_hash).sort();
  assert.deepEqual(hashes, [sha256(png("companion-one")), sha256(png("companion-two")), sha256(png("geometry-a")), sha256(png("geometry-b")), sha256(png("geometry-c")), sha256(png("geometry-d")), sha256(png("geometry-e")), sha256(png("geometry-f"))].sort());
  for (const render of renders) assert.equal(sha256(render.bytes), render.content_hash);
  const memberships = await sql.query(`select adopted_card_id, style_locked, art_role, render_id from vel_collection_memberships where owner_id = 'owner-b'`);
  assert.equal(memberships.length, 3);
  const locked = memberships.find((row) => Number(row.style_locked) === 1);
  const lockedRender = await sql.query(`select content_hash from vel_art_renders where id = $1`, [locked.render_id]);
  assert.equal(lockedRender[0].content_hash, sha256(png("companion-one")));
  const otherArt = memberships.find((row) => Number(row.style_locked) === 0 && row.art_role === "companion");
  const otherRender = await sql.query(`select content_hash from vel_art_renders where id = $1`, [otherArt.render_id]);
  assert.equal(otherRender[0].content_hash, sha256(png("companion-two")));
  assert.equal(locked.adopted_card_id, otherArt.adopted_card_id);
  const personal = await sql.query(`select personal_json from vel_adopted_cards where owner_id = 'owner-b'`);
  assert.ok(personal.some((row) => JSON.parse(row.personal_json).name === "Kept Question"));
  assert.equal(JSON.parse(personal.find((row) => JSON.parse(row.personal_json).name === "Kept Question").personal_json).upright, seeded.personal.upright);
  const again = await importVelomereArchive(sql, "owner-b", exported.bytes, { mode: "restore" });
  assert.equal(again.created.cards, 0);
  assert.equal(again.created.memberships, 0);
  const after = await sql.query(`select count(*)::int as n from vel_encounter_cards where owner_id = 'owner-b'`);
  assert.equal(Number(after[0].n), 6);
  const still = await sql.query(`select name from vel_encounter_collections where owner_id = 'owner-b' and id = 'decoy'`);
  assert.equal(still[0].name, "Keep me");
  const deckOnly = await exportVelomereArchive(sql, seeded.owner, { scope: "deck", collectionId: "col-two" });
  assert.equal(deckOnly.manifest.scope, "deck");
  assert.equal(deckOnly.manifest.counts.memberships, 1);
  assert.equal(deckOnly.manifest.counts.commits, 1);
  const deckNames = inspectArchive(deckOnly.bytes).records.cards.map((card) => card.meaning.name).sort();
  assert.deepEqual(deckNames, ["Card A", "Card B", "Card C"]);
  const landing = inspectArchive((await exportVelomereArchive(sql, seeded.owner, { scope: "deck", collectionId: "col-land" })).bytes);
  assert.deepEqual(landing.records.cards.map((card) => card.meaning.name).sort(), ["Card A", "Card B", "Card C", "Card D", "Card E"]);
  assert.equal(landing.records.commits.length, 2);
  let refused = false;
  try {
    inspectArchive(Buffer.from(zipSync({ "cards.csv": strToU8("name,suit\nOne,hearings\n") })));
  } catch (err) {
    refused = /not a Velomere Archive/.test(err instanceof Error ? err.message : String(err));
  }
  assert.equal(refused, true);
  assert.match(STANDARD_EXPORT_LIMIT, /not a complete backup/);
  await sql.query(
    `update vel_adopted_cards set personal_json = $1, approval_json = $2
      where owner_id = 'owner-b' and personal_json like '%Kept Question%'`,
    [JSON.stringify({ name: "Kept Question", upright: "NEWER" }), JSON.stringify({ at: "2099-01-01T00:00:00.000Z", explicitApproval: true })],
  );
  await importVelomereArchive(sql, "owner-b", exported.bytes, { mode: "merge" });
  const kept = await sql.query(`select personal_json from vel_adopted_cards where owner_id = 'owner-b'`);
  assert.equal(JSON.parse(kept.find((row) => JSON.parse(row.personal_json).name === "Kept Question").personal_json).upright, "NEWER");
});

test("saved drafts stay drafts and transcripts stay out unless asked", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await migrate(pg);
  const sql = sqlOf(pg);
  const seeded = await seed(sql);
  const quiet = await exportVelomereArchive(sql, seeded.owner, { scope: "complete", includeDrafts: true, includeConversations: false });
  const quietDraft = inspectArchive(quiet.bytes).records.drafts[0];
  assert.equal(quietDraft.draft, true);
  assert.equal(quietDraft.status, "DRAFT");
  assert.deepEqual(quietDraft.dialogue, []);
  assert.ok(quiet.manifest.exclusions.includes("draft-transcripts"));
  assert.equal(quiet.manifest.exclusions.includes("open-drafts"), false);
  const spoken = await exportVelomereArchive(sql, seeded.owner, { scope: "complete", includeDrafts: true, includeConversations: true });
  assert.equal(inspectArchive(spoken.bytes).records.drafts[0].dialogue[0].content, "secret");
  const without = await importVelomereArchive(sql, "owner-b", quiet.bytes, { mode: "restore", applyDrafts: false });
  assert.equal(without.created.drafts, 0);
  const withDrafts = await importVelomereArchive(sql, "owner-c", quiet.bytes, { mode: "restore", applyDrafts: true });
  assert.equal(withDrafts.created.drafts, 1);
  assert.equal(withDrafts.created.cards, 6);
  const drafts = await sql.query(`select status, dialogue_json from vel_journal_drafts where owner_id = 'owner-c'`);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].status, "DRAFT");
  assert.equal(drafts[0].dialogue_json, "[]");
  const encounters = await sql.query(`select count(*)::int as n from vel_encounter_commits where owner_id = 'owner-c'`);
  assert.equal(Number(encounters[0].n), 2);
});

test("a failed import does not keep a partial restore", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await migrate(pg);
  const sql = sqlOf(pg);
  const seeded = await seed(sql);
  const exported = await exportVelomereArchive(sql, seeded.owner, { scope: "complete" });
  await assert.rejects(
    pg.transaction(async (tx) => {
      let cards = 0;
      const guarded = {
        query: async (text, params = []) => {
          if (/insert into vel_encounter_cards/i.test(text) && ++cards === 3) throw new Error("boom");
          const result = await tx.query(text, params);
          return result.rows;
        },
      };
      await importVelomereArchive(guarded, "owner-b", exported.bytes, { mode: "restore" });
    }),
    /boom/,
  );
  const cards = await sql.query(`select count(*)::int as n from vel_encounter_cards where owner_id = 'owner-b'`);
  const renders = await sql.query(`select count(*)::int as n from vel_art_renders where owner_id = 'owner-b'`);
  assert.equal(Number(cards[0].n), 0);
  assert.equal(Number(renders[0].n), 0);
});

