"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Repeat, Shuffle } from "lucide-react";
import { DeckStack, ShuffleSlider, type CutBeat, type Phase } from "@/components/reading-table";
import { Button } from "@/components/ui/button";
import { cutCards, shuffleCards } from "@/lib/cards/order";
import { cardFrame } from "@/lib/cards/shape";
import { cutPace, cutSections, SHUFFLE_MAX, SHUFFLE_MIN } from "@/lib/cards/shuffle-count";
import { subscribeHands, velomereHand } from "@/lib/table-hands";
import { DEFAULT_THEME, subscribeTheme, themeById, themeId } from "@/lib/themes";
import { useJournal } from "@/lib/journal/store";

const BACK = "/card-back.jpg";
const BACK_STYLE = { transform: "scale(1.07)" };
const GLIDE_MS = 900;
const FLIP_MS = 860;
const LAND_MS = 780;
export const REVEAL_BEAT_MS = GLIDE_MS + FLIP_MS + 1000;

export type SeatBox = { left: number; top: number; width: number; height: number };

function splitIndex(count: number, ratio: number) {
  if (count < 2) return 1;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.min(count - 1, Math.max(1, Math.ceil(clamped * (count - 1))));
}

export function EncounterDeck({
  order,
  label,
  onOrder,
  onCommit,
  busy,
  flight = null,
  traces = null,
  risen = false,
  faces = null,
  fresh = null,
  settling = false,
  settleTo = null,
  onCloseReveal,
}: {
  order: number[];
  label: string;
  onOrder: (order: number[]) => void;
  onCommit: (order: number[], hand: "LEFT" | "RIGHT", shuffleCount: number) => void;
  busy?: boolean;
  flight?: "left" | "both" | null;
  traces?: { left: number; right: number } | null;
  risen?: boolean;
  faces?: { left?: string | null; right?: string | null } | null;
  fresh?: { left?: boolean; right?: boolean } | null;
  settling?: boolean;
  settleTo?: { left?: SeatBox | null; right?: SeatBox | null } | null;
  onCloseReveal?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [origin, setOrigin] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const [beat, setBeat] = useState<CutBeat | null>(null);
  const [motion, setMotion] = useState<number | null>(null);
  const hand = useSyncExternalStore(subscribeHands, velomereHand, () => "right" as const);
  const room = themeById(useSyncExternalStore(subscribeTheme, themeId, () => DEFAULT_THEME));
  const savedLook = useJournal((s) => (s.activeDeckId != null ? s.deckLooks[String(s.activeDeckId)] : undefined));
  const flatTableImage = useJournal((s) => s.tableImage);
  const flatTableX = useJournal((s) => s.tableX);
  const flatTableY = useJournal((s) => s.tableY);
  const flatTableScale = useJournal((s) => s.tableScale);
  const flatTableRotate = useJournal((s) => s.tableRotate);
  const flatTableColor = useJournal((s) => s.tableColor);
  const flatTableSat = useJournal((s) => s.tableSat);
  const flatTableLight = useJournal((s) => s.tableLight);
  const flatTableContrast = useJournal((s) => s.tableContrast);
  const flatTableVignette = useJournal((s) => s.tableVignette);
  const table = {
    image: savedLook?.tableImage ?? flatTableImage,
    x: savedLook?.tableX ?? flatTableX,
    y: savedLook?.tableY ?? flatTableY,
    scale: savedLook?.tableScale ?? flatTableScale,
    rotate: savedLook?.tableRotate ?? flatTableRotate,
    color: savedLook?.tableColor ?? flatTableColor,
    saturation: savedLook?.tableSat ?? flatTableSat,
    luminous: savedLook?.tableLight ?? flatTableLight,
    contrast: savedLook?.tableContrast ?? flatTableContrast,
    vignette: savedLook?.tableVignette ?? flatTableVignette,
  };
  const tableBand = useRef<HTMLDivElement>(null);
  const [tableBandHeight, setTableBandHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (risen || tableBandHeight != null || !tableBand.current) return;
    const next = tableBand.current.offsetHeight;
    if (next > 0) setTableBandHeight(next);
  }, [risen, order.length, tableBandHeight]);
  const [shuffleCount, setShuffleCount] = useState(3);
  const [locked, setLocked] = useState(true);
  const [held, setHeld] = useState(false);
  const [passes, setPasses] = useState(0);
  const holding = useRef(false);
  const run = useRef(0);
  const timers = useRef<number[]>([]);
  const orderRef = useRef(order);
  orderRef.current = order;
  const frames = useRef<Partial<Record<"left" | "right", DOMRect>>>({});
  const lift = useRef<Partial<Record<"left" | "right", DOMRect>> | null>(null);
  if (!risen) lift.current = null;
  else if (!lift.current) lift.current = { left: frames.current.left, right: frames.current.right };
  const sized = cardFrame("long-tarot", 55, 55);
  const frame = { ...sized, width: `calc((${sized.width}) * 0.8)` };
  const [veil, setVeil] = useState(0);
  useEffect(() => {
    if (!risen) {
      setVeil(0);
      return;
    }
    const id = window.requestAnimationFrame(() => setVeil(1));
    return () => window.cancelAnimationFrame(id);
  }, [risen]);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  const later = (token: number, ms: number, job: () => void) => {
    const id = window.setTimeout(() => {
      if (run.current !== token) return;
      job();
    }, ms);
    timers.current.push(id);
  };

  const liftLead = () => (reducedMotion() ? 0 : 520);

  const settle = () => {
    clearTimers();
    setPreview(null);
    setBeat(null);
    setMotion(null);
    holding.current = false;
    setHeld(false);
    setPhase("ready");
  };

  const shuffle = (times = shuffleCount) => {
    if (order.length < 2 || phase === "shuffling" || phase === "cutting" || busy) return;
    const count = Math.min(SHUFFLE_MAX, Math.max(SHUFFLE_MIN, Math.round(times)));
    const ratios = cutSections(count);
    const step = Math.round(cutPace(count) / 3);
    const token = run.current + 1;
    run.current = token;
    clearTimers();
    setPhase("shuffling");
    setPasses(count);
    setMotion(Math.max(32, Math.round(step * 0.92)));
    const play = (index: number) => {
      if (run.current !== token) return;
      if (index >= ratios.length) {
        settle();
        return;
      }
      const ratio = ratios[index] ?? 0.5;
      setPreview(ratio);
      setBeat("aside");
      later(token, step, () => setBeat("drop"));
      later(token, step * 2, () => {
        setBeat("tuck");
        onOrder(cutCards(shuffleCards(orderRef.current), ratio));
      });
      later(token, step * 3, () => {
        setOrigin((value) => (value + splitIndex(orderRef.current.length, ratio)) % Math.max(1, orderRef.current.length));
        play(index + 1);
      });
    };
    later(token, liftLead(), () => play(0));
  };

  const beginHold = () => {
    if (order.length < 2 || phase === "cutting" || busy) return;
    if (phase === "shuffling") {
      holding.current = true;
      setHeld(true);
      return;
    }
    const token = run.current + 1;
    run.current = token;
    holding.current = true;
    setHeld(true);
    clearTimers();
    setPhase("shuffling");
    let previous: number | null = null;
    let count = 0;
    const play = () => {
      if (run.current !== token) return;
      if (!holding.current) {
        settle();
        return;
      }
      count += 1;
      setPasses(count);
      const speed = Math.min(SHUFFLE_MAX, 1 + (count - 1) * 1);
      const step = Math.round(cutPace(speed) / 3);
      const ratios = cutSections(7);
      const ratio = ratios.find((item) => previous == null || Math.round(item * 7) !== Math.round((previous ?? 0) * 7)) ?? 0.5;
      previous = ratio;
      setMotion(Math.max(32, Math.round(step * 0.92)));
      setPreview(ratio);
      setBeat("aside");
      later(token, step, () => setBeat("drop"));
      later(token, step * 2, () => {
        setBeat("tuck");
        onOrder(cutCards(shuffleCards(orderRef.current), ratio));
      });
      later(token, step * 3, () => {
        setOrigin((value) => (value + splitIndex(orderRef.current.length, ratio)) % Math.max(1, orderRef.current.length));
        play();
      });
    };
    later(token, liftLead(), () => play());
  };

  const endHold = () => {
    holding.current = false;
  };

  const cut = (ratio: number) => {
    if (order.length < 2 || phase === "shuffling" || phase === "cutting" || busy) return;
    const lead = preview == null ? liftLead() : 0;
    if (passes === 0) {
      const token = run.current + 1;
      run.current = token;
      clearTimers();
      setPhase("shuffling");
      setPasses(1);
      setMotion(180);
      later(token, lead, () => {
        setPreview(ratio);
        setBeat("aside");
      });
      later(token, lead + 180, () => setBeat("drop"));
      later(token, lead + 360, () => {
        setBeat("tuck");
        onOrder(cutCards(shuffleCards(orderRef.current), ratio));
      });
      later(token, lead + 540, () => {
        setMotion(520);
        setPreview(ratio);
        setBeat("aside");
        setPhase("cutting");
      });
      later(token, lead + 1100, () => setBeat("drop"));
      later(token, lead + 1620, () => setBeat("tuck"));
      later(token, lead + 2160, () => {
        const next = cutCards(orderRef.current, ratio);
        onOrder(next);
        setOrigin((value) => (value + splitIndex(next.length, ratio)) % Math.max(1, next.length));
        setPreview(null);
        setBeat(null);
        setPhase("ready");
        onCommit(next, hand === "left" ? "LEFT" : "RIGHT", 1);
      });
      return;
    }
    const token = run.current + 1;
    run.current = token;
    clearTimers();
    setMotion(520);
    setPhase("cutting");
    later(token, lead, () => {
      setPreview(ratio);
      setBeat("aside");
    });
    later(token, 560 + lead, () => setBeat("drop"));
    later(token, 1080 + lead, () => setBeat("tuck"));
    later(token, 1620 + lead, () => {
      const next = cutCards(orderRef.current, ratio);
      onOrder(next);
      setOrigin((value) => (value + splitIndex(orderRef.current.length, ratio)) % Math.max(1, next.length));
      setPreview(null);
      setBeat(null);
      setPhase("ready");
      onCommit(next, hand === "left" ? "LEFT" : "RIGHT", passes);
    });
  };

  const leave = reducedMotion() ? "0ms" : `${LAND_MS}ms`;
  const landing = Boolean(settleTo?.left || settleTo?.right);
  const seats = flight ? (
    <>
      <Seat
        side="left"
        out
        progress={traces?.left ?? 0}
        risen={risen}
        faceUrl={faces?.left}
        fresh={Boolean(fresh?.left)}
        fromRect={risen ? lift.current?.left : undefined}
        toRect={settleTo?.left ?? null}
        deckFrame={frame}
        radius={5}
        onFrame={(rect) => {
          frames.current.left = rect;
        }}
      />
      <Seat
        side="right"
        out={flight === "both"}
        progress={traces?.right ?? 0}
        risen={risen}
        faceUrl={faces?.right}
        fresh={Boolean(fresh?.right)}
        fromRect={risen ? lift.current?.right : undefined}
        toRect={settleTo?.right ?? null}
        deckFrame={frame}
        radius={5}
        onFrame={(rect) => {
          frames.current.right = rect;
        }}
      />
    </>
  ) : null;
  const stage = (
    <div
      className={risen ? "pointer-events-auto w-full max-w-lg" : "contents"}
      style={risen && settling && !landing ? { opacity: 0, transition: `opacity ${leave} ease` } : undefined}
    >
      <div className={risen ? "grid grid-cols-2 gap-3" : "contents"}>{seats}</div>
    </div>
  );

  return (
    <div>
      {label ? <p className="text-sm text-subtle">{label}</p> : null}
      <div
        ref={tableBand}
        className="marble-slab relative mt-4"
        style={{
          ...(phase === "cutting" || phase === "shuffling" || preview != null || risen ? { overflow: "visible" } : null),
          ...(tableBandHeight ? { height: tableBandHeight } : null),
        }}
      >
        <img
          src={table.image || room.table}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
          style={{
            transform: `translate(${table.x}%, ${table.y}%) rotate(${table.rotate}deg) scale(${table.scale / 100})`,
            filter: `hue-rotate(${table.color}deg) saturate(${table.saturation}%) brightness(${table.luminous}%) contrast(${table.contrast}%)`,
          }}
        />
        <div className="table-overhead pointer-events-none absolute inset-0 z-[1]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{ background: `radial-gradient(ellipse at center, transparent 46%, rgb(28 22 16 / ${table.vignette / 140}))` }}
        />
        <div className="relative z-20 flex items-center justify-center py-10">
          {risen ? null : stage}
          <DeckStack
            phase={phase}
            preview={preview}
            beat={beat}
            motion={motion}
            count={order.length}
            origin={origin}
            edge={100}
            edgeColor={0}
            edgeSat={0}
            edgeLight={26}
            thickness={75}
            radius={5}
            frame={frame}
            backSrc={BACK}
            backStyle={BACK_STYLE}
            hand={hand}
            approach
            onPreview={setPreview}
            onCut={cut}
            onTap={() => undefined}
            working={Boolean(busy) && !flight}
          />
        </div>
      </div>
      {risen && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[80] bg-black/72"
                aria-label="Close the cut"
                onClick={onCloseReveal}
                style={{ opacity: settling ? 0 : veil, transition: `opacity ${leave} ease` }}
              />
              <div className="pointer-events-none fixed inset-x-0 top-0 z-[82] flex justify-end p-4" style={{ opacity: settling ? 0 : veil, transition: `opacity ${leave} ease` }}>
                <Button type="button" variant="secondary" className="pointer-events-auto" onClick={onCloseReveal}>Close</Button>
              </div>
              <div className="pointer-events-none fixed inset-0 z-[81] flex items-center justify-center overflow-y-auto px-4 py-8">
                {stage}
              </div>
            </>,
            document.body,
          )
        : null}
      <div className="mt-4 flex w-full max-w-md flex-col items-center gap-3">
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="secondary"
            className="relative flex-1 touch-none select-none"
            disabled={busy || phase === "cutting" || (phase === "shuffling" && !held)}
            onContextMenu={(event) => event.preventDefault()}
          >
            <Shuffle className="pointer-events-none" />
            <span className="pointer-events-none">Hold to Shuffle</span>
            <span
              className="absolute inset-0 z-10"
              aria-hidden
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                beginHold();
              }}
              onPointerUp={endHold}
              onPointerCancel={endHold}
            />
          </Button>
          <Button type="button" className="flex-1" variant="secondary" disabled={busy || phase !== "ready"} onClick={() => cut(0.5)}>
            Cut the deck
          </Button>
        </div>
        <ShuffleSlider
          value={shuffleCount}
          locked={locked}
          onToggleLock={() => setLocked((value) => !value)}
          disabled={busy || phase === "shuffling" || phase === "cutting"}
          onChange={setShuffleCount}
          onCommit={(count) => {
            setLocked(true);
            shuffle(count);
          }}
        />
        <Button type="button" variant="secondary" className="w-full" disabled={busy || phase !== "ready"} onClick={() => shuffle(shuffleCount)}>
          <Repeat />
          Shuffle {shuffleCount}
        </Button>
      </div>
    </div>
  );
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Seat({
  side,
  out,
  progress,
  risen,
  faceUrl,
  fresh,
  geometric = true,
  fromRect,
  toRect = null,
  deckFrame,
  radius = 5,
  onFrame,
}: {
  side: "left" | "right";
  out?: boolean;
  progress: number;
  risen: boolean;
  faceUrl?: string | null;
  fresh: boolean;
  geometric?: boolean;
  fromRect?: DOMRect;
  toRect?: SeatBox | null;
  deckFrame: { width: string; aspect: number };
  radius?: number;
  onFrame?: (rect: DOMRect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const from = useRef<DOMRect | null>(null);
  const [pose, setPose] = useState<{ x: number; y: number; sx: number; sy: number; live: boolean } | null>(null);
  const [land, setLand] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [turned, setTurned] = useState(false);

  useEffect(() => {
    if (risen) return;
    let frame = 0;
    const tick = () => {
      const node = ref.current;
      if (node) {
        const rect = node.getBoundingClientRect();
        from.current = rect;
        onFrame?.(rect);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [risen, out, onFrame]);

  useLayoutEffect(() => {
    if (!risen) {
      setPose(null);
      setTurned(false);
      setLand(null);
      return;
    }
    const glide = reducedMotion() ? 0 : GLIDE_MS;
    const node = ref.current;
    const start = fromRect || from.current;
    const next = node?.getBoundingClientRect();
    let flipTimer = 0;
    let raf = 0;
    if (!node || !start || !next || next.width < 2) {
      setPose({ x: 0, y: 0, sx: 1, sy: 1, live: true });
      flipTimer = window.setTimeout(() => setTurned(true), glide);
      return () => window.clearTimeout(flipTimer);
    }
    const sx = start.width / Math.max(1, next.width);
    const sy = start.height / Math.max(1, next.height);
    const x = start.left + start.width / 2 - (next.left + next.width / 2);
    const y = start.top + start.height / 2 - (next.top + next.height / 2);
    setPose({ x, y, sx, sy, live: false });
    setTurned(false);
    raf = window.requestAnimationFrame(() => setPose({ x: 0, y: 0, sx: 1, sy: 1, live: true }));
    flipTimer = window.setTimeout(() => setTurned(true), glide);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(flipTimer);
    };
  }, [risen, fromRect]);

  useLayoutEffect(() => {
    if (!toRect || !ref.current) {
      setLand(null);
      return;
    }
    const node = ref.current;
    const previous = node.style.transform;
    node.style.transition = "none";
    node.style.transform = "none";
    const base = node.getBoundingClientRect();
    node.style.transform = previous;
    node.style.transition = "";
    const sx = toRect.width / Math.max(1, base.width);
    const sy = toRect.height / Math.max(1, base.height);
    const x = toRect.left + toRect.width / 2 - (base.left + base.width / 2);
    const y = toRect.top + toRect.height / 2 - (base.top + base.height / 2);
    const id = window.requestAnimationFrame(() => setLand({ x, y, sx, sy }));
    return () => window.cancelAnimationFrame(id);
  }, [toRect]);

  const reduce = reducedMotion();
  const duration = reduce ? 0 : land ? LAND_MS : GLIDE_MS;
  const flipMs = reduce ? 0 : FLIP_MS;
  const motion = land
    ? { transform: `translate(${land.x}px, ${land.y}px) scale(${land.sx}, ${land.sy})`, live: true }
    : pose
      ? { transform: `translate(${pose.x}px, ${pose.y}px) scale(${pose.sx}, ${pose.sy})`, live: pose.live }
      : null;
  const flying = !risen;
  const plate = { aspectRatio: String(deckFrame.aspect), borderRadius: `${radius}px` };
  return (
    <div
      ref={ref}
      className={flying ? `velomere-seat velomere-seat-${side}${side === "right" && out ? " is-out" : ""}` : "relative min-w-0"}
      style={
        risen
          ? {
              width: "100%",
              ...plate,
              transform: motion?.transform,
              transition: motion?.live ? `transform ${duration}ms cubic-bezier(0.16, 0.84, 0.32, 1)` : "none",
              transformOrigin: "center center",
              zIndex: 60,
            }
          : { width: deckFrame.width, ...plate, position: "absolute" }
      }
    >
      <div className="relative h-full w-full overflow-hidden [perspective:1100px]" style={{ borderRadius: `${radius}px` }}>
        <div
          className="relative h-full"
          style={{
            transformStyle: "preserve-3d",
            transform: risen && turned ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: `transform ${flipMs}ms cubic-bezier(0.16, 0.84, 0.32, 1)`,
          }}
        >
          <img
            src={BACK}
            alt=""
            draggable={false}
            className="h-full w-full object-cover shadow-card"
            style={{ backfaceVisibility: "hidden", borderRadius: `${radius}px`, transform: "scale(1.07)" }}
          />
          {risen && faceUrl ? (
            <img
              src={faceUrl}
              alt=""
              draggable={false}
              className={`absolute inset-0 h-full w-full object-cover shadow-card${geometric ? " geom-face" : ""}`}
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: `${radius}px` }}
            />
          ) : null}
          {risen && faceUrl && geometric ? (
            <span className="geom-wash" style={{ transform: "rotateY(180deg)", borderRadius: `${radius}px` }} />
          ) : null}
        </div>
        {risen && fresh ? (
          <span className={`fresh-label pointer-events-none absolute top-2 z-10 ${side === "left" ? "left-2" : "right-2"}`}>
            NEW
          </span>
        ) : null}
      </div>
      {flying ? <EdgeTrace progress={progress} radius={radius} /> : null}
    </div>
  );
}

function roundRectPath(width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0`;
}

function EdgeTrace({ progress, radius }: { progress: number; radius: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const node = ref.current?.parentElement;
    if (!node) return;
    const read = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const drawn = Math.max(0, Math.min(1, progress));
  const stroke = 2.75;
  const innerW = Math.max(0, box.w - stroke);
  const innerH = Math.max(0, box.h - stroke);
  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" aria-hidden>
      {box.w > 0 && box.h > 0 ? (
        <path
          className="edge-trace"
          d={roundRectPath(innerW, innerH, Math.max(0, radius - stroke / 2))}
          transform={`translate(${stroke / 2} ${stroke / 2})`}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={`${drawn} 1`}
        />
      ) : null}
    </svg>
  );
}
