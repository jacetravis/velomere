"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { DeckSections } from "@/components/deck-sections";
import { DeckTabs } from "@/components/deck-tabs";
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
import { createDeck, deleteDeck, listDecks, type DeckRecord } from "@/lib/cards/server";
import { LIBRARY, LIBRARY_LOOK_STAMP } from "@/lib/cards/library";
import type { UploadConsent } from "@/lib/consent";
import { DEFAULT_LOOK, applyStarterDecks, useJournal } from "@/lib/journal/store";
import { DECK_BACKS, FRESH_DECK_BACK } from "@/lib/deck-backs";
import { deleteEncounterCollection } from "@/lib/encounters/server";

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
  const [name, setName] = useState("");
  const [theming, setTheming] = useState(false);
  const [back, setBack] = useState(FRESH_DECK_BACK);
  const [terms, setTerms] = useState(false);
  const [rights, setRights] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const [liveIds, setLiveIds] = useState<number[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeckRecord | null>(null);
  const [arranging, setArranging] = useState(false);
  const arrangeControls = useRef<{ startArrange: () => void; finishArrange: () => void } | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [pendingCollection, setPendingCollection] = useState<{ id: string; name: string } | null>(null);
  const liveRef = useRef<number[] | null>(null);
  const suppress = useRef(false);
  const trashRef = useRef<HTMLDivElement>(null);
  const keepName = useRef(false);
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
  }, [decks, ensureActiveLook, LIBRARY_LOOK_STAMP]);

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
    mutationFn: (input: { name: string; back: string; consent: UploadConsent }) => createDeck({ data: { name: input.name } }),
    onSuccess: (deck, input) => {
      useJournal.getState().setDeckConsent(deck.id, input.consent);
      saveDeckLook(deck.id, { ...DEFAULT_LOOK, cardBack: input.back });
      const current = useJournal.getState().deckOrder ?? [];
      const visual = current.length ? current : ordered.map((item) => item.id);
      setDeckOrder([...visual.filter((id) => id !== deck.id), deck.id]);
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      setNaming(false);
      setTheming(false);
      setName("");
      setBack(FRESH_DECK_BACK);
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

  const removeCollection = useMutation({
    mutationFn: (deck: { id: string }) => deleteEncounterCollection({ data: { id: deck.id } }),
    onSuccess: () => {
      setPendingCollection(null);
      void queryClient.invalidateQueries({ queryKey: ["encounter-collections"] });
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
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
      <DeckTabs current="collection" />
      <div className="mt-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-medium tracking-tight">Deck Collection</h1>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (arranging) arrangeControls.current?.finishArrange();
            else arrangeControls.current?.startArrange();
          }}
        >
          {arranging ? "Done" : "Arrange"}
        </Button>
      </div>
      {arranging ? <p className="mt-2 text-xs text-subtle">Use the arrows to order the categories. Nothing is kept until you commit.</p> : null}
      {isError ? (
        <button
          type="button"
          className="mt-4 w-full rounded-2xl bg-surface p-4 text-center text-sm text-muted"
          onClick={() => void refetch()}
        >
          The decks did not open. Tap to try again.
        </button>
      ) : (
        <DeckSections
          arranging={arranging}
          onArranging={setArranging}
          bind={(api) => {
            arrangeControls.current = api;
          }}
          open={openSections}
          onToggle={(id) => setOpenSections((current) => ({ ...current, [id]: !current[id] }))}
          decks={isLoading ? [] : shown}
          deckLooks={deckLooks}
          onOrderDecks={setDeckOrder}
          onNewDeck={() => {
            setName("");
            setNaming(true);
          }}
        />
      )}

      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What will you call this deck?</DialogTitle>
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
                  event.preventDefault();
                  const next = name.trim().toLowerCase();
                  if ((decks ?? []).some((deck) => deck.name.trim().toLowerCase() === next)) {
                    toast("A deck already has that name.");
                    return;
                  }
                  setNaming(false);
                  setBack(FRESH_DECK_BACK);
                  setTerms(false);
                  setRights(false);
                  setTheming(true);
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
                const next = name.trim().toLowerCase();
                if ((decks ?? []).some((deck) => deck.name.trim().toLowerCase() === next)) {
                  toast("A deck already has that name.");
                  return;
                }
                setNaming(false);
                setBack(FRESH_DECK_BACK);
                setTerms(false);
                setRights(false);
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
          setBack(FRESH_DECK_BACK);
          setTerms(false);
          setRights(false);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose a back</DialogTitle>
            <DialogDescription>Fresh is the plain new deck. The others match the rooms. Velomere’s own back stays on Velomere.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {DECK_BACKS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`flex flex-col items-center gap-2 rounded-xl bg-bg p-2 ${back === item.src ? "ring-1 ring-accent" : ""}`}
                onClick={() => setBack(item.src)}
              >
                <img src={item.src} alt="" className="h-24 w-[3.9rem] rounded-md object-cover shadow-card" />
                <span className="text-xs text-fg">{item.name}</span>
              </button>
            ))}
          </div>
          <ConsentChecks terms={terms} rights={rights} onTerms={setTerms} onRights={setRights} />
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={create.isPending}
              onClick={() => {
                keepName.current = true;
                setTheming(false);
                setNaming(true);
              }}
            >
              Back
            </Button>
            <Button
              disabled={!name.trim() || create.isPending || !terms || !rights}
              onClick={() =>
                create.mutate({
                  name: name.trim(),
                  back,
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
      <Dialog
        open={pendingCollection != null}
        onOpenChange={(open) => {
          if (!open && !removeCollection.isPending) setPendingCollection(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this deck?</DialogTitle>
            <DialogDescription>
              {pendingCollection
                ? `${pendingCollection.name} leaves the Decks page. Committed encounters, the personal Velomere deck, and canonical cards stay.`
                : "This Encounter deck leaves the Decks page. Committed encounters stay."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={removeCollection.isPending} onClick={() => setPendingCollection(null)}>Cancel</Button>
            <Button disabled={removeCollection.isPending || !pendingCollection} onClick={() => pendingCollection && removeCollection.mutate(pendingCollection)}>
              {removeCollection.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
