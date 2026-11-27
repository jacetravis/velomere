"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ArtZoom } from "@/components/art-zoom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EncounterDeck, REVEAL_BEAT_MS, type SeatBox } from "@/components/encounter-deck";
import { ExplainSymbols } from "@/components/explain-symbols";
import { PairedReveal, SingleReveal, WaitingBacks } from "@/components/encounter-reveal";
import { shuffleCards } from "@/lib/cards/order";
import {
  acceptEncounterCut,
  acceptNextEncounterCut,
  beginEncounterAdoption,
  commitEncounter,
  keepRevealedVelomere,
  listPersonalVelomereDeck,
  readEncounterSession,
  reshuffleEncounterPool,
  revealEncounterPair,
  retryEncounterCut,
} from "@/lib/encounters/server";

type Face = {
  id: string;
  name?: string;
  core?: string;
  upright?: string;
  shadow?: string;
  keywords?: string[];
  evidence?: string[];
  imageUrl: string | null;
  kind?: string;
  suit?: string;
  rank?: string;
  sceneHash?: string;
  face?: string;
  outcome?: string | null;
  artLabel?: string;
  artRole?: string;
  geometryUrl?: string | null;
  joins?: number | null;
};

type HistoryItem = { id: string; outcome: string; left: Face; right: Face; child: Face };
type Staging = { leftUrl: string; rightUrl: string; sessionId: string; next?: boolean };

type SessionView = {
  id: string;
  status: string;
  version: number;
  remaining?: number;
  revealed?: boolean;
  pool?: number[];
  active: Face[];
  history?: HistoryItem[];
};

type Ceremony = {
  phase: "draw" | "pulse" | "reveal" | "failed";
  leftUrl?: string;
  rightUrl?: string;
  sessionId?: string;
  message?: string;
};

type Fresh = { canonicalIndex: number | null; name: string; isNew: boolean; collected: boolean };

type Seats = {
  phase: "left" | "both" | "reveal" | "failed";
  leftUrl?: string;
  rightUrl?: string;
  sessionId?: string;
  message?: string;
  marks?: { left: Fresh; right: Fresh } | null;
};

function freshDeck() {
  return shuffleCards(Array.from({ length: 78 }, (_, index) => index));
}

