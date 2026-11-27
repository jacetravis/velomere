// @ts-nocheck
// Velomere Archive v1. A restoration, not a new Encounter.
// CSV and the older deck zip stay separate. This file does not regenerate meanings or pictures.
//
// Layout (Velomere Archive v1, schema v20.5):
//   manifest.json
//   README.txt
//   checksums/assets.json          SHA-256 of every other archived file; manifest.checksumsSha256 covers this list
//   records/cards.json             encounter cards, meanings, parent ids, session, geometry
//   records/commits.json           parent → result edges (left / right roles)
//   records/events.json            dated generation events, seeds, timezones
//   records/adopted.json           reader-authored interpretations
//   records/collections.json       encounter decks, including the Landing Zone
//   records/memberships.json       deck membership, order, lock, deck-local artwork
//   records/decks.json             reading-table decks linked from those collections
//   records/reading-cards.json     table cards from adopted interpretations, including picture placement
//   records/renders.json           image metadata (bytes live under artwork/)
//   records/preferences.json       optional art defaults, reversals, shuffle lock, and both hands
//   records/drafts.json            optional saved drafts, never treated as encounters
//   journals/selected.json         optional journals; conversations only when chosen
//   artwork/geometry|companions|legacy/<id>.<ext>
// Structured JSON is canonicalized by sorting object keys before hashing.
// Import remaps ids and stores source id → local id in vel_archive_imports.
// Historical meaning text is copied, not rewritten. Embedded parent names stay names.
import { createHash, randomBytes } from "node:crypto";
import { strToU8, unzipSync, zipSync } from "fflate";
import { CANON_HASH } from "./event-time.mjs";
import { ensureArtSchema } from "./store.mjs";
import { STANDARD_EXPORT_LIMIT } from "./archive-shared.mjs";

export const ARCHIVE_FORMAT = "velomere-archive-v1";
export const ARCHIVE_SCHEMA = "v20.5";
export { STANDARD_EXPORT_LIMIT };

const MAX_ZIP = 48_000_000;
const MAX_UNPACKED = 80_000_000;
const MAX_FILES = 4000;

const EXCLUSIONS = [
  "solace-transcripts",
  "solace-server-configuration",
  "api-keys",
  "open-drafts",
  "unsaved-style-jobs",
  "live-table-session",
];

const CARD_COLUMNS = `id, session_id, kind, canon_hash, canonical_index, parent_ids_json, semantics_json, compound_json, outcome,
              evidence_json, scene_hash, scene_json, render_id, geometry_render_id, art_role, generation_event_id, created_at`;

export function sha256(value) {
  const data = typeof value === "string" ? Buffer.from(value) : value;
  return createHash("sha256").update(data).digest("hex");
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object" && !(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value ?? null;
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  return JSON.parse(value);
}

function iso(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
}

function bytesOf(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "base64");
  return Buffer.from(value);
}

function imageKind(name, bytes) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".svg")) {
    const text = bytes.toString("utf8");
    if (/<script/i.test(text)) return null;
    if (!/^(\s|<\?xml|<svg)/i.test(text)) return null;
    return "image/svg+xml";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

function safeName(name) {
  const text = String(name || "");
  if (!text || text.length > 180 || text.includes("\0") || text.includes("\\") || text.startsWith("/") || text.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error("The archive contains an unsafe path. Nothing was imported.");
  }
  return text;
}

export function packArchive(files) {
  const input = {};
  let total = 0;
  for (const [name, data] of Object.entries(files)) {
    const safe = safeName(name);
    const bytes = typeof data === "string" ? strToU8(data) : data;
    total += bytes.length;
    if (total > MAX_UNPACKED) throw new Error("The archive is larger than the restoration limit.");
    input[safe] = bytes;
  }
  return Buffer.from(zipSync(input, { level: 6 }));
}

export function unpackArchive(data) {
  const zipped = bytesOf(data);
  if (!zipped || zipped.length < 4 || zipped.length > MAX_ZIP) throw new Error("That file is not a readable Velomere Archive.");
  let files;
  try {
    files = unzipSync(new Uint8Array(zipped));
  } catch {
    throw new Error("That file is not a readable Velomere Archive.");
  }
  const names = Object.keys(files);
  if (names.length > MAX_FILES) throw new Error("That archive has too many files. Nothing was imported.");
  let total = 0;
  const out = {};
  for (const name of names) {
    const safe = safeName(name);
    const bytes = Buffer.from(files[name]);
    total += bytes.length;
    if (total > MAX_UNPACKED) throw new Error("That archive unpacked too large. Nothing was imported.");
    out[safe] = bytes;
  }
  return out;
}

function readRecord(files, name) {
  const bytes = files[`records/${name}.json`];
  if (!bytes) return [];
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(parsed)) throw new Error(`The archive record ${name} is not a list. Nothing was imported.`);
  return parsed;
}

function stringRefs(ids) {
  return (Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id);
}

