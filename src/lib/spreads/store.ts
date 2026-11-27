import { create } from "zustand";
import { persist } from "zustand/middleware";
import seeds from "@/data/standard-spreads.json";
import {
  drawNext,
  flipFirst,
  returnLatestWaiting,
  revealNextFromStack,
  stageSpread,
  startSession,
  type DrawnCard,
  type QuarterTurn,
  type Session,
  type SpreadDefinition,
  type SpreadPosition,
} from "@/lib/spreads/engine";

type SeedFile = {
  defaultActiveSpreadId: string;
  spreads: Array<{
    id: string;
    categoryId: string;
    name: string;
    description: string;
    openingQuestion: string;
    tileAsset: string;
    positions: Array<Omit<SpreadPosition, "angleNotes"> & { angleNotes: Record<string, string> }>;
  }>;
};

const file = seeds as SeedFile;

export function factorySpreads(): SpreadDefinition[] {
  return file.spreads.map((spread) => ({
    id: spread.id,
    name: spread.name,
    description: spread.description,
    openingQuestion: spread.openingQuestion,
    revision: 1,
    factoryTemplateId: spread.id,
    categoryId: "standard",
    tile: `/spreads/${spread.tileAsset.split("/").pop()}`,
    positions: spread.positions.map((position) => ({
      ...position,
      rotationDeg: position.rotationDeg as QuarterTurn,
      angleNotes: {
        "0": position.angleNotes["0"] ?? "",
        "90": position.angleNotes["90"] ?? "",
        "180": position.angleNotes["180"] ?? "",
        "270": position.angleNotes["270"] ?? "",
      },
    })),
  }));
}

const FACTORY = new Map(factorySpreads().map((spread) => [spread.id, spread]));

type SpreadState = {
  overlays: Record<string, SpreadDefinition>;
  custom: SpreadDefinition[];
  activeSpreadId: string;
  standardOrder: string[];
  customOrder: string[];
  sectionOrder: string[];
  session: Session | null;
  setActive: (id: string) => void;
  saveSpread: (spread: SpreadDefinition) => void;
  duplicate: (id: string) => string;
  resetStandard: (id: string) => void;
  removeCustom: (id: string) => void;
  setOrders: (orders: { standardOrder?: string[]; customOrder?: string[]; sectionOrder?: string[] }) => void;
  effective: (id: string) => SpreadDefinition | null;
  list: () => { standard: SpreadDefinition[]; mine: SpreadDefinition[] };
  begin: () => Session;
  draw: (requestId: string, card: DrawnCard) => Session;
  restoreLatest: () => number | null;
  stage: (requestId: string) => Session;
  flip: (requestId: string) => Session;
  deliver: (requestId: string) => Session;
  discard: () => void;
  adopt: (session: Session | null) => void;
  remember: (pullReason: string) => void;
};

function blankPosition(order: number): SpreadPosition {
  return {
    id: crypto.randomUUID(),
    order,
    name: `Position ${order}`,
    question: "What does this place ask of the card?",
    meaningApplication: "Read the card's own meaning through this position's question. Do not invent a meaning the deck does not have.",
    x: 0.5,
    y: 0.5,
    rotationDeg: 0,
    zIndex: order,
    angleNotes: {
      "0": "Upright: use the deck's upright meaning.",
      "90": "Sideways: do not treat this as reversed unless the note says so.",
      "180": "Reversed: use the deck's reversed meaning when it has one.",
      "270": "Sideways: do not treat this as reversed unless the note says so.",
    },
  };
}

