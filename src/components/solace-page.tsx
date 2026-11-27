"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { SolaceMarkdown } from "@/components/solace-markdown";
import { ArtZoom } from "@/components/art-zoom";
import { MiniCard, VelomereBorder } from "@/components/tarot-card";
import { UnsavedChatDialog } from "@/components/unsaved-chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Label } from "@/components/ui/label";
import { listCards, listDecks, setActiveDeck } from "@/lib/cards/server";
import { applyStarterDecks, useJournal } from "@/lib/journal/store";
import type { CardOrigin, ConversationOrigin } from "@/lib/solace/origin";
import { setTableReturn } from "@/lib/table-return";
import { useSolace } from "@/lib/solace/store";
import { askSolace } from "@/lib/solace/server";
import { saveCurrentThread, threadNeedsSave } from "@/lib/solace/thread";
import { NOTE_LIMIT, THREAD_LIMIT } from "@/lib/solace/voice";
import {
  canHear,
  canSpeakAloud,
  hear,
  speakAloud,
  speakEnabled,
  stopSpeaking,
} from "@/lib/solace/speech";
import { cn } from "@/lib/utils";

type WayBack =
  | { kind: "journal"; label: string; search: { deck?: number; card?: number; dream?: string; ritual?: string; reading?: string; chat?: string } }
  | { kind: "deck"; label: string; deckId: number; cardId: number }
  | { kind: "table"; label: string };

function wayBack(source: ConversationOrigin | null, journalId: string | null, resumed: boolean): WayBack | null {
  if (resumed && journalId) return { kind: "journal", label: "Back to this journal entry", search: { chat: journalId } };
  if (!source) return null;
  if (source.kind === "dream") return { kind: "journal", label: "Back to this dream", search: { dream: source.entryId } };
  if (source.kind === "ritual") return { kind: "journal", label: "Back to this ritual", search: { ritual: source.entryId } };
  if (source.kind !== "card") return null;
  const deckId = source.deckId != null && source.deckId > 0 ? source.deckId : null;
  const cardId = source.cardId > 0 ? source.cardId : null;
  if (source.from === "deck" && deckId && cardId) return { kind: "deck", label: "Back to this card", deckId, cardId };
  if (source.from === "flip" && !source.readingId) return { kind: "table", label: "Return to table" };
  if (deckId && cardId) {
    return {
      kind: "journal",
      label: "Back to this entry",
      search: { deck: deckId, card: cardId, ...(source.readingId ? { reading: source.readingId } : {}) },
    };
  }
  if (source.from === "flip") return { kind: "table", label: "Return to table" };
  return null;
}