export function inspectArchive(data) {
  const files = unpackArchive(data);
  if (!files["manifest.json"]) {
    throw new Error("This is not a Velomere Archive. A deck zip or CSV can still be imported from the deck page. It does not restore Encounter history.");
  }
  const manifest = JSON.parse(files["manifest.json"].toString("utf8"));
  if (manifest.format !== ARCHIVE_FORMAT) throw new Error(`Unsupported archive version (${manifest.format || "unknown"}). Nothing was imported.`);
  const checksums = JSON.parse(files["checksums/assets.json"].toString("utf8"));
  if (sha256(canonicalJson(checksums)) !== manifest.checksumsSha256) {
    throw new Error("The archive checksum list does not match its manifest. Nothing was imported.");
  }
  const problems = [];
  for (const [name, expected] of Object.entries(checksums.files || {})) {
    if (name === "manifest.json" || name === "checksums/assets.json") continue;
    const bytes = files[name];
    if (!bytes) {
      problems.push({ path: name, problem: "missing" });
      continue;
    }
    if (sha256(bytes) !== expected) problems.push({ path: name, problem: "hash" });
    if (name.startsWith("artwork/") && !imageKind(name, bytes)) problems.push({ path: name, problem: "not-an-image" });
  }
  const records = {
    cards: readRecord(files, "cards"),
    commits: readRecord(files, "commits"),
    events: readRecord(files, "events"),
    adopted: readRecord(files, "adopted"),
    collections: readRecord(files, "collections"),
    memberships: readRecord(files, "memberships"),
    decks: readRecord(files, "decks"),
    readingCards: readRecord(files, "reading-cards"),
    renders: readRecord(files, "renders"),
    drafts: readRecord(files, "drafts"),
  };
  const known = new Set(records.cards.map((card) => card.id));
  for (const card of records.cards) {
    for (const parentId of card.parentIds || []) {
      if (!known.has(parentId)) problems.push({ path: `lineage/${card.id}`, problem: `missing-parent:${parentId}` });
    }
  }
  for (const commit of records.commits) {
    for (const id of [commit.leftParentId, commit.rightParentId, commit.childId]) {
      if (!known.has(id)) problems.push({ path: `lineage/${commit.id}`, problem: `missing-card:${id}` });
    }
  }
  for (const event of records.events) {
    for (const id of [...stringRefs(event.resultIds), ...stringRefs(event.parents)]) {
      if (!known.has(id)) problems.push({ path: `lineage/${event.id}`, problem: `missing-card:${id}` });
    }
  }
  const renderIds = new Set(records.renders.map((render) => render.id));
  for (const render of records.renders) {
    const path = render.path;
    if (!files[path]) problems.push({ path, problem: "missing-bytes" });
    else if (sha256(files[path]) !== render.sha256) problems.push({ path, problem: "byte-hash" });
  }
  for (const card of records.cards) {
    if (card.renderId && !renderIds.has(card.renderId)) problems.push({ path: `cards/${card.id}`, problem: "missing-render" });
    if (card.geometryRenderId && !renderIds.has(card.geometryRenderId)) problems.push({ path: `cards/${card.id}`, problem: "missing-geometry" });
  }
  const journals = files["journals/selected.json"] ? JSON.parse(files["journals/selected.json"].toString("utf8")) : null;
  return {
    manifest,
    records,
    files,
    journals,
    problems,
    ok: problems.length === 0 && manifest.complete === true,
  };
}

function assetPath(render) {
  const role = render.assetRole === "geometry" ? "geometry" : render.assetRole === "companion" ? "companions" : "legacy";
  const ext = render.mime === "image/jpeg" ? "jpg" : render.mime === "image/svg+xml" ? "svg" : "png";
  return `artwork/${role}/${render.id}.${ext}`;
}

function putRecord(files, checksums, name, value) {
  const path = `records/${name}.json`;
  const text = canonicalJson(value);
  files[path] = text;
  checksums[path] = sha256(text);
}

async function cardsByIds(sql, ownerId, ids) {
  const cards = new Map();
  const pending = [...ids];
  while (pending.length) {
    const id = pending.pop();
    if (!id || cards.has(id)) continue;
    const rows = await sql.query(
      `select ${CARD_COLUMNS} from vel_encounter_cards where id = $1 and owner_id = $2`,
      [id, ownerId],
    );
    const row = rows[0];
    if (!row) continue;
    cards.set(row.id, row);
    for (const parentId of parseJson(row.parent_ids_json, [])) pending.push(parentId);
  }
  return cards;
}

async function loadClosure(sql, ownerId, roots) {
  const cards = await cardsByIds(sql, ownerId, roots);
  const commits = [];
  if (!cards.size) return { cards: [], commits };
  const rows = await sql.query(
    `select id, session_id, left_parent_id, right_parent_id, child_id, outcome, commit_sha256, idempotency_key, created_at
       from vel_encounter_commits where owner_id = $1`,
    [ownerId],
  );
  const extra = [];
  for (const row of rows) {
    if (!cards.has(row.child_id)) continue;
    commits.push(row);
    for (const parentId of [row.left_parent_id, row.right_parent_id]) {
      if (!cards.has(parentId)) extra.push(parentId);
    }
  }
  if (extra.length) {
    const more = await cardsByIds(sql, ownerId, extra);
    for (const [id, row] of more) cards.set(id, row);
    for (const row of rows) {
      if (commits.some((commit) => commit.id === row.id)) continue;
      if (cards.has(row.child_id)) commits.push(row);
    }
  }
  return { cards: [...cards.values()], commits };
}

async function loadOwned(sql, ownerId) {
  const cards = await sql.query(`select ${CARD_COLUMNS} from vel_encounter_cards where owner_id = $1`, [ownerId]);
  const commits = await sql.query(
    `select id, session_id, left_parent_id, right_parent_id, child_id, outcome, commit_sha256, idempotency_key, created_at
       from vel_encounter_commits where owner_id = $1`,
    [ownerId],
  );
  return { cards, commits };
}

function cardRecord(row) {
  return {
    id: row.id,
    sessionId: row.session_id || null,
    kind: row.kind,
    canonHash: row.canon_hash,
    canonicalIndex: row.canonical_index == null ? null : Number(row.canonical_index),
    parentIds: parseJson(row.parent_ids_json, []),
    meaning: parseJson(row.semantics_json, {}),
    compound: parseJson(row.compound_json, {}),
    outcome: row.outcome,
    evidence: parseJson(row.evidence_json, []),
    sceneHash: row.scene_hash,
    geometry: parseJson(row.scene_json, {}),
    renderId: row.render_id,
    geometryRenderId: row.geometry_render_id,
    artRole: row.art_role || "legacy",
    generationEventId: row.generation_event_id,
    createdAt: iso(row.created_at),
  };
}

