"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChatWithSolace } from "@/components/entry-links";
import { MeaningText } from "@/components/meaning-text";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listCards, listDecks } from "@/lib/cards/server";
import { suitLabel } from "@/lib/cards/types";
import labels from "@/lib/cards/d3-labels.json";
import { project, SpreadCommandError, type Assignment, type Session } from "@/lib/spreads/engine";
import { fittedCardWidth, expandedPositions } from "@/lib/spreads/fit";
import { PhysicalCard } from "@/components/tarot-card";
import { useSpreads } from "@/lib/spreads/store";
import { applyDeliver, applyDrawWaiting, applyFlip, applyGather, pausePhysical, physicalSpread, physicalState, setPhysicalReading, subscribePhysical } from "@/lib/physical-deck/runtime";
import { displayedTableReading, resumeTableReading } from "@/lib/physical-deck/table-reading";
import { useJournal } from "@/lib/journal/store";
import { cardSitting } from "@/lib/solace/sitting";
import { useSolace } from "@/lib/solace/store";

function meaningFor(angle: number, upright: string, reversed: string) {
  if (angle === 180) return reversed.trim() ? reversed : "This deck has no separate reversed meaning for this card.";
  if (angle === 90 || angle === 270) return upright;
  return upright;
}

function splitMeaning(text: string | null | undefined) {
  const raw = text ?? "";
  const match = raw.match(/\n\n\[PERSONALIZED (CONTEXT|COUNTERREADING) — ([^\]]+)\]\n([\s\S]*)$/);
  if (!match || match.index == null) return { canon: raw, proposal: "", affinity: null as string | null };
  return { canon: raw.slice(0, match.index).trim(), proposal: match[3].trim(), affinity: match[2].trim() };
}

function storyNumber(name: string) {
  return labels.findIndex((row) => row.name === name) + 1;
}

function alignSpread() {
  const physical = physicalState();
  if (!physical) return;
  const store = useSpreads.getState();
  const plan = resumeTableReading({
    physical,
    session: store.session,
    cards: [],
    recorded: physicalSpread(),
    deckId: physical.deckId,
    deckName: store.session?.assignments[0]?.deckName ?? "Deck",
    adopt: (session) => store.adopt(session),
  });
  if (plan.action === "pause") pausePhysical(plan.reason);
}

