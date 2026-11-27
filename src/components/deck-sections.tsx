"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { deleteDeck, setActiveDeck, type DeckRecord } from "@/lib/cards/server";
import { createEncounterCollection, deleteEncounterCollection, listEncounterCollections, listPersonalVelomereDeck } from "@/lib/encounters/server";
import { FRESH_DECK_BACK } from "@/lib/deck-backs";
import { useJournal } from "@/lib/journal/store";
import { cn } from "@/lib/utils";

function storedOrder(key: string) {
  if (typeof window === "undefined") return [] as string[];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveOrder(key: string, order: string[]) {
  localStorage.setItem(key, JSON.stringify(order));
}

function byStored<T>(items: T[], order: string[], idOf: (item: T) => string) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(idOf(a)) ?? 10000) - (rank.get(idOf(b)) ?? 10000) || idOf(a).localeCompare(idOf(b)));
}

function move(list: string[], dragged: string, target: string) {
  const next = list.filter((item) => item !== dragged);
  const index = next.indexOf(target);
  if (index < 0) next.push(dragged);
  else next.splice(index, 0, dragged);
  return next;
}

export function DeckSections({
  arranging,
  onArranging,
  bind,
  open,
  onToggle,
  decks,
  deckLooks,
  onOrderDecks,
  onNewDeck,
}: {
  arranging: boolean;
  onArranging: (next: boolean) => void;
  bind: (api: { startArrange: () => void; finishArrange: () => void }) => void;
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
  decks: DeckRecord[];
  deckLooks: Record<string, { cardBack?: string | null; backX?: number; backY?: number; backScale?: number; backRotate?: number }>;
  onOrderDecks: (order: number[]) => void;
  onNewDeck: () => void;
}) {
  const personal = useQuery({ queryKey: ["personal-velomere"], queryFn: () => listPersonalVelomereDeck() });
  const collections = useQuery({ queryKey: ["encounter-collections"], queryFn: () => listEncounterCollections() });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeId = useJournal((s) => s.activeDeckId);
  const setActiveDeckId = useJournal((s) => s.setActiveDeckId);
  const [collectionName, setCollectionName] = useState("");
  const [collectionOrder, setCollectionOrder] = useState<string[]>(() => storedOrder("velomere-collection-order"));
  const [libraryOrder, setLibraryOrder] = useState<string[]>(() => storedOrder("velomere-library-order"));
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => normalizeSections(storedOrder("velomere-section-order")));
  const [arrangeDraft, setArrangeDraft] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [busy, setBusy] = useState(false);
  const createCollection = useMutation({
    mutationFn: () => createEncounterCollection({ data: { name: collectionName.trim() } }),
    onSuccess: () => {
      setCollectionName("");
      void queryClient.invalidateQueries({ queryKey: ["encounter-collections"] });
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
    onError: (err: Error) => toast(err.message),
  });
  const backing = new Set((collections.data ?? []).map((deck: { deckId: number }) => deck.deckId));
  const library = byStored(decks.filter((deck) => deck.locked), libraryOrder, (deck) => String(deck.id));
  const yours = decks.filter((deck) => !deck.locked && !backing.has(deck.id) && deck.name.trim().toLowerCase() !== "landing zone");
  const velomere = byStored(
    ((collections.data ?? []) as Collection[]).filter((deck) => !deck.landing && deck.name.trim().toLowerCase() !== "landing zone"),
    collectionOrder,
    (deck) => deck.id,
  );
  const landing = ((collections.data ?? []) as Collection[]).find((deck) => deck.landing);
  const waiting = landing?.cards ?? 0;
  const velomereOrder = normalizeIds(
    ["personal", ...velomere.map((deck) => deck.id)],
    collectionOrder.includes("personal") ? collectionOrder : ["personal", ...collectionOrder],
  );
  const libraryIds = library.map((deck) => String(deck.id));
  const yoursIds = yours.map((deck) => String(deck.id));
  const orders = {
    velomere: velomereOrder,
    reference: libraryIds,
    yours: yoursIds,
  };
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const shownSections = arrangeDraft ?? sectionOrder;
  const arrangeDirty = !!arrangeDraft && arrangeDraft.join() !== sectionOrder.join();
  const editDirty = !!editing && (editing.deleted.length > 0 || editing.order.join() !== editing.base.filter((id) => !editing.deleted.some((item) => item.id === id)).join());
  const dirtyRef = useRef(false);
  dirtyRef.current = arrangeDirty || editDirty;
  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    withResolver: true,
    enableBeforeUnload: () => dirtyRef.current,
    disabled: !dirtyRef.current,
  });

  const beginEdit = (section: SectionId) => {
    const order = [...ordersRef.current[section]];
    setEditing({ section, order, base: order, deleted: [] });
    if (!open[section]) onToggle(section);
  };

  const startArrange = () => {
    if (editing && editDirty) {
      setPrompt({ kind: "before-arrange" });
      return;
    }
    setEditing(null);
    setArrangeDraft(sectionOrder);
    onArranging(true);
  };

  const finishArrange = () => {
    if (arrangeDirty) {
      setPrompt({ kind: "arrange" });
      return;
    }
    setArrangeDraft(null);
    onArranging(false);
  };

  useEffect(() => {
    bind({ startArrange, finishArrange });
  });

  useEffect(() => {
    if (blocker.status === "blocked") setPrompt((current) => current ?? { kind: "leave" });
  }, [blocker.status]);

  const namesFor = (section: SectionId, ids: string[]) => {
    const collectionNames = new Map(velomere.map((deck) => [deck.id, deck.name]));
    const deckNames = new Map([...library, ...yours].map((deck) => [String(deck.id), deck.name]));
    return ids.map((id) => (id === "personal" ? "Velomere" : collectionNames.get(id) || deckNames.get(id) || "Deck"));
  };

  const lines = () => {
    const next: string[] = [];
    if (arrangeDirty && arrangeDraft) {
      next.push(`Category order: ${arrangeDraft.map((id) => SECTION_TITLES[id as SectionId]).join(", then ")}.`);
    }
    if (editing && editDirty) {
      const gone = new Set(editing.deleted.map((item) => item.id));
      const survivors = editing.base.filter((id) => !gone.has(id));
      if (editing.order.join() !== survivors.join()) {
        next.push(`${SECTION_TITLES[editing.section]} order: ${namesFor(editing.section, editing.order).join(", ")}.`);
      }
      for (const item of editing.deleted) {
        next.push(item.kind === "deck" ? `Delete ${item.name} and its cards.` : `Delete ${item.name}. Committed encounters stay.`);
      }
    }
    return next;
  };

  const closePrompt = (stay: boolean) => {
    if (stay && blocker.status === "blocked") blocker.reset?.();
    setPrompt(null);
  };

  const discard = () => {
    const kind = prompt?.kind;
    const nextSection = prompt?.section;
    setEditing(null);
    setArrangeDraft(null);
    if (arranging) onArranging(false);
    setPrompt(null);
    if (kind === "leave") blocker.proceed?.();
    if (kind === "before-arrange") {
      setArrangeDraft(sectionOrder);
      onArranging(true);
    }
    if (kind === "switch" && nextSection) beginEdit(nextSection);
  };

  const commit = async () => {
    const kind = prompt?.kind;
    const nextSection = prompt?.section;
    setBusy(true);
    try {
      if (arrangeDraft && arrangeDraft.join() !== sectionOrder.join()) {
        setSectionOrder(arrangeDraft);
        saveOrder("velomere-section-order", arrangeDraft);
      }
      if (editing && editDirty) {
        const gone = new Set(editing.deleted.map((item) => item.id));
        const order = editing.order.filter((id) => !gone.has(id));
        if (editing.section === "velomere") {
          setCollectionOrder(order);
          saveOrder("velomere-collection-order", order);
          for (const item of editing.deleted) {
            if (item.kind === "collection") await deleteEncounterCollection({ data: { id: item.id } });
          }
        } else if (editing.section === "reference") {
          setLibraryOrder(order);
          saveOrder("velomere-library-order", order);
        } else {
          onOrderDecks(order.map(Number));
          for (const item of editing.deleted) {
            if (item.kind === "deck") await deleteDeck({ data: { id: Number(item.id) } });
          }
        }
        void queryClient.invalidateQueries({ queryKey: ["decks"] });
        void queryClient.invalidateQueries({ queryKey: ["cards"] });
        void queryClient.invalidateQueries({ queryKey: ["encounter-collections"] });
      }
      setEditing(null);
      setArrangeDraft(null);
      if (kind === "arrange" || kind === "leave") onArranging(false);
      if (kind === "before-arrange") {
        setArrangeDraft(arrangeDraft ?? sectionOrder);
        onArranging(true);
      }
      setPrompt(null);
      if (kind === "leave") blocker.proceed?.();
      if (kind === "switch" && nextSection) beginEdit(nextSection);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Those changes were not kept.");
      if (kind === "leave" && blocker.status === "blocked") blocker.reset?.();
    } finally {
      setBusy(false);
    }
  };

  const requestCloseEdit = () => {
    if (!editing) return;
    if (!editDirty) {
      setEditing(null);
      return;
    }
    setPrompt({ kind: "edit" });
  };

  const requestEdit = (section: SectionId) => {
    if (arranging) return;
    if (editing?.section === section) {
      requestCloseEdit();
      return;
    }
    if (editing && editDirty) {
      setPrompt({ kind: "switch", section });
      return;
    }
    beginEdit(section);
  };

  const shift = (id: string, dir: -1 | 1) => {
    setArrangeDraft((current) => {
      const list = [...(current ?? sectionOrder)];
      const index = list.indexOf(id);
      const next = index + dir;
      if (index < 0 || next < 0 || next >= list.length) return list;
      const copy = [...list];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  };

  const activate = async (id: number) => {
    if (!Number.isInteger(id) || id <= 0 || activeId === id) return;
    await setActiveDeck({ data: { id } });
    setActiveDeckId(id);
    void queryClient.invalidateQueries({ queryKey: ["decks"] });
    toast("This is the active deck");
  };

  const openTable = async (id: number | null, where: "reading" | "velomere") => {
    try {
      if (id) await activate(id);
      void navigate({ to: where === "velomere" ? "/encounters" : "/" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "That deck could not be made active.");
    }
  };

  const displayIds = (section: SectionId) => (editing?.section === section ? editing.order : orders[section]);

  const place = (section: SectionId, dragged: string, target: string) => {
    setEditing((current) => (current && current.section === section ? { ...current, order: move(current.order, dragged, target) } : current));
  };

  const markDeleted = (item: Deleted) => {
    setEditing((current) => {
      if (!current) return current;
      return {
        ...current,
        order: current.order.filter((id) => id !== item.id),
        deleted: [...current.deleted, item],
      };
    });
  };

  const isActive = (id: number | null | undefined) => id != null && id > 0 && activeId === id;

  const sections: Record<SectionId, ReactNode> = {
    velomere: (
      <Section
        title={SECTION_TITLES.velomere}
        count={velomere.length + 1}
        expanded={Boolean(open.velomere)}
        onToggle={() => onToggle("velomere")}
        arranging={arranging}
        editing={editing?.section === "velomere"}
        canUp={shownSections[0] !== "velomere"}
        canDown={shownSections[shownSections.length - 1] !== "velomere"}
        onUp={() => shift("velomere", -1)}
        onDown={() => shift("velomere", 1)}
        onEdit={() => requestEdit("velomere")}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {displayIds("velomere").map((id) => {
            if (id === "personal") {
              return (
                <Tile
                  key="personal"
                  name="Velomere"
                  dragId="personal"
                  count={personal.data?.cards.length ?? 0}
                  back="/card-back.jpg"
                  onView={() => void navigate({ to: "/encounters/personal", hash: "cards" })}
                  useLabel="Velomere table"
                  onUse={() => void openTable(null, "velomere")}
                  editing={editing?.section === "velomere"}
                  draggable
                  onPlace={(dragged, target) => place("velomere", dragged, target)}
                />
              );
            }
            const deck = velomere.find((item) => item.id === id);
            if (!deck) return null;
            return (
              <Tile
                key={deck.id}
                name={deck.name}
                dragId={deck.id}
                count={deck.cards}
                back={deckLooks[String(deck.deckId)]?.cardBack || "/card-back.jpg"}
                place={deckLooks[String(deck.deckId)]}
                onStylize={() => void navigate({ to: "/encounters/collection/$id", params: { id: deck.id }, hash: "style" })}
                onView={() => {
                  if (deck.deckId) void navigate({ to: "/deck/$deckId", params: { deckId: String(deck.deckId) } });
                  else void navigate({ to: "/encounters/collection/$id", params: { id: deck.id }, hash: "cards" });
                }}
                active={isActive(deck.deckId)}
                onActivate={deck.deckId ? () => void activate(Number(deck.deckId)).catch((err: Error) => toast(err.message)) : undefined}
                editing={editing?.section === "velomere"}
                draggable
                onPlace={(dragged, target) => place("velomere", dragged, target)}
                onDelete={() => markDeleted({ kind: "collection", id: deck.id, name: deck.name })}
              />
            );
          })}
        </div>
        {editing?.section === "velomere" ? <EditNote onDone={requestCloseEdit} /> : null}
        <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (collectionName.trim()) createCollection.mutate(); }}>
          <Input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="New Encounter deck" aria-label="New Encounter deck" />
          <Button type="submit" disabled={!collectionName.trim() || createCollection.isPending}>Create</Button>
        </form>
      </Section>
    ),
    reference: (
      <Section
        title={SECTION_TITLES.reference}
        count={library.length}
        expanded={Boolean(open.reference)}
        onToggle={() => onToggle("reference")}
        arranging={arranging}
        canUp={shownSections[0] !== "reference"}
        canDown={shownSections[shownSections.length - 1] !== "reference"}
        onUp={() => shift("reference", -1)}
        onDown={() => shift("reference", 1)}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {displayIds("reference").map((id) => {
            const deck = library.find((item) => String(item.id) === id);
            if (!deck) return null;
            return (
              <Tile
                key={deck.id}
                name={deck.name}
                dragId={String(deck.id)}
                count={deck.cardCount ?? 0}
                back={deckLooks[String(deck.id)]?.cardBack || FRESH_DECK_BACK}
                place={deckLooks[String(deck.id)]}
                onView={() => void navigate({ to: "/deck/$deckId", params: { deckId: String(deck.id) } })}
                useLabel="Reading table"
                onUse={() => void openTable(deck.id, "reading")}
                active={isActive(deck.id) || (activeId == null && deck.active)}
                onActivate={() => void activate(deck.id).catch((err: Error) => toast(err.message))}
                locked
              />
            );
          })}
        </div>
      </Section>
    ),
    yours: (
      <Section
        title={SECTION_TITLES.yours}
        count={yours.length}
        expanded={Boolean(open.yours)}
        onToggle={() => onToggle("yours")}
        arranging={arranging}
        editing={editing?.section === "yours"}
        canUp={shownSections[0] !== "yours"}
        canDown={shownSections[shownSections.length - 1] !== "yours"}
        onUp={() => shift("yours", -1)}
        onDown={() => shift("yours", 1)}
        onEdit={() => requestEdit("yours")}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {displayIds("yours").map((id) => {
            const deck = yours.find((item) => String(item.id) === id);
            if (!deck) return null;
            return (
              <Tile
                key={deck.id}
                name={deck.name}
                dragId={String(deck.id)}
                count={deck.cardCount ?? 0}
                back={deckLooks[String(deck.id)]?.cardBack || FRESH_DECK_BACK}
                place={deckLooks[String(deck.id)]}
                onView={() => void navigate({ to: "/deck/$deckId", params: { deckId: String(deck.id) } })}
                useLabel="Reading table"
                onUse={() => void openTable(deck.id, "reading")}
                active={isActive(deck.id) || (activeId == null && deck.active)}
                onActivate={() => void activate(deck.id).catch((err: Error) => toast(err.message))}
                editing={editing?.section === "yours"}
                draggable
                onPlace={(dragged, target) => place("yours", dragged, target)}
                onDelete={() => markDeleted({ kind: "deck", id: String(deck.id), name: deck.name })}
              />
            );
          })}
        </div>
        {editing?.section === "yours" ? <EditNote onDone={requestCloseEdit} /> : null}
      </Section>
    ),
  };

  const changeLines = lines();
  return (
    <div className="mt-6 grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-2 text-sm disabled:opacity-50"
          disabled={!landing}
          onClick={() => {
            if (!landing) return;
            void navigate({ to: "/encounters/collection/$id", params: { id: landing.id }, hash: "style" });
          }}
        >
          Landing Zone
          <span className="ml-1.5 text-subtle">{waiting} {waiting === 1 ? "card" : "cards"}</span>
        </button>
        <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-2 text-sm" onClick={onNewDeck}>
          <Plus className="size-4" />
          New Deck
        </button>
      </div>
      {shownSections.map((id) => sections[id as SectionId])}
      <Dialog
        open={prompt != null}
        onOpenChange={(next) => {
          if (!next && !busy) closePrompt(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit these changes?</DialogTitle>
            <DialogDescription>Nothing is saved until you commit. Leaving, or closing edit, discards this list.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2 text-sm text-fg">
            {changeLines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
          </ul>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={discard}>Discard</Button>
            <Button type="button" disabled={busy || changeLines.length === 0} onClick={() => void commit()}>{busy ? "Committing…" : "Commit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditNote({ onDone }: { onDone: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="text-xs text-subtle">Hold a deck to move it. The trash icon marks it for deletion. Nothing changes until you commit.</p>
      <Button type="button" variant="secondary" onClick={onDone}>Done</Button>
    </div>
  );
}

function Section({
  title,
  count,
  expanded,
  onToggle,
  arranging,
  editing = false,
  canUp,
  canDown,
  onUp,
  onDown,
  onEdit,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  arranging: boolean;
  editing?: boolean;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex min-h-14 items-center gap-2 px-3 py-3">
        {arranging ? (
          <span className="flex shrink-0 gap-1">
            <button type="button" aria-label={`Move ${title} up`} disabled={!canUp} className="flex size-9 items-center justify-center rounded-full text-fg disabled:opacity-30" onClick={onUp}>
              <ChevronUp className="size-4" />
            </button>
            <button type="button" aria-label={`Move ${title} down`} disabled={!canDown} className="flex size-9 items-center justify-center rounded-full text-fg disabled:opacity-30" onClick={onDown}>
              <ChevronDown className="size-4" />
            </button>
          </span>
        ) : null}
        <button type="button" className="flex min-w-0 flex-1 items-baseline gap-2 text-left" aria-expanded={expanded} onClick={onToggle}>
          <span className="truncate font-display text-2xl">{title}</span>
          <span className="shrink-0 text-sm text-subtle">{count} {count === 1 ? "deck" : "decks"}</span>
        </button>
        {onEdit && !arranging && expanded ? (
          <button type="button" aria-label={`Edit ${title}`} className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", editing ? "bg-fg text-bg" : "text-muted")} onClick={onEdit}>
            <Pencil className="size-4" />
          </button>
        ) : null}
        <button type="button" aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`} className="flex size-9 shrink-0 items-center justify-center text-muted" onClick={onToggle}>
          <ChevronDown className={cn("size-5 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>
      {expanded ? <div className="border-t border-border px-3 py-3">{children}</div> : null}
    </section>
  );
}

function Tile({
  name,
  dragId,
  count,
  back,
  place,
  onView,
  onStylize,
  active,
  onActivate,
  locked,
  editing,
  draggable,
  onDelete,
  onPlace,
}: {
  name: string;
  dragId?: string;
  count: number;
  back: string;
  place?: { backX?: number; backY?: number; backScale?: number; backRotate?: number };
  onView: () => void;
  onStylize?: () => void;
  useLabel?: string;
  onUse?: () => void;
  active?: boolean;
  onActivate?: () => void;
  locked?: boolean;
  editing?: boolean;
  draggable?: boolean;
  onDelete?: () => void;
  onPlace?: (dragged: string, target: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      data-reorder={dragId || name}
      className={`relative flex min-h-0 flex-col rounded-2xl bg-bg p-3 ${dragging ? "opacity-60" : ""}`}
      onPointerDown={(event) => {
        if (!editing || !draggable || event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button, input, label")) return;
        event.preventDefault();
        const origin = dragId || "";
        let hover = origin;
        setDragging(true);
        const movePointer = (ev: PointerEvent) => {
          const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-reorder]");
          const over = hit?.getAttribute("data-reorder");
          if (over) hover = over;
        };
        const up = () => {
          window.removeEventListener("pointermove", movePointer);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          setDragging(false);
          if (hover && hover !== origin) onPlace?.(origin, hover);
        };
        window.addEventListener("pointermove", movePointer);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      }}
    >
      <div className="relative mx-auto h-36 w-[5.6rem] shrink-0">
        <button
          type="button"
          aria-label={`View ${name}`}
          className="absolute inset-0 overflow-hidden rounded-md bg-[#2c2926] shadow-card"
          onClick={onView}
        >
          <img
            src={back}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              transform: `translate(${place?.backX ?? 0}%, ${place?.backY ?? 0}%) rotate(${place?.backRotate ?? 0}deg) scale(${Math.max(place?.backScale ?? 100, 100) / 100})`,
            }}
          />
          <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] tracking-wide text-white">View</span>
        </button>
        {onStylize ? (
          <button
            type="button"
            className="absolute top-1.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] tracking-wide text-white"
            onClick={onStylize}
          >
            Stylize
          </button>
        ) : null}
      </div>
      <span className={`mt-3 flex items-center gap-1 truncate text-sm text-fg ${editing && draggable ? "cursor-grab" : ""}`}>
        <span className="min-w-0 truncate">{name}</span>
        {locked ? <Lock className="size-3.5 shrink-0 text-muted" /> : null}
      </span>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-subtle">{count} {count === 1 ? "card" : "cards"}</span>
        {onActivate ? (
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            <input
              type="checkbox"
              className="size-3.5 accent-current"
              checked={!!active}
              onChange={() => {
                if (!active) onActivate();
              }}
              aria-label={active ? `${name} is the active deck` : `Make ${name} the active deck`}
            />
            Active deck
          </label>
        ) : null}
      </div>
      {editing && onDelete ? (
        <button type="button" aria-label={`Delete ${name}`} className="mt-2 flex size-9 items-center justify-center self-start rounded-full text-subtle" onClick={onDelete}>
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

const SECTION_TITLES: Record<SectionId, string> = {
  velomere: "Velomere",
  reference: "Standard decks",
  yours: "Your decks",
};

type SectionId = "velomere" | "reference" | "yours";

type Collection = { id: string; name: string; landing: boolean; cards: number; deckId?: number };

type Deleted = { kind: "deck" | "collection"; id: string; name: string };

type EditDraft = { section: SectionId; order: string[]; base: string[]; deleted: Deleted[] };

type Prompt = { kind: "edit" | "arrange" | "leave" | "before-arrange" | "switch"; section?: SectionId };

function normalizeSections(order: string[]) {
  const ids = ["velomere", "reference", "yours"];
  const next = order.filter((id) => ids.includes(id));
  for (const id of ids) if (!next.includes(id)) next.push(id);
  return next;
}

function normalizeIds(fallback: string[], order: string[]) {
  const known = new Set(fallback);
  const next = order.filter((id) => known.has(id));
  for (const id of fallback) if (!next.includes(id)) next.push(id);
  return next;
}
