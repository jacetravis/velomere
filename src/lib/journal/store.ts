"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { LIBRARY } from "@/lib/cards/library";
import { isSuit, normalizeSuit } from "@/lib/cards/types";
import type { CardTemplateId } from "@/lib/cards/shape";
import type { UploadConsent } from "@/lib/consent";
import { cleanOrigin, type ConversationOrigin } from "@/lib/solace/origin";

export type Orientation = "upright" | "reversed";

export type DeckLook = {
  edge: number;
  edgeColor: number;
  edgeSat: number;
  edgeLight: number;
  cardThickness: number;
  cardRadius: number;
  cardWidth: number;
  cardLength: number;
  cardLocked: boolean;
  cardTemplate: CardTemplateId | null;
  cardBack: string | null;
  stockBack?: string | null;
  backX: number;
  backY: number;
  backScale: number;
  backRotate: number;
  tableImage: string | null;
  tableX: number;
  tableY: number;
  tableScale: number;
  tableRotate: number;
  tableColor: number;
  tableSat: number;
  tableLight: number;
  tableContrast: number;
  tableVignette: number;
};

export type Reading = {
  id: string;
  cardId: number;
  cardName: string;
  suit: string;
  rank: string;
  orientation: Orientation;
  keywords: string;
  meaningSnapshot: string;
  notes: string;
  question: string;
  pulledAt: string;
  updatedAt: string;
  deckId: number | null;
  deckName: string;
  manual: boolean;
  image: string | null;
  labelIds: string[];
  websiteUrl?: string;
  videoUrl?: string;
  consent?: UploadConsent;
  spreadSessionId?: string;
  spreadCover?: string;
  spreadName?: string;
};

export type Dream = {
  id: string;
  title: string;
  body: string;
  dreamedOn: string;
  dreamedTime?: string;
  createdAt: string;
  updatedAt: string;
  labelIds: string[];
  websiteUrl?: string;
  videoUrl?: string;
  consent?: UploadConsent;
};

export type Ritual = {
  id: string;
  title: string;
  body: string;
  heldOn: string;
  heldTime?: string;
  createdAt: string;
  updatedAt: string;
  labelIds: string[];
  image: string | null;
  websiteUrl?: string;
  videoUrl?: string;
  consent?: UploadConsent;
};

export type JournalLabel = {
  id: string;
  name: string;
  color: string;
};

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type Conversation = {
  id: string;
  savedAt: string;
  updatedAt: string;
  turns: ConversationTurn[];
  origin?: ConversationOrigin;
  vowAt?: string;
};

export const DEFAULT_LOOK: DeckLook = {
  edge: 100,
  edgeColor: 0,
  edgeSat: 0,
  edgeLight: 26,
  cardThickness: 75,
  cardRadius: 5,
  cardWidth: 55,
  cardLength: 55,
  cardLocked: true,
  cardTemplate: "tarot",
  cardBack: null,
  backX: 0,
  backY: 0,
  backScale: 100,
  backRotate: 0,
  tableImage: null,
  tableX: 0,
  tableY: 0,
  tableScale: 100,
  tableRotate: 0,
  tableColor: 0,
  tableSat: 100,
  tableLight: 100,
  tableContrast: 100,
  tableVignette: 18,
};

export const LIGHT_LOOK: DeckLook = {
  ...DEFAULT_LOOK,
  edge: 16,
  edgeColor: 36,
  edgeSat: 18,
  edgeLight: 94,
};

const LOOK_KEYS = Object.keys(DEFAULT_LOOK) as (keyof DeckLook)[];

export function completeLook(look?: Partial<DeckLook> | null): DeckLook {
  return { ...DEFAULT_LOOK, ...(look ?? {}) };
}

function lookFrom(state: DeckLook): DeckLook {
  return {
    edge: state.edge,
    edgeColor: state.edgeColor,
    edgeSat: state.edgeSat,
    edgeLight: state.edgeLight,
    cardThickness: state.cardThickness,
    cardRadius: state.cardRadius,
    cardWidth: state.cardWidth,
    cardLength: state.cardLength,
    cardLocked: state.cardLocked,
    cardTemplate: state.cardTemplate,
    cardBack: state.cardBack,
    ...(state.stockBack !== undefined ? { stockBack: state.stockBack } : {}),
    backX: state.backX,
    backY: state.backY,
    backScale: state.backScale,
    backRotate: state.backRotate,
    tableImage: state.tableImage,
    tableX: state.tableX,
    tableY: state.tableY,
    tableScale: state.tableScale,
    tableRotate: state.tableRotate,
    tableColor: state.tableColor,
    tableSat: state.tableSat,
    tableLight: state.tableLight,
    tableContrast: state.tableContrast,
    tableVignette: state.tableVignette,
  };
}

