"use client";

import { useEffect, useState } from "react";

type Participant = { id: string; role: string; x: number; y: number };
type Edge = { id: string; layer: string; cause: string; parameters: Record<string, unknown> };
type Constraint = { id: string; statement: string; measured: string; pass: boolean };
type Trace = {
  semantic_input: {
    identity_geometry: string;
    encounter_affordance: string;
    negative_space_rule: string;
    failure_condition: string;
  };
  graph: { participants: Participant[]; edges: Edge[] };
  protected_void: {
    shape: string;
    derived_from: string;
    rule: string;
    exclusion_test: { unconstrained_enters: boolean; actual_enters: boolean; note: string };
  };
  constraints: Constraint[];
  counterreading: { svg_id: string; differs_by: string; failure_condition: string };
  counterfactual: { altered: string; why: string };
  field: { kind: string; note?: string };
  encounter: null | {
    intensity: number;
    status: string;
    geometry_action: string;
    upright_proposal: string;
    host_geometry_changes: boolean;
  };
  contrast: string;
  geometry_digest: string;
};
type Pack = { svg: string; structure: string; trace: Trace };
type Card = { slug: string; name: string; intensity: number; hostChanged: boolean; neutral: string; dance: string };
type Index = { version: string; date: string; note: string; cards: Card[] };

function stripXml(svg: string) {
  return svg.replace(/^<\?xml[^>]*>\s*/, "");
}

function hideFailure(svg: string) {
  return svg.replace(/<path id="counterreading-[^"]*"[\s\S]*?\/>/g, "");
}

function brief(parameters: Record<string, unknown>) {
  return Object.entries(parameters)
    .slice(0, 4)
    .map(([key, value]) => `${key.replaceAll("_", " ")} ${Array.isArray(value) ? value.join(" ") : String(value)}`)
    .join(" · ");
}