export const useSpreads = create<SpreadState>()(
  persist(
    (set, get) => ({
      overlays: {},
      custom: [],
      activeSpreadId: file.defaultActiveSpreadId || "std-one-card",
      standardOrder: factorySpreads().map((spread) => spread.id),
      customOrder: [],
      sectionOrder: ["standard", "my-spreads"],
      session: null,
      setActive: (id) => set({ activeSpreadId: id }),
      saveSpread: (spread) => {
        const next = { ...spread, revision: Math.max(1, spread.revision) + (get().effective(spread.id) ? 1 : 0) };
        if (spread.categoryId === "my-spreads" || !FACTORY.has(spread.id)) {
          const custom = get().custom.some((item) => item.id === spread.id)
            ? get().custom.map((item) => (item.id === spread.id ? { ...next, categoryId: "my-spreads" as const } : item))
            : [...get().custom, { ...next, categoryId: "my-spreads" as const, factoryTemplateId: undefined }];
          const customOrder = get().customOrder.includes(next.id) ? get().customOrder : [...get().customOrder, next.id];
          set({ custom, customOrder });
          return;
        }
        set({ overlays: { ...get().overlays, [spread.id]: { ...next, categoryId: "standard", factoryTemplateId: spread.id } } });
      },
      duplicate: (id) => {
        const source = get().effective(id);
        if (!source) return "";
        const copy: SpreadDefinition = {
          ...source,
          id: `my-${crypto.randomUUID()}`,
          name: `${source.name} copy`,
          revision: 1,
          categoryId: "my-spreads",
          factoryTemplateId: undefined,
          positions: source.positions.map((position) => ({ ...position, id: crypto.randomUUID() })),
        };
        set({ custom: [...get().custom, copy], customOrder: [...get().customOrder, copy.id] });
        return copy.id;
      },
      resetStandard: (id) => {
        const overlays = { ...get().overlays };
        delete overlays[id];
        set({ overlays });
      },
      removeCustom: (id) => {
        const activeSpreadId = get().activeSpreadId === id ? file.defaultActiveSpreadId : get().activeSpreadId;
        set({
          custom: get().custom.filter((item) => item.id !== id),
          customOrder: get().customOrder.filter((item) => item !== id),
          activeSpreadId,
        });
      },
      setOrders: (orders) => set(orders),
      effective: (id) => get().overlays[id] ?? get().custom.find((item) => item.id === id) ?? FACTORY.get(id) ?? null,
      list: () => {
        const known = new Set(get().standardOrder);
        const order = [...get().standardOrder, ...factorySpreads().map((spread) => spread.id).filter((id) => !known.has(id))];
        const standard = order
          .map((id) => get().effective(id))
          .filter((item): item is SpreadDefinition => !!item)
          .sort((a, b) => a.positions.length - b.positions.length || a.name.localeCompare(b.name));
        const mine = get().customOrder.map((id) => get().custom.find((item) => item.id === id)).filter((item): item is SpreadDefinition => !!item);
        return { standard, mine };
      },
      begin: () => {
        const spread = get().effective(get().activeSpreadId) ?? FACTORY.get("std-one-card");
        if (!spread) throw new Error("No spread is selected.");
        const session = startSession(spread);
        set({ session });
        return session;
      },
      draw: (requestId, card) => {
        const current = get().session;
        if (!current) throw new Error("Start a reading first.");
        const session = drawNext(current, requestId, card);
        set({ session });
        return session;
      },
      restoreLatest: () => {
        const current = get().session;
        if (!current) return null;
        const returned = returnLatestWaiting(current);
        if (!returned) return null;
        set({ session: returned.session });
        return returned.cardId;
      },
      stage: (requestId) => {
        const current = get().session;
        if (!current) throw new Error("Start a reading first.");
        const session = stageSpread(current, requestId);
        set({ session });
        return session;
      },
      flip: (requestId) => {
        const current = get().session;
        if (!current) throw new Error("Start a reading first.");
        const session = flipFirst(current, current.version, requestId);
        set({ session });
        return session;
      },
      deliver: (requestId) => {
        const current = get().session;
        if (!current) throw new Error("Start a reading first.");
        const session = revealNextFromStack(current, current.nextOrderToDeliver, current.version, requestId);
        set({ session });
        return session;
      },
      discard: () => set({ session: null }),
      adopt: (session) => set({ session }),
      remember: (pullReason) => {
        const current = get().session;
        if (!current || !pullReason.trim()) return;
        set({ session: { ...current, pullReason: pullReason.trim() } });
      },
    }),
    {
      name: "solace-spreads",
      partialize: (state) => ({
        overlays: state.overlays,
        custom: state.custom,
        activeSpreadId: state.activeSpreadId,
        standardOrder: state.standardOrder,
        customOrder: state.customOrder,
        sectionOrder: state.sectionOrder,
        session: state.session,
      }),
    },
  ),
);

export function newCustomSpread(): SpreadDefinition {
  return {
    id: `my-${crypto.randomUUID()}`,
    name: "Untitled spread",
    description: "",
    openingQuestion: "What is this reading for?",
    revision: 1,
    categoryId: "my-spreads",
    tile: "/spreads/one-card.svg",
    positions: [blankPosition(1)],
  };
}

export function renumber(positions: SpreadPosition[]) {
  return positions.map((position, index) => ({ ...position, order: index + 1, zIndex: position.zIndex || index + 1 }));
}