function looksEqual(a: DeckLook, b: DeckLook) {
  return LOOK_KEYS.every((key) => a[key] === b[key]) && a.stockBack === b.stockBack;
}

function nowIso() {
  return new Date().toISOString();
}

function ids(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function clockTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

function keptVow(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim().slice(0, 40);
  return Number.isNaN(new Date(text).getTime()) ? "" : text;
}

function picture(value: unknown) {
  return typeof value === "string" && value.startsWith("data:image/") && value.length <= 1_500_000 ? value : null;
}

export function cleanConversationTurns(messages: { role?: string; content?: string }[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const message of messages.slice(-80)) {
    const content = typeof message.content === "string" ? message.content.trim().slice(0, 4000) : "";
    if ((message.role !== "user" && message.role !== "assistant") || !content) continue;
    turns.push({ role: message.role, content });
  }
  return turns;
}

function upsert<T extends { id: string }>(current: T[], incoming: T[]) {
  const next = new Map(incoming.map((item) => [item.id, item]));
  return [...incoming, ...current.filter((item) => !next.has(item.id))];
}

type ReadingDraft = {
  cardId: number;
  cardName: string;
  suit: string;
  rank: string;
  orientation: Orientation;
  keywords: string;
  meaningSnapshot: string;
  notes?: string;
  question?: string;
  pulledAt?: string;
  deckId?: number | null;
  deckName?: string;
  manual?: boolean;
  image?: string | null;
  labelIds?: string[];
  websiteUrl?: string;
  videoUrl?: string;
  consent?: UploadConsent;
  spreadSessionId?: string;
  spreadCover?: string;
  spreadName?: string;
};

type JournalData = {
  readings: Reading[];
  dreams: Dream[];
  rituals: Ritual[];
  conversations: Conversation[];
  labels: JournalLabel[];
  customSuits: string[];
  suitOrders: Record<string, string[]>;
  deckConsents: Record<string, UploadConsent>;
  cardConsents: Record<string, UploadConsent>;
  deckLooks: Record<string, DeckLook>;
  deckOrder: number[];
  shuffleLocked: boolean;
  includeReversals: boolean;
  activeDeckId: number | null;
} & DeckLook;

type JournalState = JournalData & {
  addReading: (draft: ReadingDraft) => Reading;
  updateReading: (id: string, patch: Partial<Reading>) => void;
  deleteReading: (id: string) => void;
  importReadings: (items: Reading[]) => void;
  alignReading: (
    id: string,
    next: { deckId: number; deckName: string; cardId: number; cardName: string; suit: string; rank: string; keywords: string },
  ) => void;
  remapReadings: (
    deckId: number,
    fromIds: number[],
    next: { cardId: number; cardName: string; suit: string; rank: string; keywords: string },
  ) => void;
  addDream: (draft: {
    title: string;
    body: string;
    dreamedOn: string;
    dreamedTime?: string;
    websiteUrl?: string;
    videoUrl?: string;
    consent?: UploadConsent;
  }) => Dream;
  updateDream: (
    id: string,
    patch: { title: string; body: string; dreamedOn: string; dreamedTime: string; websiteUrl?: string; videoUrl?: string },
  ) => void;
  deleteDream: (id: string) => void;
  importDreams: (items: Dream[]) => void;
  setDreamLabels: (id: string, labelIds: string[]) => void;
  addRitual: (draft: {
    title: string;
    body: string;
    heldOn: string;
    heldTime?: string;
    image?: string | null;
    websiteUrl?: string;
    videoUrl?: string;
    consent?: UploadConsent;
  }) => Ritual;
  updateRitual: (
    id: string,
    patch: {
      title: string;
      body: string;
      heldOn: string;
      heldTime: string;
      image: string | null;
      websiteUrl?: string;
      videoUrl?: string;
      consent?: UploadConsent;
    },
  ) => void;
  deleteRitual: (id: string) => void;
  importRituals: (items: Ritual[]) => void;
  setRitualLabels: (id: string, labelIds: string[]) => void;
  addLabel: (name: string, color: string) => JournalLabel | null;
  deleteLabel: (id: string) => void;
  importLabels: (items: JournalLabel[]) => void;
  addConversation: (turns: { role?: string; content?: string }[], origin?: ConversationOrigin | null, vowAt?: string) => Conversation | null;
  updateConversation: (id: string, turns: { role?: string; content?: string }[], origin?: ConversationOrigin | null, vowAt?: string) => boolean;
  importConversations: (items: Conversation[]) => void;
  deleteConversation: (id: string) => void;
  setIncludeReversals: (value: boolean) => void;
  setShuffleLocked: (value: boolean) => void;
  setActiveDeckId: (id: number) => void;
  setDeckOrder: (order: number[]) => void;
  ensureActiveLook: (id: number) => void;
  saveDeckLook: (id: number, look: Partial<DeckLook>) => void;
  commitDeckLook: (id: number, look: Partial<DeckLook>) => void;
  rememberSuit: (suit: string) => void;
  setSuitOrder: (deckId: number, order: string[]) => void;
  setDeckConsent: (deckId: number, consent: UploadConsent) => void;
  setCardConsent: (deckId: number, cardName: string, consent: UploadConsent) => void;
};

function fresh(): JournalData {
  return {
    readings: [],
    dreams: [],
    rituals: [],
    conversations: [],
    labels: [],
    customSuits: [],
    suitOrders: {},
    deckConsents: {},
    cardConsents: {},
    deckLooks: {},
    deckOrder: [],
    shuffleLocked: true,
    includeReversals: false,
    activeDeckId: null,
    ...DEFAULT_LOOK,
  };
}

function suitsOf(order: string[]) {
  return order
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase().slice(0, 40))
    .filter(Boolean)
    .slice(0, 40);
}

const memoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function phoneStorage(): StateStorage {
  if (typeof window === "undefined") return memoryStorage;
  let pending: { name: string; value: string } | null = null;
  let timer = 0;
  const flush = () => {
    if (!pending) return;
    const item = pending;
    pending = null;
    window.localStorage.setItem(item.name, item.value);
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  return {
    getItem: (name) => (pending?.name === name ? pending.value : window.localStorage.getItem(name)),
    setItem: (name, value) => {
      pending = { name, value };
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 250);
    },
    removeItem: (name) => {
      if (pending?.name === name) pending = null;
      window.localStorage.removeItem(name);
    },
  };
}

export const useJournal = create<JournalState>()(
  persist(
    (set, get) => ({
      ...fresh(),
      addReading: (draft) => {
        const pulledAt = draft.pulledAt && !Number.isNaN(new Date(draft.pulledAt).getTime()) ? draft.pulledAt : nowIso();
        const reading: Reading = {
          id: crypto.randomUUID(),
          cardId: draft.cardId,
          cardName: draft.cardName,
          suit: draft.suit,
          rank: draft.rank,
          orientation: draft.orientation === "reversed" ? "reversed" : "upright",
          keywords: draft.keywords ?? "",
          meaningSnapshot: draft.meaningSnapshot ?? "",
          notes: draft.notes ?? "",
          question: draft.question ?? "",
          pulledAt,
          updatedAt: nowIso(),
          deckId: typeof draft.deckId === "number" ? draft.deckId : null,
          deckName: draft.deckName ?? "",
          manual: draft.manual === true,
          image: picture(draft.image),
          labelIds: ids(draft.labelIds),
          ...(draft.websiteUrl ? { websiteUrl: draft.websiteUrl } : {}),
          ...(draft.videoUrl ? { videoUrl: draft.videoUrl } : {}),
          ...(draft.consent ? { consent: draft.consent } : {}),
          ...(draft.spreadSessionId
            ? { spreadSessionId: draft.spreadSessionId, spreadCover: draft.spreadCover, spreadName: draft.spreadName }
            : {}),
        };
        set((state) => ({ readings: [reading, ...state.readings] }));
        return reading;
      },
      updateReading: (id, patch) =>
        set((state) => ({
          readings: state.readings.map((reading) =>
            reading.id === id ? { ...reading, ...patch, id: reading.id, updatedAt: nowIso() } : reading,
          ),
        })),
      deleteReading: (id) => set((state) => ({ readings: state.readings.filter((reading) => reading.id !== id) })),
      importReadings: (items) => set((state) => ({ readings: upsert(state.readings, items) })),
      alignReading: (id, next) =>
        set((state) => ({
          readings: state.readings.map((reading) =>
            reading.id === id
              ? {
                  ...reading,
                  deckId: next.deckId,
                  deckName: next.deckName,
                  cardId: next.cardId,
                  cardName: next.cardName,
                  suit: next.suit,
                  rank: next.rank,
                  keywords: next.keywords,
                  updatedAt: nowIso(),
                }
              : reading,
          ),
        })),
      remapReadings: (deckId, fromIds, next) =>
        set((state) => ({
          readings: state.readings.map((reading) =>
            reading.deckId === deckId && fromIds.includes(reading.cardId)
              ? { ...reading, ...next, updatedAt: nowIso() }
              : reading,
          ),
        })),
      addDream: (draft) => {
        const createdAt = nowIso();
        const dreamedTime = clockTime(draft.dreamedTime);
        const dream: Dream = {
          id: crypto.randomUUID(),
          title: draft.title.trim().slice(0, 80),
          body: draft.body,
          dreamedOn: draft.dreamedOn,
          ...(dreamedTime ? { dreamedTime } : {}),
          createdAt,
          updatedAt: createdAt,
          labelIds: [],
          ...(draft.websiteUrl ? { websiteUrl: draft.websiteUrl } : {}),
          ...(draft.videoUrl ? { videoUrl: draft.videoUrl } : {}),
          ...(draft.consent ? { consent: draft.consent } : {}),
        };
        set((state) => ({ dreams: [dream, ...state.dreams] }));
        return dream;
      },
      updateDream: (id, patch) =>
        set((state) => ({
          dreams: state.dreams.map((dream) => {
            if (dream.id !== id) return dream;
            const dreamedTime = clockTime(patch.dreamedTime);
            return {
              ...dream,
              title: patch.title.trim().slice(0, 80),
              body: patch.body,
              dreamedOn: patch.dreamedOn,
              dreamedTime: dreamedTime || undefined,
              websiteUrl: patch.websiteUrl,
              videoUrl: patch.videoUrl,
              updatedAt: nowIso(),
            };
          }),
        })),
      deleteDream: (id) => set((state) => ({ dreams: state.dreams.filter((dream) => dream.id !== id) })),
      importDreams: (items) => set((state) => ({ dreams: upsert(state.dreams, items) })),
      setDreamLabels: (id, labelIds) =>
        set((state) => ({
          dreams: state.dreams.map((dream) => (dream.id === id ? { ...dream, labelIds: ids(labelIds), updatedAt: nowIso() } : dream)),
        })),
      addRitual: (draft) => {
        const createdAt = nowIso();
        const heldTime = clockTime(draft.heldTime);
        const ritual: Ritual = {
          id: crypto.randomUUID(),
          title: draft.title.trim().slice(0, 80),
          body: draft.body,
          heldOn: draft.heldOn,
          ...(heldTime ? { heldTime } : {}),
          createdAt,
          updatedAt: createdAt,
          labelIds: [],
          image: picture(draft.image),
          ...(draft.websiteUrl ? { websiteUrl: draft.websiteUrl } : {}),
          ...(draft.videoUrl ? { videoUrl: draft.videoUrl } : {}),
          ...(draft.consent ? { consent: draft.consent } : {}),
        };
        set((state) => ({ rituals: [ritual, ...state.rituals] }));
        return ritual;
      },
      updateRitual: (id, patch) =>
        set((state) => ({
          rituals: state.rituals.map((ritual) => {
            if (ritual.id !== id) return ritual;
            const heldTime = clockTime(patch.heldTime);
            return {
              ...ritual,
              title: patch.title.trim().slice(0, 80),
              body: patch.body,
              heldOn: patch.heldOn,
              heldTime: heldTime || undefined,
              image: picture(patch.image),
              websiteUrl: patch.websiteUrl,
              videoUrl: patch.videoUrl,
              ...(patch.consent ? { consent: patch.consent } : {}),
              updatedAt: nowIso(),
            };
          }),
        })),
      deleteRitual: (id) => set((state) => ({ rituals: state.rituals.filter((ritual) => ritual.id !== id) })),
      importRituals: (items) => set((state) => ({ rituals: upsert(state.rituals, items) })),
      setRitualLabels: (id, labelIds) =>
        set((state) => ({
          rituals: state.rituals.map((ritual) =>
            ritual.id === id ? { ...ritual, labelIds: ids(labelIds), updatedAt: nowIso() } : ritual,
          ),
        })),
      addLabel: (name, color) => {
        const kept = name.trim().slice(0, 32);
        if (!kept || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
        const label: JournalLabel = { id: crypto.randomUUID(), name: kept, color };
        set((state) => ({ labels: [...state.labels, label] }));
        return label;
      },
      deleteLabel: (id) =>
        set((state) => ({
          labels: state.labels.filter((label) => label.id !== id),
          readings: state.readings.map((reading) => ({ ...reading, labelIds: reading.labelIds.filter((item) => item !== id) })),
          dreams: state.dreams.map((dream) => ({ ...dream, labelIds: dream.labelIds.filter((item) => item !== id) })),
          rituals: state.rituals.map((ritual) => ({ ...ritual, labelIds: ritual.labelIds.filter((item) => item !== id) })),
        })),
      importLabels: (items) =>
        set((state) => {
          const seen = new Set(state.labels.map((label) => label.id));
          return { labels: [...state.labels, ...items.filter((label) => !seen.has(label.id))] };
        }),
      addConversation: (turns, origin, vowAt) => {
        const cleaned = cleanConversationTurns(turns);
        if (cleaned.length === 0) return null;
        const savedAt = nowIso();
        const kept = cleanOrigin(origin);
        const vow = keptVow(vowAt);
        const conversation: Conversation = {
          id: crypto.randomUUID(),
          savedAt,
          updatedAt: savedAt,
          turns: cleaned,
          ...(kept ? { origin: kept } : {}),
          ...(vow ? { vowAt: vow } : {}),
        };
        set((state) => ({ conversations: [conversation, ...state.conversations] }));
        return conversation;
      },
      updateConversation: (id, turns, origin, vowAt) => {
        const cleaned = cleanConversationTurns(turns);
        const current = get().conversations;
        if (cleaned.length === 0 || !current.some((conversation) => conversation.id === id)) return false;
        const kept = cleanOrigin(origin);
        const vow = keptVow(vowAt);
        set({
          conversations: current.map((conversation) =>
            conversation.id === id
              ? {
                  ...conversation,
                  turns: cleaned,
                  updatedAt: nowIso(),
                  ...(kept ? { origin: kept } : {}),
                  ...(vow ? { vowAt: vow } : {}),
                }
              : conversation,
          ),
        });
        return true;
      },
      importConversations: (items) => set((state) => ({ conversations: upsert(state.conversations, items) })),
      deleteConversation: (id) =>
        set((state) => ({ conversations: state.conversations.filter((conversation) => conversation.id !== id) })),
      setIncludeReversals: (value) => set({ includeReversals: value }),
      setShuffleLocked: (value) => set({ shuffleLocked: value }),
      setActiveDeckId: (id) =>
        set((state) => {
          const look = state.deckLooks[String(id)] ?? lookFrom(state);
          return { activeDeckId: id, ...look };
        }),
      setDeckOrder: (order) => set({ deckOrder: order.filter((id) => Number.isFinite(id)) }),
      ensureActiveLook: (id) =>
        set((state) => {
          const key = String(id);
          const look = state.deckLooks[key] ?? lookFrom(state);
          const has = !!state.deckLooks[key];
          if (has && state.activeDeckId === id && looksEqual(lookFrom(state), look)) return {};
          return {
            activeDeckId: id,
            deckLooks: has ? state.deckLooks : { ...state.deckLooks, [key]: look },
            ...look,
          };
        }),
      saveDeckLook: (id, look) =>
        set((state) => {
          const next = completeLook(look);
          const key = String(id);
          const prev = state.deckLooks[key];
          if (prev && looksEqual(prev, next)) return {};
          return { deckLooks: { ...state.deckLooks, [key]: next } };
        }),
      commitDeckLook: (id, look) =>
        set((state) => {
          const next = completeLook(look);
          const key = String(id);
          const deckLooks = { ...state.deckLooks, [key]: next };
          if (state.activeDeckId === id) return { deckLooks, ...next };
          return { deckLooks };
        }),
      rememberSuit: (suit) =>
        set((state) => {
          const name = normalizeSuit(suit);
          if (!name || name === "custom" || isSuit(name) || state.customSuits.includes(name)) return {};
          return { customSuits: [...state.customSuits, name].slice(0, 40) };
        }),
      setSuitOrder: (deckId, order) =>
        set((state) => ({
          suitOrders: { ...state.suitOrders, [String(deckId)]: suitsOf(order) },
        })),
      setDeckConsent: (deckId, consent) =>
        set((state) => ({ deckConsents: { ...state.deckConsents, [String(deckId)]: consent } })),
      setCardConsent: (deckId, cardName, consent) =>
        set((state) => ({
          cardConsents: { ...state.cardConsents, [`${deckId}:${cardName}`]: consent },
        })),
    }),
    {
      name: "lumen-journal",
      version: 18,
      storage: createJSONStorage(phoneStorage),
      partialize: (state) => ({
        readings: state.readings,
        dreams: state.dreams,
        rituals: state.rituals,
        conversations: state.conversations,
        labels: state.labels,
        customSuits: state.customSuits,
        suitOrders: state.suitOrders,
        deckConsents: state.deckConsents,
        cardConsents: state.cardConsents,
        deckLooks: state.deckLooks,
        deckOrder: state.deckOrder,
        shuffleLocked: state.shuffleLocked,
        includeReversals: state.includeReversals,
        activeDeckId: state.activeDeckId,
        ...lookFrom(state),
      }),
      migrate: (persisted, version) => {
        const state = (persisted && typeof persisted === "object" ? { ...(persisted as Record<string, unknown>) } : {}) as Record<string, any>;
        if (version < 12) {
          state.readings = Array.isArray(state.readings)
            ? state.readings.map((item: any) => ({ ...item, labelIds: ids(item?.labelIds) }))
            : [];
          state.dreams = Array.isArray(state.dreams)
            ? state.dreams.map((item: any) => ({ ...item, labelIds: ids(item?.labelIds) }))
            : [];
          state.rituals = Array.isArray(state.rituals)
            ? state.rituals.map((item: any) => ({
                ...item,
                labelIds: ids(item?.labelIds),
                image: typeof item?.image === "string" ? item.image : null,
              }))
            : [];
        }
        if (version < 13) {
          state.readings = (Array.isArray(state.readings) ? state.readings : []).map((item: any) => ({
            ...item,
            deckName: typeof item?.deckName === "string" ? item.deckName : "",
            cardName: typeof item?.cardName === "string" ? item.cardName : "",
          }));
        }
        if (version < 14) {
          state.customSuits = Array.isArray(state.customSuits)
            ? state.customSuits.filter((item: unknown) => typeof item === "string")
            : [];
          if (typeof state.shuffleLocked !== "boolean") state.shuffleLocked = true;
        }
        if (version < 15 && typeof state.shuffleLocked !== "boolean") state.shuffleLocked = true;
        if (version < 16 && !Array.isArray(state.conversations)) state.conversations = [];
        if (version < 17) {
          if (!state.deckConsents || typeof state.deckConsents !== "object") state.deckConsents = {};
          if (!state.cardConsents || typeof state.cardConsents !== "object") state.cardConsents = {};
        }
        if (version < 18) {
          const scrub = (back: unknown) =>
            typeof back === "string" && /\/cards\/velomere|\/cards\/procedural|card-back-velomere|card-border-velomere/i.test(back)
              ? "/cards/catalog/rider-waite-smith/back.jpg?v=2"
              : back;
          state.cardBack = scrub(state.cardBack);
          if (state.deckLooks && typeof state.deckLooks === "object") {
            for (const look of Object.values(state.deckLooks as Record<string, { cardBack?: unknown }>)) {
              if (look && typeof look === "object") look.cardBack = scrub(look.cardBack);
            }
          }
        }
        return state as JournalState;
      },
    },
  ),
);

export function applyStarterDecks(decks: { id: number; name: string; locked?: boolean }[]) {
  const state = useJournal.getState();
  const deckLooks = { ...state.deckLooks };
  const suitOrders = { ...state.suitOrders };
  let changed = false;
  const touchLook = (id: number, next: DeckLook) => {
    const key = String(id);
    const prev = deckLooks[key];
    if (prev && looksEqual(prev, next)) return;
    deckLooks[key] = next;
    changed = true;
  };
  const touchOrder = (id: number, order: readonly string[]) => {
    const key = String(id);
    const prev = suitOrders[key];
    if (prev && prev.join("\0") === order.join("\0")) return;
    suitOrders[key] = [...order];
    changed = true;
  };
  for (const deck of decks) {
    const name = deck.name.trim().toLowerCase();
    const spec = LIBRARY.find((item) => item.name.toLowerCase() === name);
    if (!spec || deck.locked === false) continue;
    const current = deckLooks[String(deck.id)];
    const next = completeLook({ ...spec.look, cardBack: spec.back });
    if (!current || !looksEqual(current, next)) touchLook(deck.id, next);
    touchOrder(deck.id, spec.suits);
  }
  if (changed) useJournal.setState({ deckLooks, suitOrders });
}
