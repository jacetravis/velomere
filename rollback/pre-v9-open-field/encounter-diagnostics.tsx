"use client";

import { useState } from "react";
import { previewEncounterGeometry } from "@/lib/cards/server";

type Trace = {
  identity: { invariants: string[]; failure_condition: string };
  protected_voids: Array<{ id: string; rule: string }>;
  operations: Array<{ id: string; operator: string; rationale: string; output_svg_ids: string[]; source_field: string }>;
  counterreading: { operator: string; svg_id: string } | null;
  geometry_digest: string;
  affinity_index: number;
  encounter_guest: string | null;
};

export function EncounterDiagnostics({ cardId, cardName }: { cardId: string; cardName: string }) {
  const [date, setDate] = useState("2026-11-12");
  const [affinity, setAffinity] = useState(0);
  const [svg, setSvg] = useState("");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const show = async () => {
    setPending(true);
    setError("");
    try {
      const result = await previewEncounterGeometry({ data: { cardId, date, affinity } });
      setSvg(result.svg);
      setTrace(result.trace);
    } catch (caught) {
      setSvg("");
      setTrace(null);
      setError(caught instanceof Error ? caught.message : "The preview failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl font-medium tracking-tight">Encounter geometry</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        This reads the new renderer for the card selected above. Changing the date or affinity does not build a deck. Show this relation draws one card.
      </p>
      <div className="mt-4 grid gap-4">
        <label className="block text-sm text-subtle" htmlFor="encounter-date">
          Date
          <input
            id="encounter-date"
            type="date"
            min="1900-01-01"
            max="2100-12-31"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-fg"
          />
        </label>
        <label className="block text-sm text-subtle" htmlFor="encounter-affinity">
          Affinity {affinity === 0 ? "— Neutral" : affinity}
          <input
            id="encounter-affinity"
            type="range"
            min={0}
            max={78}
            step={1}
            value={affinity}
            onChange={(event) => setAffinity(Number(event.target.value))}
            className="mt-2 w-full"
          />
        </label>
        <button
          type="button"
          onClick={() => void show()}
          disabled={pending}
          className="inline-flex min-h-11 w-fit items-center rounded-full bg-fg px-4 text-sm text-bg disabled:opacity-50"
        >
          {pending ? "Reading…" : "Show this relation"}
        </button>
      </div>
      {error ? <p className="mt-4 text-sm text-muted">{error}</p> : null}
      {svg ? (
        <div className="mx-auto mt-5 w-full max-w-[280px] overflow-hidden rounded-2xl [&_svg]:h-auto [&_svg]:w-full" aria-label={`Encounter preview of ${cardName}`} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : null}
      {trace ? (
        <div className="mt-5 grid gap-4 text-sm leading-relaxed">
          <p className="text-muted">{cardName}. Affinity {trace.affinity_index}{trace.encounter_guest ? ` meets ${trace.encounter_guest}` : ""}. No visual reference.</p>
          <div>
            <h3 className="font-display text-xl text-fg">Identity</h3>
            <ul className="mt-2 list-disc pl-5 text-subtle">
              {trace.identity.invariants.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-subtle">Avoid: {trace.identity.failure_condition}</p>
          </div>
          <div>
            <h3 className="font-display text-xl text-fg">Protected quiet</h3>
            {trace.protected_voids.map((zone) => (
              <p key={zone.id} className="mt-2 text-subtle">{zone.rule}</p>
            ))}
          </div>
          <div>
            <h3 className="font-display text-xl text-fg">Operations</h3>
            <ul className="mt-2 grid gap-3">
              {trace.operations.map((op) => (
                <li key={op.id} className="rounded-2xl bg-surface px-3 py-3">
                  <p className="text-fg">{op.operator}</p>
                  <p className="mt-1 text-xs text-subtle">{op.output_svg_ids.join(", ")} · {op.source_field}</p>
                  <p className="mt-2 text-subtle">{op.rationale}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-xl text-fg">Counterreading</h3>
            <p className="mt-2 text-subtle">
              {trace.counterreading ? `${trace.counterreading.operator} on ${trace.counterreading.svg_id}` : "None. A second route would have entered the protected quiet."}
            </p>
            <p className="mt-2 break-all text-xs text-subtle">{trace.geometry_digest}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
