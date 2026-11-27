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
  listCollections,
  openSession,
  paintReservedNext,
  paintReservedPair,
  previewStyle,
  publishStyle,
  pullNext,
  pullPair,
  readSession,
  reserveInitialCut,
  reserveNextCut,
  reshuffle,
  retryReserved,
  revealPair,
  setLock,
} from "./store.mjs";
import { prepareDraft } from "./draft-fields.mjs";

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
        core: String(personalIn.core ?? "").slice(0, 600),
        upright: String(personalIn.upright ?? "").slice(0, 800),
        shadow: String(personalIn.shadow ?? "").slice(0, 800),
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
    const style = String(raw.style ?? "living_matter");
    const styles = ["living_matter", "prismatic_geometry", "forged_relief", "veiled_luminescence"];
    if (!styles.includes(style)) throw new Error("Choose one of the four styles. Custom prompts are not part of this release.");
    return { name, description: String(raw.description ?? "").slice(0, 280), style };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    return withTransaction((tx) => createCollection(tx, context.userId, data.name, { description: data.description, style: data.style }));
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
        content: String(row.content ?? "").slice(0, 2000),
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

export const previewEncounterStyle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { collectionId?: unknown; scope?: unknown; presetId?: unknown; key?: unknown; confirmUnlockAll?: unknown; prompt?: unknown };
    if (raw.prompt != null && String(raw.prompt).trim()) throw new Error("Custom style prompts are not part of this release.");
    const collectionId = String(raw.collectionId ?? "");
    if (!/^[a-f0-9]{32}$/.test(collectionId)) throw new Error("That deck is missing.");
    const scope = raw.scope === "unlock_all" ? "unlock_all" : "unlocked_only";
    return {
      collectionId,
      scope,
      presetId: String(raw.presetId ?? ""),
      idempotencyKey: keyOf(raw.key),
      confirmUnlockAll: raw.confirmUnlockAll === true,
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
