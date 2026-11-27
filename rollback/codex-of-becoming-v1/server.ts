import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction } from "@/lib/db";
import {
  addToCollection,
  adoptionPacket,
  approveDraft,
  beginDraft,
  cancelStyle,
  collectionDetail,
  commitPair,
  createCollection,
  geometryForDeckCard,
  listCollections,
  moveMembership,
  openSession,
  paintReservedNext,
  paintReservedPair,
  previewStyle,
  publishStyle,
  pullNext,
  pullPair,
  readArtPreferences as loadArtPreferences,
  readSession,
  reserveInitialCut,
  reserveNextCut,
  reshuffle,
  retryReserved,
  revealPair,
  saveArtPreferences as storeArtPreferences,
  setLock,
} from "./store.mjs";
import { ENCOUNTER_STYLES } from "./style-default.mjs";
import { clampFreedom } from "./interpretive-freedom.mjs";
import { prepareDraft } from "./draft-fields.mjs";
import { exportVelomereArchive, importVelomereArchive, inspectArchive, archiveConflicts } from "./archive.mjs";

function keyOf(value: unknown) {
  const key = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9:_-]{8,80}$/.test(key)) throw new Error("That request could not be repeated safely.");
  return key;
}

function zoneOf(value: unknown) {
  const timeZone = String(value ?? "").trim().slice(0, 80);
  if (!timeZone) return { timeZone: "UTC", tzSource: "fallback_utc" as const };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return { timeZone, tzSource: "device" as const };
  } catch {
    return { timeZone: "UTC", tzSource: "fallback_utc" as const };
  }
}

function rejectRecipeOverrides(raw: object) {
  if ("date" in raw || "affinity" in raw || "recipeDate" in raw || "localDate" in raw) {
    throw new Error("Date and affinity are not chosen here.");
  }
}

export const startEncounterSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { timeZone?: unknown };
    rejectRecipeOverrides(raw);
    return zoneOf(raw.timeZone);
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const acceptedAtUtc = new Date().toISOString();
    return withTransaction((tx) => openSession(tx, context.userId, { ...data, acceptedAtUtc, publicEvent: true }));
  });

function orderOf(value: unknown, min: number) {
  if (!Array.isArray(value) || value.length < min) throw new Error("The cut did not settle the whole deck.");
  return value.map((item) => {
    const index = Number(item);
    if (!Number.isInteger(index)) throw new Error("The cut did not settle the whole deck.");
    return index;
  });
}

export const acceptEncounterCut = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { sessionId?: unknown; key?: unknown; timeZone?: unknown; order?: unknown; hand?: unknown; shuffleCount?: unknown };
    rejectRecipeOverrides(raw);
    const sessionId = String(raw.sessionId ?? "");
    return {
      sessionId: /^[a-f0-9]{32}$/.test(sessionId) ? sessionId : null,
      idempotencyKey: keyOf(raw.key),
      order: orderOf(raw.order, 78),
      hand: String(raw.hand ?? "UNKNOWN"),
      shuffleCount: Number(raw.shuffleCount ?? 0),
      ...zoneOf(raw.timeZone),
    };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const acceptedAtUtc = new Date().toISOString();
    const reserved = await withTransaction((tx) => reserveInitialCut(tx, context.userId, { ...data, acceptedAtUtc }));
    try {
      const painted = await withTransaction((tx) => paintReservedPair(tx, context.userId, { sessionId: reserved.sessionId }));
      return painted;
    } catch (err) {
      return {
        sessionId: reserved.sessionId,
        version: reserved.version,
        status: "RENDERING",
        revealed: false,
        failed: true,
        message: err instanceof Error ? err.message : "One card couldn't be prepared. Retry to reveal both.",
      };
    }
  });

export const retryEncounterCut = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const sessionId = String((input as { sessionId?: unknown })?.sessionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("That session is missing.");
    return { sessionId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => retryReserved(tx, context.userId, data.sessionId));
  });

