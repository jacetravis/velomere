"use client";

import { useRef, useState } from "react";
import { Repeat, Shuffle } from "lucide-react";
import { DeckStack, ShuffleSlider, type CutBeat, type Phase } from "@/components/reading-table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cutCards, shuffleCards } from "@/lib/cards/order";
import { cardFrame } from "@/lib/cards/shape";
import { cutPace, cutSections, SHUFFLE_MAX, SHUFFLE_MIN } from "@/lib/cards/shuffle-count";

const BACK = "/card-back.jpg";

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
}: {
  order: number[];
  label: string;
  onOrder: (order: number[]) => void;
  onCommit: (order: number[], hand: "LEFT" | "RIGHT", shuffleCount: number) => void;
  busy?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [origin, setOrigin] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const [beat, setBeat] = useState<CutBeat | null>(null);
  const [motion, setMotion] = useState<number | null>(null);
  const [hand, setHand] = useState<"right" | "left">("right");
  const [shuffleCount, setShuffleCount] = useState(3);
  const [locked, setLocked] = useState(false);
  const [held, setHeld] = useState(false);
  const [passes, setPasses] = useState(0);
  const holding = useRef(false);
  const run = useRef(0);
  const timers = useRef<number[]>([]);
  const orderRef = useRef(order);
  orderRef.current = order;
  const frame = cardFrame("tarot", 55, 55);

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
    play(0);
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
      const speed = Math.min(SHUFFLE_MAX, 1 + (count - 1) * 2);
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
    play();
  };

  const endHold = () => {
    holding.current = false;
  };

  const cut = (ratio: number) => {
    if (order.length < 2 || phase === "shuffling" || phase === "cutting" || busy) return;
    const token = run.current + 1;
    run.current = token;
    clearTimers();
    setPreview(ratio);
    setMotion(520);
    setBeat("aside");
    setPhase("cutting");
    later(token, 560, () => setBeat("drop"));
    later(token, 1080, () => setBeat("tuck"));
    later(token, 1620, () => {
      const next = cutCards(orderRef.current, ratio);
      onOrder(next);
      setOrigin((value) => (value + splitIndex(orderRef.current.length, ratio)) % Math.max(1, next.length));
      setPreview(null);
      setBeat(null);
      setPhase("ready");
      onCommit(next, hand === "left" ? "LEFT" : "RIGHT", passes);
    });
  };

  return (
    <div>
      <p className="text-sm text-subtle">{label}</p>
      <div className="marble-slab relative mt-4">
        <img src="/marble.jpg" alt="" draggable={false} className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 z-10" style={{ background: "radial-gradient(ellipse at center, transparent 46%, rgb(28 22 16 / 0.45))" }} />
        <div className="relative z-20 flex items-center justify-center py-10">
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
            backStyle={{}}
            hand={hand}
            onPreview={setPreview}
            onCut={cut}
            onTap={() => undefined}
            working={Boolean(busy)}
          />
        </div>
      </div>
      {busy ? <p className="mt-3 text-center text-sm text-subtle" role="status">The cards are being made. The edge stays lit until they turn.</p> : null}
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
          onCommit={(count) => shuffle(count)}
        />
        <Button type="button" variant="secondary" className="w-full" disabled={busy || phase !== "ready"} onClick={() => shuffle(shuffleCount)}>
          <Repeat />
          Shuffle {shuffleCount}
        </Button>
        <div className="flex w-full items-center justify-between gap-4">
          <p className="text-xs text-subtle">{hand === "left" ? "Left hand lifts the left side." : "Right hand lifts the right side."} The hand does not change the meaning.</p>
          <div className="flex items-center gap-2 text-xs text-subtle">
            <span className={hand === "right" ? "text-fg" : undefined}>Right</span>
            <Switch checked={hand === "left"} onCheckedChange={(on) => setHand(on ? "left" : "right")} aria-label="Cut with the left hand" />
            <span className={hand === "left" ? "text-fg" : undefined}>Left</span>
          </div>
        </div>
        <p className="text-center text-xs text-subtle">Drag through the deck to cut. A tap does not draw a card. The cut is kept only when the deck settles.</p>
      </div>
    </div>
  );
}
