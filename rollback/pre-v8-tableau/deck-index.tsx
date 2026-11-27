"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { VelomereEncounter } from "@/components/dendrite-encounter";
import { ConsentChecks } from "@/components/upload-consent";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDeck, createVelomereDeck, velomereDeckStatus, cancelVelomereDeck, deleteDeck, listDecks, type DeckRecord } from "@/lib/cards/server";
import labels from "@/lib/cards/d3-labels.json";
import { LIBRARY } from "@/lib/cards/library";
import type { UploadConsent } from "@/lib/consent";
import { DEFAULT_LOOK, LIGHT_LOOK, applyStarterDecks, completeLook, useJournal } from "@/lib/journal/store";
import { cn } from "@/lib/utils";

const START = Date.UTC(1900, 0, 1);
const DAY_SPAN = Math.round((Date.UTC(2100, 11, 31) - START) / 86400000);
const SUITS = ["major", "hearings", "paths", "returns", "sigils"];

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function civilDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= "2100-12-31";
}

function dayIndex(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.min(DAY_SPAN, Math.max(0, Math.round((Date.UTC(year, month - 1, day) - START) / 86400000)));
}

function dateFromIndex(index: number) {
  return new Date(START + index * 86400000).toISOString().slice(0, 10);
}

function affinityCopy(value: number) {
  if (value === 0) return { name: "Neutral — canonical interpretation only", phrase: "Date sets reproducible visual microdetail only." };
  const row = labels[value - 1];
  return row ? { name: row.name, phrase: row.phrase } : { name: "Unknown", phrase: "" };
}

function pinnedRank(deck: DeckRecord) {
  if (!deck.locked) return null;
  const name = deck.name.trim().toLowerCase();
  if (name === "velomere") return 0;
  const index = LIBRARY.findIndex((item) => item.name.toLowerCase() === name);
  return index >= 0 ? index + 1 : null;
}