export const revealEncounterPair = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const sessionId = String((input as { sessionId?: unknown })?.sessionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("That session is missing.");
    return { sessionId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => revealPair(tx, context.userId, data.sessionId));
  });

export const acceptNextEncounterCut = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { sessionId?: unknown; key?: unknown; timeZone?: unknown; order?: unknown; hand?: unknown };
    rejectRecipeOverrides(raw);
    const sessionId = String(raw.sessionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("That session is missing.");
    return {
      sessionId,
      idempotencyKey: keyOf(raw.key),
      order: orderOf(raw.order, 1),
      hand: String(raw.hand ?? "UNKNOWN"),
      ...zoneOf(raw.timeZone),
    };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const acceptedAtUtc = new Date().toISOString();
    const reserved = await withTransaction((tx) => reserveNextCut(tx, context.userId, { ...data, acceptedAtUtc }));
    try {
      return await withTransaction((tx) => paintReservedNext(tx, context.userId, { sessionId: reserved.sessionId }));
    } catch (err) {
      return {
        sessionId: reserved.sessionId,
        version: reserved.version,
        status: "RENDERING",
        revealed: false,
        failed: true,
        message: err instanceof Error ? err.message : "The new card couldn't be prepared. Retry to draw the same card.",
      };
    }
  });

export const readEncounterSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const sessionId = String((input as { sessionId?: unknown })?.sessionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("That session is missing.");
    return { sessionId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return readSession(sql, context.userId, data.sessionId);
  });

export const pullEncounterPair = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { sessionId?: unknown; version?: unknown; key?: unknown; timeZone?: unknown };
    rejectRecipeOverrides(raw);
    const sessionId = String(raw.sessionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("That session is missing.");
    return { sessionId, expectedVersion: Number(raw.version), idempotencyKey: keyOf(raw.key), ...zoneOf(raw.timeZone) };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const acceptedAtUtc = new Date().toISOString();
    return withTransaction((tx) => pullPair(tx, context.userId, { ...data, acceptedAtUtc }));
  });

export const pullEncounterNext = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { sessionId?: unknown; version?: unknown; key?: unknown; timeZone?: unknown };
    rejectRecipeOverrides(raw);
    const sessionId = String(raw.sessionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("That session is missing.");
    return { sessionId, expectedVersion: Number(raw.version), idempotencyKey: keyOf(raw.key), ...zoneOf(raw.timeZone) };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const acceptedAtUtc = new Date().toISOString();
    return withTransaction((tx) => pullNext(tx, context.userId, { ...data, acceptedAtUtc }));
  });

export const commitEncounter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { sessionId?: unknown; version?: unknown; key?: unknown; timeZone?: unknown };
    rejectRecipeOverrides(raw);
    const sessionId = String(raw.sessionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("That session is missing.");
    return { sessionId, expectedVersion: Number(raw.version), idempotencyKey: keyOf(raw.key), ...zoneOf(raw.timeZone) };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const acceptedAtUtc = new Date().toISOString();
    return withTransaction((tx) => commitPair(tx, context.userId, { ...data, acceptedAtUtc }));
  });

export const reshuffleEncounterPool = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { sessionId?: unknown; version?: unknown };
    const sessionId = String(raw.sessionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error("That session is missing.");
    return { sessionId, expectedVersion: Number(raw.version) };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => reshuffle(tx, context.userId, data));
  });

export const beginEncounterAdoption = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const cardId = String((input as { cardId?: unknown })?.cardId ?? "");
    if (!/^[a-f0-9]{32}$/.test(cardId)) throw new Error("Choose a card on the table.");
    return { cardId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => beginDraft(tx, context.userId, data.cardId));
  });

