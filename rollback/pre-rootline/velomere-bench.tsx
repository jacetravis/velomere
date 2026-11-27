"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { EncounterDiagnostics } from "@/components/encounter-diagnostics";
import { DepthProof } from "@/components/depth-proof";
import { RelationProof } from "@/components/relation-proof";
import catalog from "@/data/velomere-bench.json";

type Source = { filename: string; sha256: string; crop: string };
type View = {
  id: string;
  label: string;
  kind: string;
  src: string;
  filename: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  note: string;
  source?: Source;
};
type Experiment = {
  id: string;
  title: string;
  cardId: string;
  cardName: string;
  affinity: string;
  date: string;
  summary: string;
  limitation: string;
  zip: string;
  provenance: string;
  views: View[];
  documents?: Array<{ label: string; href: string; filename: string }>;
};

type Edition = {
  id: string;
  title: string;
  note: string;
  sheet: string;
  sheetWidth: number;
  sheetHeight: number;
  zip: string;
  zipName: string;
  provenance: string;
};

const experiments = catalog.experiments as Experiment[];
const editions = (catalog as { editions?: Edition[] }).editions ?? [];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TestBench() {
  const [cardId, setCardId] = useState("02-the-velomere");
  const [experimentId, setExperimentId] = useState("procedural-encounter-geometry-clean-v1");
  const forCard = experiments.filter((item) => item.cardId === cardId);
  const experiment = forCard.find((item) => item.id === experimentId) ?? forCard[0] ?? null;
  const [leftId, setLeftId] = useState("structural");
  const [rightId, setRightId] = useState("composite");
  const [full, setFull] = useState<View | null>(null);

  useEffect(() => {
    if (!experiment) return;
    const ids = new Set(experiment.views.map((view) => view.id));
    if (!ids.has(leftId)) setLeftId(experiment.views[0]?.id ?? "");
    if (!ids.has(rightId)) setRightId(experiment.views[1]?.id ?? experiment.views[0]?.id ?? "");
  }, [experiment, leftId, rightId]);

  const left = experiment?.views.find((view) => view.id === leftId) ?? null;
  const right = experiment?.views.find((view) => view.id === rightId) ?? null;
  const card = catalog.cards.find((item) => item.id === cardId);

  return (
    <AppShell>
      <p className="text-sm text-subtle">
        <Link to="/deck" className="underline decoration-border underline-offset-4">
          Deck Collection
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">Velomere Test Bench</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Saved decks are not changed from here.
      </p>
      <DepthProof />
      <RelationProof />

      <label className="mt-6 block text-sm text-subtle" htmlFor="bench-card">
        Card
      </label>
      <select
        id="bench-card"
        value={cardId}
        onChange={(event) => {
          const next = event.target.value;
          setCardId(next);
          const found =
            experiments.find((item) => item.cardId === next && item.id === "procedural-encounter-geometry-clean-v1") ??
            experiments.find((item) => item.cardId === next);
          setExperimentId(found?.id ?? "");
        }}
        className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-fg"
      >
        {catalog.cards.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>

      <EncounterDiagnostics cardId={cardId} cardName={card?.name ?? "This card"} />

      <section className="mt-14">
        <h2 className="font-display text-2xl font-medium tracking-tight">Earlier experiments</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          These stay as they were made.
        </p>
        {!experiment || !card ? (
          <p className="mt-6 rounded-2xl bg-surface px-4 py-6 text-sm leading-relaxed text-muted">
            No single-card experiment has been saved for {card?.name ?? "this card"}. The full editions below still include it when a deck was generated.
          </p>
        ) : (
          <ExperimentView
            experiment={experiment}
            experiments={forCard}
            onExperiment={setExperimentId}
            left={left}
            right={right}
            leftId={leftId}
            rightId={rightId}
            onLeft={setLeftId}
            onRight={setRightId}
            onOpen={setFull}
          />
        )}
      </section>

      {full ? <FullPlate view={full} onClose={() => setFull(null)} /> : null}
      <Editions editions={editions} />
    </AppShell>
  );
}

function ExperimentView({
  experiment,
  experiments,
  onExperiment,
  left,
  right,
  leftId,
  rightId,
  onLeft,
  onRight,
  onOpen,
}: {
  experiment: Experiment;
  experiments: Experiment[];
  onExperiment: (id: string) => void;
  left: View | null;
  right: View | null;
  leftId: string;
  rightId: string;
  onLeft: (id: string) => void;
  onRight: (id: string) => void;
  onOpen: (view: View) => void;
}) {
  const donors = experiment.views.filter((view) => view.kind === "donor" || view.kind === "source");
  return (
    <div className="mt-8">
      {experiments.length > 1 ? (
        <label className="block text-sm text-subtle">
          Experiment
          <select
            value={experiment.id}
            onChange={(event) => onExperiment(event.target.value)}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-fg"
          >
            {experiments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <h2 className="font-display text-2xl font-medium tracking-tight">{experiment.title}</h2>
      )}
      <p className="mt-2 text-sm text-subtle">
        {experiment.cardName} · {experiment.affinity} · {experiment.date}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{experiment.summary}</p>
      <p className="mt-3 text-sm leading-relaxed text-subtle">{experiment.limitation}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={experiment.zip}
          download={experiment.zip.split("/").pop() || "experiment.zip"}
          className="inline-flex min-h-11 items-center rounded-full bg-fg px-4 text-sm text-bg"
        >
          Download this experiment
        </a>
        <a
          href={experiment.provenance}
          download="provenance.json"
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-fg underline decoration-border underline-offset-4"
        >
          Provenance
        </a>
      </div>
      {experiment.documents?.length ? (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {experiment.documents.map((doc) => (
            <li key={doc.href}>
              <a href={doc.href} download={doc.filename} className="text-sm text-fg underline decoration-border underline-offset-4">
                {doc.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <ComparePane view={left} views={experiment.views} selected={leftId} onSelect={onLeft} onOpen={onOpen} side="Left" />
        <ComparePane view={right} views={experiment.views} selected={rightId} onSelect={onRight} onOpen={onOpen} side="Right" />
      </div>

      <h3 className="mt-10 font-display text-2xl font-medium tracking-tight">Material</h3>
      <ul className="mt-4 grid gap-4">
        {donors.map((view) => (
          <li key={view.id} className="rounded-2xl bg-surface p-3">
            <button type="button" onClick={() => onOpen(view)} className="block w-full text-left">
              <img
                src={view.src}
                alt={view.label}
                width={view.width}
                height={view.height}
                className="h-auto w-full rounded-xl"
              />
            </button>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-fg">{view.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-subtle">{view.note}</p>
                {view.source ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    {view.source.filename}
                    <span className="mt-1 block break-all text-subtle">{view.source.sha256}</span>
                  </p>
                ) : null}
              </div>
              <a href={view.src} download={view.filename} className="shrink-0 text-sm text-fg underline decoration-border underline-offset-4">
                Download
              </a>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="mt-10 font-display text-2xl font-medium tracking-tight">Files</h3>
      <ul className="mt-3 divide-y divide-border">
        {experiment.views.map((view) => (
          <li key={view.id} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm text-fg">{view.label}</span>
              <span className="text-xs text-subtle">
                {view.width}×{view.height} · {formatBytes(view.bytes)}
              </span>
            </span>
            <a href={view.src} download={view.filename} className="shrink-0 text-sm text-fg underline decoration-border underline-offset-4">
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Editions({ editions }: { editions: Edition[] }) {
  if (!editions.length) return null;
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl font-medium tracking-tight">Full editions</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        June 8, 2000. Each contact sheet is the whole deck. The zip is the deck itself: fronts, vectors, traces, and the canon.
      </p>
      {(catalog as { report?: string }).report ? (
        <p className="mt-3">
          <a href={(catalog as { report?: string }).report} download="report.json" className="text-sm text-fg underline decoration-border underline-offset-4">
            Test report
          </a>
        </p>
      ) : null}
      <div className="mt-4 grid gap-6">
        {editions.map((edition) => (
          <article key={edition.id} className="rounded-2xl bg-surface p-3">
            <h3 className="font-display text-xl font-medium">{edition.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-subtle">{edition.note}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <a href={edition.zip} download={edition.zipName} className="text-sm text-fg underline decoration-border underline-offset-4">
                Download deck
              </a>
              <a href={edition.provenance} download="provenance.json" className="text-sm text-fg underline decoration-border underline-offset-4">
                Provenance
              </a>
            </div>
            <img src={edition.sheet} alt={edition.title} width={edition.sheetWidth} height={edition.sheetHeight} className="mt-4 h-auto w-full rounded-xl" />
          </article>
        ))}
      </div>
    </section>
  );
}

function ComparePane({
  view,
  views,
  selected,
  onSelect,
  onOpen,
  side,
}: {
  view: View | null;
  views: View[];
  selected: string;
  onSelect: (id: string) => void;
  onOpen: (view: View) => void;
  side: string;
}) {
  const label = side;
  return (
    <section className="rounded-2xl bg-surface p-3">
      <label className="text-xs text-subtle" htmlFor={`bench-${side}`}>
        {label}
        <select
          id={`bench-${side}`}
          value={selected}
          onChange={(event) => onSelect(event.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-bg px-3 py-3 text-sm text-fg"
        >
          {views.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {view ? (
        <>
          <button type="button" onClick={() => onOpen(view)} className="mt-3 block w-full">
            <img
              src={view.src}
              alt={view.label}
              width={view.width}
              height={view.height}
              className="h-auto w-full rounded-xl"
            />
          </button>
          <p className="mt-3 text-sm leading-relaxed text-subtle">{view.note}</p>
          <div className="mt-3 flex gap-4">
            <button type="button" onClick={() => onOpen(view)} className="text-sm text-fg underline decoration-border underline-offset-4">
              Full size
            </button>
            <a href={view.src} download={view.filename} className="text-sm text-fg underline decoration-border underline-offset-4">
              Download
            </a>
          </div>
        </>
      ) : null}
    </section>
  );
}

function FullPlate({ view, onClose }: { view: View; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-bg" role="dialog" aria-modal="true" aria-label={view.label}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 py-3">
        <p className="min-w-0 truncate text-sm text-fg">{view.label}</p>
        <div className="flex shrink-0 gap-4">
          <a href={view.src} download={view.filename} className="text-sm text-fg underline decoration-border underline-offset-4">
            Download
          </a>
          <button type="button" onClick={onClose} className="text-sm text-fg">
            Close
          </button>
        </div>
      </div>
      <img
        src={view.src}
        alt={view.label}
        width={view.width}
        height={view.height}
        className="mx-auto h-auto max-w-none"
      />
    </div>
  );
}
