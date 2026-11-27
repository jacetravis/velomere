"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getLibrary, saveLibrary } from "@/lib/journal/server";
import { shrinkDataUrl } from "@/lib/cards/image";
import { consentFrom, keptConsents } from "@/lib/consent";
import { cleanWebsite, cleanYoutube } from "@/lib/links";
import { conversationFromBackup } from "@/lib/journal/backup";
import { DEFAULT_LOOK, useJournal, type Conversation, type DeckLook, type Dream, type JournalLabel, type Reading, type Ritual } from "@/lib/journal/store";
import { readingHand, setReadingHand, setVelomereHand, velomereHand, type TableHand } from "@/lib/table-hands";
import type { UploadConsent } from "@/lib/consent";

const CLAIM_KEY = "lumen-library-claimed";

type LibraryData = {
  readings: Reading[];
  dreams: Dream[];
  rituals?: Ritual[];
  conversations?: Conversation[];
  deckLooks: Record<string, DeckLook>;
  deckOrder: number[];
  labels?: JournalLabel[];
  customSuits?: string[];
  suitOrders?: Record<string, string[]>;
  deckConsents?: Record<string, UploadConsent>;
  cardConsents?: Record<string, UploadConsent>;
  shuffleLocked?: boolean;
  shuffleVersion?: number;
  includeReversals: boolean;
  activeDeckId: number | null;
  edge: number;
  edgeColor: number;
  edgeSat: number;
  edgeLight: number;
  cardThickness: number;
  cardRadius: number;
  cardWidth: number;
  cardLength: number;
  cardLocked: boolean;
  cardTemplate: DeckLook["cardTemplate"];
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
  lookVersion?: number;
  readingHand?: TableHand;
  velomereHand?: TableHand;
};

let readyUserId: string | null = null;
const readyListeners = new Set<() => void>();

function setLibraryReady(userId: string | null) {
  if (readyUserId === userId) return;
  readyUserId = userId;
  for (const listener of readyListeners) listener();
}

export function useLibraryReady(userId: string | null): boolean {
  const current = useSyncExternalStore(
    (listener) => {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    () => readyUserId,
    () => null,
  );
  return userId !== null && current === userId;
}

function blankLibrary(): LibraryData {
  return {
    readings: [],
    dreams: [],
    rituals: [],
    conversations: [],
    deckLooks: {},
    deckOrder: [],
    labels: [],
    customSuits: [],
    suitOrders: {},
    deckConsents: {},
    cardConsents: {},
    shuffleLocked: true,
    includeReversals: false,
    activeDeckId: null,
    ...DEFAULT_LOOK,
    lookVersion: 1,
    readingHand: "right",
    velomereHand: "right",
  };
}

function snapshot(): LibraryData {
  const state = useJournal.getState();
  return {
    readings: state.readings ?? [],
    dreams: state.dreams ?? [],
    rituals: state.rituals ?? [],
    conversations: state.conversations ?? [],
    deckLooks: state.deckLooks ?? {},
    deckOrder: state.deckOrder ?? [],
    labels: state.labels ?? [],
    customSuits: state.customSuits ?? [],
    suitOrders: keptSuitOrders(state.suitOrders),
    deckConsents: keptConsents(state.deckConsents),
    cardConsents: keptConsents(state.cardConsents),
    shuffleLocked: state.shuffleLocked !== false,
    shuffleVersion: 1,
    includeReversals: state.includeReversals,
    activeDeckId: state.activeDeckId,
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
    lookVersion: 1,
    readingHand: readingHand(),
    velomereHand: velomereHand(),
  };
}

async function tightPicture(url: string | null | undefined, max: number) {
  if (!url || !url.startsWith("data:image/") || url.length <= 180_000) return url ?? null;
  try {
    return await shrinkDataUrl(url, max);
  } catch {
    return url;
  }
}

async function compactLibrary(data: LibraryData): Promise<LibraryData> {
  if (JSON.stringify(data).length < 900_000) return data;
  const deckLooks: Record<string, DeckLook> = {};
  for (const [id, look] of Object.entries(data.deckLooks ?? {})) {
    deckLooks[id] = {
      ...look,
      cardBack: await tightPicture(look.cardBack, 480),
      stockBack: look.stockBack ? await tightPicture(look.stockBack, 480) : look.stockBack,
      tableImage: await tightPicture(look.tableImage, 960),
    };
  }
  return {
    ...data,
    cardBack: await tightPicture(data.cardBack, 480),
    ...(data.stockBack ? { stockBack: await tightPicture(data.stockBack, 480) } : {}),
    tableImage: await tightPicture(data.tableImage, 960),
    deckLooks,
    readings: await Promise.all(
      (data.readings ?? []).map(async (reading) => ({
        ...reading,
        image: await tightPicture(reading.image, 720),
      })),
    ),
    rituals: await Promise.all(
      (data.rituals ?? []).map(async (ritual) => ({
        ...ritual,
        image: await tightPicture(ritual.image, 720),
      })),
    ),
  };
}

async function pushLibrary(data: LibraryData) {
  await saveLibrary({ data: await compactLibrary(data) });
}

function legacyDarkEdge(look: Partial<DeckLook> | undefined) {
  return (
    !!look &&
    look.edge === 100 &&
    look.edgeColor === 0 &&
    look.edgeSat === 0 &&
    look.edgeLight === 100
  );
}

function currentDarkLooks(data: Partial<LibraryData>): Partial<LibraryData> {
  if (data.lookVersion === 1) return data;
  const deckLooks = { ...(data.deckLooks ?? {}) };
  for (const [id, look] of Object.entries(deckLooks)) {
    if (legacyDarkEdge(look)) deckLooks[id] = { ...look, edgeLight: 26 };
  }
  return {
    ...data,
    ...(legacyDarkEdge(data) ? { edgeLight: 26 } : null),
    deckLooks,
    lookVersion: 1,
  };
}

function keptIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function clockTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

function keptLabels(value: unknown): JournalLabel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const label = item as Partial<JournalLabel>;
    const name = typeof label.name === "string" ? label.name.trim().slice(0, 32) : "";
    if (typeof label.id !== "string" || !name) return [];
    if (typeof label.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(label.color)) return [];
    return [{ id: label.id, name, color: label.color }];
  });
}

