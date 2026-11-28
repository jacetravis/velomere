"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { CutScene } from "@/lib/physical-deck/visual/cut";
import { compileFluid, FLUID_EASE, type FluidActor } from "@/lib/physical-deck/visual/choreography";
import type { ZoneMap } from "@/lib/physical-deck/visual/compile";
import type { PicturedScene } from "@/lib/physical-deck/visual/playback";

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

function paintActor(actor: FluidActor, host: HTMLElement, backSrc: string, backStyle: CSSProperties, edgeColor: string, radius: number) {
  const node = document.createElement("div");
  node.className = "trace-proxy";
  node.dataset.fluidRole = actor.role;
  node.dataset.proxyDisplay = "single-card";
  node.style.zIndex = String(actor.zIndex);
  node.style.borderRadius = `${radius}px`;
  node.style.boxShadow = `0 16px 28px rgb(20 14 10 / 0.32), inset 0 0 0 1px ${edgeColor}`;
  const img = document.createElement("img");
  img.src = backSrc;
  img.alt = "";
  img.draggable = false;
  Object.assign(img.style, backStyle, { width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit", pointerEvents: "none" });
  node.append(img);
  host.append(node);
  return node.animate(
    actor.frames.map((frame) => ({ transform: frame.transform, opacity: frame.opacity ?? 1, offset: frame.offset })),
    { delay: actor.delay, duration: actor.duration, easing: FLUID_EASE, fill: "both" },
  );
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

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    let closed = false;
    const show = compileFluid(scene, dir, reduced);
    node.replaceChildren();
    node.dataset.motionDriver = show.driver;
    node.dataset.fluidMs = String(show.duration);
    node.dataset.proxyCount = String(show.actors.length);
    const running = show.actors.map((actor) => paintActor(actor, node, backSrc, backStyle, edgeColor, radius));
    const first = show.actors[0];
    publish({
      operationId,
      kind: scene.kind,
      style: scene.kind === "motion" ? scene.style : null,
      eventIndex: 0,
      seq: 0,
      action: show.driver,
      packetCount: first?.ids.length ?? 0,
      packetIds: first ? [...first.ids] : [],
      zones: { draw: [...scene.after] },
      after: [...scene.after],
    });
    const finish = () => {
      if (closed) return;
      closed = true;
      settled.current(generation);
    };
    const timer = window.setTimeout(finish, show.duration + 32);
    return () => {
      closed = true;
      window.clearTimeout(timer);
      for (const animation of running) animation.cancel();
      node.replaceChildren();
    };
  }, [scene, generation, reduced, dir, edgeColor, operationId, style, backSrc, backStyle, radius]);

  return (
    <div
      ref={root}
      className="trace-motion trace-fluid"
      data-motion-faithful="trace"
      data-operation-id={operationId ?? ""}
      data-motion-kind={scene.kind}
      data-motion-style={style}
      data-event-count={scene.frames.length}
      aria-hidden
    />
  );
}

export type { PicturedScene, CutScene };
