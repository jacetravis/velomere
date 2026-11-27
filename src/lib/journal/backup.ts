import { consentFrom } from "../consent.ts";
import { cleanWebsite, cleanYoutube } from "../links.ts";
import { cleanOrigin } from "../solace/origin.ts";
import type { Conversation, Dream, JournalLabel, Reading, Ritual } from "./store";

function keptVow(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim().slice(0, 40);
  return Number.isNaN(new Date(text).getTime()) ? "" : text;
}

function keptLink(value: unknown, kind: "site" | "video") {
  if (typeof value !== "string") return "";
  return (kind === "site" ? cleanWebsite(value) : cleanYoutube(value)) ?? "";
}

function linkFields(value: { websiteUrl?: string; videoUrl?: string; consent?: unknown }) {
  const websiteUrl = keptLink(value.websiteUrl, "site");
  const videoUrl = keptLink(value.videoUrl, "video");
  const consent = consentFrom(value.consent);
  return {
    ...(websiteUrl ? { websiteUrl } : {}),
    ...(videoUrl ? { videoUrl } : {}),
    ...(consent ? { consent } : {}),
  };
}

function labelIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function clockTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

export function labelFromBackup(value: unknown): JournalLabel | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<JournalLabel>;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 32) : "";
  if (typeof raw.id !== "string" || !name) return null;
  if (typeof raw.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(raw.color)) return null;
  return { id: raw.id, name, color: raw.color };
}

export function readingToBackup(reading: Reading) {
  return {
    id: reading.id,
    cardId: reading.cardId,
    cardName: reading.cardName,
    suit: reading.suit,
    rank: reading.rank,
    orientation: reading.orientation,
    keywords: reading.keywords,
    meaningSnapshot: reading.meaningSnapshot,
    notes: reading.notes ?? "",
    question: reading.question ?? "",
    pulledAt: reading.pulledAt,
    updatedAt: reading.updatedAt,
    deckId: reading.deckId ?? null,
    deckName: reading.deckName ?? "",
    manual: reading.manual === true,
    image: typeof reading.image === "string" ? reading.image : null,
    labelIds: labelIds(reading.labelIds),
    ...linkFields(reading),
    ...(reading.spreadSessionId
      ? {
          spreadSessionId: reading.spreadSessionId,
          ...(reading.spreadCover ? { spreadCover: reading.spreadCover } : {}),
          ...(reading.spreadName ? { spreadName: reading.spreadName } : {}),
        }
      : {}),
  };
}

export function readingFromBackup(value: unknown): Reading | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Reading>;
  if (typeof raw.id !== "string" || typeof raw.cardName !== "string") return null;
  const pulledAt = typeof raw.pulledAt === "string" ? raw.pulledAt : new Date().toISOString();
  return {
    id: raw.id,
    cardId: typeof raw.cardId === "number" ? raw.cardId : 0,
    cardName: raw.cardName,
    suit: typeof raw.suit === "string" ? raw.suit : "",
    rank: typeof raw.rank === "string" ? raw.rank : "",
    orientation: raw.orientation === "reversed" ? "reversed" : "upright",
    keywords: typeof raw.keywords === "string" ? raw.keywords : "",
    meaningSnapshot: typeof raw.meaningSnapshot === "string" ? raw.meaningSnapshot : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    question: typeof raw.question === "string" ? raw.question : "",
    pulledAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : pulledAt,
    deckId: typeof raw.deckId === "number" ? raw.deckId : null,
    deckName: typeof raw.deckName === "string" ? raw.deckName : "",
    manual: raw.manual === true,
    image:
      typeof raw.image === "string" &&
      raw.image.startsWith("data:image/") &&
      raw.image.length <= 1_500_000
        ? raw.image
        : null,
    labelIds: labelIds(raw.labelIds),
    ...linkFields(raw),
    ...(typeof raw.spreadSessionId === "string"
      ? {
          spreadSessionId: raw.spreadSessionId.slice(0, 80),
          ...(typeof raw.spreadCover === "string" ? { spreadCover: raw.spreadCover.slice(0, 240) } : {}),
          ...(typeof raw.spreadName === "string" ? { spreadName: raw.spreadName.slice(0, 80) } : {}),
        }
      : {}),
  };
}

