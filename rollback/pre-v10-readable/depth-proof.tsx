"use client";

import { useEffect, useState } from "react";

type Constraint = { id: string; statement: string; measured: string; pass: boolean };
type Trace = {
  renderer_version: string;
  recipe_id: string;
  semantic_input: {
    identity_geometry: string;
    encounter_affordance: string;
    negative_space_rule: string;
    failure_condition: string;
  };
  graph: {
    participants: Array<{ id: string; role: string; x: number; y: number; charge: number }>;
    edges: Array<{ id: string; layer: string; cause: string; parameters: Record<string, unknown>; parent: string | null }>;
  };
  constraints: Constraint[];
  field: { kind: string; note?: string; peaks: Array<{ x: number; y: number; weight: number }>; samples: number; isolines: number };
  counterreading: { differs_by: string; failure_condition: string };
  contrast: string;
  layers: { primary: string; secondary: string; field: string };
  mask_ablation: { changed_ids: string[]; why: string };
  encounter: null | { intensity: number; status: string; geometry_action: string; upright_proposal: string };
  geometry_digest: string;
};
type Pack = { svg: string; structure: string; trace: Trace; png: string };
type Card = { slug: string; name: string; neutral: string; dance: string };
type Index = {
  version: string;
  date: string;
  diagnosis: string[];
  cards: Card[];
};

function stripXml(svg: string) {
  return svg.replace(/^<\?xml[^>]*>\s*/, "");
}

function keep(svg: string, layers: { secondary: boolean; field: boolean; counter: boolean }) {
  let next = svg;
  if (!layers.secondary) next = next.replace(/<(?:path|circle) [^>]*data-layer="secondary"[\s\S]*?\/>/g, "");
  if (!layers.field) {
    next = next.replace(/<(?:path|circle|rect) [^>]*data-layer="field"[\s\S]*?\/>/g, "");
    next = next.replace(/<defs>[\s\S]*?<\/defs>/g, "");
  }
  if (!layers.counter) next = next.replace(/<path [^>]*data-layer="counterreading"[\s\S]*?\/>/g, "");
  return next;
}

