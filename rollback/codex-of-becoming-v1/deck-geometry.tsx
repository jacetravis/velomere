"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { readEncounterGeometry } from "@/lib/encounters/server";

export function DeckGeometryButton({
  cardId,
  onGeometry,
}: {
  cardId: number;
  onGeometry: (url: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["encounter-geometry", cardId],
    queryFn: () => readEncounterGeometry({ data: { cardId } }),
    enabled: Number.isInteger(cardId) && cardId > 0,
  });
  useEffect(() => {
    setOpen(false);
    onGeometry(null);
  }, [cardId]);
  const geo = query.data;
  if (!geo?.available || !geo.geometryUrl) return null;
  return (
    <div className="grid justify-items-center gap-1">
      <button
        type="button"
        className="min-h-11 px-3 text-sm underline"
        onClick={() => {
          const next = !open;
          setOpen(next);
          onGeometry(next ? geo.geometryUrl : null);
        }}
      >
        {open ? "Return to Artwork" : "Show Original Geometry"}
      </button>
      {open ? (
        <p className="max-w-sm text-center text-xs text-subtle">
          About this geometry. Scene {String(geo.sceneHash || "").slice(0, 16)}. Joins {geo.joins ?? "—"}. This score stays after companion artwork is saved.
        </p>
      ) : (
        <p className="text-xs text-subtle">{geo.artLabel}</p>
      )}
    </div>
  );
}
