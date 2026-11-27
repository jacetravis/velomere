"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NAME_LIMIT, THREAD_LIMIT, VOICE_LIMIT } from "@/lib/solace/voice";
import { carryReadingId, cleanOrigin, sameOrigin, type ConversationOrigin } from "@/lib/solace/origin";

export type SolaceTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  name?: string;
};

export type SolaceSitting = {
  title: string;
  detail: string;
  source: ConversationOrigin | null;
};

type SolaceState = {
  name: string;
  personality: string;
  messages: SolaceTurn[];
  shared: SolaceSitting | null;
  journalId: string | null;
  resumed: boolean;
  vowAt: string | null;
  setName: (value: string) => void;
  setPersonality: (value: string) => void;
  setShared: (value: SolaceSitting | null) => void;
  setSource: (source: ConversationOrigin | null) => void;
  openWith: (value: { title: string; detail: string; source?: ConversationOrigin | null }) => void;
  continueThread: (value: {
    journalId: string;
    turns: { role: "user" | "assistant"; content: string }[];
    title?: string;
    detail?: string;
    source?: ConversationOrigin | null;
  }) => void;
  setJournalId: (id: string | null) => void;
  pushTurn: (role: SolaceTurn["role"], content: string, name?: string) => void;
  clearMessages: () => void;
  acceptVow: () => void;
};

const KEEP = THREAD_LIMIT;

export const useSolace = create<SolaceState>()(
  persist(
    (set) => ({
      name: "Solace",
      personality: "",
      messages: [],
      shared: null,
      journalId: null,
      resumed: false,
      vowAt: null,
      setName: (value) => set({ name: value.slice(0, NAME_LIMIT) }),
      setPersonality: (value) => set({ personality: value.slice(0, VOICE_LIMIT) }),
      setShared: (value) =>
        set({
          shared: value
            ? {
                title: value.title.slice(0, 120),
                detail: value.detail.slice(0, 6000),
                source: cleanOrigin(value.source),
              }
            : null,
        }),
      setSource: (source) =>
        set((state) => {
          if (!state.shared) return {};
          return { shared: { ...state.shared, source: cleanOrigin(source) } };
        }),
      openWith: (value) =>
        set((state) => {
          const next = {
            title: value.title.slice(0, 120),
            detail: value.detail.slice(0, 6000),
            source: cleanOrigin(value.source),
          };
          const same =
            state.shared?.title === next.title &&
            state.shared?.detail === next.detail &&
            sameOrigin(state.shared?.source, next.source);
          if (same) return { shared: { ...next, source: carryReadingId(state.shared?.source, next.source) } };
          return { shared: next, messages: [], journalId: null, resumed: false, vowAt: null };
        }),
      continueThread: (value) =>
        set({
          journalId: value.journalId,
          messages: value.turns.slice(-KEEP).flatMap((turn) => {
            const content = turn.content.trim();
            if ((turn.role !== "user" && turn.role !== "assistant") || !content) return [];
            return [
              {
                id: crypto.randomUUID(),
                role: turn.role,
                content,
                ...(turn.role === "assistant" ? { name: "Solace" } : {}),
              },
            ];
          }),
          shared: value.title
            ? {
                title: value.title.slice(0, 120),
                detail: (value.detail ?? "").slice(0, 6000),
                source: cleanOrigin(value.source),
              }
            : null,
          resumed: true,
          vowAt: null,
        }),
      setJournalId: (id) => set({ journalId: id }),
      pushTurn: (role, content, name) =>
        set((state) => ({
          messages: [...state.messages, { id: crypto.randomUUID(), role, content, name }].slice(-KEEP),
        })),
      clearMessages: () => set({ messages: [], shared: null, journalId: null, resumed: false, vowAt: null }),
      acceptVow: () => set((state) => (state.vowAt ? {} : { vowAt: new Date().toISOString() })),
    }),
    {
      name: "solace-chat",
      version: 3,
      migrate: (persisted, version) => {
        const state = (persisted && typeof persisted === "object" ? persisted : {}) as {
          name?: string;
          personality?: string;
          messages?: SolaceTurn[];
        };
        if (version < 3) {
          state.personality = "";
          state.name = "Solace";
        }
        return state;
      },
    },
  ),
);
