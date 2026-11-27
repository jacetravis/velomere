"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TarotCardFace, VelomereBorder, cardImageSrc, placedArtStyle } from "@/components/tarot-card";
import type { Card } from "@/lib/cards/types";
import type { Orientation } from "@/lib/journal/store";

type ZoomCard = Pick<
  Card,
  "name" | "suit" | "rank" | "keywords" | "imageUrl" | "imageScale" | "imageX" | "imageY" | "imageRadius"
>;

export function ArtZoom({
  card,
  orientation,
  onClose,
  onStep,
}: {
  card: ZoomCard;
  orientation: Orientation;
  onClose: () => void;
  onStep?: (delta: number) => boolean;
}) {
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ratio, setRatio] = useState(2 / 3);
  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number; t: number; onCard: boolean } | null>(null);
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [card.imageUrl, card.name]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[80] flex flex-col bg-[#120f0c]">
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" className="text-sm text-[#f7f3ea]" onClick={onClose}>
          Close
        </button>
        <p className="truncate text-sm text-[#f7f3ea]/80">{card.name}</p>
      </div>
      <div
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: pan.x,
            y: pan.y,
            px: event.clientX,
            py: event.clientY,
            t: performance.now(),
            onCard: cardRef.current?.contains(event.target as Node) ?? false,
          };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          setPan({
            x: start.x + event.clientX - start.px,
            y: start.y + event.clientY - start.py,
          });
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          drag.current = null;
          if (!start) return;
          const dx = event.clientX - start.px;
          const dy = event.clientY - start.py;
          const dt = Math.max(1, performance.now() - start.t);
          const flick =
            dt <= 280 &&
            Math.abs(dx) >= 64 &&
            Math.abs(dx) > Math.abs(dy) * 1.35 &&
            Math.abs(dx) / dt >= 0.55;
          if (flick && onStep?.(dx < 0 ? 1 : -1)) {
            setPan({ x: 0, y: 0 });
            return;
          }
          const moved = Math.hypot(dx, dy) > 8;
          if (!moved && start.onCard) onClose();
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          ref={cardRef}
          className="absolute top-1/2 left-1/2 overflow-hidden bg-[#f7f3ea]"
          style={{
            aspectRatio: ratio,
            width: `min(86vw, calc(70vh * ${ratio}))`,
            borderRadius: `${card.imageRadius ?? 2}px`,
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
          }}
        >
          {card.imageUrl ? (
            <div className="relative h-full w-full">
              <img
                src={cardImageSrc(card.imageUrl)}
                alt=""
                draggable={false}
                className="h-full w-full object-contain"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setRatio(image.naturalWidth / image.naturalHeight);
                  }
                }}
                style={{
                  ...placedArtStyle(card.imageScale ?? 100, card.imageX ?? 0, card.imageY ?? 0),
                  transform: [
                    placedArtStyle(card.imageScale ?? 100, card.imageX ?? 0, card.imageY ?? 0).transform,
                    orientation === "reversed" ? "rotate(180deg)" : "",
                  ].filter(Boolean).join(" ") || undefined,
                }}
              />
              <VelomereBorder src={card.imageUrl} suit={card.suit} className={orientation === "reversed" ? "rotate-180" : undefined} />
            </div>
          ) : (
            <TarotCardFace card={card} orientation={orientation} />
          )}
        </div>
      </div>
      <label className="relative z-20 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <span className="mb-2 flex items-baseline justify-between text-xs tracking-[0.16em] text-[#f7f3ea]/70 uppercase">
          Zoom
          <span className="font-display text-sm tracking-normal text-[#f7f3ea] tabular-nums">{zoom}</span>
        </span>
        <input
          type="range"
          min={100}
          max={400}
          value={zoom}
          aria-label="Zoom"
          onChange={(event) => setZoom(Number(event.target.value))}
          className="edge-range w-full"
        />
      </label>
    </div>,
    document.body,
  );
}