export const approveEncounterAdoption = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { draftId?: unknown; destinationId?: unknown; explicitApproval?: unknown; reviewed?: unknown; personal?: { name?: unknown; core?: unknown; upright?: unknown; shadow?: unknown; keywords?: unknown } };
    const draftId = String(raw.draftId ?? "");
    if (!/^[a-f0-9]{32}$/.test(draftId)) throw new Error("That draft is missing.");
    const personalIn = raw.personal ?? {};
    const keywords = Array.isArray(personalIn.keywords)
      ? personalIn.keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
      : String(personalIn.keywords ?? "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
    return {
      draftId,
      destinationId: raw.destinationId ? String(raw.destinationId) : null,
      explicitApproval: raw.explicitApproval === true,
      reviewed: raw.reviewed === true,
      personal: {
        name: String(personalIn.name ?? "").slice(0, 80),
        core: String(personalIn.core ?? "").slice(0, 1400),
        upright: String(personalIn.upright ?? "").slice(0, 2400),
        shadow: String(personalIn.shadow ?? "").slice(0, 2400),
        keywords,
      },
    };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => approveDraft(tx, context.userId, data));
  });

export const listEncounterCollections = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return withTransaction((tx) => listCollections(tx, context.userId));
  });

export const createEncounterCollection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { name?: unknown; description?: unknown; style?: unknown };
    const name = String(raw.name ?? "").trim();
    if (!name) throw new Error("An Encounter deck needs a name.");
    const rawStyle = raw.style == null || String(raw.style).trim() === "" ? "" : String(raw.style);
    if (rawStyle && !(ENCOUNTER_STYLES as readonly string[]).includes(rawStyle)) throw new Error("Choose one of the six styles. Custom prompts are not part of this release.");
    return { name, description: String(raw.description ?? "").slice(0, 280), style: rawStyle || null };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => createCollection(tx, context.userId, data.name, { description: data.description, style: data.style || undefined }));
  });

export const readArtPreferences = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return loadArtPreferences(sql, context.userId);
  });

export const saveArtPreferences = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { style?: unknown; freedom?: unknown };
    const style = String(raw.style ?? "");
    if (!(ENCOUNTER_STYLES as readonly string[]).includes(style)) throw new Error("Choose one of the six styles.");
    const freedom = clampFreedom(raw.freedom);
    return { style, freedom };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => storeArtPreferences(tx, context.userId, data));
  });

export const readEncounterAdoption = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { draftId?: unknown; cardId?: unknown };
    const draftId = String(raw.draftId ?? "");
    const cardId = String(raw.cardId ?? "");
    if (!/^[a-f0-9]{32}$/.test(draftId) || !/^[a-f0-9]{32}$/.test(cardId)) throw new Error("That card conversation is missing.");
    return { draftId, cardId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return adoptionPacket(sql, context.userId, data.draftId, data.cardId);
  });

export const prepareEncounterDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { draftId?: unknown; cardId?: unknown; messages?: unknown };
    const draftId = String(raw.draftId ?? "");
    const cardId = String(raw.cardId ?? "");
    if (!/^[a-f0-9]{32}$/.test(draftId) || !/^[a-f0-9]{32}$/.test(cardId)) throw new Error("That card conversation is missing.");
    const messages = Array.isArray(raw.messages) ? raw.messages.slice(0, 40).map((message) => {
      const row = message as { id?: unknown; role?: unknown; content?: unknown; hidden?: unknown };
      return {
        id: String(row.id ?? "").slice(0, 40),
        role: row.role === "assistant" ? "assistant" : "user",
        content: String(row.content ?? "").slice(0, 2400),
        hidden: row.hidden === true,
      };
    }) : [];
    return { draftId, cardId, messages };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const packet = await adoptionPacket(sql, context.userId, data.draftId, data.cardId);
    const source = packet.source;
    return prepareDraft({
      name: source.name,
      core: source.core,
      upright: source.upright,
      shadow: source.shadow,
      keywords: source.keywords,
    }, data.messages, null);
  });

export const readEncounterCollection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const collectionId = String((input as { collectionId?: unknown })?.collectionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(collectionId)) throw new Error("That deck is missing.");
    return { collectionId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return collectionDetail(sql, context.userId, data.collectionId);
  });