function CardOverview({
  card,
  positionName,
  onClose,
}: {
  card: Assignment;
  positionName: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const reversed = card.physicalAngle === 180;
  const shown = splitMeaning(reversed ? card.reversed : card.upright);
  const orientation = reversed ? "reversed" : "upright";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{card.cardName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">
            {reversed ? "Reversed" : "Upright"} · {suitLabel(card.suit)}
          </p>
          <p className="mt-1 text-sm text-subtle">{positionName}</p>
          {storyNumber(card.cardName) > 0 ? (
            <Link to="/guide" search={{ card: card.cardName }} className="mt-2 text-sm text-subtle underline decoration-border underline-offset-4">
              Living Meanings
            </Link>
          ) : null}
          {card.keywords ? <p className="mt-2 text-sm text-muted">{card.keywords}</p> : null}
        </div>
        <div className="rounded-xl bg-bg/40 p-4 text-left">
          <p className="text-xs tracking-[0.16em] text-subtle uppercase">Canonical</p>
          <MeaningText className="mt-2 text-sm leading-relaxed text-fg" text={shown.canon || "No description written yet."} />
          {shown.proposal ? (
            <>
              <p className="mt-4 text-xs tracking-[0.16em] text-subtle uppercase">Proposed context · affinity {shown.affinity} · draft</p>
              <MeaningText className="mt-2 text-sm leading-relaxed text-fg" text={shown.proposal} />
            </>
          ) : null}
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            void navigate({
              to: "/journal",
              search: {
                ...(card.deckId ? { deck: card.deckId } : {}),
                ...(card.cardId > 0 ? { card: card.cardId } : {}),
              },
            })
          }
        >
          Past entries
        </Button>
        <ChatWithSolace
          sitting={cardSitting({
            name: card.cardName,
            deckName: card.deckName,
            orientation,
            suit: suitLabel(card.suit),
            rank: card.rank,
            keywords: card.keywords,
            upright: card.upright,
            reversed: card.reversed,
            meaning: reversed ? card.reversed : card.upright,
          })}
          source={{
            kind: "card",
            from: "flip",
            cardName: card.cardName,
            cardId: card.cardId,
            deckId: card.deckId,
            deckName: card.deckName,
            suit: card.suit,
            rank: card.rank,
            orientation,
            keywords: card.keywords,
            imageUrl: card.imageUrl,
            pulledAt: card.revealedAt ?? "",
            question: "",
            meaning: reversed ? card.reversed : card.upright,
            readingId: null,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function SpreadTable() {
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const activeDeckId = useJournal((s) => s.activeDeckId);
  const addReading = useJournal((s) => s.addReading);
  const { data: decks } = useQuery({ queryKey: ["decks"], queryFn: () => listDecks(), enabled: user !== null });
  const { data: cards } = useQuery({
    queryKey: ["cards", "spread-table", activeDeckId],
    queryFn: () => listCards({ data: { deckId: activeDeckId ?? 0 } }),
    enabled: user !== null && activeDeckId != null,
  });
  const selectedSpread = useSpreads((s) => s.effective(s.activeSpreadId));
  const selectedId = useSpreads((s) => s.activeSpreadId);
  const session = useSpreads((s) => s.session);
  const recordedSpread = useSyncExternalStore(subscribePhysical, physicalSpread, physicalSpread);
  const displayed = displayedTableReading({
    session,
    selectedId,
    selected: selectedSpread,
    recorded: recordedSpread,
  });
  const spread = displayed.spread ?? selectedSpread;
  const begin = useSpreads((s) => s.begin);
  const draw = useSpreads((s) => s.draw);
  const flip = useSpreads((s) => s.flip);
  const deliver = useSpreads((s) => s.deliver);
  const discard = useSpreads((s) => s.discard);
  const [infoOrder, setInfoOrder] = useState<number | null>(null);
  const [detailOrder, setDetailOrder] = useState<number | null>(null);
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const deck = decks?.find((item) => item.id === activeDeckId) ?? decks?.find((item) => item.active);
  const view = useMemo(() => project(displayed.session, spread?.positions.length ?? 1), [displayed.session, spread]);
  const live = displayed.session;
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const take = (current: Session) => {
    const used = new Set(current.assignments.map((item) => item.cardId));
    const topId = physicalState()?.drawPile[0];
    const card = (cards ?? []).find((item) => item.id === topId && !used.has(item.id));
    if (!card || topId == null) throw new SpreadCommandError("The top card is not available.");
    applyDrawWaiting();
    return {
      deckId: deck?.id ?? activeDeckId ?? 0,
      deckName: deck?.name ?? "Deck",
      cardId: card.id,
      cardName: card.name,
      upright: card.upright,
      reversed: card.reversed,
      imageUrl: card.imageUrl,
      keywords: card.keywords,
      suit: card.suit,
      rank: card.rank,
    };
  };

  const releaseReading = () => {
    try {
      setPhysicalReading(null);
      if (physicalState()) applyGather();
    } catch (err) {
      alignSpread();
      toast(err instanceof Error ? err.message : "The cards could not be returned to the deck.");
      return;
    }
    discard();
    setKept(false);
  };

  const run = (work: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      work();
    } catch (err) {
      alignSpread();
      toast(err instanceof Error ? err.message : "That step did not finish.");
    } finally {
      window.setTimeout(() => setBusy(false), reduce ? 0 : 280);
    }
  };

  const journal = () => {
    if (!live || live.status !== "complete" || kept) return;
    const already = (useJournal.getState().readings ?? []).some((item) => item.spreadSessionId === live.id);
    if (already) {
      setKept(true);
      return;
    }
    const lines = live.assignments
      .slice()
      .sort((a, b) => a.positionOrder - b.positionOrder)
      .map((item) => {
        const position = live.spread.positions.find((entry) => entry.id === item.positionId);
        const meaning = meaningFor(item.physicalAngle, item.upright, item.reversed);
        return `${item.positionOrder}. ${position?.name ?? "Position"} — ${item.cardName} (${item.physicalAngle}°)\n${meaning}`;
      })
      .join("\n\n");
    const first = live.assignments.find((item) => item.positionOrder === 1);
    addReading({
      cardId: first?.cardId ?? 0,
      cardName: live.spread.name,
      suit: first?.suit ?? "",
      rank: first?.rank ?? "",
      orientation: first?.physicalAngle === 180 ? "reversed" : "upright",
      keywords: live.spread.name,
      meaningSnapshot: lines,
      notes: lines,
      question: live.spread.openingQuestion,
      deckId: first?.deckId ?? null,
      deckName: first?.deckName ?? "",
      pulledAt: new Date().toISOString(),
      spreadSessionId: live.id,
      spreadCover: live.spread.tile,
      spreadName: live.spread.name,
    });
    setKept(true);
    toast("The spread was kept.");
  };

  const talk = () => {
    if (!live || live.status !== "complete") return;
    const detail = [
      `Spread: ${live.spread.name}`,
      live.spread.description,
      `Question: ${live.spread.openingQuestion}`,
      `Revision: ${live.spread.revision}`,
      ...live.assignments
        .slice()
        .sort((a, b) => a.positionOrder - b.positionOrder)
        .map((item) => {
          const position = live.spread.positions.find((entry) => entry.id === item.positionId);
          return [
            `Position ${item.positionOrder}: ${position?.name}`,
            `Question: ${position?.question}`,
            `Application: ${position?.meaningApplication}`,
            `Place: ${position?.x}, ${position?.y}, ${item.physicalAngle}°`,
            `Angle note: ${position?.angleNotes[String(item.physicalAngle) as "0" | "90" | "180" | "270"]}`,
            `Card: ${item.cardName} (${item.deckName})`,
            `Upright: ${item.upright}`,
            `Reversed: ${item.reversed || "This deck has no separate reversed meaning."}`,
            `Reading used: ${meaningFor(item.physicalAngle, item.upright, item.reversed)}`,
          ].join("\n");
        }),
    ].join("\n\n");
    if (detail.length > 6000) {
      toast("This spread is too long to send to Solace in full, so it was not sent.");
      return;
    }
    useSolace.getState().openWith({ title: live.spread.name, detail, source: null });
    void navigate({ to: "/solace" });
  };

  const info = live?.spread.positions.find((item) => item.order === infoOrder) ?? spread?.positions.find((item) => item.order === infoOrder);
  const revealed = live?.assignments.find((item) => item.positionOrder === detailOrder && item.face === "up" && item.location === "table");

  return (
    <div className="mt-4">
      <p className="font-display text-2xl">{spread?.name ?? "Spread"}</p>
      <p className="mt-1 text-sm text-muted">{view.deckVisible ? `${view.drawnCount} of ${view.requiredCount} drawn` : view.nextAction === "journal_or_solace" ? "The spread is open." : `${spread?.name ?? "Spread"}`}</p>
      {view.deckVisible ? (
        <div className="mt-8 flex flex-col items-center gap-4">
          <img src="/card-back.jpg" alt="" className="h-48 w-32 rounded-md object-cover shadow-card" />
          <Button
            type="button"
            disabled={!cards?.length || busy}
            onClick={() => run(() => {
              if (!live || live.spread.id !== spread?.id || live.status === "complete") begin();
              const current = useSpreads.getState().session;
              if (!current) return;
              draw(crypto.randomUUID(), take(current));
            })}
          >
            Draw {Math.min(view.drawnCount + 1, view.requiredCount)} of {view.requiredCount}
          </Button>
          {live ? <Button type="button" variant="ghost" onClick={releaseReading}>Discard this reading</Button> : null}
        </div>
      ) : (
        <div className="relative mt-6">
          <div className="relative aspect-[1.65] w-full overflow-hidden rounded-2xl bg-[#1c1917]">
            {view.positions.map((slot) => (
              <div key={slot.position.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${slot.position.x * 100}%`, top: `${slot.position.y * 100}%`, zIndex: slot.position.zIndex }}>
                <button
                  type="button"
                  aria-label={slot.visual === "revealed_face_up" ? slot.revealed?.cardName : slot.visual === "first_face_down" ? "Flip first card" : `Position ${slot.position.order}, ${slot.position.name}`}
                  className={`relative flex h-24 w-16 items-center justify-center overflow-hidden rounded-md border ${slot.visual === "ghost" ? "border-dashed border-fg/30 bg-fg/5" : "border-transparent bg-[#2c2926] shadow-card"} ${view.nextAction === "flip_first" && slot.visual === "first_face_down" ? "ring-2 ring-fg" : ""} ${view.nextAction === "reveal_next_from_stack" && slot.visual === "ghost" && view.nextPosition?.order === slot.position.order ? "ring-1 ring-fg/70" : ""}`}
                  style={{ rotate: `${slot.position.rotationDeg}deg`, transition: reduce ? "none" : "transform 280ms ease" }}
                  onClick={() => {
                    if (slot.visual === "first_face_down") run(() => { applyFlip(); flip(crypto.randomUUID()); });
                    else if (slot.visual === "revealed_face_up") setDetailOrder(slot.position.order);
                  }}
                >
                  {slot.visual === "revealed_face_up" && slot.revealed?.imageUrl ? <img src={slot.revealed.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                  {slot.visual === "first_face_down" ? <img src="/card-back.jpg" alt="" className="h-full w-full object-cover" /> : null}
                  {slot.visual === "ghost" ? <span className="text-xs text-muted">{slot.position.order}</span> : null}
                  {slot.visual === "revealed_face_up" && view.nextPosition?.order === slot.position.order ? null : null}
                </button>
                <button type="button" aria-label={`About position ${slot.position.order}`} className="absolute -right-3 -top-3 flex size-6 items-center justify-center rounded-full bg-surface text-muted" onClick={() => setInfoOrder(slot.position.order)}>
                  <Info className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          {view.waitingStackRemaining > 0 ? (
            <button
              type="button"
              className={`mt-4 flex items-center gap-3 rounded-2xl bg-surface p-3 ${view.nextAction === "reveal_next_from_stack" ? "ring-2 ring-fg" : "opacity-70"}`}
              disabled={busy || view.nextAction !== "reveal_next_from_stack"}
              onClick={() => run(() => { applyDeliver(); deliver(crypto.randomUUID()); })}
            >
              <img src="/card-back.jpg" alt="" className="h-16 w-11 rounded-md object-cover" />
              <span className="text-left text-sm">
                <span className="block">{view.waitingStackRemaining} waiting</span>
                <span className="block text-muted">{view.nextPosition ? `Reveal next card: Position ${view.nextPosition.order} — ${view.nextPosition.name}` : "Waiting"}</span>
              </span>
            </button>
          ) : null}
          {view.nextAction === "flip_first" ? <p className="mt-3 text-sm text-muted">Flip first card</p> : null}
          <div className="mt-4 grid gap-2">
            {live?.assignments.filter((item) => item.face === "up").map((item) => (
              <button key={item.positionId} type="button" className="rounded-xl bg-surface px-3 py-2 text-left text-sm" onClick={() => setDetailOrder(item.positionOrder)}>
                {item.positionOrder}. {live.spread.positions.find((position) => position.id === item.positionId)?.name} — {item.cardName}
              </button>
            ))}
          </div>
          {view.nextAction === "journal_or_solace" ? (
            <div className="mt-4 grid gap-2">
              <Button type="button" variant="secondary" onClick={journal}>{kept ? "Kept in the journal" : "Add Journal Entry"}</Button>
              <Button type="button" variant="secondary" onClick={talk}>Chat with Solace</Button>
              <Button type="button" variant="ghost" onClick={releaseReading}>Clear the table</Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="mt-3" onClick={releaseReading}>Discard this reading</Button>
          )}
        </div>
      )}
      <Dialog open={info != null} onOpenChange={(open) => !open && setInfoOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{info ? `${info.order}. ${info.name}` : "Position"}</DialogTitle>
          </DialogHeader>
          {info && spread ? (
            <div className="grid gap-2 text-sm">
              <p>{spread.description}</p>
              <p className="text-muted">{spread.openingQuestion}</p>
              <p>{info.question}</p>
              <p className="text-subtle">{info.meaningApplication}</p>
              <p className="text-subtle">{info.rotationDeg}°. {info.angleNotes[String(info.rotationDeg) as "0" | "90" | "180" | "270"]}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={revealed != null} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revealed?.cardName}</DialogTitle>
          </DialogHeader>
          {revealed && live ? (
            <div className="grid gap-2 text-sm">
              {revealed.imageUrl ? <img src={revealed.imageUrl} alt="" className="mx-auto h-48 w-32 rounded-md object-cover" /> : null}
              <p>{live.spread.positions.find((item) => item.id === revealed.positionId)?.name} · {revealed.physicalAngle}°</p>
              <p>{meaningFor(revealed.physicalAngle, revealed.upright, revealed.reversed)}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SpreadLay({
  session,
  backSrc,
  backStyle,
  shape,
  guides = true,
}: {
  session: Session;
  backSrc: string;
  backStyle?: CSSProperties;
  shape: { width: string; aspect: number; radius: number };
  guides?: boolean;
}) {
  const view = project(session, session.spread.positions.length);
  const [busy, setBusy] = useState(false);
  const [infoOrder, setInfoOrder] = useState<number | null>(null);
  const [detailOrder, setDetailOrder] = useState<number | null>(null);
  const [overview, setOverview] = useState<Assignment | null>(null);
  const [lifted, setLifted] = useState<number[] | null>(null);
  const pressRef = useRef<{ x: number; y: number; timer: number } | null>(null);
  const skipClick = useRef(false);
  const [travel, setTravel] = useState<{ order: number; x: number; y: number; rotation: number } | null>(null);
  const [showFace, setShowFace] = useState(false);
  const [arriving, setArriving] = useState(session.status === "staged");
  const [stackGlow, setStackGlow] = useState(session.status === "revealing");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dealt = useRef(session.status !== "staged");
  const [canvasBox, setCanvasBox] = useState({ w: 0, h: 0 });
  const [pile, setPile] = useState(() => {
    if (typeof window === "undefined") return { x: 0.86, y: 0.86 };
    try {
      const saved = JSON.parse(localStorage.getItem("solace-spread-stack") || "");
      if (typeof saved?.x === "number" && typeof saved?.y === "number") return { x: saved.x, y: saved.y };
    } catch {
      /* keep the default corner */
    }
    return { x: 0.86, y: 0.86 };
  });
  const pileRef = useRef(pile);
  const dragRef = useRef<{ pointer: number; ox: number; oy: number; moved: boolean } | null>(null);
  const placed = useMemo(() => expandedPositions(session.spread.positions), [session.spread]);
  const flip = useSpreads((s) => s.flip);
  const deliver = useSpreads((s) => s.deliver);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const info = session.spread.positions.find((item) => item.order === infoOrder);
  const revealed = session.assignments.find((item) => item.positionOrder === detailOrder && item.face === "up");
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => setCanvasBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const fitted = canvasBox.w > 0 && canvasBox.h > 0
    ? fittedCardWidth({
        width: canvasBox.w,
        height: canvasBox.h,
        aspect: shape.aspect,
        positions: placed,
      })
    : 0;
  const cardStyle: CSSProperties = {
    width: fitted ? `${fitted}px` : "30%",
    aspectRatio: String(shape.aspect),
    ["--card-aspect" as string]: String(shape.aspect),
    ["--card-width" as string]: fitted ? `${fitted}px` : "30%",
    ["--radius-lg" as string]: `${shape.radius}px`,
    borderRadius: shape.radius,
  };
  const pileStyle: CSSProperties = {
    width: `calc(${shape.width} * 0.28)`,
    aspectRatio: String(shape.aspect),
    borderRadius: `${Math.max(1, shape.radius * 0.28)}px`,
  };
  useEffect(() => {
    if (!travel) return;
    const frame = window.requestAnimationFrame(() => setShowFace(true));
    return () => window.cancelAnimationFrame(frame);
  }, [travel]);
  useEffect(() => {
    if (dealt.current || session.status !== "staged") return;
    dealt.current = true;
    setArriving(true);
  }, [session.status]);
  useEffect(() => {
    setStackGlow(session.status === "revealing");
  }, [session.status]);
  const cardsAt = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !fitted) return [] as Assignment[];
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const cardW = fitted;
    const cardH = fitted / Math.max(0.35, shape.aspect);
    const found = placed.flatMap((spot) => {
      const assignment = session.assignments.find((item) => item.positionId === spot.id && item.face === "up" && item.location === "table");
      if (!assignment) return [];
      const dx = px - spot.x * rect.width;
      const dy = py - spot.y * rect.height;
      const rad = (-spot.rotationDeg * Math.PI) / 180;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      if (Math.abs(lx) > cardW / 2 || Math.abs(ly) > cardH / 2) return [];
      return [assignment];
    });
    return found.sort((a, b) => {
      const az = placed.find((item) => item.id === a.positionId)?.zIndex ?? 0;
      const bz = placed.find((item) => item.id === b.positionId)?.zIndex ?? 0;
      return bz - az;
    });
  };
  const openHeld = (clientX: number, clientY: number) => {
    const hits = cardsAt(clientX, clientY);
    if (!hits.length) return;
    skipClick.current = true;
    if (hits.length === 1) {
      setLifted(null);
      setOverview(hits[0]);
      return;
    }
    setLifted(hits.map((item) => item.positionOrder));
  };
  const traveling = session.assignments.find((item) => item.positionOrder === travel?.order);
  const run = (work: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      work();
    } catch (err) {
      alignSpread();
      toast(err instanceof Error ? err.message : "That step did not finish.");
    } finally {
      window.setTimeout(() => setBusy(false), reduce ? 0 : 280);
    }
  };
  return (
    <div className="absolute inset-0 z-20">
      <div ref={canvasRef} className="absolute inset-0">
      {lifted ? (
        <button type="button" className="absolute inset-0 z-[55] bg-black/45" aria-label="Close the card choice" onClick={() => setLifted(null)} />
      ) : null}
      {lifted ? (
        <p className="pointer-events-none absolute top-3 left-1/2 z-[56] -translate-x-1/2 text-xs tracking-[0.14em] text-white/80 uppercase">Choose a card</p>
      ) : null}
      {view.positions.map((slot) => {
        const spot = placed.find((item) => item.id === slot.position.id) ?? slot.position;
        const liftIndex = lifted?.indexOf(slot.position.order) ?? -1;
        const shift = liftIndex < 0 ? "" : ` translate(${(liftIndex - ((lifted?.length ?? 1) - 1) / 2) * 42}px, -52px) scale(1.08)`;
        return (
        <div key={slot.position.id} className="absolute" style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, zIndex: liftIndex >= 0 ? 70 + liftIndex : slot.position.zIndex, pointerEvents: slot.visual === "ghost" ? "none" : "auto", transform: `translate(-50%, -50%)${shift}`, transition: "transform 280ms var(--ease-smooth-out)", visibility: travel?.order === slot.position.order || (arriving && slot.position.order === 1) ? "hidden" : "visible" }}>
          <div className="relative" style={{ ...cardStyle, rotate: `${spot.rotationDeg}deg` }}>
          {slot.visual === "first_face_down" || slot.visual === "revealed_face_up" ? (
            <button
              type="button"
              aria-label={slot.visual === "first_face_down" ? "Flip first card" : slot.revealed?.cardName}
              className="relative z-10 block w-full leading-none"
              style={{ borderRadius: shape.radius }}
              onClick={() => {
                if (skipClick.current) {
                  skipClick.current = false;
                  return;
                }
                if (liftIndex >= 0) {
                  const chosen = session.assignments.find((item) => item.positionOrder === slot.position.order && item.face === "up");
                  if (chosen) setOverview(chosen);
                  setLifted(null);
                  return;
                }
                if (slot.visual === "first_face_down") run(() => { applyFlip(); flip(crypto.randomUUID()); });
                else setDetailOrder(slot.position.order);
              }}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                if (event.button !== 0 || slot.visual !== "revealed_face_up") return;
                const point = { x: event.clientX, y: event.clientY };
                const timer = window.setTimeout(() => openHeld(point.x, point.y), 480);
                pressRef.current = { ...point, timer };
              }}
              onPointerMove={(event) => {
                const press = pressRef.current;
                if (!press) return;
                if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) {
                  window.clearTimeout(press.timer);
                  pressRef.current = null;
                }
              }}
              onPointerUp={() => {
                if (!pressRef.current) return;
                window.clearTimeout(pressRef.current.timer);
                pressRef.current = null;
              }}
              onPointerCancel={() => {
                if (!pressRef.current) return;
                window.clearTimeout(pressRef.current.timer);
                pressRef.current = null;
              }}
            >
              <PhysicalCard
                art
                className={slot.visual === "first_face_down" && !arriving ? "card-beckon" : ""}
                flipped={slot.visual === "revealed_face_up"}
                card={slot.revealed ? { name: slot.revealed.cardName, suit: slot.revealed.suit, rank: slot.revealed.rank, imageUrl: slot.revealed.imageUrl, keywords: slot.revealed.keywords } : { name: "", suit: "", rank: "", imageUrl: null, keywords: "" }}
                backSrc={backSrc}
                backStyle={backStyle}
                frame={{ radius: shape.radius }}
                style={{ ...cardStyle, width: "100%" }}
              />
            </button>
          ) : guides ? (
            <div
              className={`relative z-10 flex h-full w-full items-center justify-center border border-dashed border-fg/30 bg-fg/5 ${view.nextPosition?.order === slot.position.order && view.nextAction === "reveal_next_from_stack" ? "ring-1 ring-fg/40" : ""}`}
              style={{ aspectRatio: String(shape.aspect), borderRadius: shape.radius }}
            >
              <span className="text-xs text-muted">{slot.position.order}</span>
            </div>
          ) : (
            <div className="h-full w-full" style={{ aspectRatio: String(shape.aspect) }} />
          )}
          {guides ? (
          <button
            type="button"
            aria-label={`About ${slot.position.name}`}
            className={`pointer-events-auto absolute top-full left-1/2 z-0 -translate-x-1/2 px-2 py-px text-[10px] leading-none ${slot.visual === "revealed_face_up" ? "bg-surface/70 text-fg/80" : "bg-surface/15 text-fg/35"}`}
            style={{ marginTop: -1, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }}
            onClick={() => setInfoOrder(slot.position.order)}
          >
            {slot.position.name}
          </button>
          ) : null}
          </div>
        </div>
        );
      })}
      {view.waitingStackRemaining > 0 ? (
        <button
          type="button"
          aria-label={view.nextPosition ? `Reveal next card, position ${view.nextPosition.order}, ${view.nextPosition.name}. ${view.waitingStackRemaining} left. Drag to move the stack.` : `${view.waitingStackRemaining} cards left. Drag to move the stack.`}
          className={`absolute z-40 -translate-x-1/2 -translate-y-1/2 touch-none ${view.nextAction === "reveal_next_from_stack" ? "" : "opacity-80"}`}
          style={{ left: `${pile.x * 100}%`, top: `${pile.y * 100}%`, borderRadius: Math.max(1, shape.radius * 0.34) }}
          onPointerDown={(event) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            dragRef.current = {
              pointer: event.pointerId,
              ox: event.clientX - (pileRef.current.x * rect.width + rect.left),
              oy: event.clientY - (pileRef.current.y * rect.height + rect.top),
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!drag || drag.pointer !== event.pointerId || !rect) return;
            const x = Math.min(0.94, Math.max(0.06, (event.clientX - drag.ox - rect.left) / rect.width));
            const y = Math.min(0.94, Math.max(0.06, (event.clientY - drag.oy - rect.top) / rect.height));
            if (Math.hypot(x - pileRef.current.x, y - pileRef.current.y) > 0.012) drag.moved = true;
            if (!drag.moved) return;
            const next = { x, y };
            pileRef.current = next;
            setPile(next);
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current;
            dragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (drag?.moved) {
              localStorage.setItem("solace-spread-stack", JSON.stringify(pileRef.current));
              return;
            }
            if (busy || view.nextAction !== "reveal_next_from_stack" || travel != null) return;
            const next = view.nextPosition;
            if (!next) return;
            const position = placed.find((item) => item.order === next.order);
            if (!position) return;
            try {
              applyDeliver();
              deliver(crypto.randomUUID());
              if (!reduce) {
                setShowFace(false);
                setTravel({ order: next.order, x: position.x, y: position.y, rotation: position.rotationDeg });
                setBusy(true);
              }
            } catch (err) {
              alignSpread();
              toast(err instanceof Error ? err.message : "That step did not finish.");
            }
          }}
        >
          <span className={`relative block shadow-card ${stackGlow ? "card-beckon" : ""}`} style={pileStyle}>
            <img src={backSrc} alt="" className="absolute inset-0 h-full w-full object-cover" style={backStyle} />
            <span className="absolute right-0.5 bottom-0.5 rounded-full bg-black/70 px-1.5 text-[10px] leading-4 text-white">{view.waitingStackRemaining}</span>
          </span>
        </button>
      ) : null}
      </div>
      {arriving ? (
        <div
          className="spread-deliver"
          style={{ ["--land-x" as string]: `${(placed.find((item) => item.order === 1)?.x ?? 0.5) * 100}%`, ["--land-y" as string]: `${(placed.find((item) => item.order === 1)?.y ?? 0.5) * 100}%`, ["--land-rot" as string]: `${placed.find((item) => item.order === 1)?.rotationDeg ?? 0}deg` }}
          onAnimationEnd={() => setArriving(false)}
        >
          <PhysicalCard art flipped={false} card={{ name: "", suit: "", rank: "", imageUrl: null, keywords: "" }} backSrc={backSrc} backStyle={backStyle} frame={{ radius: shape.radius }} style={cardStyle} />
        </div>
      ) : null}
      {travel && traveling ? (
        <div
          className="spread-deliver"
          style={{ ["--land-x" as string]: `${travel.x * 100}%`, ["--land-y" as string]: `${travel.y * 100}%`, ["--land-rot" as string]: `${travel.rotation}deg` }}
          onAnimationEnd={() => {
            setTravel(null);
            setBusy(false);
          }}
        >
          <PhysicalCard
            art
            flipped={showFace}
            card={{ name: traveling.cardName, suit: traveling.suit, rank: traveling.rank, imageUrl: traveling.imageUrl, keywords: traveling.keywords }}
            backSrc={backSrc}
            backStyle={backStyle}
            frame={{ radius: shape.radius }}
            style={cardStyle}
          />
        </div>
      ) : null}
      <Dialog open={info != null} onOpenChange={(open) => !open && setInfoOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{info ? `${info.order}. ${info.name}` : "Position"}</DialogTitle></DialogHeader>
          {info ? <div className="grid gap-2 text-sm"><p>{session.spread.description}</p><p>{info.question}</p><p className="text-subtle">{info.meaningApplication}</p><p className="text-subtle">{info.rotationDeg}°. {info.angleNotes[String(info.rotationDeg) as "0" | "90" | "180" | "270"]}</p></div> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={revealed != null} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{revealed?.cardName}</DialogTitle></DialogHeader>
          {revealed ? <div className="grid gap-2 text-sm"><p>{session.spread.positions.find((item) => item.id === revealed.positionId)?.name} · {revealed.physicalAngle}°</p><p>{meaningFor(revealed.physicalAngle, revealed.upright, revealed.reversed)}</p></div> : null}
        </DialogContent>
      </Dialog>
      {overview ? (
        <CardOverview
          card={overview}
          positionName={session.spread.positions.find((item) => item.id === overview.positionId)?.name ?? "Position"}
          onClose={() => setOverview(null)}
        />
      ) : null}
    </div>
  );
}

export function SpreadReadingBar({ session }: { session: Session }) {
  const addReading = useJournal((s) => s.addReading);
  const [kept, setKept] = useState(false);
  const navigate = useNavigate();
  if (session.status !== "complete") return null;
  const journal = () => {
    if (kept || (useJournal.getState().readings ?? []).some((item) => item.spreadSessionId === session.id)) {
      setKept(true);
      return;
    }
    const lines = session.assignments
      .slice()
      .sort((a, b) => a.positionOrder - b.positionOrder)
      .map((item) => {
        const position = session.spread.positions.find((entry) => entry.id === item.positionId);
        return `${item.positionOrder}. ${position?.name ?? "Position"} — ${item.cardName} (${item.physicalAngle}°)\n${meaningFor(item.physicalAngle, item.upright, item.reversed)}`;
      })
      .join("\n\n");
    const first = session.assignments.find((item) => item.positionOrder === 1);
    addReading({
      cardId: first?.cardId ?? 0,
      cardName: session.spread.name,
      suit: first?.suit ?? "",
      rank: first?.rank ?? "",
      orientation: first?.physicalAngle === 180 ? "reversed" : "upright",
      keywords: session.spread.name,
      meaningSnapshot: lines,
      notes: lines,
      question: session.pullReason || session.spread.openingQuestion,
      deckId: first?.deckId ?? null,
      deckName: first?.deckName ?? "",
      pulledAt: new Date().toISOString(),
      spreadSessionId: session.id,
      spreadCover: session.spread.tile,
      spreadName: session.spread.name,
    });
    setKept(true);
    toast("The spread was kept.");
  };
  const talk = () => {
    const detail = [
      `Spread: ${session.spread.name}`,
      session.pullReason ? `Reason for the pull: ${session.pullReason}` : "",
      session.spread.description,
      `Question: ${session.spread.openingQuestion}`,
      `Revision: ${session.spread.revision}`,
      ...session.assignments.slice().sort((a, b) => a.positionOrder - b.positionOrder).map((item) => {
        const position = session.spread.positions.find((entry) => entry.id === item.positionId);
        return `Position ${item.positionOrder}: ${position?.name}\n${position?.question}\n${position?.meaningApplication}\n${item.physicalAngle}° ${position?.angleNotes[String(item.physicalAngle) as "0" | "90" | "180" | "270"]}\n${item.cardName} (${item.deckName})\nUpright: ${item.upright}\nReversed: ${item.reversed || "This deck has no separate reversed meaning."}`;
      }),
    ].join("\n\n");
    if (detail.length > 6000) {
      toast("This spread is too long to send to Solace in full, so it was not sent.");
      return;
    }
    useSolace.getState().openWith({ title: session.spread.name, detail, source: null });
    void navigate({ to: "/solace" });
  };
  return (
    <div className="mt-4 grid w-full max-w-md gap-2">
      <Button type="button" variant="secondary" onClick={journal}>{kept ? "Kept in the journal" : "Add Journal Entry"}</Button>
      <Button type="button" variant="secondary" onClick={talk}>Chat with Solace</Button>
    </div>
  );
}