export function SolacePage() {
  const messages = useSolace((s) => s.messages);
  const shared = useSolace((s) => s.shared);
  const pushTurn = useSolace((s) => s.pushTurn);
  const clearMessages = useSolace((s) => s.clearMessages);
  const journalId = useSolace((s) => s.journalId);
  const resumed = useSolace((s) => s.resumed);
  const vowAt = useSolace((s) => s.vowAt);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [returning, setReturning] = useState(false);
  const [remap, setRemap] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(speakEnabled);
  const [hearing, setHearing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const spokenRef = useRef(messages[messages.length - 1]?.id ?? "");
  const speakNext = useRef(false);
  const handsFree = useRef(false);
  const ear = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const back = wayBack(shared?.source ?? null, journalId, resumed === true);
  const canSpeak = resumed === true || Boolean(vowAt);
  const vowed = Boolean(vowAt);
  const backBesideVow = !resumed && vowed && back != null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sending]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      ear.current?.abort();
    };
  }, []);

  const listen = () => {
    if (hearing) {
      handsFree.current = false;
      ear.current?.stop();
      setHearing(false);
      return;
    }
    stopSpeaking();
    const recognition = hear(
      (text, final) => {
        setDraft(text);
        if (!final || !text) return;
        handsFree.current = true;
        setDraft("");
        void send(text);
      },
      () => {
        ear.current = null;
        setHearing(false);
      },
    );
    if (!recognition) {
      toast(canHear() ? "The microphone didn't open." : "This browser can't hear you yet.");
      return;
    }
    ear.current = recognition;
    setHearing(true);
  };

  useEffect(() => {
    if (!speakReplies || !canSpeakAloud()) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || spokenRef.current === last.id) return;
    if (!speakNext.current) {
      spokenRef.current = last.id;
      return;
    }
    speakNext.current = false;
    spokenRef.current = last.id;
    speakAloud(last.content, () => {
      if (handsFree.current) listen();
    });
  }, [messages, speakReplies]);

  const send = async (spoken?: string) => {
    const note = (spoken ?? draft).trim();
    const state = useSolace.getState();
    if (!note || sending || !(state.resumed || state.vowAt)) return;
    if (spoken == null) handsFree.current = false;
    stopSpeaking();
    const sitting = useSolace.getState().shared;
    const prior = useSolace.getState().messages;
    setDraft("");
    setSending(true);
    const history = [...prior, { role: "user" as const, content: note }];
    pushTurn("user", note);
    speakNext.current = speakReplies;
    try {
      const reply = await askSolace({
        data: {
          name: "Solace",
          personality: "",
          context: sitting ? [sitting.title, sitting.detail].filter(Boolean).join("\n") : "",
          messages: history.slice(-THREAD_LIMIT),
        },
      });
      pushTurn("assistant", reply.text, "Solace");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn’t answer just now.");
    } finally {
      setSending(false);
    }
  };

  const keep = () => {
    void (async () => {
      const result = await saveCurrentThread();
      if (result === "updated") toast("Journal entry updated");
      else if (result === "saved") toast("Saved to the journal");
    })();
  };

  const clear = () => {
    if (threadNeedsSave(messages, journalId)) {
      setConfirmClear(true);
      return;
    }
    clearMessages();
  };

  const placeOnTable = async (
    deckId: number,
    cardId: number,
    next?: { deckName: string; cardName: string; suit: string; rank: string; keywords: string; imageUrl: string | null },
  ) => {
    const source = useSolace.getState().shared?.source;
    if (!source || source.kind !== "card") return;
    await setActiveDeck({ data: { id: deckId } });
    const journal = useJournal.getState();
    applyStarterDecks([{ id: deckId, name: next?.deckName || (source.kind === "card" ? source.deckName : "") }]);
    journal.ensureActiveLook(deckId);
    journal.setActiveDeckId(deckId);
    if (next) {
      useSolace.getState().setSource({
        ...source,
        deckId,
        deckName: next.deckName,
        cardId,
        cardName: next.cardName,
        suit: next.suit,
        rank: next.rank,
        keywords: next.keywords,
        imageUrl: next.imageUrl,
      });
      if (source.readingId) {
        journal.alignReading(source.readingId, {
          deckId,
          deckName: next.deckName,
          cardId,
          cardName: next.cardName,
          suit: next.suit,
          rank: next.rank,
          keywords: next.keywords,
        });
      }
    }
    const face = useSolace.getState().shared?.source;
    const origin = face && face.kind === "card" ? face : source;
    setTableReturn({
      deckId,
      cardId,
      orientation: origin.orientation === "reversed" ? "reversed" : "upright",
      pulledAt: origin.pulledAt,
      question: origin.question,
      readingId: origin.readingId,
    });
    await queryClient.invalidateQueries({ queryKey: ["decks"] });
    await queryClient.invalidateQueries({ queryKey: ["cards"] });
    void navigate({ to: "/" });
  };

  const beginTable = async () => {
    const source = useSolace.getState().shared?.source;
    if (!source || source.kind !== "card") {
      void navigate({ to: "/" });
      return;
    }
    const deckId = source.deckId != null && source.deckId > 0 ? source.deckId : null;
    const cardId = source.cardId > 0 ? source.cardId : null;
    if (!deckId || !cardId) {
      setRemap(true);
      return;
    }
    setReturning(true);
    try {
      const cards = await listCards({ data: { deckId } });
      if (!cards.some((card) => card.id === cardId)) {
        setRemap(true);
        return;
      }
      await placeOnTable(deckId, cardId);
    } catch {
      setRemap(true);
    } finally {
      setReturning(false);
    }
  };

  const leave = () => {
    if (!back) return;
    if (back.kind === "table") {
      void beginTable();
      return;
    }
    if (back.kind === "deck") {
      void navigate({ to: "/deck/$deckId", params: { deckId: String(back.deckId) }, search: { card: back.cardId } });
      return;
    }
    void navigate({ to: "/journal", search: back.search });
  };

  const askLeave = () => {
    if (resumed && threadNeedsSave(useSolace.getState().messages, useSolace.getState().journalId)) {
      setConfirmLeave(true);
      return;
    }
    leave();
  };

  const goBack = () => {
    if (returning) return;
    askLeave();
  };

  return (
    <AppShell>
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Solace</h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
          Write what you’re sitting with. The thread stays on this phone until you save it.
        </p>
        {resumed ? null : vowed ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <label className="flex min-w-0 items-start gap-2 text-xs leading-snug text-subtle">
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 accent-fg"
                checked
                disabled
              />
              <span>I vow that my interaction with Solace will be respectful towards her.</span>
            </label>
            {back ? (
              <button
                type="button"
                className="shrink-0 rounded-full border border-border px-3 py-1 text-sm text-fg/80 hover:text-fg disabled:opacity-40"
                disabled={returning}
                onClick={goBack}
              >
                {back.label}
              </button>
            ) : null}
          </div>
        ) : (
          <label className="mt-6 flex items-start gap-3 text-sm leading-relaxed text-fg">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-fg"
              checked={false}
              onChange={() => {
                if (!vowAt) useSolace.getState().acceptVow();
              }}
            />
            <span>I vow that my interaction with Solace will be respectful towards her.</span>
          </label>
        )}
      </div>

      {shared || (back && !backBesideVow) ? (
        <div className="mt-4 rounded-xl bg-surface px-4 py-3 shadow-border">
          {back && !backBesideVow ? (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                className="rounded-full border border-border px-3 py-1 text-sm text-fg/80 hover:text-fg disabled:opacity-40"
                disabled={returning}
                onClick={goBack}
              >
                {back.label}
              </button>
            </div>
          ) : null}
          {shared?.source ? <SittingArt source={shared.source} compact={canSpeak} /> : null}
          {shared ? <p className={cn("text-sm text-fg", shared.source && "mt-3")}>Sitting with {shared.title}</p> : null}
          {shared?.detail ? (
            canSpeak ? (
              <div className="mt-3 border-t border-border pt-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 py-1 text-left"
                  aria-expanded={detailsOpen}
                  onClick={() => setDetailsOpen((open) => !open)}
                >
                  <span className="font-display text-sm tracking-tight text-fg">Details</span>
                  <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", detailsOpen && "rotate-180")} />
                </button>
                {detailsOpen ? (
                  <p className="mt-1 max-h-28 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-muted">
                    {shared.detail}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 max-h-28 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-muted">
                {shared.detail}
              </p>
            )
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {messages.length === 0 && !sending ? (
          <p className="text-sm leading-relaxed text-muted">The threshold is open. Ask, or set down what is on your mind.</p>
        ) : null}
        {messages.map((turn) => (
          <div key={turn.id} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                turn.role === "user" ? "whitespace-pre-wrap bg-fg text-bg" : "bg-surface text-fg shadow-border",
              )}
            >
              {turn.role === "assistant" ? <p className="mb-1 font-display text-base tracking-tight">Solace</p> : null}
              {turn.role === "assistant" ? <SolaceMarkdown text={turn.content} /> : turn.content}
              {turn.role === "assistant" && canSpeakAloud() ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-subtle underline-offset-2 hover:underline"
                  onClick={() => speakAloud(turn.content)}
                >
                  Read this aloud
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {sending ? <p className="text-sm text-subtle">Solace is listening…</p> : null}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={draft}
          maxLength={NOTE_LIMIT}
          rows={3}
          className="min-h-24"
          placeholder="Write to Solace"
          aria-label="Write to Solace"
          disabled={!canSpeak || sending}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-fg/80 hover:text-fg disabled:opacity-40"
              disabled={!canSpeak || sending}
              aria-pressed={hearing}
              onClick={listen}
            >
              {hearing ? <Square className="size-3.5" /> : <Mic className="size-3.5" />}
              {hearing ? "Listening" : "Speak"}
            </button>
            <button
              type="button"
              className="rounded-full border border-border px-3 py-1 text-sm text-fg/80 hover:text-fg disabled:opacity-40"
              disabled={(messages.length === 0 && !shared) || sending}
              onClick={clear}
            >
              Clear the thread
            </button>
            <button
              type="button"
              className="rounded-full border border-border px-3 py-1 text-sm text-fg/80 hover:text-fg disabled:opacity-40"
              disabled={messages.length === 0 || sending}
              onClick={keep}
            >
              Save to journal
            </button>
          </div>
          <Button type="submit" size="sm" disabled={!canSpeak || sending || !draft.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
      <UnsavedChatDialog
        open={confirmClear}
        onCancel={() => setConfirmClear(false)}
        onDiscard={() => {
          setConfirmClear(false);
          clearMessages();
        }}
        onSave={() => {
          void (async () => {
            const result = await saveCurrentThread();
            if (result === "cancelled") return;
            if (result === "saved") toast("Saved to the journal");
            else if (result === "updated") toast("Journal entry updated");
            setConfirmClear(false);
            clearMessages();
          })();
        }}
      />
      <Dialog open={confirmLeave} onOpenChange={(next) => !next && setConfirmLeave(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update this chat?</DialogTitle>
            <DialogDescription>
              This continues a journal entry. Add this chat to that entry, or leave it as it was.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmLeave(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirmLeave(false);
                leave();
              }}
            >
              Leave without updating
            </Button>
            <Button
              type="button"
              onClick={() => {
                void (async () => {
                  const result = await saveCurrentThread();
                  if (result === "cancelled") return;
                  if (result === "updated") toast("Journal entry updated");
                  else if (result === "saved") toast("Saved to the journal");
                  setConfirmLeave(false);
                  leave();
                })();
              }}
            >
              Update entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {remap && shared?.source?.kind === "card" ? (
        <RemapCard
          source={shared.source}
          onCancel={() => setRemap(false)}
          onDone={(deckId, cardId, next) => {
            setRemap(false);
            void placeOnTable(deckId, cardId, next);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function SittingArt({ source, compact }: { source: ConversationOrigin; compact?: boolean }) {
  const { user } = useCurrentUserState();
  const artRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; moved: boolean; held: boolean; timer: number } | null>(null);
  const [zoom, setZoom] = useState(false);
  const uploaded = useJournal((s) => {
    if (source.kind === "ritual") return s.rituals.find((ritual) => ritual.id === source.entryId)?.image ?? null;
    if (source.kind === "card" && source.readingId) return s.readings.find((reading) => reading.id === source.readingId)?.image ?? null;
    return null;
  });
  const deckId = source.kind === "card" && source.deckId != null && source.deckId > 0 ? source.deckId : null;
  const { data } = useQuery({
    queryKey: ["cards", deckId],
    queryFn: () => listCards({ data: { deckId: deckId ?? 0 } }),
    enabled: user !== null && source.kind === "card" && !uploaded && deckId != null && source.cardId > 0,
    staleTime: 60_000,
  });
  const found = source.kind === "card" ? data?.find((card) => card.id === source.cardId) : undefined;
  const src = uploaded || (source.kind === "card" ? source.imageUrl || found?.imageUrl || null : null);
  const reversed = source.kind === "card" && source.orientation === "reversed" && !uploaded;
  const settle = () => {
    setZoom(false);
    requestAnimationFrame(() => artRef.current?.scrollIntoView({ block: "start" }));
  };
  const clearPress = () => {
    const active = press.current;
    if (active) window.clearTimeout(active.timer);
    press.current = null;
  };
  if (!src && source.kind !== "card") return null;
  const art = src ? (
    uploaded ? (
      <img
        src={src}
        alt="Journal image"
        draggable={false}
        className={cn(
          "mx-auto rounded-md object-contain",
          compact ? "max-h-20 max-w-20" : "max-h-64 w-full",
        )}
      />
    ) : (
      <div className={cn("relative mx-auto", compact ? "h-20 w-14" : "h-52 w-36", reversed && "rotate-180")}>
        <img
          src={src}
          alt={source.kind === "card" ? source.cardName : "Journal image"}
          draggable={false}
          className="h-full w-full rounded-md object-cover"
        />
        <VelomereBorder src={src} suit={source.kind === "card" ? source.suit : null} className="rounded-md" />
      </div>
    )
  ) : source.kind === "card" ? (
    <MiniCard
      className="mx-auto"
      size={compact ? "sm" : "md"}
      orientation={source.orientation}
      card={{
        name: source.cardName,
        suit: source.suit || "custom",
        rank: source.rank,
        keywords: source.keywords,
        imageUrl: null,
      }}
    />
  ) : null;
  return (
    <>
      <div
        ref={artRef}
        className="scroll-mt-28 touch-none select-none"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const active = { x: event.clientX, y: event.clientY, moved: false, held: false, timer: 0 };
          active.timer = window.setTimeout(() => {
            if (!press.current || press.current.moved) return;
            press.current.held = true;
            setZoom(true);
          }, 360);
          press.current = active;
        }}
        onPointerMove={(event) => {
          const active = press.current;
          if (!active || active.moved) return;
          if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8) {
            active.moved = true;
            window.clearTimeout(active.timer);
          }
        }}
        onPointerUp={() => {
          const active = press.current;
          clearPress();
          if (active && !active.moved && !active.held) settle();
        }}
        onPointerCancel={clearPress}
        onContextMenu={(event) => event.preventDefault()}
      >
        {art}
      </div>
      {zoom ? (
        <ArtZoom
          card={{
            name: source.kind === "card" ? source.cardName : "Journal image",
            suit: source.kind === "card" ? source.suit || "custom" : "custom",
            rank: source.kind === "card" ? source.rank : "",
            keywords: source.kind === "card" ? source.keywords : "",
            imageUrl: src,
            imageScale: found?.imageScale ?? 100,
            imageX: found?.imageX ?? 0,
            imageY: found?.imageY ?? 0,
            imageRadius: found?.imageRadius ?? 2,
          }}
          orientation={reversed ? "reversed" : "upright"}
          onClose={settle}
        />
      ) : null}
    </>
  );
}

function RemapCard({
  source,
  onCancel,
  onDone,
}: {
  source: CardOrigin;
  onCancel: () => void;
  onDone: (
    deckId: number,
    cardId: number,
    next: { deckName: string; cardName: string; suit: string; rank: string; keywords: string; imageUrl: string | null },
  ) => void;
}) {
  const { user } = useCurrentUserState();
  const { data: decks } = useQuery({
    queryKey: ["decks"],
    queryFn: () => listDecks(),
    enabled: user !== null,
  });
  const [deckId, setDeckId] = useState("");
  const [cardId, setCardId] = useState("");
  const chosen = deckId ? Number(deckId) : null;
  const { data: cards, isLoading } = useQuery({
    queryKey: ["cards", "remap", chosen],
    queryFn: () => listCards({ data: { deckId: chosen } }),
    enabled: user !== null && chosen != null,
  });
  const save = () => {
    const deck = decks?.find((item) => String(item.id) === deckId);
    const card = cards?.find((item) => String(item.id) === cardId);
    if (!deck || !card) return;
    onDone(deck.id, card.id, {
      deckName: deck.name,
      cardName: card.name,
      suit: card.suit,
      rank: card.rank,
      keywords: card.keywords,
      imageUrl: card.imageUrl,
    });
  };
  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This card is no longer on a deck</DialogTitle>
          <DialogDescription>
            {source.cardName} needs a deck before it can return to the table. Choose where it belongs.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remap-deck">Deck</Label>
            <select
              id="remap-deck"
              value={deckId}
              onChange={(event) => {
                setDeckId(event.target.value);
                setCardId("");
              }}
              className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
            >
              <option value="">Choose a deck</option>
              {(decks ?? []).map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </div>
          {chosen != null ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="remap-card">Card</Label>
              <select
                id="remap-card"
                value={cardId}
                onChange={(event) => setCardId(event.target.value)}
                disabled={isLoading || (cards ?? []).length === 0}
                className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
              >
                <option value="">{isLoading ? "Loading cards…" : (cards ?? []).length === 0 ? "This deck has no cards" : "Choose a card"}</option>
                {(cards ?? []).map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!deckId || !cardId} onClick={save}>
            Return to table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