export function DeckIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deckLooks = useJournal((s) => s.deckLooks);
  const deckOrder = useJournal((s) => s.deckOrder);
  const setDeckOrder = useJournal((s) => s.setDeckOrder);
  const ensureActiveLook = useJournal((s) => s.ensureActiveLook);
  const saveDeckLook = useJournal((s) => s.saveDeckLook);
  const setActiveDeckId = useJournal((s) => s.setActiveDeckId);
  const { user } = useCurrentUserState();
  const { data: decks, isLoading, isError, refetch } = useQuery({
    queryKey: ["decks"],
    queryFn: () => listDecks(),
    refetchOnMount: "always",
    enabled: user !== null,
  });

  const [naming, setNaming] = useState(false);
  const [sourcing, setSourcing] = useState(false);
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [theming, setTheming] = useState(false);
  const [shaping, setShaping] = useState(false);
  const [sourceKind, setSourceKind] = useState<"fresh" | "velomere">("fresh");
  const [sigilDate, setSigilDate] = useState(localToday);
  const [affinity, setAffinity] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [terms, setTerms] = useState(false);
  const [rights, setRights] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const [liveIds, setLiveIds] = useState<number[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeckRecord | null>(null);
  const liveRef = useRef<number[] | null>(null);
  const suppress = useRef(false);
  const trashRef = useRef<HTMLDivElement>(null);
  const keepName = useRef(false);
  const forgeToken = useRef("");
  const dragRef = useRef<number | null>(null);
  const orderedRef = useRef<DeckRecord[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const liftRef = useRef({ width: 0, height: 0, grabX: 0, grabY: 0 });
  const hoverRef = useRef(18);
  const placeRef = useRef(new Map<number, DOMRect>());

  useEffect(() => {
    if (!decks) return;
    applyStarterDecks(decks);
    const active = decks.find((item) => item.active);
    if (active) ensureActiveLook(active.id);
  }, [decks, ensureActiveLook]);

  const ordered = useMemo(() => {
    const list = [...(decks ?? [])];
    const pinned = list
      .filter((deck) => pinnedRank(deck) != null)
      .sort((a, b) => (pinnedRank(a) ?? 0) - (pinnedRank(b) ?? 0) || a.id - b.id);
    const pinnedIds = new Set(pinned.map((deck) => deck.id));
    const rest = list.filter((deck) => !pinnedIds.has(deck.id));
    const rank = new Map((deckOrder ?? []).map((id, index) => [id, index]));
    rest.sort((a, b) => {
      if (!deckOrder?.length) return a.id - b.id;
      const ar = rank.has(a.id) ? rank.get(a.id)! : 10000 + a.id;
      const br = rank.has(b.id) ? rank.get(b.id)! : 10000 + b.id;
      return ar - br;
    });
    return [...pinned, ...rest];
  }, [decks, deckOrder]);
  orderedRef.current = ordered;

  const shown = useMemo(() => {
    if (!liveIds) return ordered;
    const byId = new Map(ordered.map((deck) => [deck.id, deck]));
    return liveIds.map((id) => byId.get(id)).filter((deck): deck is DeckRecord => !!deck);
  }, [ordered, liveIds]);

  const orderKey = shown.map((deck) => deck.id).join(",");
  useLayoutEffect(() => {
    const nodes = gridRef.current?.querySelectorAll<HTMLElement>("[data-deck-id]");
    if (!nodes) return;
    const next = new Map<number, DOMRect>();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nodes.forEach((node) => {
      const id = Number(node.getAttribute("data-deck-id"));
      const rect = node.getBoundingClientRect();
      const prev = placeRef.current.get(id);
      if (prev && id !== dragRef.current) {
        const dx = prev.left - rect.left;
        const dy = prev.top - rect.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          node.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "translate(0px, 0px)" },
            ],
            { duration: reduce ? 0 : 480, easing: "cubic-bezier(0.22, 1.35, 0.32, 1)" },
          );
        }
      }
      next.set(id, rect);
    });
    placeRef.current = next;
  }, [orderKey]);

  const create = useMutation({
    mutationFn: (input: {
      name: string;
      sourceId: number | null;
      theme: "dark" | "light";
      consent: UploadConsent;
    }) => createDeck({ data: { name: input.name, sourceId: input.sourceId } }),
    onSuccess: (deck, input) => {
      useJournal.getState().setDeckConsent(deck.id, input.consent);
      if (input.theme === "light") saveDeckLook(deck.id, LIGHT_LOOK);
      else saveDeckLook(deck.id, DEFAULT_LOOK);
      const current = useJournal.getState().deckOrder ?? [];
      const visual = current.length ? current : ordered.map((item) => item.id);
      setDeckOrder([...visual.filter((id) => id !== deck.id), deck.id]);
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      setNaming(false);
      setSourcing(false);
      setTheming(false);
      setName("");
      setSourceId(null);
      setTheme("dark");
      void navigate({ to: "/deck/$deckId", params: { deckId: String(deck.id) } });
    },
    onError: (err: Error) => toast(err.message),
  });

  const forge = useMutation({
    mutationFn: async (input: { name: string; date: string; affinity: number; token: string; consent: UploadConsent }) => {
      const started = await createVelomereDeck({ data: { name: input.name, date: input.date, affinity: input.affinity, treatment: "relational-field", token: input.token } });
      const ready = (value: { id?: number; backUrl?: string } | null | undefined) =>
        value && typeof value.id === "number" ? value : null;
      const immediate = ready(started as { id?: number; backUrl?: string });
      if (immediate) return immediate;
      if (!started || typeof started !== "object" || !("accepted" in started) || !started.accepted) {
        throw new Error("The drawing did not start. Nothing was saved.");
      }
      const deadline = Date.now() + 8 * 60 * 1000;
      for (;;) {
        if (Date.now() > deadline) throw new Error("The deck took too long. Nothing was opened.");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const status = await velomereDeckStatus({ data: { token: input.token } });
        if (!status || typeof status !== "object") throw new Error("The drawing lost its reply. Nothing was opened.");
        if (status.status === "done") {
          const deck = ready(status.deck);
          if (!deck) throw new Error("The deck finished without an id. Nothing was opened.");
          return deck;
        }
        if (status.status === "error") throw new Error(status.message || "The deck could not be finished. Nothing was saved.");
      }
    },
    onSuccess: (deck, input) => {
      if (!deck?.id) {
        toast("The deck finished without an id. Nothing was opened.");
        return;
      }
      const journal = useJournal.getState();
      journal.setDeckConsent(deck.id, input.consent);
      journal.saveDeckLook(deck.id, completeLook({
        edge: 84,
        edgeColor: 0,
        edgeSat: 0,
        edgeLight: 26,
        cardThickness: 75,
        cardRadius: 7,
        cardWidth: 55,
        cardLength: 55,
        cardLocked: true,
        cardTemplate: "long-tarot",
        cardBack: deck.backUrl,
      }));
      for (const suit of SUITS) journal.rememberSuit(suit);
      journal.setSuitOrder(deck.id, SUITS);
      const current = journal.deckOrder ?? [];
      const visual = current.length ? current : ordered.map((item) => item.id);
      setDeckOrder([...visual.filter((id) => id !== deck.id), deck.id]);
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
      setShaping(false);
      setName("");
      setSourceId(null);
      setSourceKind("fresh");
      setAffinity(0);
      void navigate({ to: "/deck/$deckId", params: { deckId: String(deck.id) } });
    },
    onError: (err: Error) => toast(err.message),
  });

  const remove = useMutation({
    mutationFn: (deck: DeckRecord) => deleteDeck({ data: { id: deck.id } }),
    onSuccess: (_result, deck) => {
      const current = liveRef.current ?? useJournal.getState().deckOrder ?? [];
      setDeckOrder(current.filter((id) => id !== deck.id));
      liveRef.current = null;
      setLiveIds(null);
      setPendingDelete(null);
      if (deck.active) {
        const fallback = decks?.find((item) => item.locked && item.id !== deck.id);
        if (fallback) setActiveDeckId(fallback.id);
      }
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
      toast("Deck deleted");
    },
    onError: (err: Error) => toast(err.message),
  });

  const rememberLive = (ids: number[]) => {
    liveRef.current = ids;
    setLiveIds(ids);
  };

  const onTilePointerDown = (event: ReactPointerEvent<HTMLDivElement>, deckId: number) => {
    if (event.button !== 0 || dragRef.current != null) return;
    const held = orderedRef.current.find((item) => item.id === deckId);
    const locked = !!held?.locked;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const target = event.currentTarget;
    let mode: "pending" | "drag" | "scroll" = "pending";
    let tx = startX;
    let ty = startY;
    let cx = startX;
    let cy = startY;
    let lift = 0;
    let raf = 0;
    const stopLift = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const tick = () => {
      const node = floatRef.current;
      const box = liftRef.current;
      if (node && box.width) {
        const vx = tx - cx;
        cx += vx * 0.28;
        cy += (ty - cy) * 0.28;
        lift += (hoverRef.current - lift) * 0.2;
        const tilt = Math.max(-7, Math.min(7, vx * 0.12));
        node.style.opacity = "1";
        node.style.transform = `translate3d(${cx - box.grabX}px, ${cy - box.grabY - lift}px, 0) rotate(${tilt}deg) scale(1.045)`;
      }
      raf = requestAnimationFrame(tick);
    };
    let dwellTimer: number | null = null;
    let pendingOver = Number.NaN;
    let timer: number | null = null;

    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (dwellTimer != null) window.clearTimeout(dwellTimer);
      if (timer != null) window.clearTimeout(timer);
      timer = null;
      stopLift();
      target.style.touchAction = "";
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (mode === "pending") {
        const distance = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (distance > 8) {
          if (timer != null) window.clearTimeout(timer);
          timer = null;
          mode = "scroll";
          suppress.current = true;
        }
        return;
      }
      if (mode === "scroll") return;
      ev.preventDefault();
      tx = ev.clientX;
      ty = ev.clientY;
      const trash = trashRef.current?.getBoundingClientRect();
      const onTrash =
        !!trash &&
        ev.clientX >= trash.left &&
        ev.clientX <= trash.right &&
        ev.clientY >= trash.top &&
        ev.clientY <= trash.bottom;
      setOverTrash(onTrash);
      hoverRef.current = onTrash ? 4 : 18;
      if (onTrash) return;
      let overId = Number.NaN;
      for (const tile of document.querySelectorAll<HTMLElement>("[data-deck-id]")) {
        const id = Number(tile.getAttribute("data-deck-id"));
        if (!Number.isFinite(id) || id === deckId) continue;
        const rect = tile.getBoundingClientRect();
        if (
          ev.clientX >= rect.left &&
          ev.clientX <= rect.right &&
          ev.clientY >= rect.top &&
          ev.clientY <= rect.bottom
        ) {
          overId = id;
          break;
        }
      }
      if (!Number.isFinite(overId)) {
        if (dwellTimer != null) window.clearTimeout(dwellTimer);
        dwellTimer = null;
        pendingOver = Number.NaN;
        return;
      }
      if (pendingOver === overId) return;
      pendingOver = overId;
      if (dwellTimer != null) window.clearTimeout(dwellTimer);
      dwellTimer = window.setTimeout(() => {
        dwellTimer = null;
        if (pendingOver !== overId) return;
        const ids = [...(liveRef.current ?? orderedRef.current.map((item) => item.id))];
        const from = ids.indexOf(deckId);
        const to = ids.indexOf(overId);
        const lockedIds = new Set(orderedRef.current.filter((item) => item.locked).map((item) => item.id));
        if (from < 0 || to < 0 || from === to || lockedIds.has(overId) || lockedIds.has(deckId)) return;
        ids.splice(from, 1);
        ids.splice(to, 0, deckId);
        rememberLive(ids);
      }, 280);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (timer != null) window.clearTimeout(timer);
      stop();
      if (ev.type === "pointercancel") {
        dragRef.current = null;
        setDragId(null);
        setOverTrash(false);
        liveRef.current = null;
        setLiveIds(null);
        suppress.current = true;
        window.setTimeout(() => {
          suppress.current = false;
        }, 400);
        return;
      }
      if (mode === "scroll") {
        suppress.current = true;
        window.setTimeout(() => {
          suppress.current = false;
        }, 400);
        return;
      }
      if (mode !== "drag") {
        suppress.current = true;
        window.setTimeout(() => {
          suppress.current = false;
        }, 400);
        void navigate({ to: "/deck/$deckId", params: { deckId: String(deckId) } });
        return;
      }
      const trash = trashRef.current?.getBoundingClientRect();
      const onTrash =
        !!trash &&
        ev.clientX >= trash.left &&
        ev.clientX <= trash.right &&
        ev.clientY >= trash.top &&
        ev.clientY <= trash.bottom;
      dragRef.current = null;
      setDragId(null);
      setOverTrash(false);
      const deck = orderedRef.current.find((item) => item.id === deckId);
      if (onTrash) {
        if (deck?.locked) {
          toast(deck.name.trim().toLowerCase() === "velomere" ? "The Velomere deck stays." : "This deck stays.");
          liveRef.current = null;
          setLiveIds(null);
        } else if (deck) {
          setPendingDelete(deck);
        }
      } else if (liveRef.current) {
        setDeckOrder(liveRef.current);
        liveRef.current = null;
        setLiveIds(null);
      }
      window.setTimeout(() => {
        suppress.current = false;
      }, 400);
    };
    if (!locked) {
      timer = window.setTimeout(() => {
        timer = null;
        if (mode !== "pending") return;
        mode = "drag";
        suppress.current = true;
        dragRef.current = deckId;
        const rect = target.getBoundingClientRect();
        liftRef.current = {
          width: rect.width,
          height: rect.height,
          grabX: startX - rect.left,
          grabY: startY - rect.top,
        };
        hoverRef.current = 18;
        lift = 0;
        target.style.touchAction = "none";
        window.removeEventListener("pointermove", onMove);
        window.addEventListener("pointermove", onMove, { passive: false });
        rememberLive(orderedRef.current.map((item) => item.id));
        setDragId(deckId);
        try {
          target.setPointerCapture(pointerId);
        } catch {
          /* pointer already released */
        }
        raf = requestAnimationFrame(tick);
      }, 180);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <AppShell>
      <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Deck Collection</h1>
      <p className="mt-2 text-sm text-subtle">
        <Link to="/guide" className="underline decoration-border underline-offset-4">Velomere — Living Meanings</Link>
        <span> · the v7 companion, origin canon first, beside the card canon and not instead of it.</span>
      </p>
      <p className="mt-4">
        <Link
          to="/deck/bench"
          className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm text-fg"
        >
          Velomere Test Bench
        </Link>
      </p>
      <VelomereEncounter />
      <div
        ref={gridRef}
        className={cn("mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3", dragId != null && "pb-28")}
      >
        <button
          type="button"
          className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface text-fg"
          onClick={() => {
            setName("");
            setNaming(true);
          }}
        >
          <Plus className="size-6" />
          <span className="text-sm">New Deck</span>
        </button>
        {isError ? (
          <button
            type="button"
            className="flex aspect-[3/4] flex-col items-center justify-center rounded-2xl bg-surface p-4 text-center text-sm text-muted"
            onClick={() => void refetch()}
          >
            The Velomere deck did not open. Tap to try again.
          </button>
        ) : isLoading ? null : (
          shown.map((deck) => {
            const look = deckLooks[String(deck.id)];
            const back = look?.cardBack || "/card-back-deck.jpg";
            return (
              <div
                key={deck.id}
                data-deck-id={deck.id}
                role="link"
                tabIndex={0}
                onClick={() => {
                  if (suppress.current || dragId != null) return;
                  void navigate({ to: "/deck/$deckId", params: { deckId: String(deck.id) } });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void navigate({ to: "/deck/$deckId", params: { deckId: String(deck.id) } });
                  }
                }}
                onPointerDown={(event) => onTilePointerDown(event, deck.id)}
                onContextMenu={(event) => event.preventDefault()}
                className={cn(
                  "flex aspect-[3/4] cursor-pointer flex-col justify-end overflow-clip rounded-2xl bg-surface p-3 shadow-border select-none",
                  dragId === deck.id && "invisible",
                )}
                style={{ WebkitTouchCallout: "none" }}
              >
                <span
                  className="mb-auto mt-4 block h-24 w-16 self-center rounded-md bg-cover bg-center shadow-card"
                  style={{ backgroundImage: `url(${back})` }}
                />
                <span className="mt-4 flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-fg">{deck.name}</span>
                  {deck.locked ? <Lock className="size-3.5 shrink-0 text-muted" /> : null}
                </span>
                <span className="mt-1 text-[11px] text-subtle">
                  {deck.cardCount ?? 0} {deck.cardCount === 1 ? "card" : "cards"}
                  {" · "}
                  {deck.active ? "Active" : deck.locked ? "Locked" : "Custom"}
                </span>
              </div>
            );
          })
        )}
      </div>

      {dragId != null
        ? shown
            .filter((deck) => deck.id === dragId)
            .map((deck) => {
              const look = deckLooks[String(deck.id)];
              const back = look?.cardBack || "/card-back-deck.jpg";
              return (
                <div
                  key={`lift-${deck.id}`}
                  ref={floatRef}
                  className="pointer-events-none fixed top-0 left-0 z-50 flex flex-col justify-end overflow-hidden rounded-2xl bg-surface p-3 opacity-0 shadow-[0_30px_50px_-16px_rgba(0,0,0,0.72)] select-none will-change-transform"
                  style={{
                    width: liftRef.current.width || undefined,
                    height: liftRef.current.height || undefined,
                    WebkitTouchCallout: "none",
                  }}
                >
                  <span
                    className="mb-auto mt-4 block h-24 w-16 self-center rounded-md bg-cover bg-center shadow-card"
                    style={{ backgroundImage: `url(${back})` }}
                  />
                  <span className="mt-4 flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-fg">{deck.name}</span>
                    {deck.locked ? <Lock className="size-3.5 shrink-0 text-muted" /> : null}
                  </span>
                  <span className="mt-1 text-[11px] text-subtle">
                    {deck.cardCount ?? 0} {deck.cardCount === 1 ? "card" : "cards"}
                    {" · "}
                    {deck.active ? "Active" : deck.locked ? "Locked" : "Custom"}
                  </span>
                </div>
              );
            })
        : null}

      {dragId != null ? (
        <div
          ref={trashRef}
          data-deck-trash=""
          className={cn(
            "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex min-h-24 items-center justify-center pb-[max(1.25rem,env(safe-area-inset-bottom))] select-none",
            overTrash ? "bg-fg" : "bg-surface",
          )}
        >
          <img
            src="/delete-label.png"
            alt=""
            draggable={false}
            className={cn("h-7 w-auto", overTrash && "invert")}
          />
        </div>
      ) : null}

      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name this deck</DialogTitle>
            <DialogDescription>
              Next, choose its cards, then a light or dark theme.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-name">Deck name</Label>
            <Input
              id="deck-name"
              value={name}
              autoFocus
              maxLength={60}
              placeholder="Velvet"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) {
                  setSourceId(null);
                  setNaming(false);
                  setSourcing(true);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setNaming(false);
                setName("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={() => {
                setSourceId(null);
                setNaming(false);
                setSourcing(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sourcing}
        onOpenChange={(open) => {
          if (open || create.isPending) return;
          setSourcing(false);
          if (keepName.current) {
            keepName.current = false;
            return;
          }
          setName("");
          setSourceId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start this deck</DialogTitle>
            <DialogDescription>
              A fresh deck has no cards. Velomere draws only after Create. A copy brings over that deck's cards.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            <label className="flex items-center gap-3 rounded-xl bg-bg p-3">
              <input
                type="radio"
                name="deck-source"
                className="size-4 accent-fg"
                checked={sourceKind === "fresh" && sourceId == null}
                onChange={() => {
                  setSourceKind("fresh");
                  setSourceId(null);
                }}
              />
              <span>
                <span className="block text-sm text-fg">Fresh deck</span>
                <span className="mt-0.5 block text-xs text-subtle">
                  No cards yet. Add each one yourself.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-3 rounded-xl bg-bg p-3">
              <input
                type="radio"
                name="deck-source"
                className="size-4 accent-fg"
                checked={sourceKind === "velomere"}
                onChange={() => {
                  setSourceKind("velomere");
                  setSourceId(null);
                }}
              />
              <span>
                <span className="block text-sm text-fg">The Velomere Deck - Procedural Encounter Geometry</span>
                <span className="mt-0.5 block text-xs text-subtle">
                  A relational depth field from the canon and the encounter rules. Nothing is drawn until you press Create.
                </span>
              </span>
            </label>
            {ordered.filter((deck) => !deck.locked).map((deck) => (
              <label key={deck.id} className="flex items-center gap-3 rounded-xl bg-bg p-3">
                <input
                  type="radio"
                  name="deck-source"
                  className="size-4 accent-fg"
                  checked={sourceId === deck.id}
                  onChange={() => {
                  setSourceKind("fresh");
                  setSourceId(deck.id);
                }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-fg">{deck.name}</span>
                  <span className="mt-0.5 block text-xs text-subtle">Copy its cards</span>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={create.isPending}
              onClick={() => {
                keepName.current = true;
                setSourcing(false);
                setNaming(true);
              }}
            >
              Back
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={() => {
                keepName.current = true;
                if (sourceKind === "velomere") {
                  setTerms(false);
                  setRights(false);
                  setSourcing(false);
                  setShaping(true);
                  return;
                }
                setTheme("dark");
                setTerms(false);
                setRights(false);
                setSourcing(false);
                setTheming(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={theming}
        onOpenChange={(open) => {
          if (open || create.isPending) return;
          setTheming(false);
          if (keepName.current) {
            keepName.current = false;
            return;
          }
          setName("");
          setSourceId(null);
          setTheme("dark");
          setTerms(false);
          setRights(false);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Light or dark?</DialogTitle>
            <DialogDescription>
              Dark is a plain card back. Light is its own ivory design. Velomere cannot be copied.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col items-center gap-2 rounded-xl bg-bg p-3">
              <input
                type="radio"
                name="deck-theme"
                className="size-4 accent-fg"
                checked={theme === "dark"}
                onChange={() => setTheme("dark")}
              />
              <img
                src="/card-back-deck.jpg"
                alt=""
                className="h-28 w-[4.6rem] rounded-md object-cover shadow-card"
              />
              <span className="text-sm text-fg">Dark</span>
            </label>
            <label className="flex flex-col items-center gap-2 rounded-xl bg-bg p-3">
              <input
                type="radio"
                name="deck-theme"
                className="size-4 accent-fg"
                checked={theme === "light"}
                onChange={() => setTheme("light")}
              />
              <img
                src="/card-back-light.jpg"
                alt=""
                className="h-28 w-[4.6rem] rounded-md object-cover shadow-card"
              />
              <span className="text-sm text-fg">Light</span>
            </label>
          </div>
          <ConsentChecks terms={terms} rights={rights} onTerms={setTerms} onRights={setRights} />
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={create.isPending}
              onClick={() => {
                keepName.current = true;
                setTheming(false);
                setSourcing(true);
              }}
            >
              Back
            </Button>
            <Button
              disabled={!name.trim() || create.isPending || !terms || !rights}
              onClick={() =>
                create.mutate({
                  name: name.trim(),
                  sourceId,
                  theme,
                  consent: { terms: true, rights: true, at: new Date().toISOString() },
                })
              }
            >
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={shaping}
        onOpenChange={(open) => {
          if (open || forge.isPending) return;
          setShaping(false);
          if (keepName.current) {
            keepName.current = false;
            return;
          }
          setName("");
          setSourceKind("fresh");
          setTerms(false);
          setRights(false);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>The Velomere Deck - Procedural Encounter Geometry</DialogTitle>
            <DialogDescription>
              Date changes only reproducible microdetail. Affinity 0 is Neutral. Affinity 1–78 names that card, and 14 is The Dance. Nothing is drawn until Create.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sigil-date">Date</Label>
              <Input id="sigil-date" type="date" min="1900-01-01" max="2100-12-31" value={civilDate(sigilDate) ? sigilDate : ""} disabled={forge.isPending} onChange={(event) => setSigilDate(event.target.value)} />
              <input type="range" min={0} max={DAY_SPAN} value={civilDate(sigilDate) ? dayIndex(sigilDate) : 0} disabled={forge.isPending} aria-label="Day" className="w-full accent-fg" onChange={(event) => setSigilDate(dateFromIndex(Number(event.target.value)))} />
              <p className="text-xs text-subtle">Date sets reproducible visual microdetail only.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sigil-affinity">{affinity === 0 ? "0 — Neutral — canonical interpretation only" : `${affinity} — ${affinityCopy(affinity).name}`}</Label>
              <input id="sigil-affinity" type="range" min={0} max={78} step={1} value={affinity} disabled={forge.isPending} aria-label="Affinity" className="w-full accent-fg" onChange={(event) => setAffinity(Number(event.target.value))} />
              <p className="text-xs text-subtle">{affinityCopy(affinity).phrase}</p>
            </div>
            <p className="font-mono text-xs text-fg">{civilDate(sigilDate) ? `Velomere / ${sigilDate} / ${affinity === 0 ? "Neutral" : affinityCopy(affinity).name} (${affinity}) / Encounter geometry` : "Choose a real date"}</p>
            <p className="text-xs text-subtle">The drawing comes from the card’s own relation. It does not use photographs, crystals, or an image model.</p>
            {forge.isPending ? <p className="text-sm text-fg">Drawing 78 fronts and one shared back. Keep this open.</p> : null}
          </div>
          <ConsentChecks terms={terms} rights={rights} onTerms={setTerms} onRights={setRights} />
          <DialogFooter>
            {forge.isPending ? (
              <Button type="button" variant="ghost" onClick={() => { if (forgeToken.current) void cancelVelomereDeck({ data: { token: forgeToken.current } }); }}>Cancel</Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => { keepName.current = true; setShaping(false); setSourcing(true); }}>Back</Button>
            )}
            <Button
              type="button"
              disabled={!name.trim() || !civilDate(sigilDate) || forge.isPending || !terms || !rights}
              onClick={() => {
                const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
                forgeToken.current = token;
                forge.mutate({ name: name.trim(), date: sigilDate, affinity, token, consent: { terms: true, rights: true, at: new Date().toISOString() } });
              }}
            >
              {forge.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) {
            setPendingDelete(null);
            liveRef.current = null;
            setLiveIds(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this deck?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${pendingDelete.name} and its cards will be removed.`
                : "This deck and its cards will be removed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => {
                setPendingDelete(null);
                liveRef.current = null;
                setLiveIds(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={remove.isPending || !pendingDelete}
              onClick={() => pendingDelete && remove.mutate(pendingDelete)}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
