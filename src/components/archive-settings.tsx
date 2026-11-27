"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  exportVelomereCompleteArchive,
  exportVelomereDeckArchive,
  importVelomereArchiveFile,
  listEncounterCollections,
  previewVelomereArchive,
} from "@/lib/encounters/server";
import { listCards, listDecks } from "@/lib/cards/server";
import { STANDARD_EXPORT_LIMIT } from "@/lib/encounters/archive-shared.mjs";
import { useJournal } from "@/lib/journal/store";
import { readingHand, setReadingHand, setVelomereHand, velomereHand } from "@/lib/table-hands";

type Manifest = {
  label?: string;
  complete?: boolean;
  scope?: string;
  counts?: Record<string, number>;
  exclusions?: string[];
  incomplete?: { id?: string; problem?: string }[];
};

type Preview = {
  label: string;
  format: string;
  schema?: string;
  scope: string;
  complete: boolean;
  counts: Record<string, number>;
  exclusions: string[];
  incomplete: { problem?: string }[];
  problems: { path?: string; problem?: string }[];
  alreadyRestored?: boolean;
  sameMeaning?: number;
  hasJournals: boolean;
  hasDrafts?: boolean;
  journalCounts: { readings: number; dreams: number; rituals: number; conversations: number } | null;
};

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function imageFile(url: string | null) {
  if (!url || url.startsWith("data:")) return "";
  const name = url.split("?")[0]?.split("/").pop() || "";
  return name.includes(".") ? name : "";
}