export function RelationProof() {
  const [index, setIndex] = useState<Index | null>(null);
  const [slug, setSlug] = useState("01-the-shuffle");
  const [affinity, setAffinity] = useState<0 | 14>(0);
  const [pack, setPack] = useState<Pack | null>(null);
  const [showFailure, setShowFailure] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    fetch("/velomere-bench/relation-proof/index.json")
      .then((response) => {
        if (!response.ok) throw new Error("The proof index is missing.");
        return response.json() as Promise<Index>;
      })
      .then((next) => {
        if (!cancel) setIndex(next);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "The proof index failed.");
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
    const file = affinity === 0 ? card.neutral : card.dance;
    fetch(`/velomere-bench/relation-proof/${file}`)
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

  const card = index?.cards.find((item) => item.slug === slug);
  const rendered = pack ? (showFailure ? pack.svg : hideFailure(pack.svg)) : "";
  const structure = pack ? (showFailure ? pack.structure : hideFailure(pack.structure)) : "";
  const trace = pack?.trace;

  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-medium tracking-tight">Relation proof</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Eight cards, dated {index?.date ?? "2026-11-12"}. Neutral and The Dance are already drawn. This is the earlier proof. Create now draws with the depth renderer.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(index?.cards ?? []).map((item) => (
          <button
            key={item.slug}
            type="button"
            onClick={() => setSlug(item.slug)}
            className={`min-h-11 rounded-full border px-3 text-sm ${item.slug === slug ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg"}`}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setAffinity(0)}
          className={`min-h-11 rounded-full border px-3 text-sm ${affinity === 0 ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg"}`}
        >
          Neutral
        </button>
        <button
          type="button"
          onClick={() => setAffinity(14)}
          className={`min-h-11 rounded-full border px-3 text-sm ${affinity === 14 ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg"}`}
        >
          The Dance
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}
      {trace ? (
        <div className="mt-6 grid gap-6">
          <figure>
            <figcaption className="text-sm text-subtle">Phone size. Rendered.</figcaption>
            <div
              className="mx-auto mt-2 max-w-[280px] overflow-hidden rounded-2xl border border-border [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: stripXml(rendered) }}
            />
          </figure>
          <figure>
            <figcaption className="text-sm text-subtle">Structure. Same paths, no field paint.</figcaption>
            <div
              className="mt-2 overflow-hidden rounded-2xl border border-border [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: stripXml(structure) }}
            />
          </figure>
          <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
            <input type="checkbox" checked={showFailure} onChange={(event) => setShowFailure(event.target.checked)} />
            Show the refused relation (the dashed path)
          </label>
          <p className="text-sm leading-relaxed text-muted">{trace.contrast}</p>
          <div>
            <h3 className="font-display text-xl">Semantic input</h3>
            <dl className="mt-2 grid gap-2 text-sm">
              <div>
                <dt className="text-subtle">Identity</dt>
                <dd className="text-fg">{trace.semantic_input.identity_geometry}</dd>
              </div>
              <div>
                <dt className="text-subtle">What an encounter may do</dt>
                <dd className="text-fg">{trace.semantic_input.encounter_affordance}</dd>
              </div>
              <div>
                <dt className="text-subtle">Must remain</dt>
                <dd className="text-fg">{trace.semantic_input.negative_space_rule}</dd>
              </div>
              <div>
                <dt className="text-subtle">Failure</dt>
                <dd className="text-fg">{trace.semantic_input.failure_condition}</dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="font-display text-xl">Graph</h3>
            <ul className="mt-2 grid gap-2 text-sm">
              {trace.graph.participants.map((item) => (
                <li key={item.id} className="text-fg">
                  {item.role} <span className="text-subtle">at {item.x}, {item.y}</span>
                </li>
              ))}
              {trace.graph.edges.map((edge) => (
                <li key={edge.id} className="text-muted">
                  <span className="text-fg">{edge.id}</span> — {edge.cause}
                  {edge.parameters ? <span className="mt-1 block text-subtle">{brief(edge.parameters)}</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-xl">Constraints</h3>
            <ul className="mt-2 grid gap-3 text-sm">
              {trace.constraints.map((item) => (
                <li key={item.id}>
                  <p className="text-fg">{item.pass ? "Holds" : "Fails"} — {item.statement}</p>
                  <p className="text-subtle">{item.measured}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-xl">Protected absence</h3>
            <p className="mt-2 text-sm text-fg">{trace.protected_void.derived_from}</p>
            <p className="mt-1 text-sm text-subtle">
              Shape {trace.protected_void.shape}. If the constraint is removed: {trace.protected_void.exclusion_test.note} Unconstrained enters: {String(trace.protected_void.exclusion_test.unconstrained_enters)}. Actual enters: {String(trace.protected_void.exclusion_test.actual_enters)}.
            </p>
          </div>
          <div>
            <h3 className="font-display text-xl">Counterreading</h3>
            <p className="mt-2 text-sm text-fg">{trace.counterreading.differs_by}</p>
            <p className="mt-1 text-sm text-subtle">{trace.counterreading.failure_condition}. Field: {trace.field.kind}{trace.field.note ? `. ${trace.field.note}` : ""}</p>
          </div>
          <div>
            <h3 className="font-display text-xl">Affinity {affinity === 0 ? "0" : "14"}</h3>
            {trace.encounter ? (
              <div className="mt-2 grid gap-2 text-sm">
                <p className="text-fg">
                  {trace.encounter.host_geometry_changes
                    ? "The host relation moved. This is not only an added stroke."
                    : "Intensity is 0, so the host relation is unchanged and no bridge was added."}
                </p>
                <p className="text-subtle">{trace.encounter.status}</p>
                <p className="text-muted">{trace.encounter.geometry_action}</p>
                <p className="text-subtle">{trace.encounter.upright_proposal}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No encounter is applied. The drawing is the card’s own relation.</p>
            )}
            <p className="mt-2 text-xs text-subtle">Geometry {trace.geometry_digest.slice(0, 16)} · {card?.name}</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-subtle">{error ? "" : "Opening the proof…"}</p>
      )}
    </section>
  );
}
