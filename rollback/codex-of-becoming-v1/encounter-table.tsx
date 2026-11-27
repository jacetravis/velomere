"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { EncounterDeck } from "@/components/encounter-deck";
import { PairedReveal, SingleReveal, WaitingBacks } from "@/components/encounter-reveal";
import {
  acceptEncounterCut,
  acceptNextEncounterCut,
  beginEncounterAdoption,
  commitEncounter,
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
  const [deck, setDeck] = useState<number[]>(() => Array.from({ length: 78 }, (_, index) => index));
  const [cutKey, setCutKey] = useState<string | null>(null);
  const [staging, setStaging] = useState<Staging | null>(null);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const ceremonyStarted = useRef(0);
  const [cutNote, setCutNote] = useState<string | null>(null);
  const [pendingCut, setPendingCut] = useState(false);
  const [revealTry, setRevealTry] = useState(0);
  const cutLock = useRef(false);
  const sealed = useRef(false);
  const revealing = useRef(false);

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
    sessionStorage.removeItem(SESSION_KEY);
    sealed.current = false;
    cutLock.current = false;
    setSession(null);
    setStaging(null);
    setCeremony(null);
    setCutKey(null);
    setCutNote(null);
    setPendingCut(false);
    setDeck(Array.from({ length: 78 }, (_, index) => index));
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

  const takeCut = async (order: number[], hand: "LEFT" | "RIGHT", shuffleCount: number, next: boolean) => {
    if (cutLock.current || sealed.current) return;
    cutLock.current = true;
    const idempotency = cutKey || key();
    setCutKey(idempotency);
    setCutNote(null);
    setPendingCut(true);
    try {
      if (!next) {
        ceremonyStarted.current = Date.now();
        setCeremony({ phase: "draw" });
        const painted = paintOf(await acceptEncounterCut({
          data: { sessionId: session?.id, order, hand, shuffleCount, key: idempotency, timeZone: zone() },
        }));
        if (painted.sessionId) sessionStorage.setItem(SESSION_KEY, painted.sessionId);
        if (painted.failed || !painted.sessionId || !painted.left?.imageUrl || !painted.right?.imageUrl) {
          if (painted.sessionId) {
            const fresh = await readEncounterSession({ data: { sessionId: painted.sessionId } });
            setSession(fresh);
            const staged = stageFrom(fresh);
            if (staged?.leftUrl && staged.rightUrl) {
              presentPair(staged.leftUrl, staged.rightUrl, staged.sessionId);
              setCutNote(null);
              sealed.current = true;
              return;
            }
          }
          setCeremony({ phase: "failed", message: painted.message || "Card art is still being prepared.", sessionId: painted.sessionId });
          setCutNote(painted.message || "Card art is still being prepared.");
          return;
        }
        presentPair(painted.left.imageUrl, painted.right.imageUrl, painted.sessionId);
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

  const busy = commit.isPending || pendingCut;
  const named = (session?.active ?? []).filter(isNamed);
  const pair = session?.status === "PAIR_READY" && session.revealed !== false && named.length === 2;
  const showDeck = Boolean(ceremony) || (!staging && (!session || session.status === "EMPTY"));
  const rendering = !staging && session?.status === "RENDERING";
  const renderingNext = Boolean(rendering && named.length > 0);
  const showNextDeck = !staging && !rendering && session?.status === "SINGLE_READY" && (session.pool?.length ?? 0) > 0;
  const showFaces = !staging && !rendering;
  const tableNote = session
    ? session.status === "EMPTY"
      ? "The table is open."
      : session.status === "RENDERING"
        ? named.length ? "The new card stays face down." : "Both cards stay face down."
        : session.status === "PAIR_READY" && session.revealed === false
          ? staging?.next ? "The new card turns beside the one you kept." : "Both cards turn together."
          : session.status === "PAIR_READY"
            ? "Two Velomere cards are ready."
            : "One card is active."
    : staging
      ? "Both cards turn together."
      : "";

  return (
    <AppShell>
      <h1 className="font-display text-4xl">Velomere</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {session?.remaining === 0 && session.status !== "EMPTY" ? <Button type="button" variant="secondary" onClick={() => again.mutate()}>Reshuffle source pool</Button> : null}
        <Button type="button" variant="ghost" className="text-muted" onClick={resetTable}>
          Reset Table
        </Button>
      </div>
      {cutNote ? <p className="mt-4 text-sm">{cutNote}</p> : null}
      {showDeck ? (
        <div className="mt-6">
          <EncounterDeck
            order={deck}
            label="As above, so below. Shuffle if you want, then cut. The top and the bottom come forward together. Nothing is drawn until the cut settles."
            busy={busy || ceremony != null}
            onOrder={setDeck}
            onCommit={(order, hand, shuffleCount) => void takeCut(order, hand, shuffleCount, false)}
          />
        </div>
      ) : null}
      {ceremony && ceremony.phase !== "reveal" ? (
        <div className="mt-4">
          <p className="text-sm text-subtle" role="status">
            {ceremony.phase === "failed"
              ? ceremony.message || "The cards could not be prepared."
              : ceremony.phase === "draw"
                ? "The deck settles. The top and the bottom come forward."
                : "Both cards stay face down while they are made."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
            {(["Above", "Below"] as const).map((label, index) => (
              <div key={label} className={index === 0 ? "ceremony-draw min-w-0" : "ceremony-draw ceremony-draw-late min-w-0"}>
                <div className={ceremony.phase === "pulse" ? "edge-pulse overflow-hidden rounded-xl" : "overflow-hidden rounded-xl"}>
                  <img src="/card-back.jpg" alt="" draggable={false} className="aspect-[3.5/5.75] w-full object-cover" />
                </div>
                <p className="mt-2 text-center text-[11px] text-subtle">{label}</p>
              </div>
            ))}
          </div>
          {ceremony.phase === "failed" && session ? (
            <Button type="button" className="mt-3" onClick={() => void retry()}>Retry both cards</Button>
          ) : null}
        </div>
      ) : null}
      {ceremony?.phase === "reveal" && ceremony.leftUrl && ceremony.rightUrl && ceremony.sessionId ? (
        <div className="mt-4">
          <PairedReveal
            key={revealTry}
            leftUrl={ceremony.leftUrl}
            rightUrl={ceremony.rightUrl}
            onDone={() => void finishReveal(ceremony.sessionId || "")}
            onFail={() => setCeremony({ phase: "failed", message: "One card couldn't be prepared. Retry to reveal both.", sessionId: ceremony.sessionId })}
          />
        </div>
      ) : null}
      {rendering && !renderingNext && !ceremony ? (
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
      {tableNote ? <p className="mt-3 text-xs text-subtle" role="status">{tableNote}{session?.remaining != null ? ` ${session.remaining} source cards remain.` : ""}</p> : null}
      {showFaces ? (
      <div className={named.length === 2 ? "mt-6 grid grid-cols-2 gap-2 sm:gap-3" : "mt-6"}>
        {named.map((card, index) => (
          <EncounterFace
            key={card.id}
            card={card}
            place={named.length === 2 ? (index === 0 ? "Left" : "Right") : "Active"}
            onPreview={() => setPreview(card)}
            onZoom={() => setZoom(card)}
            onAdopt={() => adopt.mutate(card.id)}
            adopting={adopt.isPending}
          />
        ))}
      </div>
      ) : null}
      {named.length ? (
        <div className="mt-4 grid gap-2">
          {named.map((card) => (
            <details key={`${card.id}-reading`} className="rounded-2xl bg-surface p-3">
              <summary className="cursor-pointer text-sm">{card.name}</summary>
              <p className="mt-3 text-sm">{card.core}</p>
              <p className="mt-2 text-sm"><span className="text-subtle">Upright. </span>{card.upright}</p>
              <p className="mt-2 text-sm"><span className="text-subtle">Shadow. </span>{card.shadow}</p>
              {card.evidence?.length ? <p className="mt-2 text-xs text-subtle">Evidence: {card.evidence.join(" / ")}</p> : null}
            </details>
          ))}
        </div>
      ) : null}
      {pair ? (
        <div className="mt-4">
          <Button type="button" className="w-full sm:w-auto" disabled={commit.isPending} onClick={() => commit.mutate()}>
            {commit.isPending ? "Encountering…" : "Encounter these cards"}
          </Button>
        </div>
      ) : null}
      {session?.history?.length ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">History</h2>
          <p className="text-sm text-subtle">Committed Encounters stay here. They cannot be unmerged. They can still be read, and added to Encounters.</p>
          {session.history.map((item) => (
            <div key={item.id} className="mt-3 rounded-2xl bg-surface p-3 text-sm">
              <p>{item.left.name} and {item.right.name} became {item.child.name}.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[item.left, item.right, item.child].map((card) => (
                  <Button key={card.id} type="button" variant="secondary" onClick={() => adopt.mutate(card.id)}>Add {card.name}</Button>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}
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
      {geometry ? <p className="text-xs text-subtle">About this geometry. Joins {card.joins ?? "—"}. Scene {card.sceneHash?.slice(0, 16)}.</p> : null}
      <p className="text-xs text-subtle">{card.artLabel ? `${card.artLabel} · ` : ""}{card.kind === "emergent" ? "Encounter result" : "Original Velomere source"}{card.suit ? ` · ${card.suit}` : ""}{card.rank ? ` · ${card.rank}` : ""}</p>
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
  onPreview,
  onZoom,
  onAdopt,
  adopting,
}: {
  card: Face;
  place: string;
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
    <article className={`min-w-0 rounded-2xl bg-surface p-2 sm:p-3 ${place === "Active" ? "mx-auto w-full max-w-xs" : ""}`}>
      <p className="text-[11px] text-subtle sm:text-xs">{place} · {card.kind === "emergent" ? "Encounter result" : "Canonical draw"}</p>
      <h2 className="mt-1 line-clamp-2 font-display text-base sm:text-2xl">{card.name}</h2>
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
        {card.imageUrl ? (
          <img src={card.imageUrl} alt="" draggable={false} className="aspect-[3.5/5.75] w-full rounded-xl object-cover" />
        ) : (
          <span className="flex aspect-[3.5/5.75] items-center justify-center rounded-xl bg-bg text-xs text-subtle">No picture yet</span>
        )}
      </button>
      {card.artLabel ? <p className="mt-1 text-[11px] text-subtle">{card.artLabel}</p> : null}
      <div className="mt-2 flex flex-col gap-2">
        <Button type="button" variant="secondary" className="h-auto min-h-11 whitespace-normal px-2 text-xs" onClick={onPreview}>View card</Button>
        <Button type="button" variant="secondary" className="h-auto min-h-11 whitespace-normal px-2 text-xs" onClick={onZoom}>Fullscreen</Button>
        <Button type="button" variant="secondary" className="h-auto min-h-11 whitespace-normal px-2 text-xs" disabled={adopting} onClick={onAdopt}>Add to Encounters</Button>
      </div>
    </article>
  );
}