function downloadBase64(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Report({ manifest }: { manifest: Manifest | null }) {
  if (!manifest) return null;
  const counts = manifest.counts || {};
  const standard = manifest.label === "Standard deck export";
  return (
    <div className="mt-3 rounded-2xl border border-border p-3 text-sm">
      <p className="font-display text-lg">{manifest.label}</p>
      <p className="mt-1 text-subtle">
        {standard
          ? "Names and meanings only. Picture bytes and Encounter history were not included."
          : manifest.complete
            ? "Required image bytes were included."
            : "This archive is incomplete. Missing pieces are listed below and were not invented."}
      </p>
      <p className="mt-2 text-muted">
        {standard
          ? `${counts.cards || 0} cards.`
          : `${counts.cards || 0} cards, ${counts.commits || 0} encounters, ${counts.renders || 0} images, ${counts.memberships || 0} memberships, ${counts.collections || 0} decks.`}
      </p>
      {manifest.exclusions?.length ? <p className="mt-2 text-subtle">Left out: {manifest.exclusions.join(", ")}.</p> : null}
      {manifest.incomplete?.length ? (
        <ul className="mt-2 list-disc pl-5 text-subtle">
          {manifest.incomplete.slice(0, 8).map((item, index) => <li key={`${item.problem}-${index}`}>{item.problem}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function ArchiveSettings({ embedded = false }: { embedded?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [decks, setDecks] = useState<{ id: string; name: string; landing: boolean }[]>([]);
  const [deckId, setDeckId] = useState("");
  const [includeJournals, setIncludeJournals] = useState(false);
  const [includeConversations, setIncludeConversations] = useState(false);
  const [exportReport, setExportReport] = useState<Manifest | null>(null);
  const [fileText, setFileText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"restore" | "merge" | "as-new">("restore");
  const [applyPreferences, setApplyPreferences] = useState(false);
  const [readingDecks, setReadingDecks] = useState<{ id: number; name: string; cardCount: number }[]>([]);
  const [readingDeckId, setReadingDeckId] = useState(0);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [applyDrafts, setApplyDrafts] = useState(false);

  const [applyJournals, setApplyJournals] = useState(false);

  const loadDecks = async () => {
    const rows = await listEncounterCollections();
    setDecks(rows);
    setDeckId((current) => current || rows.find((row: { landing?: boolean; id: string }) => row.landing)?.id || rows[0]?.id || "");
  };

  const loadReadingDecks = async () => {
    const rows = (await listDecks()).filter((row) => !row.locked);
    setReadingDecks(rows);
    setReadingDeckId((current) => (rows.some((row) => row.id === current) ? current : rows[0]?.id || 0));
  };

  const journalPayload = () => {
    if (!includeJournals) return null;
    const state = useJournal.getState();
    return {
      readings: state.readings,
      dreams: state.dreams,
      rituals: state.rituals,
      labels: state.labels,
      conversations: includeConversations ? state.conversations : [],
    };
  };

  const runExport = async (kind: "deck" | "complete") => {
    setBusy(true);
    try {
      const result = kind === "deck"
        ? await exportVelomereDeckArchive({ data: { collectionId: deckId } })
        : await exportVelomereCompleteArchive({
            data: {
              journal: journalPayload(),
              includeConversations,
              includeDrafts,
              reader: {
                includeReversals: useJournal.getState().includeReversals,
                shuffleLocked: useJournal.getState().shuffleLocked,
                readingHand: readingHand(),
                velomereHand: velomereHand(),
              },
            },
          });
      downloadBase64(result.base64, result.filename);
      setExportReport(result.manifest);
      toast(result.manifest.complete ? "Archive downloaded." : "Archive downloaded. It is not complete.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "The archive was not created.");
    } finally {
      setBusy(false);
    }
  };

  const exportSpreadsheet = async () => {
    if (!readingDeckId) return;
    setBusy(true);
    try {
      const cards = await listCards({ data: { deckId: readingDeckId } });
      const deck = readingDecks.find((row) => row.id === readingDeckId);
      const lines = ["name,suit,rank,keywords,upright,reversed,image,sort_order,image_scale,image_x,image_y,image_radius"];
      for (const card of cards) {
        lines.push(
          [
            csvCell(card.name),
            csvCell(card.suit),
            csvCell(card.rank),
            csvCell(card.keywords),
            csvCell(card.upright),
            csvCell(card.reversed),
            csvCell(imageFile(card.imageUrl)),
            String(card.sortOrder),
            String(card.imageScale),
            String(card.imageX),
            String(card.imageY),
            String(card.imageRadius),
          ].join(","),
        );
      }
      const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(deck?.name || "deck").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setExportReport({
        label: "Standard deck export",
        complete: false,
        counts: { cards: cards.length },
        exclusions: ["encounter-lineage", "geometric-scores", "companion-art", "journals"],
      });
      toast("Spreadsheet downloaded. It is not a complete backup.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That deck was not exported.");
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setPreview(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
      const base64 = btoa(binary);
      setFileText(base64);
      const report = await previewVelomereArchive({ data: { base64 } }) as Preview;
      setPreview(report);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!fileText || !preview || preview.problems.length) return;
    setBusy(true);
    try {
      const result = await importVelomereArchiveFile({ data: { base64: fileText, mode, applyPreferences, applyDrafts } });
      if (applyJournals && result.journals) {
        const journal = result.journals as { readings?: never[]; dreams?: never[]; rituals?: never[]; conversations?: never[] };
        const store = useJournal.getState();
        if (journal.readings?.length) store.importReadings(journal.readings);
        if (journal.dreams?.length) store.importDreams(journal.dreams);
        if (journal.rituals?.length) store.importRituals(journal.rituals);
        if (journal.conversations?.length) store.importConversations(journal.conversations);
      }
      if (applyPreferences && result.localPreferences) {
        const local = result.localPreferences as {
          includeReversals?: boolean | null;
          shuffleLocked?: boolean | null;
          readingHand?: string | null;
          velomereHand?: string | null;
        };
        const store = useJournal.getState();
        if (typeof local.includeReversals === "boolean") store.setIncludeReversals(local.includeReversals);
        if (typeof local.shuffleLocked === "boolean") store.setShuffleLocked(local.shuffleLocked);
        if (local.readingHand === "left" || local.readingHand === "right") setReadingHand(local.readingHand);
        if (local.velomereHand === "left" || local.velomereHand === "right") setVelomereHand(local.velomereHand);
      }
      toast(result.created.cards ? "Restored." : "Already restored. Nothing was duplicated.");
      setExportReport({
        label: result.label,
        complete: result.complete,
        counts: result.created as unknown as Record<string, number>,
        exclusions: result.exclusions,
        incomplete: result.incomplete,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const body = (
      <section className="grid gap-3">
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer font-display text-xl">Standard deck export</summary>
          <p className="mt-3 text-sm text-subtle">{STANDARD_EXPORT_LIMIT}</p>
          <p className="mt-2 text-sm">Included: the 12-column spreadsheet (name, suit, rank, keywords, upright, reversed, image name, order, placement). The deck page Export zip still carries pictures, picture placement, the original card back, and table settings. It is still not a complete backup.</p>
          <p className="mt-2 text-sm text-subtle">Left out: Encounter lineage, geometric scores, companion art, journals, and saved art defaults.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadReadingDecks()}>Choose a deck</Button>
            <Label className="sr-only" htmlFor="standard-deck">Reading deck</Label>
            <select id="standard-deck" className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm" value={readingDeckId || ""} onChange={(event) => setReadingDeckId(Number(event.target.value))}>
              {readingDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
            </select>
            <Button type="button" disabled={busy || !readingDeckId} onClick={() => void exportSpreadsheet()}>{busy ? "Working…" : "Export Standard Deck"}</Button>
          </div>
        </details>
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer font-display text-xl">Velomere deck archive</summary>
          <p className="mt-3 text-sm text-subtle">Included: the chosen Encounter deck, its cards, meanings, original geometry, approved pictures, locks, and the ancestors required to restore that deck by itself.</p>
          <p className="mt-2 text-sm text-subtle">Left out: unrelated decks, journals, reader preferences, Solace transcripts, open drafts, and the live table.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadDecks()}>Choose a deck</Button>
            <Label className="sr-only" htmlFor="archive-deck">Deck</Label>
            <select id="archive-deck" className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm" value={deckId} onChange={(event) => setDeckId(event.target.value)}>
              {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}{deck.landing ? " (Landing Zone)" : ""}</option>)}
            </select>
            <Button type="button" disabled={busy || !deckId} onClick={() => void runExport("deck")}>{busy ? "Working…" : "Export Velomere Deck Archive"}</Button>
          </div>
        </details>
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer font-display text-xl">Complete Velomere archive</summary>
          <p className="mt-3 text-sm text-subtle">Included: every Encounter deck, the Landing Zone, committed cards even if they are not in a deck, ancestry, geometry, companion pictures, and saved art defaults. Reading cards keep their picture placement. Reversals, the shuffle lock, and which hand lifts each table are included. The current approved reading is kept. Older wording is not stored, so it cannot be invented.</p>
          <p className="mt-2 text-sm text-subtle">Left out unless you ask: journals, saved conversations, and drafts. Always left out: the live table, unfinished style jobs, and Solace’s private configuration.</p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={includeJournals} onChange={(event) => setIncludeJournals(event.target.checked)} />
            Include journals saved on this phone. Readings, dreams, and rituals only.
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={includeConversations} disabled={!includeJournals && !includeDrafts} onChange={(event) => setIncludeConversations(event.target.checked)} />
            Also include saved Solace conversations. This is separate and off unless you check it.
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={includeDrafts} onChange={(event) => setIncludeDrafts(event.target.checked)} />
            Include saved drafts as drafts. They are not new Encounters. Their conversation stays out unless the box above is checked.
          </label>
          <Button className="mt-3" type="button" disabled={busy} onClick={() => void runExport("complete")}>{busy ? "Working…" : "Export Complete Velomere Archive"}</Button>
        </details>
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer font-display text-xl">Import deck or archive</summary>
          <p className="mt-3 text-sm text-subtle">A CSV or older deck zip still belongs on the deck page. A Velomere Archive is checked before anything is written. A bad file changes nothing.</p>
          <input className="mt-3 block text-sm" type="file" accept=".zip,application/zip" onChange={(event) => void readFile(event.target.files?.[0] || null)} />
          {preview ? (
            <div className="mt-3 text-sm">
              <p className="font-display text-lg">{preview.label}</p>
              <p className="text-subtle">{preview.format}{preview.schema ? ` · ${preview.schema}` : ""} · {preview.scope} · {preview.complete ? "complete" : "incomplete"}</p>
              <p className="mt-1 text-muted">{preview.counts.cards || 0} cards, {preview.counts.commits || 0} encounters, {preview.counts.renders || 0} images{(preview.counts.drafts ? `, ${preview.counts.drafts} drafts` : "")}.</p>
              {preview.problems.length ? <p className="mt-2 text-subtle">Cannot restore: {preview.problems.slice(0, 6).map((item) => item.problem).join(", ")}.</p> : null}
              {preview.incomplete?.length ? <p className="mt-2 text-subtle">Missing from the file: {preview.incomplete.slice(0, 4).map((item) => item.problem).join(", ")}.</p> : null}
              {preview.alreadyRestored ? <p className="mt-2">This archive was restored here before. Restore will not duplicate it.</p> : null}
              {preview.sameMeaning ? <p className="mt-2">{preview.sameMeaning} cards already match a geometry and a meaning here. Merge can reuse them. A shared title is not treated as the same card.</p> : null}
              {preview.journalCounts ? <p className="mt-2">Journals in the file: {preview.journalCounts.readings} readings, {preview.journalCounts.dreams} dreams, {preview.journalCounts.rituals} rituals, {preview.journalCounts.conversations} conversations.</p> : null}
              {preview.hasDrafts ? <p className="mt-2">Saved drafts are in this file. They stay drafts.</p> : null}
              <label className="mt-3 flex items-start gap-2">
                <input type="radio" name="archive-mode" checked={mode === "restore"} onChange={() => setMode("restore")} />
                Restore. Importing the same archive again does not duplicate it.
              </label>
              <label className="mt-2 flex items-start gap-2">
                <input type="radio" name="archive-mode" checked={mode === "merge"} onChange={() => setMode("merge")} />
                Merge. Reuse a card that is already here with the same geometry and meaning. Do not replace a newer personal reading.
              </label>
              <label className="mt-2 flex items-start gap-2">
                <input type="radio" name="archive-mode" checked={mode === "as-new"} onChange={() => setMode("as-new")} />
                Import as new. Make another copy even if this archive was restored before.
              </label>
              <label className="mt-3 flex items-start gap-2">
                <input type="checkbox" checked={applyPreferences} onChange={(event) => setApplyPreferences(event.target.checked)} />
                Replace this installation’s saved style, freedom, reversals, and shuffle lock with the archive. Off by default.
              </label>
              <label className="mt-2 flex items-start gap-2">
                <input type="checkbox" checked={applyJournals} onChange={(event) => setApplyJournals(event.target.checked)} />
                Add included journals to this phone. Existing entries with the same id are kept.
              </label>
              <label className="mt-2 flex items-start gap-2">
                <input type="checkbox" checked={applyDrafts} onChange={(event) => setApplyDrafts(event.target.checked)} disabled={!preview.hasDrafts} />
                Restore saved drafts. They are not turned into Encounters.
              </label>
              <Button className="mt-3" type="button" disabled={busy || preview.problems.length > 0} onClick={() => void restore()}>Import archive</Button>
            </div>
          ) : null}
        </details>
        <Report manifest={exportReport} />
      </section>
  );
  if (embedded) return body;
  return (
    <AppShell>
      <h1 className="font-display text-3xl">Settings</h1>
      <p className="mt-2 text-sm text-subtle">Import and export live here, not on the table.</p>
      <div className="mt-6">{body}</div>
    </AppShell>
  );
}
