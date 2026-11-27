"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { CutScene } from "@/lib/physical-deck/visual/cut";
import { sampleVisual, type VisualSample, type VisualScene, type ZoneMap } from "@/lib/physical-deck/visual/compile";
import { playbackDuration, playbackIndex, renderSamples, type PicturedScene } from "@/lib/physical-deck/visual/playback";

const LIPS = 16;

export type MotionProbe = {
  operationId: string | null;
  kind: PicturedScene["kind"];
  style: string | null;
  eventIndex: number | null;
  seq: number | null;
  action: string | null;
  packetCount: number;
  packetIds: number[];
  zones: ZoneMap;
  after: number[];
};

let probe: MotionProbe | null = null;

/** QA hook. Card ids stay off the reader's DOM. */
export function motionProbe() {
  return probe;
}

function publish(next: MotionProbe | null) {
  probe = next;
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    (window as unknown as { __solaceMotion?: () => MotionProbe | null }).__solaceMotion = motionProbe;
  }
}

const ANCHORS: Record<string, { x: number; y: number; r: number }> = {
  draw: { x: 0, y: 0, r: 0 },
  held: { x: 2, y: -10, r: -4 },
  receive: { x: -48, y: 16, r: 8 },
  upper: { x: -54, y: -8, r: -12 },
  result: { x: 0, y: 4, r: 0 },
  left: { x: -42, y: 0, r: -8 },
  right: { x: 44, y: 0, r: 8 },
  merged: { x: 0, y: 6, r: 0 },
  packet0: { x: -50, y: -4, r: -7 },
  packet1: { x: 0, y: 18, r: 0 },
  packet2: { x: 50, y: -4, r: 7 },
};

function anchor(zone: string, dir: number) {
  const pose = ANCHORS[zone] ?? ANCHORS.draw!;
  return { x: pose.x * dir, y: pose.y, r: pose.r * dir };
}