function useEdgeProgress(active: boolean, done: boolean) {
  const [value, setValue] = useState(0);
  const started = useRef(0);
  useEffect(() => {
    if (!active) {
      started.current = 0;
      setValue(0);
      return;
    }
    if (done) {
      setValue(1);
      return;
    }
    if (!started.current) started.current = Date.now();
    let frame = 0;
    const tick = () => {
      const elapsed = Date.now() - started.current;
      const eased = 1 - Math.exp(-elapsed / 7000);
      setValue(Math.min(0.92, eased));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, done]);
  return value;
}

const SESSION_KEY = "velomere-encounter-session";
const SCROLL_KEY = "velomere-encounter-scroll";

function zone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function key() {
  return `k${crypto.randomUUID().replace(/-/g, "")}`;
}

function remember(session: SessionView) {
  sessionStorage.setItem(SESSION_KEY, session.id);
}

function boxOf(node?: HTMLElement | null): SeatBox | null {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function isNamed(card: Face): card is Face & { name: string } {
  return typeof card.name === "string" && card.name.length > 0;
}

function paintOf(value: unknown) {
  const row = (value && typeof value === "object" ? value : {}) as {
    failed?: boolean;
    message?: string;
    sessionId?: string;
    left?: { imageUrl?: string | null } | null;
    right?: { imageUrl?: string | null } | null;
  };
  return row;
}

function stageFrom(value: SessionView): Staging | null {
  if (value.status !== "PAIR_READY" || value.revealed !== false || value.active.length < 2) return null;
  const left = value.active[0];
  const right = value.active[1];
  if (!right?.imageUrl) return null;
  if (isNamed(left) && !isNamed(right)) {
    return { leftUrl: left.imageUrl || "", rightUrl: right.imageUrl, sessionId: value.id, next: true };
  }
  if (!isNamed(left) && !isNamed(right) && left?.imageUrl) {
    return { leftUrl: left.imageUrl, rightUrl: right.imageUrl, sessionId: value.id };
  }
  return null;
}

export function EncounterTable() {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionView | null>(null);
  const [preview, setPreview] = useState<Face | null>(null);
  const [zoom, setZoom] = useState<Face | null>(null);
  const [ready, setReady] = useState(false);
  const [deck, setDeck] = useState<number[]>(freshDeck);
  const [cutKey, setCutKey] = useState<string | null>(null);
  const [staging, setStaging] = useState<Staging | null>(null);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [seats, setSeats] = useState<Seats | null>(null);
  const ceremonyStarted = useRef(0);
  const [cutNote, setCutNote] = useState<string | null>(null);
  const [pendingCut, setPendingCut] = useState(false);
  const [revealTry, setRevealTry] = useState(0);
  const cutLock = useRef(false);
  const sealed = useRef(false);
  const revealing = useRef(false);
  const sitting = useRef(0);
  const pairReady = seats?.phase === "reveal" && Boolean(seats.leftUrl && seats.rightUrl);
  const leftTrace = useEdgeProgress(Boolean(seats && seats.phase !== "failed"), Boolean(pairReady));
  const rightTrace = useEdgeProgress(seats?.phase === "both" || Boolean(pairReady), Boolean(pairReady));
  const [risen, setRisen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [arrive, setArrive] = useState(false);
  const [freshSides, setFreshSides] = useState<{ left: boolean; right: boolean } | null>(null);
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const [nextCut, setNextCut] = useState(false);
  const [settleTo, setSettleTo] = useState<{ left: SeatBox | null; right: SeatBox | null } | null>(null);
  const handed = useRef(false);
  const faceSlots = useRef<Partial<Record<"left" | "right", HTMLElement | null>>>({});
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const queryClient = useQueryClient();
  const personal = useQuery({ queryKey: ["personal-velomere"], queryFn: () => listPersonalVelomereDeck() });
  const collected = personal.data?.cards.length ?? 0;

  useEffect(() => {
    if (!pairReady) {
      setRisen(false);
      return;
    }
    const wait = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 80;
    const id = window.setTimeout(() => setRisen(true), wait);
    return () => window.clearTimeout(id);
  }, [pairReady]);

  useEffect(() => {
    if (seats?.phase !== "reveal" || !seats.sessionId || seats.marks) return;
    let cancel = false;
    void keepRevealedVelomere({ data: { sessionId: seats.sessionId } })
      .then((value) => {
        if (cancel) return;
        setSeats((current) => (
          current?.phase === "reveal"
            ? { ...current, marks: { left: value.left, right: value.right } }
            : current
        ));
        void queryClient.invalidateQueries({ queryKey: ["personal-velomere"] });
      })
      .catch((err) => {
        if (cancel) return;
        const message = err instanceof Error ? err.message : "The cards could not be kept.";
        setSeats((current) => (current ? { ...current, phase: "failed", message } : current));
        setCutNote(message);
      });
    return () => {
      cancel = true;
    };
  }, [seats?.phase, seats?.sessionId, seats?.marks, queryClient]);

  useEffect(() => {
    if (ceremony?.phase !== "draw") return;
    const id = window.setTimeout(() => {
      setCeremony((current) => (current?.phase === "draw" ? { ...current, phase: "pulse" } : current));
    }, 900);
    return () => window.clearTimeout(id);
  }, [ceremony?.phase]);

  const presentPair = (leftUrl: string, rightUrl: string, sessionId: string) => {
    const wait = Math.max(0, 920 - (Date.now() - ceremonyStarted.current));
    window.setTimeout(() => {
      setCeremony({ phase: "reveal", leftUrl, rightUrl, sessionId });
    }, wait);
  };

  const resetTable = () => {
    sitting.current += 1;
    sessionStorage.removeItem(SESSION_KEY);
    sealed.current = false;
    cutLock.current = false;
    setSession(null);
    setStaging(null);
    setCeremony(null);
    setSeats(null);
    setRisen(false);
    setSettling(false);
    setArrive(false);
    setFreshSides(null);
    setAddedNote(null);
    setSettleTo(null);
    setNextCut(false);
    handed.current = false;
    setCutKey(null);
    setCutNote(null);
    setPendingCut(false);
    setDeck(freshDeck());
  };

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) {
      setReady(true);
      return;
    }
    void readEncounterSession({ data: { sessionId: saved } })
      .then((value) => {
        setSession(value);
        const staged = stageFrom(value);
        if (staged) {
          setStaging(staged);
          sealed.current = true;
        } else if (value.status === "RENDERING") {
          setCutNote("Card art is still being prepared.");
        }
        const y = Number(sessionStorage.getItem(SCROLL_KEY) || "0");
        if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
      })
      .catch(() => sessionStorage.removeItem(SESSION_KEY))
      .finally(() => setReady(true));
  }, []);

  const finishReveal = async (sessionId: string) => {
    if (revealing.current) return;
    revealing.current = true;
    try {
      const fresh = await revealEncounterPair({ data: { sessionId } });
      setSession(fresh);
      remember(fresh);
      setStaging(null);
      setCeremony(null);
      setCutNote(null);
      setCutKey(null);
      sealed.current = false;
    } catch (err) {
      setCutNote(err instanceof Error ? err.message : "The cards could not be revealed.");
    } finally {
      revealing.current = false;
    }
  };

  const handoff = async () => {
    if (handed.current) return;
    const current = seatsRef.current;
    const sessionId = current?.sessionId;
    if (!sessionId) return;
    handed.current = true;
    const leftNew = Boolean(current.marks?.left.isNew);
    const rightNew = Boolean(current.marks?.right.isNew);
    setFreshSides({ left: leftNew, right: rightNew });
    const names = [leftNew ? current.marks?.left.name : "", rightNew ? current.marks?.right.name : ""].filter((name): name is string => Boolean(name));
    if (names.length === 1) setAddedNote(`${names[0]} was added to your Velomere deck.`);
    else if (names.length > 1) setAddedNote("Two new cards were added to your Velomere deck.");
    else setAddedNote(null);
    try {
      await finishReveal(sessionId);
    } catch {
      /* finishReveal records the note */
    }
    setArrive(false);
    setSettling(true);
    if (names.length) window.setTimeout(() => setAddedNote(null), 3400);
  };
  const handoffRef = useRef(handoff);
  handoffRef.current = handoff;

  useEffect(() => {
    if (!risen || handed.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = Date.now();
    const minHold = reduce ? 0 : REVEAL_BEAT_MS;
    const id = window.setInterval(() => {
      if (handed.current) return;
      const waited = Date.now() - started;
      const marksReady = Boolean(seatsRef.current?.marks);
      if (waited >= minHold && (marksReady || waited > 7000)) void handoffRef.current();
    }, 90);
    return () => window.clearInterval(id);
  }, [risen]);

  useEffect(() => {
    if (!settling) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let end = 0;
    const measure = window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      const left = boxOf(faceSlots.current.left);
      const right = boxOf(faceSlots.current.right);
      if (left || right) setSettleTo({ left, right });
      end = window.setTimeout(() => {
        setSeats(null);
        setRisen(false);
        setSettling(false);
        setSettleTo(null);
      }, left || right ? (reduce ? 0 : 920) : (reduce ? 0 : 420));
    });
    return () => {
      window.cancelAnimationFrame(measure);
      window.clearTimeout(end);
    };
  }, [settling]);

  const takeCut = async (order: number[], hand: "LEFT" | "RIGHT", shuffleCount: number, next: boolean) => {
    if (cutLock.current || sealed.current) return;
    cutLock.current = true;
    const ticket = sitting.current;
    const idempotency = cutKey || key();
    setCutKey(idempotency);
    setCutNote(null);
    setPendingCut(true);
    try {
      if (!next) {
        ceremonyStarted.current = Date.now();
        setRisen(false);
        setSettling(false);
        setArrive(false);
        setSettleTo(null);
        setNextCut(false);
        handed.current = false;
        setSeats({ phase: "left" });
        window.setTimeout(() => {
          if (ticket !== sitting.current) return;
          setSeats((current) => (current?.phase === "left" ? { ...current, phase: "both" } : current));
        }, 720);
        const painted = paintOf(await acceptEncounterCut({
          data: { sessionId: session?.id, order, hand, shuffleCount, key: idempotency, timeZone: zone() },
        }));
        if (ticket !== sitting.current) return;
        if (painted.sessionId) sessionStorage.setItem(SESSION_KEY, painted.sessionId);
        if (painted.failed || !painted.sessionId || !painted.left?.imageUrl || !painted.right?.imageUrl) {
          setSeats({ phase: "failed", message: painted.message || "Card art is still being prepared.", sessionId: painted.sessionId });
          setCutNote(painted.message || "Card art is still being prepared.");
          return;
        }
        const wait = Math.max(0, 1500 - (Date.now() - ceremonyStarted.current));
        window.setTimeout(() => {
          if (ticket !== sitting.current) return;
          setSeats({
            phase: "reveal",
            leftUrl: painted.left?.imageUrl || "",
            rightUrl: painted.right?.imageUrl || "",
            sessionId: painted.sessionId,
            marks: null,
          });
        }, wait);
        sealed.current = true;
        return;
      }
      if (!session) return;
      const painted = paintOf(await acceptNextEncounterCut({
        data: { sessionId: session.id, order, hand, key: idempotency, timeZone: zone() },
      }));
      if (painted.failed || !painted.right?.imageUrl) {
        const fresh = await readEncounterSession({ data: { sessionId: session.id } });
        setSession(fresh);
        const staged = stageFrom(fresh);
        if (staged) {
          setStaging(staged);
          setCutNote(null);
          sealed.current = true;
          return;
        }
        setCutNote(painted.message || "Card art is still being prepared.");
        return;
      }
      const fresh = await readEncounterSession({ data: { sessionId: session.id } });
      setSession(fresh);
      setStaging({ leftUrl: "", rightUrl: painted.right.imageUrl, sessionId: session.id, next: true });
      sealed.current = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "The cut was not kept.";
      setCutNote(message);
      setCeremony((current) => (current ? { ...current, phase: "failed", message } : current));
      setSeats((current) => (current ? { ...current, phase: "failed", message } : current));
    } finally {
      cutLock.current = false;
      setPendingCut(false);
    }
  };

  const retry = async () => {
    if (!session || cutLock.current) return;
    cutLock.current = true;
    setCutNote(null);
    try {
      const painted = paintOf(await retryEncounterCut({ data: { sessionId: session.id } }));
      if (painted.failed || !painted.right?.imageUrl) {
        const message = painted.message || "Card art is still being prepared.";
        setCeremony((current) => (current ? { phase: "failed", message, sessionId: session.id } : current));
        setCutNote(message);
        return;
      }
      const next = !painted.left?.imageUrl;
      if (next) {
        const fresh = await readEncounterSession({ data: { sessionId: session.id } });
        setSession(fresh);
        setStaging({ leftUrl: "", rightUrl: painted.right.imageUrl, sessionId: session.id, next: true });
      } else if (painted.left?.imageUrl && painted.right?.imageUrl) {
        ceremonyStarted.current = Date.now() - 920;
        presentPair(painted.left.imageUrl, painted.right.imageUrl, session.id);
      }
      sealed.current = true;
    } catch (err) {
      setCutNote(err instanceof Error ? err.message : "The cut was not kept.");
    } finally {
      cutLock.current = false;
    }
  };

  const commit = useMutation({
    mutationFn: () => {
      if (!session) throw new Error("Nothing is on the table.");
      return commitEncounter({ data: { sessionId: session.id, version: session.version, key: key(), timeZone: zone() } });
    },
    onSuccess: (value) => {
      setNextCut(false);
      setArrive(true);
      setSession((current) => {
        if (!current) return current;
        const next = { ...current, status: value.status, version: value.version, active: value.active };
        remember(next);
        return next;
      });
      toast(value.alreadyCommitted ? "That Encounter was already committed." : "The Encounter is committed. It cannot be undone.");
      void readEncounterSession({ data: { sessionId: session!.id } }).then((fresh) => {
        setSession(fresh);
        remember(fresh);
      }).catch(() => undefined);
    },
    onError: (err: Error) => toast(err.message),
  });

  const again = useMutation({
    mutationFn: () => {
      if (!session) throw new Error("Nothing is on the table.");
      return reshuffleEncounterPool({ data: { sessionId: session.id, version: session.version } });
    },
    onSuccess: (value) => setSession((current) => current ? { ...current, version: value.version, remaining: value.remaining } : current),
    onError: (err: Error) => toast(err.message),
  });

  const adopt = useMutation({
    mutationFn: (cardId: string) => beginEncounterAdoption({ data: { cardId } }),
    onSuccess: (value, cardId) => {
      sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      void navigate({ to: "/solace", search: { draft: value.id, card: cardId } });
    },
    onError: (err: Error) => toast(err.message),
  });

  const busy = commit.isPending || pendingCut || seats?.phase === "left" || seats?.phase === "both";
  const named = (session?.active ?? []).filter(isNamed);
  const pair = session?.status === "PAIR_READY" && session.revealed !== false && named.length === 2;
  const showDeck = !staging && (Boolean(seats) || !session || session.status === "EMPTY");
  const rendering = !staging && session?.status === "RENDERING";
  const renderingNext = Boolean(rendering && named.length > 0);
  const showNextDeck = nextCut && !staging && !rendering && session?.status === "SINGLE_READY" && (session.pool?.length ?? 0) > 0;
  const showFaces = !staging && !rendering && (!seats || settling);
  const tableNote = session
    ? session.status === "EMPTY"
      ? "The table is open."
      : session.status === "RENDERING"
        ? named.length ? "The new card stays face down." : "Both cards stay face down."
        : session.status === "PAIR_READY" && session.revealed === false
          ? staging?.next ? "The new card turns beside the one you kept." : "Both cards turn together."
          : ""
    : staging
      ? "Both cards turn together."
      : "";

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-3xl tracking-tight sm:text-4xl">Discovered {collected} of 78</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {session?.remaining === 0 && session.status !== "EMPTY" ? <Button type="button" variant="secondary" onClick={() => again.mutate()}>Reshuffle source pool</Button> : null}
          <Button type="button" variant="ghost" className="text-muted" onClick={resetTable}>
            Reset Table
          </Button>
        </div>
      </div>
      {addedNote ? (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-[90] flex justify-center px-6">
          <p className="velomere-added max-w-sm rounded-full bg-accent px-4 py-2 text-center text-sm text-accent-fg shadow-card" role="status">
            {addedNote}
          </p>
        </div>
      ) : null}
      {cutNote ? <p className="mt-4 text-sm">{cutNote}</p> : null}
      {showDeck ? (
        <div className={settling ? "pointer-events-none h-0 overflow-hidden" : "mt-6"}>
          <EncounterDeck
            order={deck}
            label=""
            busy={busy || ceremony != null || (seats != null && seats.phase !== "failed")}
            flight={seats?.phase === "left" ? "left" : seats && seats.phase !== "failed" ? "both" : null}
            traces={{ left: leftTrace, right: rightTrace }}
            risen={risen && Boolean(pairReady)}
            settling={settling}
            settleTo={settling ? settleTo : null}
            faces={pairReady ? { left: seats?.leftUrl, right: seats?.rightUrl } : null}
            fresh={{ left: Boolean(seats?.marks?.left.isNew), right: Boolean(seats?.marks?.right.isNew) }}
            onCloseReveal={() => void handoff()}
            onOrder={setDeck}
            onCommit={(order, hand, shuffleCount) => void takeCut(order, hand, shuffleCount, false)}
          />
        </div>
      ) : null}
      {seats?.phase === "failed" ? (
        <div className="mt-4">
          <p className="text-sm">{seats.message || "The cards could not be prepared."}</p>
          {session ? <Button type="button" className="mt-3" onClick={() => void retry()}>Retry both cards</Button> : null}
        </div>
      ) : null}
      {rendering && !renderingNext && !ceremony && !seats ? (
        <div className="mt-6">
          <WaitingBacks />
          <Button type="button" className="mt-3" onClick={() => void retry()}>Retry both cards</Button>
        </div>
      ) : null}
      {staging && !staging.next ? (
        <div className="mt-6">
          <PairedReveal
            key={revealTry}
            leftUrl={staging.leftUrl}
            rightUrl={staging.rightUrl}
            onDone={() => void finishReveal(staging.sessionId)}
            onFail={() => setCutNote("One card couldn't be prepared. Retry to reveal both.")}
          />
          {cutNote ? <Button type="button" className="mt-3" onClick={() => { setCutNote(null); setRevealTry((value) => value + 1); }}>Try the pictures again</Button> : null}
        </div>
      ) : null}
      {staging?.next || renderingNext ? (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3">
          {named.map((card, index) => (
            <div key={card.id} className={staging?.next ? "pointer-events-none min-w-0" : "min-w-0"}>
            <EncounterFace
              card={card}
              place={index === 0 ? "Left" : "Right"}
              onPreview={() => setPreview(card)}
              onZoom={() => setZoom(card)}
              onAdopt={() => adopt.mutate(card.id)}
              adopting={adopt.isPending}
            />
            </div>
          ))}
          <div className="min-w-0">
            {staging?.next ? (
              <SingleReveal
                key={revealTry}
                url={staging.rightUrl}
                onDone={() => void finishReveal(staging.sessionId)}
                onFail={() => setCutNote("The new card couldn't be prepared.")}
              />
            ) : (
              <>
                <div className="edge-pulse overflow-hidden rounded-xl">
                  <img src="/card-back.jpg" alt="" draggable={false} className="aspect-[3.5/5.75] w-full object-cover" />
                </div>
                <p className="mt-2 text-center text-[11px] text-subtle">New card</p>
                <Button type="button" className="mt-3" onClick={() => void retry()}>Retry this card</Button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {showFaces ? (
      <div className={`${named.length === 2 ? "mt-6 grid grid-cols-2 gap-2 sm:gap-3" : "mt-6"}${arrive && named.length === 1 ? " velomere-arrive" : ""}${settling ? " invisible" : ""}`}>
        {named.map((card, index) => (
          <EncounterFace
            key={card.id}
            card={card}
            place={named.length === 2 ? (index === 0 ? "Left" : "Right") : "Active"}
            isNew={named.length === 2 && Boolean(index === 0 ? freshSides?.left : freshSides?.right)}
            freshSide={index === 0 ? "left" : "right"}
            slotRef={named.length === 2 ? (node) => { faceSlots.current[index === 0 ? "left" : "right"] = node; } : undefined}
            onPreview={() => setPreview(card)}
            onZoom={() => setZoom(card)}
            onAdopt={() => adopt.mutate(card.id)}
            adopting={adopt.isPending}
          />
        ))}
      </div>
      ) : null}
      {pair && !settling ? (
        <div className="mt-4">
          {commit.isPending ? (
            <div className="mb-3 grid gap-2" role="status" aria-live="polite">
              <p className="text-sm">The two cards are becoming one.</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="companion-progress h-full rounded-full bg-accent" />
              </div>
            </div>
          ) : null}
          <Button type="button" className="w-full sm:w-auto" disabled={commit.isPending} onClick={() => commit.mutate()}>
            {commit.isPending ? "Encountering…" : "Encounter these cards"}
          </Button>
        </div>
      ) : null}
      {session?.status === "SINGLE_READY" && (session.pool?.length ?? 0) > 0 && !nextCut && !seats ? (
        <div className="mt-4">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setNextCut(true)}>Draw & Further Encounter</Button>
        </div>
      ) : null}
      {showNextDeck ? (
        <div className="mt-6">
          <EncounterDeck
            order={session?.pool ?? []}
            label="Cut once more for a single card, to the right of the one already here. Only the top of this cut is drawn."
            busy={busy}
            onOrder={(order) => setSession((current) => current ? { ...current, pool: order } : current)}
            onCommit={(order, hand, shuffleCount) => void takeCut(order, hand, shuffleCount, true)}
          />
        </div>
      ) : null}
      {session?.status === "SINGLE_READY" && (session.pool?.length ?? 0) === 0 ? (
        <p className="mt-4 text-sm text-subtle">The source pool is empty. Reset the table when you want another sitting. What you already committed stays.</p>
      ) : null}
      {tableNote && !settling ? <p className="mt-3 text-xs text-subtle" role="status">{tableNote}</p> : null}
      <Dialog open={preview != null} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {preview ? <CardDetail card={preview} session={session} /> : null}
        </DialogContent>
      </Dialog>
      {zoom ? (
        <ArtZoom
          card={{
            name: zoom.name || "Velomere",
            suit: zoom.suit || (zoom.kind === "emergent" ? "Encounter" : "Velomere"),
            rank: zoom.rank || "",
            keywords: (zoom.keywords || []).join(", "),
            imageUrl: zoom.imageUrl,
            imageScale: 100,
            imageX: 0,
            imageY: 0,
            imageRadius: 2,
          }}
          orientation="upright"
          onClose={() => setZoom(null)}
        />
      ) : null}
    </AppShell>
  );
}

function CardDetail({ card, session }: { card: Face; session: SessionView | null }) {
  const [geometry, setGeometry] = useState(false);
  const src = geometry && card.geometryUrl ? card.geometryUrl : card.imageUrl;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{card.name}</DialogTitle>
      </DialogHeader>
      {src ? <img src={src} alt="" className="mx-auto w-full max-w-xs rounded-xl" /> : null}
      {card.geometryUrl ? (
        <Button type="button" variant="secondary" className="min-h-11" onClick={() => setGeometry((open) => !open)}>
          {geometry ? "Return to Artwork" : "Show Original Geometry"}
        </Button>
      ) : null}
      <ExplainSymbols encounterCardId={card.id} />
      {geometry ? <p className="text-xs text-subtle">About this geometry. Joins {card.joins ?? "—"}. Scene {card.sceneHash?.slice(0, 16)}.</p> : null}
      <p className="text-xs text-subtle">{card.kind === "emergent" ? "Encounter result" : "Original Velomere source"}{card.suit ? ` · ${card.suit}` : ""}{card.rank ? ` · ${card.rank}` : ""}</p>
      <p className="text-sm">{card.core}</p>
      <p className="text-sm"><span className="text-subtle">Upright. </span>{card.upright}</p>
      <p className="text-sm"><span className="text-subtle">Shadow. </span>{card.shadow}</p>
      <Lineage session={session} card={card} />
    </>
  );
}

