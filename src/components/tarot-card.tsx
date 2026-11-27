"use client";

import type { Card } from "@/lib/cards/types";
import { cardPortrait } from "@/lib/cards/portrait";
import { cn } from "@/lib/utils";
import { useEffect, useState, type CSSProperties } from "react";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "w-16",
  md: "w-28",
  lg: "max-w-[78vw]",
};

/** Position the art inside the card. 0, 0 is centered. */
export function placedArtStyle(scale = 100, x = 0, y = 0): CSSProperties {
  return { transform: `translate(${x}%, ${y}%) scale(${scale / 100})` };
}

export function VelomereBorder({
  src,
  className,
}: {
  src?: string | null;
  suit?: string | null;
  className?: string;
}) {
  if (!src) return null;
  const stock = {
    backgroundImage: "url(/card-stock.png)",
    backgroundRepeat: "repeat",
  } as const;
  return (
    <>
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 z-[1]", className)}
        style={{
          ...stock,
          backgroundSize: "900px 900px",
          mixBlendMode: "soft-light",
          opacity: 0.22,
        }}
      />
    </>
  );
}

export function cardImageSrc(url: string) {
  if (url.startsWith("/cards/owned/") && !url.includes("?")) return `${url}?v=1`;
  return url;
}

function CardPortrait({
  card,
}: {
  card: Pick<Card, "name" | "suit" | "rank">;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    setSrc(cardPortrait(card));
  }, [card.name, card.suit, card.rank]);
  if (!src) return <div className="h-full w-full bg-[#f7f3ea]" />;
  return <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />;
}

export function TarotCardFace({
  card,
  orientation = "upright",
  className,
}: {
  card: Pick<Card, "name" | "suit" | "rank" | "imageUrl" | "keywords">;
  orientation?: "upright" | "reversed";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col bg-[#f7f3ea] text-[#1c1915]",
        orientation === "reversed" && "rotate-180",
        className,
      )}
    >
      {card.imageUrl ? (
        <div className="m-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-ink/15">
          <div className="relative min-h-0 flex-1">
            <img src={cardImageSrc(card.imageUrl)} alt={`${card.name}. Encounter drawing. The written meaning is separate from the picture.`} draggable={false} className="h-full w-full object-contain" />
            <VelomereBorder src={card.imageUrl} suit={card.suit} />
          </div>
        </div>
      ) : (
        <CardPortrait card={card} />
      )}
    </div>
  );
}

export function TarotCardBack({
  src = "/card-back.jpg",
  style,
}: {
  src?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      src={src}
      alt="Dendrite, the shared card back. Two separate influences, an open interval, and an unfinished return. It does not show which card is face down, and it does not tell upright from reversed."
      style={style}
      className="outline outline-1 -outline-offset-1 outline-fg/10"
    />
  );
}

export function MiniCard({
  card,
  orientation = "upright",
  size = "sm",
  className,
}: {
  card: Pick<Card, "name" | "suit" | "rank" | "imageUrl" | "keywords">;
  orientation?: "upright" | "reversed";
  size?: Size;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card-scene overflow-hidden rounded-md shadow-card",
        SIZE[size],
        className,
      )}
    >
      {card.imageUrl ? (
        <>
          <img
            src={cardImageSrc(card.imageUrl)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <VelomereBorder src={card.imageUrl} suit={card.suit} />
        </>
      ) : (
        <div className="absolute inset-0">
          <TarotCardFace card={card} orientation={orientation} />
        </div>
      )}
    </div>
  );
}

export function PhysicalCard({
  size = "lg",
  flipped = false,
  card,
  orientation = "upright",
  shuffling = false,
  art = false,
  frame,
  className,
  style,
  backSrc,
  backStyle,
  onArtRatio,
}: {
  size?: Size;
  flipped?: boolean;
  card?: Pick<Card, "name" | "suit" | "rank" | "imageUrl" | "keywords"> | null;
  orientation?: "upright" | "reversed";
  shuffling?: boolean;
  art?: boolean;
  frame?: { scale?: number; x?: number; y?: number; radius?: number };
  className?: string;
  style?: CSSProperties;
  backSrc?: string;
  backStyle?: CSSProperties;
  onArtRatio?: (ratio: number) => void;
}) {
  const full = art && !!card?.imageUrl;
  const radius = frame?.radius;
  const faceRadius =
    radius == null
      ? undefined
      : { borderRadius: radius, clipPath: `inset(0 round ${radius}px)` };
  return (
    <div className={cn("card-scene shadow-card", SIZE[size], className)} style={style}>
      <div
        className={cn(
          "card-flip",
          flipped && "is-flipped",
          shuffling && "shuffle-leaf",
        )}
      >
        <div className="card-face card-face-back" style={faceRadius}>
          <TarotCardBack src={backSrc} style={backStyle} />
        </div>
        <div className={cn("card-face card-face-front", full && "bg-[#f7f3ea]")} style={faceRadius}>
          {full && card ? (
            <div
              className="relative h-full w-full overflow-hidden"
              style={{ borderRadius: frame?.radius ?? undefined }}
            >
              <img
                src={cardImageSrc(card.imageUrl ?? "")}
                alt=""
                draggable={false}
                className="h-full w-full object-contain"
                style={(() => {
                  const art = placedArtStyle(frame?.scale ?? 100, frame?.x ?? 0, frame?.y ?? 0);
                  if (orientation !== "reversed") return art;
                  return { ...art, transform: [art.transform, "rotate(180deg)"].filter(Boolean).join(" ") };
                })()}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    onArtRatio?.(image.naturalWidth / image.naturalHeight);
                  }
                }}
              />
              <VelomereBorder src={card.imageUrl} suit={card.suit} className={orientation === "reversed" ? "rotate-180" : undefined} />
            </div>
          ) : card ? (
            <TarotCardFace card={card} orientation={orientation} />
          ) : (
            <TarotCardBack />
          )}
        </div>
      </div>
    </div>
  );
}