function keptSuitOrders(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key) || !Array.isArray(list)) continue;
    const suits = list
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase().slice(0, 40))
      .filter(Boolean)
      .slice(0, 40);
    if (suits.length > 0) out[key] = suits;
  }
  return out;
}

function asLibrary(saved: unknown): Partial<LibraryData> | null {
  let value = saved;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Partial<LibraryData>;
}

function applyLibrary(data: Partial<LibraryData>) {
  useJournal.setState({
    readings: Array.isArray(data.readings)
      ? data.readings.map((reading) => ({
          ...reading,
          question: typeof reading.question === "string" ? reading.question : "",
          deckName: typeof reading.deckName === "string" ? reading.deckName : "",
          cardName: typeof reading.cardName === "string" ? reading.cardName : "",
          manual: reading.manual === true,
          image: typeof reading.image === "string" ? reading.image : null,
          labelIds: keptIds(reading.labelIds),
          websiteUrl: cleanWebsite(typeof reading.websiteUrl === "string" ? reading.websiteUrl : "") || undefined,
          videoUrl: cleanYoutube(typeof reading.videoUrl === "string" ? reading.videoUrl : "") || undefined,
          consent: consentFrom(reading.consent) || undefined,
        }))
      : [],
    dreams: Array.isArray(data.dreams)
      ? data.dreams.map((dream) => ({
          ...dream,
          labelIds: keptIds(dream.labelIds),
          dreamedTime: clockTime(dream.dreamedTime) || undefined,
          websiteUrl: cleanWebsite(typeof dream.websiteUrl === "string" ? dream.websiteUrl : "") || undefined,
          videoUrl: cleanYoutube(typeof dream.videoUrl === "string" ? dream.videoUrl : "") || undefined,
          consent: consentFrom(dream.consent) || undefined,
        }))
      : [],
    ...(Array.isArray(data.rituals)
      ? {
          rituals: data.rituals.map((ritual) => ({
            ...ritual,
            labelIds: keptIds(ritual.labelIds),
            heldTime: clockTime(ritual.heldTime) || undefined,
            websiteUrl: cleanWebsite(typeof ritual.websiteUrl === "string" ? ritual.websiteUrl : "") || undefined,
            videoUrl: cleanYoutube(typeof ritual.videoUrl === "string" ? ritual.videoUrl : "") || undefined,
            consent: consentFrom(ritual.consent) || undefined,
            image:
              typeof ritual.image === "string" &&
              ritual.image.startsWith("data:image/") &&
              ritual.image.length <= 1_500_000
                ? ritual.image
                : null,
          })),
        }
      : {}),
    ...(Array.isArray(data.conversations)
      ? {
          conversations: data.conversations
            .map(conversationFromBackup)
            .filter((item): item is Conversation => item != null),
        }
      : {}),
    ...(Array.isArray(data.labels) ? { labels: keptLabels(data.labels) } : null),
    ...(Array.isArray(data.customSuits)
      ? {
          customSuits: data.customSuits
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim().toLowerCase().slice(0, 40))
            .filter(Boolean),
        }
      : {}),
    ...(data.suitOrders !== undefined ? { suitOrders: keptSuitOrders(data.suitOrders) } : {}),
    ...(data.deckConsents !== undefined ? { deckConsents: keptConsents(data.deckConsents) } : {}),
    ...(data.cardConsents !== undefined ? { cardConsents: keptConsents(data.cardConsents) } : {}),
    ...(typeof data.shuffleLocked === "boolean" ? { shuffleLocked: data.shuffleLocked } : {}),
    deckLooks: data.deckLooks && typeof data.deckLooks === "object" ? data.deckLooks : {},
    deckOrder: Array.isArray(data.deckOrder) ? data.deckOrder : [],
    includeReversals: data.includeReversals === true,
    activeDeckId: typeof data.activeDeckId === "number" ? data.activeDeckId : null,
    ...(typeof data.edge === "number" ? { edge: data.edge } : null),
    ...(typeof data.edgeColor === "number" ? { edgeColor: data.edgeColor } : null),
    ...(typeof data.edgeSat === "number" ? { edgeSat: data.edgeSat } : null),
    ...(typeof data.edgeLight === "number" ? { edgeLight: data.edgeLight } : null),
    ...(typeof data.cardThickness === "number" ? { cardThickness: data.cardThickness } : null),
    ...(typeof data.cardRadius === "number" ? { cardRadius: data.cardRadius } : null),
    ...(typeof data.cardWidth === "number" ? { cardWidth: data.cardWidth } : null),
    ...(typeof data.cardLength === "number" ? { cardLength: data.cardLength } : null),
    ...(typeof data.cardLocked === "boolean" ? { cardLocked: data.cardLocked } : null),
    ...(data.cardTemplate !== undefined ? { cardTemplate: data.cardTemplate } : null),
    ...(data.cardBack !== undefined ? { cardBack: data.cardBack } : null),
    ...(data.stockBack === null || typeof data.stockBack === "string" ? { stockBack: data.stockBack } : null),
    ...(typeof data.backX === "number" ? { backX: data.backX } : null),
    ...(typeof data.backY === "number" ? { backY: data.backY } : null),
    ...(typeof data.backScale === "number" ? { backScale: data.backScale } : null),
    ...(typeof data.backRotate === "number" ? { backRotate: data.backRotate } : null),
    ...(data.tableImage !== undefined ? { tableImage: typeof data.tableImage === "string" ? data.tableImage : null } : null),
    ...(typeof data.tableX === "number" ? { tableX: data.tableX } : null),
    ...(typeof data.tableY === "number" ? { tableY: data.tableY } : null),
    ...(typeof data.tableScale === "number" ? { tableScale: data.tableScale } : null),
    ...(typeof data.tableRotate === "number" ? { tableRotate: data.tableRotate } : null),
    ...(typeof data.tableColor === "number" ? { tableColor: data.tableColor } : null),
    ...(typeof data.tableSat === "number" ? { tableSat: data.tableSat } : null),
    ...(typeof data.tableLight === "number" ? { tableLight: data.tableLight } : null),
    ...(typeof data.tableContrast === "number" ? { tableContrast: data.tableContrast } : null),
    ...(typeof data.tableVignette === "number" ? { tableVignette: data.tableVignette } : null),
  });
  if (data.readingHand === "left" || data.readingHand === "right") setReadingHand(data.readingHand);
  if (data.velomereHand === "left" || data.velomereHand === "right") setVelomereHand(data.velomereHand);
}