export const setEncounterLock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { membershipId?: unknown; locked?: unknown };
    const membershipId = String(raw.membershipId ?? "");
    if (!/^[a-f0-9]{32}$/.test(membershipId)) throw new Error("That card is missing.");
    return { membershipId, locked: raw.locked === true };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => setLock(tx, context.userId, data));
  });

export const copyEncounterMembership = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { adoptedId?: unknown; collectionId?: unknown };
    const adoptedId = String(raw.adoptedId ?? "");
    const collectionId = String(raw.collectionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(adoptedId) || !/^[a-f0-9]{32}$/.test(collectionId)) throw new Error("Choose a card and a deck.");
    return { adoptedId, collectionId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => addToCollection(tx, context.userId, data));
  });

export const moveEncounterMembership = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { membershipId?: unknown; collectionId?: unknown };
    const membershipId = String(raw.membershipId ?? "");
    const collectionId = String(raw.collectionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(membershipId) || !/^[a-f0-9]{32}$/.test(collectionId)) {
      throw new Error("Choose a card and a deck.");
    }
    return { membershipId, collectionId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => moveMembership(tx, context.userId, data));
  });

export const previewEncounterStyle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as {
      collectionId?: unknown;
      scope?: unknown;
      presetId?: unknown;
      key?: unknown;
      confirmUnlockAll?: unknown;
      prompt?: unknown;
      styleTouched?: unknown;
      interpretiveFreedom?: unknown;
      freedomTouched?: unknown;
    };
    if (raw.prompt != null && String(raw.prompt).trim()) throw new Error("Custom style prompts are not part of this release.");
    const collectionId = String(raw.collectionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(collectionId)) throw new Error("That deck is missing.");
    const scope = raw.scope === "unlock_all" ? "unlock_all" : "unlocked_only";
    const freedomTouched = raw.freedomTouched === true;
    const interpretiveFreedom = raw.interpretiveFreedom == null || raw.interpretiveFreedom === ""
      ? null
      : Number(raw.interpretiveFreedom);
    if (freedomTouched && !Number.isFinite(interpretiveFreedom)) throw new Error("Set interpretive freedom between 0 and 100.");
    return {
      collectionId,
      scope,
      presetId: String(raw.presetId ?? ""),
      idempotencyKey: keyOf(raw.key),
      confirmUnlockAll: raw.confirmUnlockAll === true,
      styleTouched: raw.styleTouched === true ? true : raw.styleTouched === false ? false : undefined,
      interpretiveFreedom,
      freedomTouched,
    };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => previewStyle(tx, context.userId, data));
  });

export const publishEncounterStyle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { jobId?: unknown; approved?: unknown };
    const jobId = String(raw.jobId ?? "");
    if (!/^[a-f0-9]{32}$/.test(jobId)) throw new Error("That preview is missing.");
    return { jobId, approved: raw.approved === true };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => publishStyle(tx, context.userId, data));
  });

export const readEncounterGeometry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const cardId = Number((input as { cardId?: unknown })?.cardId);
    if (!Number.isInteger(cardId) || cardId <= 0) throw new Error("That card is missing.");
    return { cardId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return geometryForDeckCard(sql, context.userId, data.cardId);
  });

export const cancelEncounterStyle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const jobId = String((input as { jobId?: unknown })?.jobId ?? "");
    if (!/^[a-f0-9]{32}$/.test(jobId)) throw new Error("That preview is missing.");
    return { jobId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => cancelStyle(tx, context.userId, data.jobId));
  });

function archiveJournal(value: unknown, includeConversations: boolean) {
  if (!value || typeof value !== "object") return null;
  const raw = value as { readings?: unknown; dreams?: unknown; rituals?: unknown; labels?: unknown; conversations?: unknown };
  const take = (items: unknown, limit: number) => (Array.isArray(items) ? items.slice(0, limit) : []);
  const journal = {
    readings: take(raw.readings, 400),
    dreams: take(raw.dreams, 400),
    rituals: take(raw.rituals, 400),
    labels: take(raw.labels, 80),
    conversations: includeConversations ? take(raw.conversations, 80) : [],
  };
  if (JSON.stringify(journal).length > 1_500_000) throw new Error("That journal selection is too large.");
  return journal;
}

