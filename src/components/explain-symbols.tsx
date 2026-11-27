"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { explainCodexSymbols } from "@/lib/encounters/server";

type LegendRow = {
  id: string;
  operator: string;
  title: string;
  meaning: string;
  epistemic: string;
  role: string;
  canonStatus: string;
  sceneEventId?: string | null;
  quote?: string | null;
};

type Payload = {
  legend: {
    intro: string;
    contact_count: number;
    contact_note: string;
    seal: string;
    parents?: { note?: string; parents?: string[] };
    rows: LegendRow[];
  };
  overlaySvg?: string;
};

function tone(status: string) {
  if (status === "counterreading") return "Counterreading. Not a fact.";
  if (status === "attested") return "Stored graph.";
  if (status === "attested-by-meaning") return "Canonical wording. New visual mark.";
  return status;
}

export function ExplainSymbols({
  membershipId,
  encounterCardId,
  deckCardId,
}: {
  membershipId?: string;
  encounterCardId?: string;
  deckCardId?: number;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["codex-explain", membershipId || "", encounterCardId || "", deckCardId || 0],
    queryFn: () => explainCodexSymbols({
      data: {
        membershipId: membershipId || undefined,
        encounterCardId: encounterCardId || undefined,
        deckCardId: deckCardId || undefined,
      },
    }) as Promise<Payload>,
    enabled: open,
  });
  const legend = query.data?.legend;
  const svg = query.data?.overlaySvg;
  return (
    <div className="grid gap-2">
      <Button type="button" variant="secondary" className="min-h-11 w-full sm:w-auto" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide Symbols" : "Explain Symbols"}
      </Button>
      {open ? (
        <div className="grid gap-3 rounded-2xl border border-border p-3 text-sm">
          {query.isPending ? <p className="text-subtle">Reading the register…</p> : null}
          {query.isError ? <p>{query.error instanceof Error ? query.error.message : "The register could not be read."}</p> : null}
          {legend ? (
            <>
              <p className="text-subtle">{legend.intro}</p>
              <p>{legend.seal}</p>
              <p>{legend.contact_note}</p>
              {legend.parents?.note ? <p className="text-subtle">{legend.parents.note}</p> : null}
              {svg ? (
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
                  alt=""
                  className="mx-auto w-full max-w-xs rounded-xl bg-[#0c101a]"
                />
              ) : null}
              <ul className="grid gap-3">
                {legend.rows.map((row) => (
                  <li key={row.id} className="border-t border-border pt-3">
                    <p className="font-display text-lg">{row.title}</p>
                    <p className="text-xs text-subtle">{row.operator} · {tone(row.epistemic)}{row.sceneEventId ? ` · ${row.sceneEventId}` : ""}</p>
                    <p className="mt-1">{row.meaning}</p>
                    {row.quote ? <p className="mt-1 text-subtle">Source: “{row.quote}”</p> : null}
                    <p className="mt-1 text-xs text-subtle">{row.canonStatus.replaceAll("-", " ")}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