export function DepthProof() {
  const [index, setIndex] = useState<Index | null>(null);
  const [slug, setSlug] = useState("01-the-shuffle");
  const [affinity, setAffinity] = useState<0 | 14>(0);
  const [pack, setPack] = useState<Pack | null>(null);
  const [layers, setLayers] = useState({ secondary: true, field: true, counter: true });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    fetch("/velomere-bench/relational-depth/index.json")
      .then((response) => {
        if (!response.ok) throw new Error("The depth proof is missing.");
        return response.json() as Promise<Index>;
      })
      .then((next) => {
        if (!cancel) setIndex(next);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "The depth proof failed.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!index) return;
    const card = index.cards.find((item) => item.slug === slug) ?? index.cards[0];
    if (!card) return;
    let cancel = false;
    setPack(null);
    fetch(`/velomere-bench/relational-depth/${affinity === 0 ? card.neutral : card.dance}`)
      .then((response) => {
        if (!response.ok) throw new Error("That proof card is missing.");
        return response.json() as Promise<Pack>;
      })
      .then((next) => {
        if (!cancel) setPack(next);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "The proof card failed.");
      });
    return () => {
      cancel = true;
    };
  }, [index, slug, affinity]);

  const trace = pack?.trace;
  const shown = pack ? keep(pack.structure, layers) : "";

  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-medium tracking-tight">Relational depth</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Eight cards, {index?.date ?? "2026-11-12"}, from an earlier proof ({index?.version ?? "relational-encounter-3-depth"}). Create now draws all 78 with relational-encounter-9-open-field. These pictures are history, not the current export.
      </p>
      {index ? (
        <ul className="mt-3 grid gap-2 text-sm text-muted">
          {index.diagnosis.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {(index?.cards ?? []).map((item) => (
          <button key={item.slug} type="button" onClick={() => setSlug(item.slug)} className={`min-h-11 rounded-full border px-3 text-sm ${item.slug === slug ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg"}`}>
            {item.name}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setAffinity(0)} className={`min-h-11 rounded-full border px-3 text-sm ${affinity === 0 ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg"}`}>Neutral</button>
        <button type="button" onClick={() => setAffinity(14)} className={`min-h-11 rounded-full border px-3 text-sm ${affinity === 14 ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg"}`}>The Dance</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {(["field", "secondary", "counter"] as const).map((key) => (
          <label key={key} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={(event) => setLayers((current) => ({ ...current, [key]: event.target.checked }))}
            />
            {key === "field" ? "Field" : key === "secondary" ? "Derived paths" : "Refused relation"}
          </label>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}
      {trace && pack ? (
        <div className="mt-6 grid gap-6">
          <figure>
            <figcaption className="text-sm text-subtle">Export buffer, phone size. Raster of this SVG.</figcaption>
            <img src={pack.png} alt="" className="mx-auto mt-2 w-full max-w-[280px] rounded-2xl border border-border" />
          </figure>
          <figure>
            <figcaption className="text-sm text-subtle">Same geometry, layers you toggled, without field paint.</figcaption>
            <div className="mt-2 overflow-hidden rounded-2xl border border-border [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: stripXml(shown) }} />
          </figure>
          <p className="text-sm leading-relaxed text-muted">{trace.contrast}</p>
          <div>
            <h3 className="font-display text-xl">Why this is not the ZIP</h3>
            <p className="mt-2 text-sm text-muted">Recipe {trace.recipe_id.slice(0, 16)}. This picture is an earlier proof. Create exports relational-encounter-9-open-field.</p>
          </div>
          <div>
            <h3 className="font-display text-xl">Semantic input</h3>
            <dl className="mt-2 grid gap-2 text-sm">
              <div><dt className="text-subtle">Identity</dt><dd>{trace.semantic_input.identity_geometry}</dd></div>
              <div><dt className="text-subtle">Encounter may</dt><dd>{trace.semantic_input.encounter_affordance}</dd></div>
              <div><dt className="text-subtle">Must remain</dt><dd>{trace.semantic_input.negative_space_rule}</dd></div>
              <div><dt className="text-subtle">Failure</dt><dd>{trace.semantic_input.failure_condition}</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="font-display text-xl">Graph</h3>
            <ul className="mt-2 grid gap-2 text-sm">
              {trace.graph.participants.map((item) => (
                <li key={item.id}>{item.role} <span className="text-subtle">charge {item.charge} at {item.x}, {item.y}</span></li>
              ))}
              {trace.graph.edges.map((edge) => (
                <li key={edge.id} className="text-muted"><span className="text-fg">{edge.id}</span> {edge.layer} — {edge.cause}{edge.parent ? <span className="text-subtle"> from {edge.parent}</span> : null}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-xl">Field and constraints</h3>
            <p className="mt-2 text-sm text-muted">{trace.field.kind}. {trace.field.isolines} isolines, {trace.field.samples} samples, {trace.field.peaks.length} peaks.{trace.field.note ? ` ${trace.field.note}` : ""}</p>
            <ul className="mt-2 grid gap-2 text-sm">
              {trace.constraints.map((item) => (
                <li key={item.id}><span className="text-fg">{item.pass ? "Holds" : "Fails"} — {item.statement}</span><span className="mt-1 block text-subtle">{item.measured}</span></li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-subtle">Removing the protected relation changes {trace.mask_ablation.changed_ids.join(", ")}. {trace.mask_ablation.why}</p>
            <p className="mt-1 text-sm text-subtle">Refused relation: {trace.counterreading.differs_by}</p>
          </div>
          <div>
            <h3 className="font-display text-xl">Affinity {affinity === 0 ? "0" : "14"}</h3>
            {trace.encounter ? (
              <div className="mt-2 grid gap-2 text-sm">
                <p>{trace.encounter.intensity === 0 ? "Intensity 0. The host, the derived paths, and the field stay as they are." : "The host path, the paths derived from it, and the field all move."}</p>
                <p className="text-subtle">{trace.encounter.status}</p>
                <p className="text-muted">{trace.encounter.geometry_action}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No outside archetype is in this drawing.</p>
            )}
            <p className="mt-2 text-xs text-subtle">Primary {trace.layers.primary.slice(0, 12)} · derived {trace.layers.secondary.slice(0, 12)} · field {trace.layers.field.slice(0, 12)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-subtle">{error ? "" : "Opening the proof…"}</p>
      )}
    </section>
  );
}
