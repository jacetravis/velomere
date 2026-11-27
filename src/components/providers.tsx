"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LibrarySync } from "@/lib/journal/sync";
import { useJournal } from "@/lib/journal/store";
import { FRESH_DECK_BACK } from "@/lib/deck-backs";
import { subscribeTheme, themeById, themeId, DEFAULT_THEME } from "@/lib/themes";
import "@/lib/install-app";

const warmed = new Set<string>();

function warmImage(src: string) {
  if (!src || warmed.has(src)) return;
  warmed.add(src);
  const image = new Image();
  image.decoding = "sync";
  image.src = src;
  void image.decode?.().catch(() => undefined);
}

function DeckImageWarmup() {
  const cardBack = useJournal((s) => {
    const id = s.activeDeckId;
    const saved = id != null ? s.deckLooks[String(id)] : undefined;
    return (saved ? saved.cardBack : s.cardBack) || FRESH_DECK_BACK;
  });
  useEffect(() => {
    warmImage(cardBack || FRESH_DECK_BACK);
  }, [cardBack]);
  return null;
}

function ThemeRoot() {
  const id = useSyncExternalStore(subscribeTheme, themeId, () => DEFAULT_THEME);
  if (typeof document !== "undefined") {
    const scheme = themeById(id).scheme === "light" ? "only light" : "only dark";
    document.documentElement.dataset.theme = id;
    document.documentElement.style.colorScheme = scheme;
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute("content", scheme);
  }
  return null;
}

function ThemedToaster() {
  const id = useSyncExternalStore(subscribeTheme, themeId, () => DEFAULT_THEME);
  return (
    <Toaster
      theme={themeById(id).scheme}
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: "bg-surface text-fg border-border shadow-card",
        },
      }}
    />
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <DeckImageWarmup />
      <ThemeRoot />
      <LibrarySync />
      {children}
      <ThemedToaster />
    </QueryClientProvider>
  );
}
