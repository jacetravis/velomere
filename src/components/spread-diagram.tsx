import { useId } from "react";
import type { SpreadDefinition } from "@/lib/spreads/engine";
import { fittedCardWidth } from "@/lib/spreads/fit";
import { cn } from "@/lib/utils";

export function SpreadTile({
  spread,
  className,
}: {
  spread: Pick<SpreadDefinition, "positions">;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const positions = [...spread.positions].sort((a, b) => a.zIndex - b.zIndex || a.order - b.order);
  const cardWidth = positions.length > 7 ? 34 : positions.length > 4 ? 44 : positions.length > 1 ? 56 : 78;
  const cardHeight = cardWidth / 0.64;
  return (
    <svg viewBox="0 0 840 525" className={cn("h-full w-full", className)} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-raised)" />
          <stop offset="1" stopColor="var(--color-bg)" />
        </linearGradient>
      </defs>
      <rect width="840" height="525" rx="28" fill={`url(#${gradientId})`} />
      <rect x="10" y="10" width="820" height="505" rx="24" fill="none" stroke="var(--color-accent)" strokeOpacity="0.35" strokeWidth="2" />
      {positions.map((position) => {
        const turned = position.rotationDeg === 90 || position.rotationDeg === 270;
        return (
          <g key={position.id} transform={`translate(${position.x * 840} ${position.y * 525}) rotate(${position.rotationDeg})`}>
            <rect
              x={-cardWidth / 2}
              y={-cardHeight / 2}
              width={cardWidth}
              height={cardHeight}
              rx="7"
              fill="var(--color-surface)"
              stroke="var(--color-accent)"
              strokeWidth="3"
            />
            <circle r={turned ? 9 : 12} fill="var(--color-fg)" />
            <text
              y={turned ? 4 : 5}
              textAnchor="middle"
              fontSize={turned ? 11 : 14}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="700"
              fill="var(--color-bg)"
              transform={`rotate(${-position.rotationDeg})`}
            >
              {position.order}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SpreadDiagram({
  spread,
  className,
  highlightOrder,
}: {
  spread: SpreadDefinition;
  className?: string;
  highlightOrder?: number;
}) {
  const width = fittedCardWidth({
    width: 300,
    height: 400,
    aspect: 0.62,
    positions: spread.positions,
    margin: 8,
  });
  return (
    <div className={cn("relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-bg", className)}>
      {spread.positions.map((position) => (
        <span
          key={position.id}
          className={cn(
            "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border text-[10px] text-fg",
            highlightOrder === position.order ? "border-fg bg-fg/20 text-fg" : "border-accent/70 bg-surface text-fg",
          )}
          style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, width: `${(width / 300) * 100}%`, aspectRatio: "0.62", borderRadius: 3, rotate: `${position.rotationDeg}deg`, zIndex: position.zIndex }}
        >
          {position.order}
        </span>
      ))}
    </div>
  );
}