function mix(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function ease(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function PacketFace({
  count,
  backSrc,
  backStyle,
  edgeColor,
  dir,
  radius,
}: {
  count: number;
  backSrc: string;
  backStyle: CSSProperties;
  edgeColor: string;
  dir: number;
  radius: number;
}) {
  const lips = Math.max(1, Math.min(count, LIPS));
  const gap = Math.min(3.4, 0.55 + Math.sqrt(Math.max(1, count)) * 0.42);
  return (
    <>
      {Array.from({ length: lips }, (_, step) => {
        const depth = lips - 1 - step;
        const face = step === lips - 1;
        return (
          <div
            key={step}
            className="trace-card"
            style={{
              transform: `translate(${dir * depth * gap * 0.42}px, ${depth * gap}px)`,
              background: face ? undefined : edgeColor,
              borderRadius: radius,
              zIndex: step + 1,
              boxShadow: face ? "0 14px 28px rgb(0 0 0 / 0.38)" : undefined,
            }}
          >
            {face ? <img src={backSrc} alt="" draggable={false} style={backStyle} /> : null}
          </div>
        );
      })}
    </>
  );
}

function LipStack({ backSrc, backStyle, radius }: { backSrc: string; backStyle: CSSProperties; radius: number }) {
  return (
    <>
      {Array.from({ length: LIPS }, (_, step) => (
        <div key={step} data-lip={step} className="trace-card" style={{ borderRadius: radius }} hidden>
          <img src={backSrc} alt="" draggable={false} style={backStyle} hidden />
        </div>
      ))}
    </>
  );
}

function showPacket(element: HTMLElement, count: number, dir: number, edgeColor: string) {
  const lips = Math.max(count > 0 ? 1 : 0, Math.min(LIPS, count));
  const gap = Math.min(3.4, 0.55 + Math.sqrt(Math.max(1, count)) * 0.42);
  element.dataset.count = String(count);
  element.querySelectorAll<HTMLElement>("[data-lip]").forEach((lip, step) => {
    if (step >= lips) {
      lip.hidden = true;
      return;
    }
    const depth = lips - 1 - step;
    const face = step === lips - 1;
    lip.hidden = false;
    lip.style.transform = `translate(${dir * depth * gap * 0.42}px, ${depth * gap}px)`;
    lip.style.zIndex = String(step + 1);
    lip.style.background = face ? "" : edgeColor;
    lip.style.boxShadow = face ? "0 14px 28px rgb(0 0 0 / 0.38)" : "";
    const img = lip.querySelector("img");
    if (img instanceof HTMLElement) img.hidden = !face;
  });
}

export function PhysicalShuffleMotion({
  scene,
  generation,
  reduced,
  hand,
  backSrc,
  backStyle,
  edgeColor,
  radius,
  onSettled,
}: {
  scene: PicturedScene;
  generation: number;
  reduced: boolean;
  hand: "left" | "right";
  backSrc: string;
  backStyle: CSSProperties;
  edgeColor: string;
  radius: number;
  onSettled: (generation: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const dir = hand === "left" ? -1 : 1;
  const style = scene.kind === "motion" ? scene.style : "cut";
  const operationId = scene.identity?.operationId ?? null;
  const slotOf = useRef(new Map<number, number>());
  slotOf.current = new Map(scene.before.map((id, index) => [id, index]));

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    let frame = 0;
    let closed = false;
    node.dataset.playbackDriver = reduced ? "reduced-clock" : "samples";
    const paint = (sample: VisualSample) => {
      const traveling = sample.travel?.kind === "transfer" ? sample.travel.ids : [];
      const drop = new Set(traveling);
      const visible = Object.entries(sample.zones)
        .map(([name, cards]) => ({ name, cards: cards.filter((id) => !drop.has(id)) }))
        .filter((zone) => zone.cards.length);
      node.querySelectorAll<HTMLElement>("[data-trace-zone]").forEach((element) => {
        const zone = visible.find((item) => item.name === element.dataset.traceZone);
        if (!zone) {
          element.hidden = true;
          return;
        }
        element.hidden = false;
        const pose = anchor(zone.name, dir);
        let bridge = "";
        if (!reduced && sample.action === "square_without_reordering" && style === "riffle_bridge" && zone.name === "merged") {
          bridge = " scaleY(0.9)";
        }
        element.style.transform = `translate(${pose.x}%, ${pose.y}%) rotate(${pose.r}deg)${bridge}`;
        showPacket(element, zone.cards.length, dir, edgeColor);
      });
      const flyer = node.querySelector<HTMLElement>("[data-trace-flyer]");
      if (flyer && sample.travel?.kind === "transfer") {
        const from = anchor(sample.travel.from, dir);
        const to = anchor(sample.travel.to, dir);
        const t = ease(sample.travel.progress);
        flyer.hidden = false;
        flyer.style.transform = `translate(${mix(from.x, to.x, t)}%, ${mix(from.y, to.y, t)}%) rotate(${mix(from.r, to.r, t)}deg)`;
        showPacket(flyer, sample.travel.ids.length, dir, edgeColor);
      } else if (flyer) flyer.hidden = true;
      const wash = node.querySelector<HTMLElement>("[data-trace-wash]");
      if (wash) {
        const picking = sample.travel?.kind === "pickup" ? sample.travel.ids[0] : null;
        wash.querySelectorAll<HTMLElement>("[data-trace-slot]").forEach((card) => {
          card.hidden = true;
        });
        const showCard = (id: number, x: number, y: number, turn: number) => {
          const slot = slotOf.current.get(id);
          if (slot == null) return;
          const card = wash.querySelector<HTMLElement>(`[data-trace-slot="${slot}"]`);
          if (!card) return;
          card.hidden = false;
          card.style.transform = `translate(${x}%, ${y}%) rotate(${turn}deg)`;
        };
        for (const [key, at] of Object.entries(sample.positions)) {
          const id = Number(key);
          if (picking === id) continue;
          showCard(id, (at.x - 0.5) * 210, (at.y - 0.5) * 170, (at.x - 0.5) * 18 * dir);
        }
        if (picking != null) {
          const at = sample.positions[String(picking)] ?? { x: 0.5, y: 0.5 };
          const t = ease(sample.travel?.progress ?? 0);
          showCard(picking, mix((at.x - 0.5) * 210, 0, t), mix((at.y - 0.5) * 170, 0, t), mix((at.x - 0.5) * 18 * dir, 0, t));
        }
        wash.hidden = Object.keys(sample.positions).length === 0 && picking == null;
      }
      node.dataset.seq = sample.seq == null ? "" : String(sample.seq);
      node.dataset.action = sample.action ?? "before";
      node.dataset.packetCount = String(sample.packetIds.length);
      publish({
        operationId,
        kind: scene.kind,
        style: scene.kind === "motion" ? scene.style : null,
        eventIndex: sample.eventIndex,
        seq: sample.seq,
        action: sample.action,
        packetCount: sample.packetIds.length,
        packetIds: sample.packetIds,
        zones: sample.zones,
        after: [...scene.after],
      });
    };
    const finish = () => {
      if (closed) return;
      closed = true;
      paint(sampleVisual(scene, 1));
      settled.current(generation);
    };
    if (reduced) {
      const started = performance.now();
      const tick = (now: number) => {
        const elapsed = now - started;
        const clock = elapsed < 70 ? 0.05 : 1;
        paint(sampleVisual(scene, clock));
        if (clock < 1) frame = window.requestAnimationFrame(tick);
        else finish();
      };
      paint(sampleVisual(scene, 0));
      frame = window.requestAnimationFrame(tick);
    } else {
      const samples = renderSamples(scene, false);
      const duration = playbackDuration(scene, false);
      node.dataset.playbackSamples = String(samples.length);
      let step = 0;
      const started = performance.now();
      const tick = (now: number) => {
        if (closed) return;
        step = playbackIndex(samples.length, duration, now - started, step);
        paint(samples[step] ?? sampleVisual(scene, 1));
        if (step < samples.length - 1 || now - started < duration) frame = window.requestAnimationFrame(tick);
        else finish();
      };
      paint(samples[0] ?? sampleVisual(scene, 0));
      frame = window.requestAnimationFrame(tick);
    }
    return () => {
      closed = true;
      window.cancelAnimationFrame(frame);
    };
  }, [scene, generation, reduced, dir, edgeColor, operationId, style]);

  const names = new Set<string>(["draw"]);
  for (const frame of scene.frames) {
    for (const name of [...Object.keys(frame.zones), ...Object.keys(frame.beforeZones)]) names.add(name);
    if (frame.from) names.add(frame.from);
    if (frame.to) names.add(frame.to);
  }
  names.delete("wash");
  const showWash = scene.kind === "motion" && scene.style === "table_wash";

  return (
    <div
      ref={root}
      className="trace-motion"
      data-motion-faithful="trace"
      data-operation-id={operationId ?? ""}
      data-motion-kind={scene.kind}
      data-motion-style={style}
      data-event-count={scene.frames.length}
      aria-hidden
    >
      {[...names].map((name) => (
        <div key={name} className="trace-packet" data-trace-zone={name} data-count="0" hidden={name !== "draw"}>
          <LipStack backSrc={backSrc} backStyle={backStyle} radius={radius} />
        </div>
      ))}
      <div className="trace-packet is-flyer" data-trace-flyer="" data-count="0" hidden>
        <LipStack backSrc={backSrc} backStyle={backStyle} radius={radius} />
      </div>
      {showWash ? (
        <div className="trace-wash" data-trace-wash="" hidden>
          {scene.before.map((_, index) => (
            <div key={index} className="trace-wash-card" data-trace-slot={index} hidden>
              <img src={backSrc} alt="" draggable={false} style={backStyle} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type { PicturedScene, VisualScene, CutScene };
