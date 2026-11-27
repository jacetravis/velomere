"use client";

/**
 * Unused preset sprite scene. The Table does not play this.
 * Visible shuffles come from the committed physical trace.
 */

import { useEffect, useRef } from "react";
import type { ShuffleAnimationId } from "@/lib/shuffle-animation";

const DURATION: Record<Exclude<ShuffleAnimationId, "original">, number> = {
  overhand: 2800,
  riffle_bridge: 3200,
  hindu: 2800,
  table_wash: 3600,
  three_packet_cut: 2600,
};

const COUNT: Record<Exclude<ShuffleAnimationId, "original">, number> = {
  overhand: 7,
  riffle_bridge: 12,
  hindu: 7,
  table_wash: 16,
  three_packet_cut: 3,
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smooth(value: number) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function seg(t: number, start: number, end: number) {
  return smooth((t - start) / (end - start));
}

function mix(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function seed(index: number, salt = 0) {
  const value = Math.sin((index + 1) * 123.61 + salt * 73.13) * 43758.5453;
  return value - Math.floor(value);
}

function put(el: HTMLDivElement, x: number, y: number, angle = 0, opacity = 1, scale = 1, z = 1) {
  el.style.opacity = String(opacity);
  el.style.zIndex = String(Math.round(z));
  el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
}

function frameOf(style: Exclude<ShuffleAnimationId, "original">, sprites: HTMLDivElement[], t: number, width: number, height: number) {
  const done = seg(t, 0.82, 1);
  if (style === "overhand") {
    const hold = seg(t, 0, 0.14);
    put(sprites[0], mix(0, width * 0.55, hold) * (1 - done), mix(0, -height * 0.22, hold) * (1 - done), mix(0, 8, hold) * (1 - done), 1 - done * 0.2, mix(1, 0.62, seg(t, 0.14, 0.8)), 30);
    put(sprites[1], mix(0, -width * 0.7, hold) * (1 - done), mix(0, height * 0.34, hold) * (1 - done), -3 * (1 - done), hold, mix(0.45, 1, seg(t, 0.14, 0.8)), 5);
    for (let index = 0; index < 5; index += 1) {
      const start = 0.14 + index * 0.12;
      const progress = seg(t, start, start + 0.18);
      const x = mix(width * 0.55, -width * 0.7, progress);
      const y = mix(-height * 0.22, height * 0.34, progress) - Math.sin(Math.PI * progress) * height * 0.16;
      put(sprites[index + 2], x * (1 - done), y * (1 - done), mix(8, -4, progress) * (1 - done), t >= start ? 1 : 0, 0.78, 8 + index);
    }
    return;
  }
  if (style === "hindu") {
    const present = seg(t, 0, 0.16);
    put(sprites[0], width * 0.85 * present * (1 - done), -height * 0.08 * present * (1 - done), 18 * present * (1 - done), 1, mix(1, 0.55, seg(t, 0.16, 0.8)), 30);
    put(sprites[1], -width * 0.15 * (1 - done), height * 0.42 * present * (1 - done), 0, present, mix(0.4, 1, seg(t, 0.16, 0.8)), 4);
    for (let index = 0; index < 5; index += 1) {
      const start = 0.16 + index * 0.12;
      const progress = seg(t, start, start + 0.16);
      const across = progress < 0.55 ? progress / 0.55 : 1;
      const drop = progress < 0.55 ? 0 : seg(progress, 0.55, 1);
      const x = mix(width * 0.85, -width * 0.55, across);
      const y = mix(-height * 0.08, height * 0.42, drop);
      put(sprites[index + 2], x * (1 - done), y * (1 - done), mix(16, 0, progress) * (1 - done), t >= start ? 1 : 0, 0.72, 8 + index);
    }
    return;
  }
  if (style === "riffle_bridge") {
    const split = seg(t, 0, 0.22);
    const join = seg(t, 0.22, 0.62);
    const bridge = seg(t, 0.62, 0.86);
    const bow = Math.sin(Math.PI * bridge) * height * 0.28;
    put(sprites[0], mix(-width * 0.95, 0, join) * split * (1 - done), -bow * 0.2, mix(-8, 0, join), 1, 1, 6);
    put(sprites[1], mix(width * 0.95, 0, join) * split * (1 - done), -bow * 0.2, mix(8, 0, join), 1, 1, 7);
    for (let index = 0; index < 10; index += 1) {
      const start = 0.22 + index * 0.03;
      const progress = seg(t, start, start + 0.2);
      const side = index % 2 === 0 ? -1 : 1;
      const x = side * mix(width * 0.72, 0, progress);
      const y = -bow * (0.35 + (index % 5) * 0.08);
      put(sprites[index + 2], x * (1 - done), y * (1 - done), side * (1 - progress) * 8, t >= start ? 1 : 0, 0.7, 10 + index);
    }
    return;
  }
  if (style === "table_wash") {
    const release = seg(t, 0, 0.2);
    const gather = seg(t, 0.68, 0.9);
    const square = seg(t, 0.9, 1);
    for (let index = 0; index < sprites.length; index += 1) {
      const x = (seed(index, 1) * 2 - 1) * width * 1.35;
      const y = (seed(index, 2) * 2 - 1) * height * 0.7;
      const drift = Math.sin(t * 7 + index) * width * 0.08 * (1 - gather);
      put(
        sprites[index],
        (x * release * (1 - gather) + drift) * (1 - square),
        y * release * (1 - gather) * (1 - square),
        (seed(index, 3) * 2 - 1) * 14 * release * (1 - square),
        1,
        0.62,
        index + 1,
      );
    }
    return;
  }
  const lift = seg(t, 0, 0.2);
  const places = [
    [-width * 0.95, height * 0.45],
    [0, -height * 0.55],
    [width * 0.95, height * 0.38],
  ];
  for (let index = 0; index < 3; index += 1) {
    const travel = seg(t, 0.22 + index * 0.18, 0.22 + index * 0.18 + 0.24);
    const place = places[index] ?? [0, 0];
    const arc = Math.sin(Math.PI * travel) * height * 0.2;
    put(
      sprites[index],
      place[0] * lift * (1 - travel) * (1 - done),
      (place[1] * lift * (1 - travel) - arc) * (1 - done),
      (index - 1) * 7 * (1 - travel) * (1 - done),
      1,
      0.92,
      10 + index,
    );
  }
}

export function ShuffleChoreography({
  style,
  width,
  aspect,
  radius,
  backSrc,
  backTransform,
  originX,
  originY,
  onDone,
}: {
  style: Exclude<ShuffleAnimationId, "original">;
  width: number;
  aspect: number;
  radius: number;
  backSrc: string;
  backTransform: string;
  originX: number;
  originY: number;
  onDone: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const root = host.current;
    if (!root || width < 8) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sprites: HTMLDivElement[] = [];
    for (let index = 0; index < COUNT[style]; index += 1) {
      const card = document.createElement("div");
      card.style.position = "absolute";
      card.style.left = `${originX}px`;
      card.style.top = `${originY}px`;
      card.style.width = `${width}px`;
      card.style.aspectRatio = String(aspect);
      card.style.borderRadius = `${Math.max(2, radius)}px`;
      card.style.overflow = "hidden";
      card.style.pointerEvents = "none";
      card.style.background = "#1c1714";
      card.style.boxShadow = "0 10px 18px rgb(0 0 0 / 0.35)";
      const image = document.createElement("img");
      image.src = backSrc;
      image.alt = "";
      image.draggable = false;
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.objectFit = "cover";
      if (backTransform) image.style.transform = backTransform;
      card.appendChild(image);
      root.appendChild(card);
      sprites.push(card);
    }
    let frame = 0;
    let start: number | null = null;
    const height = width / Math.max(0.35, aspect);
    const duration = (reduced ? 0.55 : 1) * DURATION[style];
    const tick = (now: number) => {
      if (start == null) start = now;
      const t = clamp((now - start) / duration);
      frameOf(style, sprites, t, width, height);
      if (t < 1) frame = window.requestAnimationFrame(tick);
      else done.current();
    };
    frameOf(style, sprites, 0, width, height);
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      root.replaceChildren();
    };
  }, [style, width, aspect, radius, backSrc, backTransform, originX, originY]);
  return <div ref={host} className="pointer-events-none absolute inset-0 z-50 overflow-visible" aria-hidden />;
}