function Lineage({ session, card }: { session: SessionView | null; card: Face }) {
  const hit = session?.history?.find((item) => item.child.id === card.id);
  if (!hit) return null;
  return <p className="text-sm text-subtle">From {hit.left.name} and {hit.right.name}. Those sources stay as they were.</p>;
}

function EncounterFace({
  card,
  place,
  isNew = false,
  freshSide = "left",
  slotRef,
  onPreview,
  onZoom,
  onAdopt,
  adopting,
}: {
  card: Face;
  place: string;
  isNew?: boolean;
  freshSide?: "left" | "right";
  slotRef?: (node: HTMLSpanElement | null) => void;
  onPreview: () => void;
  onZoom: () => void;
  onAdopt: () => void;
  adopting: boolean;
}) {
  const timer = useRef<number | null>(null);
  const suppress = useRef(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <article className={`min-w-0 rounded-2xl bg-surface p-2 sm:p-3 ${place === "Active" ? "mx-auto w-full max-w-sm" : ""}`}>
      <h2 className="line-clamp-2 font-display text-base sm:text-2xl">{card.name}</h2>
      <button
        type="button"
        className="mt-2 block w-full"
        aria-label={`View ${card.name}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          moved.current = false;
          start.current = { x: event.clientX, y: event.clientY };
          clear();
          timer.current = window.setTimeout(() => {
            suppress.current = true;
            onZoom();
          }, 500);
        }}
        onPointerMove={(event) => {
          if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 12) {
            moved.current = true;
            clear();
          }
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onClick={() => {
          if (suppress.current) {
            suppress.current = false;
            return;
          }
          if (moved.current) return;
          onPreview();
        }}
      >
        <span ref={slotRef} className="relative block overflow-hidden" style={{ borderRadius: 5 }}>
          {isNew ? (
            <span className={`fresh-label pointer-events-none absolute top-2 z-10 ${freshSide === "left" ? "left-2" : "right-2"}`}>NEW</span>
          ) : null}
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt=""
              draggable={false}
              className={`aspect-[3.5/5.75] w-full object-cover${card.artRole === "geometry" ? " geom-face" : ""}`}
              style={{ borderRadius: 5 }}
            />
          ) : (
            <span className="flex aspect-[3.5/5.75] items-center justify-center bg-bg text-xs text-subtle" style={{ borderRadius: 5 }}>No picture yet</span>
          )}
          {card.imageUrl && card.artRole === "geometry" ? <span className="geom-wash" style={{ borderRadius: 5 }} /> : null}
        </span>
      </button>
      {card.core || card.upright || card.shadow || card.keywords?.length ? (
        <div className="mt-2 max-h-36 overflow-y-auto overscroll-contain rounded-xl bg-bg px-2.5 py-2 text-xs leading-relaxed">
          {card.core ? <p>{card.core}</p> : null}
          {card.upright ? <p className="mt-2"><span className="text-subtle">Upright. </span>{card.upright}</p> : null}
          {card.shadow ? <p className="mt-2"><span className="text-subtle">Shadow. </span>{card.shadow}</p> : null}
          {card.keywords?.length ? <p className="mt-2 text-subtle">{card.keywords.join(" · ")}</p> : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-col gap-2">
        <Button type="button" variant="secondary" className="h-auto min-h-11 whitespace-normal px-2 text-xs" onClick={onPreview}>View full details</Button>
        {card.kind === "emergent" ? (
          <Button type="button" variant="paper" className="h-auto min-h-11 whitespace-normal px-2 text-xs" disabled={adopting} onClick={onAdopt}>Save card with Solace</Button>
        ) : null}
      </div>
    </article>
  );
}
