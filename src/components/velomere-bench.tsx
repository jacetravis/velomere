"use client";

import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { auditRootline, previewRootline } from "@/lib/cards/server";
import cards from "@/data/rootline-cards.json";

type Orientation = "upright" | "shadow";
type Trace = Awaited<ReturnType<typeof previewRootline>>["trace"];
type Png = Awaited<ReturnType<typeof previewRootline>>["png"];
type Audit = Awaited<ReturnType<typeof auditRootline>>;

const today = new Date().toISOString().slice(0, 10);

export function TestBench({ embedded = false }: { embedded?: boolean }) {
  const [hostId, setHostId] = useState("");
  const [affinity, setAffinity] = useState(0);
  const [hostOrientation, setHostOrientation] = useState<Orientation>("upright");
  const [guestOrientation, setGuestOrientation] = useState<Orientation>("upright");
  const [date, setDate] = useState(today);
  const [roots, setRoots] = useState(true);
  const [derived, setDerived] = useState(true);
  const [events, setEvents] = useState(true);
  const [svg, setSvg] = useState("");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [png, setPng] = useState<Png>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const host = cards.find((card) => card.id === hostId);
  const guest = affinity === 0 ? null : cards[affinity - 1];

  const draw = async (extra?: { includePng?: boolean; counterfactuals?: boolean }) => {
    if (!hostId) return;
    setBusy(extra?.counterfactuals ? "Measuring" : extra?.includePng ? "Checking parity" : "Drawing");
    setError("");
    try {
      const result = await previewRootline({
        data: {
          cardId: hostId,
          date,
          affinity,
          hostOrientation,
          guestOrientation,
          includePng: extra?.includePng === true,
          counterfactuals: extra?.counterfactuals === true,
          view: { roots, derived, events },
        },
      });
      setSvg(result.svg);
      setTrace(result.trace);
      setPng(result.png);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The drawing failed.");
    } finally {
      setBusy("");
    }
  };

  const Shell = embedded ? Fragment : AppShell;
  return (
    <Shell>
      {embedded ? null : (
      <p className="text-sm text-subtle">
        <Link to="/deck" className="underline decoration-border underline-offset-4">
          Deck Collection
        </Link>
      </p>
      )}
      {embedded ? null : <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Rootline</h1>}
      <p className="mt-3 text-sm leading-relaxed text-muted">
        One card is one stream. Two cards start apart. A path moves only when both passages attest a term. Upright looks toward. Shadow looks away. An earned meeting joins at the top. An unresolved meeting stays open. Nothing is drawn until you choose a host and render. Saved decks stay as they were.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <label className="block text-sm text-subtle" htmlFor="root-host">
          Host card
        </label>
        <select id="root-host" value={hostId} onChange={(event) => { setHostId(event.target.value); setSvg(""); setTrace(null); setPng(null); }} className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-fg">
          <option value="">Choose a host</option>
          {cards.map((card) => (
            <option key={card.id} value={card.id}>{card.name}</option>
          ))}
        </select>

        <label className="block text-sm text-subtle" htmlFor="root-affinity">
          {affinity === 0 ? "Affinity 0 — Neutral, one rising path" : `Affinity ${affinity} — ${guest?.name ?? "guest"}`}
        </label>
        <input id="root-affinity" type="range" min={0} max={78} step={1} value={affinity} aria-label="Affinity" className="w-full accent-fg" onChange={(event) => setAffinity(Number(event.target.value))} />
        <p className="text-xs text-subtle">{guest ? `Guest core: ${guest.core}. This is not a new canon line.` : "No guest. No second path, question, axiom, or doubt."}</p>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-subtle">
            Host orientation
            <select value={hostOrientation} onChange={(event) => setHostOrientation(event.target.value as Orientation)} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-fg">
              <option value="upright">Upright</option>
              <option value="shadow">Shadow</option>
            </select>
          </label>
          <label className="text-sm text-subtle">
            Guest orientation
            <select value={guestOrientation} onChange={(event) => setGuestOrientation(event.target.value as Orientation)} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-fg" disabled={affinity === 0}>
              <option value="upright">Upright</option>
              <option value="shadow">Shadow</option>
            </select>
          </label>
        </div>

        <label className="text-sm text-subtle" htmlFor="root-date">
          Date
          <input id="root-date" type="date" min="1900-01-01" max="2100-12-31" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-fg" />
        </label>

        <fieldset className="flex flex-col gap-2 text-sm text-fg">
          <legend className="text-sm text-subtle">Show</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={roots} onChange={(event) => setRoots(event.target.checked)} /> Source roots</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={derived} onChange={(event) => setDerived(event.target.checked)} /> Derived branches</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={events} onChange={(event) => setEvents(event.target.checked)} /> Event markers</label>
        </fieldset>

        <Button type="button" disabled={!hostId || !date || busy !== ""} onClick={() => void draw()}>
          {busy === "Drawing" ? "Drawing…" : "Render"}
        </Button>
        <div className="grid grid-cols-1 gap-2">
          <Button type="button" variant="secondary" disabled={!hostId || busy !== ""} onClick={() => void draw({ counterfactuals: true })}>
            {busy === "Measuring" ? "Measuring…" : "Run counterfactuals"}
          </Button>
          <Button type="button" variant="secondary" disabled={!hostId || busy !== ""} onClick={() => void draw({ includePng: true })}>
            {busy === "Checking parity" ? "Checking…" : "Check SVG and PNG"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy !== ""} onClick={() => {
            setBusy("Auditing");
            setError("");
            void auditRootline({ data: { date } })
              .then((result) => setAudit(result))
              .catch((cause) => setError(cause instanceof Error ? cause.message : "The audit failed."))
              .finally(() => setBusy(""));
          }}>
            {busy === "Auditing" ? "Auditing all 6,162…" : "Audit all 6,162 scenes"}
          </Button>
        </div>
        {error ? <p className="text-sm text-fg">{error}</p> : null}
      </div>

      {svg ? (
        <figure className="mt-8">
          <img alt={host ? `${host.name}. ${host.core}.` : ""} className="w-full rounded-xl" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />
          <figcaption className="mt-2 text-xs text-subtle">Read from the foundation upward. Human recognition of these pictures is not yet measured.</figcaption>
        </figure>
      ) : (
        <p className="mt-8 text-sm text-subtle">The field is blank.</p>
      )}

      {trace ? (
        <section className="mt-8 flex flex-col gap-4 text-sm leading-relaxed">
          <h2 className="font-display text-2xl">Evidence</h2>
          <p>{trace.source_core_concepts.map((item) => `${item.card}: ${item.core}`).join(" · ")}</p>
          <p>Roots {trace.rendered_evidence.source_root_marks}. Returning strands {trace.rendered_evidence.internal_strands ?? 0}. Guest {trace.guest_card ?? "none"}.</p>
          <h3 className="font-display text-xl">Effect review</h3>
          <p>{trace.lexical_evidence.action ?? "NO_AUTOMATIC_EFFECT"}. {trace.lexical_evidence.note}</p>
          <p>Eligible overlap is not a decision. Potential {trace.lexical_evidence.potential ?? 0}. Policy {trace.lexical_evidence.policy}.</p>
          <h3 className="font-display text-xl">Lineage and color</h3>
          <ul className="flex flex-col gap-1">
            {trace.color_provenance.map((item) => (
              <li key={item.element}>{item.element} {item.lineage}{item.mix ? ` · mix ${item.mix}` : ""}</li>
            ))}
          </ul>
          <h3 className="font-display text-xl">Depth</h3>
          <p>Host {trace.layer_positions.host}. Guest {trace.layer_positions.guest ?? "none"}. Confluence {trace.layer_positions.confluence ?? "none"}. {trace.layer_positions.assignment ?? "Weight is not depth."} Same-plane contact: {trace.contact_same_z ? "yes" : "no"}.</p>
          <h3 className="font-display text-xl">Vocabulary</h3>
          <p>Shared eligible terms: {trace.lexical_evidence.shared_terms.slice(0, 12).join(", ") || "none"}.</p>
          <p>No shared word is treated as agreement by itself. Shadow text is not treated as negative. Negation is read from the sentence.</p>
          {trace.landmarks?.length ? (
            <div>
              <h3 className="font-display text-xl">Landmarks</h3>
              <ul className="flex flex-col gap-2">
                {trace.landmarks.map((mark, index) => (
                  <li key={`${mark.key}-${index}`}>
                    {mark.key} · {mark.participant}{mark.term ? ` · ${mark.term}` : ""}. {mark.cause}
                    {mark.quote ? ` “${mark.quote}”` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {trace.internal_strands?.length ? (
            <div>
              <h3 className="font-display text-xl">Returning strands</h3>
              <ul className="flex flex-col gap-1">
                {trace.internal_strands.map((strand) => (
                  <li key={strand.id}>{strand.term} · weight {strand.weight} · depth background · {strand.rejoins ? "rejoins" : "open"}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {trace.glyph ? (
            <div>
              <h3 className="font-display text-xl">Top glyph</h3>
              <p>{trace.glyph.kind}. Agreement assumed: {trace.glyph.agreement ? "yes" : "no"}.</p>
            </div>
          ) : null}
          {trace.recursion_state ? (
            <div>
              <h3 className="font-display text-xl">Recursive state</h3>
              <p>{trace.recursion_state.recognized_relational_structure}. Unresolved difference: {trace.recursion_state.unresolved_difference ? "yes" : "no"}. {trace.recursion_state.sufficiency}</p>
            </div>
          ) : null}
          <p>{trace.negative_space.reason}</p>
          {trace.derived_paths.length ? (
            <ul className="flex flex-col gap-1">
              {trace.derived_paths.map((path) => (
                <li key={path.id}>{path.id} · {path.role_after} · {path.event_id}</li>
              ))}
            </ul>
          ) : null}
          {png ? <p>PNG {png.width}×{png.height}, {png.bytes} bytes. SVG and raster share this scene.</p> : null}
          {trace.counterfactual_probes ? (
            <div>
              <h3 className="font-display text-xl">Counterfactuals</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {trace.counterfactual_probes.map((probe) => (
                  <li key={probe.intervention}>
                    {probe.intervention}: executed {probe.actually_executed ? "yes" : "no"}, drawing {probe.svg_changed ? "changed" : "unchanged"}
                    {probe.note ? `. ${probe.note}` : ""}
                    {probe.intervention === "separate_z" ? `. Contact ${probe.contact_when_collapsed ? "met" : "missed"} when stacked, ${probe.contact_when_separated ? "met" : "missed"} when separated.` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="font-mono text-xs text-subtle">{trace.geometry_digest}</p>
        </section>
      ) : null}

      {audit ? (
        <section className="mt-8 text-sm leading-relaxed">
          <h2 className="font-display text-2xl">Full matrix</h2>
          <p className="mt-2">{audit.ok ? "Passed." : "Failed."} {audit.scenes} scenes, {audit.neutrals} single paths, {audit.encounters} encounters, {audit.asymmetric_pairs} ordered pairs differed, {audit.equal_pairs} were equal. Back mean {audit.back_mean.toFixed(5)}. {audit.human_legibility}.</p>
          {audit.failures.length ? <p className="mt-2">{audit.failures.join(" ")}</p> : null}
        </section>
      ) : null}

      <section className="mt-10 text-sm">
        <h2 className="font-display text-2xl">Deck zip</h2>
        <p className="mt-2 text-subtle">Create on the collection page writes a full 78-card zip with this same renderer. Published copies of the rising-path deck sit on the reading table.</p>
      </section>
    </Shell>
  );
}