async function rendersFor(sql, ownerId, cards) {
  const hashes = [...new Set(cards.map((card) => card.scene_hash).filter(Boolean))];
  if (!hashes.length) return [];
  const rows = await sql.query(
    `select id, scene_hash, style_id, style_version, backend_id, content_hash, quality_json, bytes,
            asset_role, geometry_render_id, provider, model, prompt_version, request_id, source_png_sha256,
            width, height, mime, created_at
       from vel_art_renders where owner_id = $1`,
    [ownerId],
  );
  const referenced = new Set();
  for (const card of cards) {
    if (card.render_id) referenced.add(card.render_id);
    if (card.geometry_render_id) referenced.add(card.geometry_render_id);
  }
  return rows.filter((row) => {
    if (!hashes.includes(row.scene_hash) && !referenced.has(row.id)) return false;
    if (referenced.has(row.id)) return true;
    const quality = parseJson(row.quality_json, {});
    const staged = quality?.fidelity?.staged === true && quality?.fidelity?.passed !== true;
    return !staged;
  });
}

async function ensureLedger(sql) {
  await ensureArtSchema(sql);
  await sql.query(
    `create table if not exists vel_archive_imports (
       owner_id text not null,
       content_id text not null,
       object_kind text not null,
       source_id text not null,
       local_id text not null,
       primary key (owner_id, content_id, object_kind, source_id)
     )`,
  );
}

function handOf(value) {
  return value === "left" || value === "right" ? value : null;
}