function archiveBytes(value: unknown) {
  const text = String(value ?? "");
  if (!text || text.length > 64_000_000) throw new Error("That archive is too large.");
  return Buffer.from(text, "base64");
}

export const exportVelomereDeckArchive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const collectionId = String((input as { collectionId?: unknown })?.collectionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(collectionId)) throw new Error("Choose an Encounter deck.");
    return { collectionId };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const archive = await exportVelomereArchive(sql, context.userId, { scope: "deck", collectionId: data.collectionId });
    return {
      filename: archive.filename,
      base64: Buffer.from(archive.bytes).toString("base64"),
      manifest: archive.manifest,
    };
  });

export const exportVelomereCompleteArchive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { journal?: unknown; includeConversations?: unknown; includeDrafts?: unknown; reader?: { includeReversals?: unknown; shuffleLocked?: unknown } };
    const reversals = raw.reader?.includeReversals;
    const shuffle = raw.reader?.shuffleLocked;
    return {
      journal: archiveJournal(raw.journal, raw.includeConversations === true),
      includeConversations: raw.includeConversations === true,
      includeDrafts: raw.includeDrafts === true,
      reader: {
        includeReversals: reversals === true || reversals === false ? reversals : null,
        shuffleLocked: shuffle === true || shuffle === false ? shuffle : null,
      },
    };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const archive = await exportVelomereArchive(sql, context.userId, {
      scope: "complete",
      journal: data.journal,
      includeConversations: data.includeConversations,
      includeDrafts: data.includeDrafts,
      reader: data.reader,
    });
    return {
      filename: archive.filename,
      base64: Buffer.from(archive.bytes).toString("base64"),
      manifest: archive.manifest,
    };
  });

export const previewVelomereArchive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ bytes: archiveBytes((input as { base64?: unknown })?.base64) }))
  .handler(async ({ data, context }) => {
    const inspected = inspectArchive(data.bytes);
    const sql = await getSql();
    const conflicts = await archiveConflicts(sql, context.userId, inspected);
    return {
      label: inspected.manifest.label,
      format: inspected.manifest.format,
      schema: inspected.manifest.schema,
      scope: inspected.manifest.scope,
      complete: inspected.manifest.complete === true,
      counts: inspected.manifest.counts,
      exclusions: inspected.manifest.exclusions,
      incomplete: inspected.manifest.incomplete,
      problems: inspected.problems,
      alreadyRestored: conflicts.alreadyRestored,
      sameMeaning: conflicts.sameMeaning,
      hasJournals: Boolean(inspected.journals),
      hasDrafts: (inspected.records.drafts || []).length > 0,
      journalCounts: inspected.journals
        ? {
            readings: inspected.journals.readings?.length || 0,
            dreams: inspected.journals.dreams?.length || 0,
            rituals: inspected.journals.rituals?.length || 0,
            conversations: inspected.journals.conversations?.length || 0,
          }
        : null,
    };
  });

export const importVelomereArchiveFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { base64?: unknown; mode?: unknown; applyPreferences?: unknown; applyDrafts?: unknown };
    const mode = raw.mode === "as-new" || raw.mode === "merge" ? raw.mode : "restore";
    return {
      bytes: archiveBytes(raw.base64),
      mode,
      applyPreferences: raw.applyPreferences === true,
      applyDrafts: raw.applyDrafts === true,
    };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const result = await withTransaction((tx) => importVelomereArchive(tx, context.userId, data.bytes, {
      mode: data.mode,
      applyPreferences: data.applyPreferences,
      applyDrafts: data.applyDrafts,
    }));
    return {
      status: result.status,
      mode: result.mode,
      label: result.label,
      complete: result.complete,
      created: result.created,
      preferencesApplied: result.preferencesApplied,
      localPreferences: result.localPreferences,
      exclusions: result.exclusions,
      incomplete: result.incomplete,
      journals: result.journals,
    };
  });

