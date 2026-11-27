"use client";

import { useState } from "react";
import { previewEncounterGeometry } from "@/lib/cards/server";

type Region = { id: string; semantic_kind?: string; guard_policy?: string; boundary_rendered?: boolean; edge_connectivity?: string; footprint_kind?: string };
type Pass = { pass_id: string; state: string; emitted_count: number; evidence?: string };
type Fact = { intervention: string; pass: boolean | null; reason_if_noop?: string; measured_negative_space_delta?: number; measured_renderable_delta?: number };
type Trace = {
  renderer_version?: string;
  grammar?: string;
  host_id?: string;
  guest_id?: string | null;
  affinity_index?: number;
  geometry_digest?: string;
  canvas?: { implicit_art_inset?: boolean; allow_edge_crossing?: boolean };
  field?: { kind?: string; domain?: { x0: number; y0: number; x1: number; y1: number }; isolines?: number; samples?: number };
  spatial_regions?: Region[];
  render_passes?: Pass[];
  composition_frame?: { clipped_continuations?: unknown[]; viewport_transform?: { inset?: number; scale?: number } };
  counterfactuals?: Fact[];
  scene?: { guest_note?: string };
  identity?: { invariants: string[]; failure_condition: string };
  protected_voids?: Array<{ id: string; rule: string }>;
  operations?: Array<{ id: string; operator: string; rationale: string; output_svg_ids: string[]; source_field: string }>;
  counterreading?: { operator: string; svg_id: string } | null;
  encounter_guest?: string | null;
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
      <h2 className="font-display text-2xl font-medium tracking-tight">Open field</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        This is the live renderer, relational-encounter-9-open-field. The whole face is available. Empty space is recorded where the relation puts it, including when no border is drawn. Show this relation draws one card. It does not build a deck.
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
          <p className="text-muted">
            {trace.host_id || cardName}. {trace.renderer_version || "renderer"}. {trace.grammar ? `Grammar ${trace.grammar}. ` : ""}
            Affinity {trace.affinity_index ?? affinity}{trace.guest_id ? ` meets ${trace.guest_id}` : trace.encounter_guest ? ` meets ${trace.encounter_guest}` : ""}. No visual reference.
            {trace.scene?.guest_note ? ` ${trace.scene.guest_note}` : ""}
          </p>
          {trace.canvas ? (
            <p className="text-subtle">
              Face {trace.canvas.allow_edge_crossing ? "may cross the frame" : "stays inside"}. {trace.canvas.implicit_art_inset ? "Inset on." : "No art inset."} Field {trace.field?.kind} across {trace.field?.domain ? `${trace.field.domain.x0}–${trace.field.domain.x1} by ${trace.field.domain.y0}–${trace.field.domain.y1}` : "the card"}. Framing scale {trace.composition_frame?.viewport_transform?.scale ?? 1}, inset {trace.composition_frame?.viewport_transform?.inset ?? 0}. Continuations past the frame: {trace.composition_frame?.clipped_continuations?.length ?? 0}.
            </p>
          ) : null}
          {trace.identity ? (
            <div>
              <h3 className="font-display text-xl text-fg">Identity</h3>
              <ul className="mt-2 list-disc pl-5 text-subtle">
                {trace.identity.invariants.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2 text-subtle">Avoid: {trace.identity.failure_condition}</p>
            </div>
          ) : null}
          {trace.spatial_regions?.length ? (
            <div>
              <h3 className="font-display text-xl text-fg">Where the quiet sits</h3>
              {trace.spatial_regions.map((zone) => (
                <p key={zone.id} className="mt-2 text-subtle">
                  {zone.semantic_kind} · {zone.footprint_kind} · {zone.edge_connectivity} · {zone.boundary_rendered ? "border drawn" : "no border"}
                  {zone.guard_policy ? ` — ${zone.guard_policy}` : ""}
                </p>
              ))}
            </div>
          ) : null}
          {trace.protected_voids?.length ? (
            <div>
              <h3 className="font-display text-xl text-fg">Protected quiet</h3>
              {trace.protected_voids.map((zone) => (
                <p key={zone.id} className="mt-2 text-subtle">{zone.rule}</p>
              ))}
            </div>
          ) : null}
          {trace.render_passes?.length ? (
            <div>
              <h3 className="font-display text-xl text-fg">What was actually drawn</h3>
              <ul className="mt-2 grid gap-2">
                {trace.render_passes.map((pass) => (
                  <li key={pass.pass_id} className="text-subtle">
                    {pass.pass_id}: {pass.state}{pass.emitted_count ? ` · ${pass.emitted_count}` : ""}{pass.evidence ? ` · ${pass.evidence}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {trace.counterfactuals?.length ? (
            <div>
              <h3 className="font-display text-xl text-fg">Measured checks</h3>
              <ul className="mt-2 grid gap-2">
                {trace.counterfactuals.map((item) => (
                  <li key={item.intervention} className="text-subtle">
                    {item.intervention}: {item.pass ? "holds" : "does not hold"}
                    {item.reason_if_noop ? ` — ${item.reason_if_noop}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {trace.operations?.length ? (
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
          ) : null}
          <p className="break-all text-xs text-subtle">{trace.geometry_digest}</p>
        </div>
      ) : null}
    </section>
  );
}