export function dreamToBackup(dream: Dream) {
  return {
    id: dream.id,
    title: dream.title ?? "",
    body: dream.body,
    dreamedOn: dream.dreamedOn,
    ...(dream.dreamedTime ? { dreamedTime: dream.dreamedTime } : {}),
    createdAt: dream.createdAt,
    updatedAt: dream.updatedAt,
    labelIds: labelIds(dream.labelIds),
    ...linkFields(dream),
  };
}

export function dreamFromBackup(value: unknown): Dream | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Dream>;
  if (typeof raw.id !== "string" || typeof raw.body !== "string" || !raw.body.trim()) return null;
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  const dreamedOn =
    typeof raw.dreamedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dreamedOn)
      ? raw.dreamedOn
      : createdAt.slice(0, 10);
  const dreamedTime = clockTime(raw.dreamedTime);
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "",
    body: raw.body,
    dreamedOn,
    ...(dreamedTime ? { dreamedTime } : {}),
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    labelIds: labelIds(raw.labelIds),
    ...linkFields(raw),
  };
}

function keptImage(value: unknown) {
  return typeof value === "string" && value.startsWith("data:image/") && value.length <= 1_500_000
    ? value
    : null;
}

export function ritualToBackup(ritual: Ritual) {
  return {
    id: ritual.id,
    title: ritual.title ?? "",
    body: ritual.body,
    heldOn: ritual.heldOn,
    ...(ritual.heldTime ? { heldTime: ritual.heldTime } : {}),
    createdAt: ritual.createdAt,
    updatedAt: ritual.updatedAt,
    labelIds: labelIds(ritual.labelIds),
    image: keptImage(ritual.image),
    ...linkFields(ritual),
  };
}

export function ritualFromBackup(value: unknown): Ritual | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Ritual>;
  if (typeof raw.id !== "string" || typeof raw.body !== "string" || !raw.body.trim()) return null;
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  const heldOn =
    typeof raw.heldOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.heldOn)
      ? raw.heldOn
      : createdAt.slice(0, 10);
  const heldTime = clockTime(raw.heldTime);
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "",
    body: raw.body,
    heldOn,
    ...(heldTime ? { heldTime } : {}),
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    labelIds: labelIds(raw.labelIds),
    image: keptImage(raw.image),
    ...linkFields(raw),
  };
}

export function conversationToBackup(conversation: Conversation) {
  const origin = cleanOrigin(conversation.origin);
  const vowAt = keptVow(conversation.vowAt);
  return {
    id: conversation.id,
    savedAt: conversation.savedAt,
    updatedAt: conversation.updatedAt,
    turns: conversation.turns.map((turn) => ({ role: turn.role, content: turn.content })),
    ...(origin ? { origin } : {}),
    ...(vowAt ? { vowAt } : {}),
  };
}

export function conversationFromBackup(value: unknown): Conversation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Conversation>;
  if (typeof raw.id !== "string" || !Array.isArray(raw.turns)) return null;
  const turns = raw.turns.flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const role = turn.role;
    const content = typeof turn.content === "string" ? turn.content.trim().slice(0, 4000) : "";
    if ((role !== "user" && role !== "assistant") || !content) return [];
    return [{ role, content }];
  });
  if (turns.length === 0) return null;
  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString();
  const origin = cleanOrigin((raw as { origin?: unknown }).origin);
  const vowAt = keptVow((raw as { vowAt?: unknown }).vowAt);
  return {
    id: raw.id,
    savedAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : savedAt,
    turns,
    ...(origin ? { origin } : {}),
    ...(vowAt ? { vowAt } : {}),
  };
}