function placed(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function readerSettings(value) {
  if (!value || typeof value !== "object") return null;
  const reversals = value.includeReversals;
  const shuffle = value.shuffleLocked;
  const next = {};
  if (reversals === true || reversals === false) next.includeReversals = reversals;
  if (shuffle === true || shuffle === false) next.shuffleLocked = shuffle;
  const reading = handOf(value.readingHand);
  const velomere = handOf(value.velomereHand);
  if (reading) next.readingHand = reading;
  if (velomere) next.velomereHand = velomere;
  return Object.keys(next).length ? next : null;
}

function eventKept(row, cardIds, linkedEventIds) {
  const refs = [...stringRefs(parseJson(row.result_ids_json, [])), ...stringRefs(parseJson(row.parents_json, []))];
  if (!refs.length) return linkedEventIds.has(row.event_id);
  if (!refs.every((id) => cardIds.has(id))) return false;
  return linkedEventIds.has(row.event_id) || refs.some((id) => cardIds.has(id));
}

export async function exportVelomereArchive(sql, ownerId, options = {}) {
  await ensureLedger(sql);
  const scope = options.scope === "deck" ? "deck" : "complete";
  const collectionRows = scope === "deck"
    ? await sql.query(
      `select id, name, landing_zone, style_preset, style_version, version, description, deck_id, created_at
         from vel_encounter_collections where id = $1 and owner_id = $2`,
      [options.collectionId, ownerId],
    )
    : await sql.query(
      `select id, name, landing_zone, style_preset, style_version, version, description, deck_id, created_at
         from vel_encounter_collections where owner_id = $1 order by landing_zone desc, created_at asc`,
      [ownerId],
    );
  if (scope === "deck" && !collectionRows[0]) throw new Error("That Encounter deck is not yours.");
  const collectionIds = collectionRows.map((row) => row.id);
  const memberships = collectionIds.length
    ? (await sql.query(
      `select id, collection_id, adopted_card_id, position, render_id, card_id, styled, style_locked, scene_hash,
              presentation_version, geometry_render_id, art_role
         from vel_collection_memberships where owner_id = $1
         order by collection_id, position`,
      [ownerId],
    )).filter((row) => collectionIds.includes(row.collection_id))
    : [];
  const adoptedRows = await sql.query(
    `select id, source_card_id, source_snapshot_json, personal_json, author_version, approval_json, created_at
       from vel_adopted_cards where owner_id = $1`,
    [ownerId],
  );
  const adoptedIds = new Set(memberships.map((row) => row.adopted_card_id));
  const adopted = scope === "complete" ? adoptedRows : adoptedRows.filter((row) => adoptedIds.has(row.id));
  const roots = [...new Set(adopted.map((row) => row.source_card_id))];
  const closure = scope === "complete" ? await loadOwned(sql, ownerId) : await loadClosure(sql, ownerId, roots);
  const cardRecords = closure.cards.map(cardRecord);
  const cardIds = new Set(cardRecords.map((card) => card.id));
  const renderRows = await rendersFor(sql, ownerId, closure.cards);
  for (const membership of memberships) {
    for (const renderId of [membership.render_id, membership.geometry_render_id]) {
      if (!renderId || renderRows.some((row) => row.id === renderId)) continue;
      const full = await sql.query(
        `select id, scene_hash, style_id, style_version, backend_id, content_hash, quality_json, bytes,
                asset_role, geometry_render_id, provider, model, prompt_version, request_id, source_png_sha256,
                width, height, mime, created_at
           from vel_art_renders where id = $1 and owner_id = $2`,
        [renderId, ownerId],
      );
      if (full[0]) renderRows.push(full[0]);
    }
  }
  const incomplete = [];
  const renderRecords = [];
  const files = {};
  const checksumFiles = {};
  for (const row of renderRows) {
    const bytes = bytesOf(row.bytes);
    if (!bytes || bytes.length < 8) {
      incomplete.push({ id: row.id, problem: "missing-image-bytes" });
      continue;
    }
    const record = {
      id: row.id,
      sceneHash: row.scene_hash,
      styleId: row.style_id,
      styleVersion: row.style_version,
      backendId: row.backend_id,
      contentHash: row.content_hash,
      quality: parseJson(row.quality_json, {}),
      assetRole: row.asset_role || "legacy",
      geometryRenderId: row.geometry_render_id,
      provider: row.provider,
      model: row.model,
      promptVersion: row.prompt_version,
      requestId: row.request_id,
      sourcePngSha256: row.source_png_sha256,
      width: row.width == null ? null : Number(row.width),
      height: row.height == null ? null : Number(row.height),
      mime: row.mime || "image/png",
      sha256: sha256(bytes),
      createdAt: iso(row.created_at),
    };
    record.path = assetPath(record);
    if (!imageKind(record.path, bytes)) {
      incomplete.push({ id: row.id, problem: "unrecognized-image" });
      continue;
    }
    if (record.contentHash && record.contentHash !== record.sha256) {
      incomplete.push({ id: row.id, problem: "content-hash-mismatch" });
    }
    files[record.path] = bytes;
    checksumFiles[record.path] = record.sha256;
    renderRecords.push(record);
  }
  const haveRender = new Set(renderRecords.map((row) => row.id));
  for (const card of cardRecords) {
    if (card.geometryRenderId && !haveRender.has(card.geometryRenderId)) incomplete.push({ id: card.id, problem: "missing-geometry-png" });
    if (card.renderId && card.artRole === "companion" && !haveRender.has(card.renderId)) incomplete.push({ id: card.id, problem: "missing-companion-png" });
    for (const parentId of card.parentIds || []) {
      if (!cardIds.has(parentId)) incomplete.push({ id: card.id, problem: `missing-parent:${parentId}` });
    }
  }
  const linkedEventIds = new Set(cardRecords.map((card) => card.generationEventId).filter(Boolean));
  const eventRows = await sql.query(
    `select event_id, session_id, action, accepted_at_utc, time_zone, time_zone_source, local_date, affinity,
            seed_algorithm_version, seed_digest, engine_version, canonical_hash, request_idempotency_key,
            session_version_at_acceptance, request_payload_hash, status, result_ids_json, parents_json, created_at
       from vel_generation_events where owner_id = $1`,
    [ownerId],
  );
  const events = scope === "complete" ? eventRows : eventRows.filter((row) => eventKept(row, cardIds, linkedEventIds));
  const deckIds = [...new Set(collectionRows.map((row) => row.deck_id).filter((id) => id != null).map(Number))];
  const decks = deckIds.length
    ? (await sql.query(`select id, name, locked, active, created_at from decks where user_id = $1`, [ownerId])).filter((row) => deckIds.includes(Number(row.id)))
    : [];
  const readingIds = [...new Set(memberships.map((row) => row.card_id).filter((id) => id != null).map(Number))];
  const readingCards = [];
  for (const readingId of readingIds) {
    const rows = await sql.query(
      `select id, deck_id, name, suit, rank, keywords, upright, reversed, image_url, is_seed, sort_order,
              image_scale, image_x, image_y, image_radius
         from cards where id = $1 and is_seed is not true`,
      [readingId],
    );
    if (rows[0]) readingCards.push(rows[0]);
  }
  const prefs = scope === "complete"
    ? await sql.query(`select default_style, interpretive_freedom from vel_reader_preferences where owner_id = $1`, [ownerId])
    : [];
  const journal = options.journal && typeof options.journal === "object"
    ? {
        readings: Array.isArray(options.journal.readings) ? options.journal.readings : [],
        dreams: Array.isArray(options.journal.dreams) ? options.journal.dreams : [],
        rituals: Array.isArray(options.journal.rituals) ? options.journal.rituals : [],
        labels: Array.isArray(options.journal.labels) ? options.journal.labels : [],
        conversations: options.includeConversations === true && Array.isArray(options.journal.conversations) ? options.journal.conversations : [],
      }
    : null;
  const includeDrafts = scope === "complete" && options.includeDrafts === true;
  const draftRows = includeDrafts
    ? await sql.query(
      `select id, source_card_id, status, dialogue_json, personal_json, adopted_card_id, created_at
         from vel_journal_drafts where owner_id = $1`,
      [ownerId],
    )
    : [];
  const collections = collectionRows.map((row) => ({
    id: row.id,
    name: row.name,
    landing: Number(row.landing_zone) === 1,
    style: row.style_preset,
    styleVersion: row.style_version,
    version: Number(row.version),
    description: row.description || "",
    deckId: row.deck_id == null ? null : Number(row.deck_id),
    createdAt: iso(row.created_at),
  }));
  const membershipRecords = memberships.map((row) => ({
    id: row.id,
    collectionId: row.collection_id,
    adoptedCardId: row.adopted_card_id,
    position: Number(row.position),
    renderId: row.render_id,
    cardId: row.card_id == null ? null : Number(row.card_id),
    styled: Number(row.styled) === 1,
    styleLocked: Number(row.style_locked) === 1,
    sceneHash: row.scene_hash,
    presentationVersion: Number(row.presentation_version),
    geometryRenderId: row.geometry_render_id,
    artRole: row.art_role || "legacy",
  }));
  const adoptedRecords = adopted.map((row) => ({
    id: row.id,
    sourceCardId: row.source_card_id,
    sourceSnapshot: parseJson(row.source_snapshot_json, {}),
    personal: parseJson(row.personal_json, {}),
    authorVersion: Number(row.author_version),
    approval: parseJson(row.approval_json, {}),
    createdAt: iso(row.created_at),
  }));
  const commitRecords = closure.commits.map((row) => ({
    id: row.id,
    sessionId: row.session_id || null,
    leftParentId: row.left_parent_id,
    rightParentId: row.right_parent_id,
    sourceRoles: { left: "left", right: "right" },
    childId: row.child_id,
    outcome: row.outcome,
    commitSha256: row.commit_sha256,
    idempotencyKey: row.idempotency_key,
    createdAt: iso(row.created_at),
  }));
  const eventRecords = events.map((row) => ({
    id: row.event_id,
    sessionId: row.session_id,
    action: row.action,
    acceptedAtUtc: row.accepted_at_utc,
    timeZone: row.time_zone,
    timeZoneSource: row.time_zone_source,
    localDate: row.local_date,
    affinity: Number(row.affinity),
    seedAlgorithmVersion: row.seed_algorithm_version,
    seedDigest: row.seed_digest,
    engineVersion: row.engine_version,
    canonicalHash: row.canonical_hash,
    requestIdempotencyKey: row.request_idempotency_key,
    sessionVersionAtAcceptance: Number(row.session_version_at_acceptance),
    requestPayloadHash: row.request_payload_hash,
    status: row.status,
    resultIds: parseJson(row.result_ids_json, []),
    parents: parseJson(row.parents_json, []),
    createdAt: iso(row.created_at),
  }));
  const deckRecords = decks.map((row) => ({
    id: Number(row.id),
    name: row.name,
    locked: row.locked === true || row.locked === 1,
    active: false,
    createdAt: iso(row.created_at),
  }));
  const readingRecords = readingCards.map((row) => ({
    id: Number(row.id),
    deckId: row.deck_id == null ? null : Number(row.deck_id),
    name: row.name,
    suit: row.suit,
    rank: row.rank,
    keywords: row.keywords,
    upright: row.upright,
    reversed: row.reversed,
    imageUrl: row.image_url,
    isSeed: false,
    sortOrder: Number(row.sort_order),
    imageScale: placed(row.image_scale, 100, 40, 220),
    imageX: placed(row.image_x, 0, -80, 80),
    imageY: placed(row.image_y, 0, -80, 80),
    imageRadius: placed(row.image_radius, 2, 0, 40),
  }));
  const localReader = scope === "complete" ? readerSettings(options.reader) : null;
  const preference = prefs[0] || localReader
    ? {
        defaultStyle: prefs[0]?.default_style || null,
        interpretiveFreedom: prefs[0] ? Number(prefs[0].interpretive_freedom) : null,
        includeReversals: localReader?.includeReversals ?? null,
        shuffleLocked: localReader?.shuffleLocked ?? null,
        readingHand: localReader?.readingHand ?? null,
        velomereHand: localReader?.velomereHand ?? null,
      }
    : null;
  const draftRecords = draftRows
    .filter((row) => row.status === "DRAFT" || row.status === "APPROVED")
    .map((row) => ({
      id: row.id,
      sourceCardId: row.source_card_id,
      status: row.status,
      personal: parseJson(row.personal_json, null),
      adoptedCardId: row.adopted_card_id,
      createdAt: iso(row.created_at),
      draft: true,
      dialogue: options.includeConversations === true ? parseJson(row.dialogue_json, []) : [],
    }));
  putRecord(files, checksumFiles, "cards", cardRecords);
  putRecord(files, checksumFiles, "commits", commitRecords);
  putRecord(files, checksumFiles, "events", eventRecords);
  putRecord(files, checksumFiles, "adopted", adoptedRecords);
  putRecord(files, checksumFiles, "collections", collections);
  putRecord(files, checksumFiles, "memberships", membershipRecords);
  putRecord(files, checksumFiles, "decks", deckRecords);
  putRecord(files, checksumFiles, "reading-cards", readingRecords);
  putRecord(files, checksumFiles, "renders", renderRecords);
  if (preference) putRecord(files, checksumFiles, "preferences", [preference]);
  if (includeDrafts) putRecord(files, checksumFiles, "drafts", draftRecords);
  if (journal) {
    const text = canonicalJson(journal);
    files["journals/selected.json"] = text;
    checksumFiles["journals/selected.json"] = sha256(text);
  }
  const exclusions = [...EXCLUSIONS];
  if (includeDrafts) {
    const open = exclusions.indexOf("open-drafts");
    if (open >= 0) exclusions.splice(open, 1);
    exclusions.push("drafts-are-not-encounters");
    if (options.includeConversations !== true) exclusions.push("draft-transcripts");
  }
  if (!journal) exclusions.push("journals");
  else if (options.includeConversations !== true) exclusions.push("saved-conversations");
  if (scope !== "complete") exclusions.push("reader-preferences");
  const complete = incomplete.length === 0;
  const checksums = { files: checksumFiles };
  const checksumText = canonicalJson(checksums);
  files["checksums/assets.json"] = checksumText;
  const label = scope === "deck"
    ? (complete ? "Velomere Deck Archive" : "Incomplete Velomere Deck Archive")
    : (complete ? "Complete Velomere Archive" : "Incomplete Velomere Archive");
  const manifest = {
    format: ARCHIVE_FORMAT,
    schema: ARCHIVE_SCHEMA,
    scope,
    label,
    complete,
    createdAt: new Date().toISOString(),
    canonHash: CANON_HASH,
    counts: {
      cards: cardRecords.length,
      commits: commitRecords.length,
      events: eventRecords.length,
      adopted: adoptedRecords.length,
      collections: collections.length,
      memberships: membershipRecords.length,
      decks: deckRecords.length,
      readingCards: readingRecords.length,
      renders: renderRecords.length,
      journals: journal ? 1 : 0,
      drafts: draftRecords.length,
    },
    exclusions,
    incomplete,
    capabilities: ["meanings", "lineage", "geometry-bytes", "companion-bytes", "locks", "deck-memberships", "ancestry-closure"],
    canonicalization: "sorted-json-keys",
    checksumsSha256: sha256(checksumText),
  };
  manifest.contentId = sha256(canonicalJson({
    cards: cardRecords,
    commits: commitRecords,
    adopted: adoptedRecords,
    memberships: membershipRecords,
    renders: renderRecords.map((row) => row.sha256),
  }));
  files["manifest.json"] = canonicalJson(manifest);
  files["README.txt"] = [
    "Velomere Archive v1",
    "This file restores stored records and image bytes. It does not replay an Encounter.",
    "Meanings are historical and must not be rewritten on import.",
    "Solace transcripts, server configuration, and API keys are not included.",
    "Drafts, when present, are records/drafts.json and are not committed Encounters.",
    "The app keeps the current approved meaning, not an older revision log.",
    complete ? "Required image bytes for the exported cards were present." : "This archive is incomplete. See manifest.incomplete. Nothing missing was invented.",
  ].join("\n");
  return {
    bytes: packArchive(files),
    manifest,
    filename: scope === "deck" ? "velomere-deck-archive.zip" : "velomere-archive.zip",
  };
}

function newId() {
  return randomBytes(16).toString("hex");
}

async function ledgerGet(sql, ownerId, contentId, kind, sourceId) {
  const rows = await sql.query(
    `select local_id from vel_archive_imports
      where owner_id = $1 and content_id = $2 and object_kind = $3 and source_id = $4`,
    [ownerId, contentId, kind, String(sourceId)],
  );
  return rows[0]?.local_id || null;
}

async function ledgerPut(sql, ownerId, contentId, kind, sourceId, localId) {
  await sql.query(
    `insert into vel_archive_imports (owner_id, content_id, object_kind, source_id, local_id)
     values ($1,$2,$3,$4,$5)
     on conflict (owner_id, content_id, object_kind, source_id) do nothing`,
    [ownerId, contentId, kind, String(sourceId), String(localId)],
  );
}

function remapId(map, id) {
  if (typeof id !== "string") return id;
  return map.has(id) ? map.get(id) : id;
}

function remapCompound(compound, eventMap) {
  if (!compound || typeof compound !== "object" || Array.isArray(compound)) return compound || {};
  const next = { ...compound };
  if (typeof next.generationEventId === "string" && eventMap.has(next.generationEventId)) {
    next.sourceGenerationEventId = next.sourceGenerationEventId || next.generationEventId;
    next.generationEventId = eventMap.get(next.generationEventId);
  }
  return next;
}

export async function archiveConflicts(sql, ownerId, inspected) {
  await ensureLedger(sql);
  const contentId = inspected.manifest.contentId;
  const prior = contentId
    ? await sql.query(
      `select count(*)::int as n from vel_archive_imports where owner_id = $1 and content_id = $2`,
      [ownerId, contentId],
    )
    : [{ n: 0 }];
  let sameMeaning = 0;
  for (const card of inspected.records.cards) {
    if (!card.sceneHash) continue;
    const rows = await sql.query(
      `select semantics_json from vel_encounter_cards where owner_id = $1 and scene_hash = $2`,
      [ownerId, card.sceneHash],
    );
    if (rows.some((row) => canonicalJson(parseJson(row.semantics_json, {})) === canonicalJson(card.meaning || {}))) sameMeaning += 1;
  }
  return {
    alreadyRestored: Number(prior[0]?.n || 0) > 0,
    sameMeaning,
  };
}

export async function importVelomereArchive(sql, ownerId, data, options = {}) {
  const inspected = inspectArchive(data);
  if (inspected.problems.length) {
    const error = new Error("The archive failed integrity checks. Nothing was changed.");
    error.problems = inspected.problems;
    throw error;
  }
  await ensureLedger(sql);
  const mode = options.mode === "as-new" ? "as-new" : options.mode === "merge" ? "merge" : "restore";
  const contentId = mode === "as-new" ? `${inspected.manifest.contentId}:as-new:${newId()}` : inspected.manifest.contentId;
  const { records, files } = inspected;
  const idOf = async (kind, sourceId) => {
    const existing = await ledgerGet(sql, ownerId, contentId, kind, sourceId);
    if (existing) return existing;
    const created = newId();
    await ledgerPut(sql, ownerId, contentId, kind, sourceId, created);
    return created;
  };
  const created = { cards: 0, renders: 0, memberships: 0, collections: 0, drafts: 0 };
  const renderMap = new Map();
  for (const render of records.renders) {
    let local = await ledgerGet(sql, ownerId, contentId, "render", render.id);
    const bytes = files[render.path];
    if (local) {
      const have = await sql.query(`select id from vel_art_renders where id = $1 and owner_id = $2`, [local, ownerId]);
      if (have[0]) {
        renderMap.set(render.id, local);
        continue;
      }
    }
    if (!local) {
      local = newId();
      await ledgerPut(sql, ownerId, contentId, "render", render.id, local);
    }
    await sql.query(
      `insert into vel_art_renders
         (id, owner_id, scene_hash, style_id, style_version, backend_id, content_hash, quality_json, bytes,
          asset_role, geometry_render_id, provider, model, prompt_version, request_id, source_png_sha256, width, height, mime, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        local,
        ownerId,
        render.sceneHash,
        render.styleId,
        render.styleVersion,
        render.backendId,
        render.sha256,
        JSON.stringify(render.quality || {}),
        bytes,
        render.assetRole || "legacy",
        null,
        render.provider,
        render.model,
        render.promptVersion,
        render.requestId,
        render.sourcePngSha256,
        render.width,
        render.height,
        render.mime || "image/png",
        render.createdAt,
      ],
    );
    renderMap.set(render.id, local);
    created.renders += 1;
  }
  for (const render of records.renders) {
    if (!render.geometryRenderId) continue;
    const local = renderMap.get(render.id);
    const geometry = renderMap.get(render.geometryRenderId);
    if (local && geometry) {
      await sql.query(`update vel_art_renders set geometry_render_id = $2 where id = $1 and owner_id = $3`, [local, geometry, ownerId]);
    }
  }
  const eventMap = new Map();
  for (const event of records.events) eventMap.set(event.id, await idOf("event", event.id));
  const cardMap = new Map();
  for (const card of records.cards) {
    let local = await ledgerGet(sql, ownerId, contentId, "card", card.id);
    if (mode === "merge" && !local) {
      const same = await sql.query(
        `select id, semantics_json from vel_encounter_cards where owner_id = $1 and scene_hash = $2`,
        [ownerId, card.sceneHash],
      );
      const hit = same.find((row) => canonicalJson(parseJson(row.semantics_json, {})) === canonicalJson(card.meaning));
      if (hit) {
        local = hit.id;
        await ledgerPut(sql, ownerId, contentId, "card", card.id, local);
      }
    }
    if (local) {
      const have = await sql.query(`select id from vel_encounter_cards where id = $1 and owner_id = $2`, [local, ownerId]);
      if (have[0]) {
        cardMap.set(card.id, local);
        continue;
      }
    }
    if (!local) {
      local = newId();
      await ledgerPut(sql, ownerId, contentId, "card", card.id, local);
    }
    cardMap.set(card.id, local);
  }
  for (const card of records.cards) {
    const local = cardMap.get(card.id);
    const have = await sql.query(`select id from vel_encounter_cards where id = $1 and owner_id = $2`, [local, ownerId]);
    if (have[0]) continue;
    const parents = (card.parentIds || []).map((id) => cardMap.get(id)).filter(Boolean);
    await sql.query(
      `insert into vel_encounter_cards
         (id, owner_id, session_id, kind, canon_hash, canonical_index, parent_ids_json, semantics_json, compound_json,
          outcome, evidence_json, scene_hash, scene_json, render_id, geometry_render_id, art_role, generation_event_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        local,
        ownerId,
        card.sessionId || "restored",
        card.kind,
        card.canonHash,
        card.canonicalIndex,
        JSON.stringify(parents),
        JSON.stringify(card.meaning || {}),
        JSON.stringify(remapCompound(card.compound, eventMap)),
        card.outcome,
        JSON.stringify(card.evidence || []),
        card.sceneHash,
        JSON.stringify(card.geometry || {}),
        card.renderId ? renderMap.get(card.renderId) || null : null,
        card.geometryRenderId ? renderMap.get(card.geometryRenderId) || null : null,
        card.artRole || "legacy",
        card.generationEventId ? eventMap.get(card.generationEventId) || null : null,
        card.createdAt,
      ],
    );
    created.cards += 1;
  }
  for (const event of records.events) {
    const local = eventMap.get(event.id);
    const have = await sql.query(`select event_id from vel_generation_events where event_id = $1 and owner_id = $2`, [local, ownerId]);
    if (have[0]) continue;
    const resultIds = (event.resultIds || []).map((id) => remapId(cardMap, id));
    const parents = (event.parents || []).map((id) => remapId(cardMap, id));
    await sql.query(
      `insert into vel_generation_events
         (event_id, owner_id, session_id, action, accepted_at_utc, time_zone, time_zone_source, local_date, affinity,
          seed_algorithm_version, seed_digest, engine_version, canonical_hash, request_idempotency_key,
          session_version_at_acceptance, request_payload_hash, status, result_ids_json, parents_json, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        local,
        ownerId,
        event.sessionId || "restored",
        event.action,
        event.acceptedAtUtc,
        event.timeZone,
        event.timeZoneSource,
        event.localDate,
        event.affinity,
        event.seedAlgorithmVersion,
        event.seedDigest,
        event.engineVersion,
        event.canonicalHash,
        `${event.requestIdempotencyKey}:restored:${local}`,
        event.sessionVersionAtAcceptance,
        event.requestPayloadHash,
        event.status,
        JSON.stringify(resultIds),
        JSON.stringify(parents),
        event.createdAt,
      ],
    );
  }
  for (const commit of records.commits) {
    const local = await idOf("commit", commit.id);
    const have = await sql.query(`select id from vel_encounter_commits where id = $1 and owner_id = $2`, [local, ownerId]);
    if (have[0]) continue;
    await sql.query(
      `insert into vel_encounter_commits
         (id, session_id, owner_id, left_parent_id, right_parent_id, child_id, outcome, commit_sha256, idempotency_key, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        local,
        commit.sessionId || "restored",
        ownerId,
        cardMap.get(commit.leftParentId),
        cardMap.get(commit.rightParentId),
        cardMap.get(commit.childId),
        commit.outcome,
        commit.commitSha256,
        `${commit.idempotencyKey}:restored:${local}`,
        commit.createdAt,
      ],
    );
  }
  const deckMap = new Map();
  for (const deck of records.decks) {
    let local = await ledgerGet(sql, ownerId, contentId, "deck", deck.id);
    if (local) {
      deckMap.set(deck.id, Number(local));
      continue;
    }
    const inserted = await sql.query(
      `insert into decks (name, locked, active, user_id) values ($1,$2,false,$3) returning id`,
      [deck.name, deck.locked === true, ownerId],
    );
    local = String(inserted[0].id);
    await ledgerPut(sql, ownerId, contentId, "deck", deck.id, local);
    deckMap.set(deck.id, Number(local));
  }
  const readingMap = new Map();
  for (const card of records.readingCards) {
    let local = await ledgerGet(sql, ownerId, contentId, "reading-card", card.id);
    if (local) {
      readingMap.set(card.id, Number(local));
      continue;
    }
    const deckId = card.deckId == null ? null : deckMap.get(card.deckId) || null;
    let imageUrl = card.imageUrl;
    if (typeof imageUrl === "string" && imageUrl.startsWith("/encounters/art/")) {
      const mapped = renderMap.get(imageUrl.split("/").pop());
      imageUrl = mapped ? `/encounters/art/${mapped}` : null;
    }
    const inserted = await sql.query(
      `insert into cards (name, suit, rank, keywords, upright, reversed, image_url, is_seed, sort_order,
                          image_scale, image_x, image_y, image_radius, deck_id)
       values ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13) returning id`,
      [
        card.name,
        card.suit || "Encounter",
        card.rank || "",
        card.keywords || "",
        card.upright || "",
        card.reversed || "",
        imageUrl,
        card.sortOrder || 0,
        placed(card.imageScale, 100, 40, 220),
        placed(card.imageX, 0, -80, 80),
        placed(card.imageY, 0, -80, 80),
        placed(card.imageRadius, 2, 0, 40),
        deckId,
      ],
    );
    local = String(inserted[0].id);
    await ledgerPut(sql, ownerId, contentId, "reading-card", card.id, local);
    readingMap.set(card.id, Number(local));
  }
  const collectionMap = new Map();
  for (const collection of records.collections) {
    let local = await ledgerGet(sql, ownerId, contentId, "collection", collection.id);
    if (local) {
      const have = await sql.query(`select id from vel_encounter_collections where id = $1 and owner_id = $2`, [local, ownerId]);
      if (have[0]) {
        collectionMap.set(collection.id, local);
        continue;
      }
    }
    const landingWanted = collection.landing === true;
    const existingLanding = landingWanted
      ? await sql.query(`select id from vel_encounter_collections where owner_id = $1 and landing_zone = 1`, [ownerId])
      : [];
    const landing = landingWanted && !existingLanding[0];
    if (!local) {
      local = newId();
      await ledgerPut(sql, ownerId, contentId, "collection", collection.id, local);
    }
    const deckId = collection.deckId == null ? null : deckMap.get(collection.deckId) || null;
    await sql.query(
      `insert into vel_encounter_collections
         (id, owner_id, name, landing_zone, style_preset, style_version, version, deck_id, description, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [local, ownerId, landingWanted && !landing ? `${collection.name} (restored)` : collection.name, landing ? 1 : 0, collection.style, collection.styleVersion, collection.version || 0, deckId, collection.description || "", collection.createdAt],
    );
    collectionMap.set(collection.id, local);
    created.collections += 1;
  }
  const adoptedMap = new Map();
  for (const adopted of records.adopted) {
    let local = await ledgerGet(sql, ownerId, contentId, "adopted", adopted.id);
    if (local) {
      const have = await sql.query(`select id, personal_json, approval_json from vel_adopted_cards where id = $1 and owner_id = $2`, [local, ownerId]);
      if (have[0]) {
        const currentAt = Date.parse(parseJson(have[0].approval_json, {}).at || 0);
        const incomingAt = Date.parse(adopted.approval?.at || 0);
        if (!(currentAt > incomingAt)) {
          await sql.query(
            `update vel_adopted_cards set personal_json = $2 where id = $1 and owner_id = $3`,
            [local, JSON.stringify(adopted.personal || {}), ownerId],
          );
        }
        adoptedMap.set(adopted.id, local);
        continue;
      }
    }
    if (!local) {
      local = newId();
      await ledgerPut(sql, ownerId, contentId, "adopted", adopted.id, local);
    }
    const snapshot = { ...(adopted.sourceSnapshot || {}) };
    if (snapshot.sceneHash == null && adopted.sourceCardId) snapshot.sceneHash = records.cards.find((card) => card.id === adopted.sourceCardId)?.sceneHash || null;
    await sql.query(
      `insert into vel_adopted_cards
         (id, owner_id, source_card_id, source_snapshot_json, personal_json, author_version, approval_json, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        local,
        ownerId,
        cardMap.get(adopted.sourceCardId),
        JSON.stringify(snapshot),
        JSON.stringify(adopted.personal || {}),
        adopted.authorVersion || 1,
        JSON.stringify(adopted.approval || {}),
        adopted.createdAt,
      ],
    );
    adoptedMap.set(adopted.id, local);
  }
  for (const membership of records.memberships) {
    const collectionId = collectionMap.get(membership.collectionId);
    const adoptedId = adoptedMap.get(membership.adoptedCardId);
    if (!collectionId || !adoptedId) continue;
    const have = await sql.query(
      `select id from vel_collection_memberships where collection_id = $1 and adopted_card_id = $2 and owner_id = $3`,
      [collectionId, adoptedId, ownerId],
    );
    if (have[0]) continue;
    const local = await idOf("membership", membership.id);
    await sql.query(
      `insert into vel_collection_memberships
         (id, collection_id, adopted_card_id, owner_id, position, render_id, card_id, styled, style_locked, scene_hash,
          presentation_version, geometry_render_id, art_role)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        local,
        collectionId,
        adoptedId,
        ownerId,
        membership.position,
        membership.renderId ? renderMap.get(membership.renderId) || null : null,
        membership.cardId == null ? null : readingMap.get(membership.cardId) || null,
        membership.styled ? 1 : 0,
        membership.styleLocked ? 1 : 0,
        membership.sceneHash,
        membership.presentationVersion || 0,
        membership.geometryRenderId ? renderMap.get(membership.geometryRenderId) || null : null,
        membership.artRole || "legacy",
      ],
    );
    created.memberships += 1;
  }
  if (options.applyDrafts === true) {
    for (const draft of records.drafts || []) {
      if (draft.status !== "DRAFT" && draft.status !== "APPROVED") continue;
      const sourceId = cardMap.get(draft.sourceCardId);
      if (!sourceId) continue;
      let local = await ledgerGet(sql, ownerId, contentId, "draft", draft.id);
      if (local) {
        const have = await sql.query(`select id from vel_journal_drafts where id = $1 and owner_id = $2`, [local, ownerId]);
        if (have[0]) continue;
      }
      if (!local) {
        local = newId();
        await ledgerPut(sql, ownerId, contentId, "draft", draft.id, local);
      }
      await sql.query(
        `insert into vel_journal_drafts
           (id, owner_id, source_card_id, status, dialogue_json, personal_json, adopted_card_id, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          local,
          ownerId,
          sourceId,
          draft.status,
          JSON.stringify(Array.isArray(draft.dialogue) ? draft.dialogue : []),
          draft.personal ? JSON.stringify(draft.personal) : null,
          draft.adoptedCardId ? adoptedMap.get(draft.adoptedCardId) || null : null,
          draft.createdAt,
        ],
      );
      created.drafts += 1;
    }
  }
  let preferencesApplied = false;
  let localPreferences = null;
  if (files["records/preferences.json"]) {
    const [preference] = JSON.parse(files["records/preferences.json"].toString("utf8"));
    if (preference) {
      localPreferences = readerSettings(preference);
      if (options.applyPreferences === true && preference.defaultStyle) {
        await sql.query(
          `insert into vel_reader_preferences (owner_id, default_style, interpretive_freedom)
           values ($1,$2,$3)
           on conflict (owner_id) do update
             set default_style = excluded.default_style,
                 interpretive_freedom = excluded.interpretive_freedom,
                 updated_at = now()`,
          [ownerId, preference.defaultStyle, preference.interpretiveFreedom],
        );
        preferencesApplied = true;
      }
    }
  }
  return {
    status: "restored",
    mode,
    contentId: inspected.manifest.contentId,
    label: inspected.manifest.label,
    complete: inspected.manifest.complete === true,
    created,
    preferencesApplied,
    localPreferences,
    journals: inspected.journals,
    exclusions: inspected.manifest.exclusions,
    incomplete: inspected.manifest.incomplete,
  };
}