function waitForHydration() {
  if (useJournal.persist.hasHydrated()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const unsub = useJournal.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

export function LibrarySync() {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const ready = useRef<string | null>(null);

  useEffect(() => {
    if (isPending || !userId) {
      ready.current = null;
      setLibraryReady(null);
      return;
    }
    let cancel = false;
    ready.current = null;
    setLibraryReady(null);
    void (async () => {
      await waitForHydration();
      if (cancel) return;
      const saved = asLibrary(await getLibrary());
      if (cancel) return;
      const claim = window.localStorage.getItem(CLAIM_KEY);
      if (saved) {
        const next = currentDarkLooks(saved);
        const upgraded = saved.shuffleVersion === 1 ? next : { ...next, shuffleLocked: true };
        applyLibrary(upgraded);
        if (saved.lookVersion !== 1 || saved.shuffleVersion !== 1) await pushLibrary(snapshot());
      } else if (!claim) {
        window.localStorage.setItem(CLAIM_KEY, userId);
        await pushLibrary(snapshot());
      } else if (claim !== userId) {
        const blank = blankLibrary();
        applyLibrary(blank);
        await pushLibrary(blank);
      }
      if (cancel) return;
      ready.current = userId;
      setLibraryReady(userId);
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
    })().catch(() => {
      if (cancel) return;
      const claim = window.localStorage.getItem(CLAIM_KEY);
      if (claim && claim !== userId) applyLibrary(blankLibrary());
      ready.current = userId;
      setLibraryReady(userId);
    });
    return () => {
      cancel = true;
    };
  }, [userId, isPending, queryClient]);

  useEffect(() => {
    if (!userId) return;
    let timer = 0;
    const unsub = useJournal.subscribe(() => {
      if (ready.current !== userId) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void pushLibrary(snapshot()).catch(() => undefined);
      }, 800);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [userId]);

  return null;
}
