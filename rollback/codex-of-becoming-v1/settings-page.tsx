"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ArchiveSettings } from "@/components/archive-settings";
import { ArtPreferences } from "@/components/art-preferences";
import { FilePicker } from "@/components/file-picker";
import { TestBench } from "@/components/velomere-bench";
import { requestUploadConsent } from "@/components/upload-consent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { buildArchive, restoreArchive } from "@/lib/archive";
import { useJournal } from "@/lib/journal/store";
import {
  readingHand,
  setReadingHand,
  setVelomereHand,
  subscribeHands,
  velomereHand,
  type TableHand,
} from "@/lib/table-hands";
import { GRAMMAR_VERSION, VERSION } from "../../velomere-crystal/engine/export-identity.mjs";

function Section({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-border p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-display text-xl">{title}</span>
          <span className="mt-1 block text-sm font-normal text-subtle">{summary}</span>
        </span>
        <ChevronDown className="mt-1 size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function HandChoice({
  id,
  label,
  note,
  value,
  onChange,
}: {
  id: string;
  label: string;
  note: string;
  value: TableHand;
  onChange: (hand: TableHand) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm text-fg">{label}</Label>
        <p className="mt-1 text-xs text-subtle">{note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs tracking-wide text-subtle">
        <span className={value === "right" ? "text-fg" : undefined}>Right</span>
        <Switch
          id={id}
          checked={value === "left"}
          onCheckedChange={(on) => onChange(on ? "left" : "right")}
          aria-label={label}
        />
        <span className={value === "left" ? "text-fg" : undefined}>Left</span>
      </div>
    </div>
  );
}

function DownloadLink({ href, download, children }: { href: string; download: string; children: string }) {
  return (
    <a className="inline-block min-h-11 py-2 text-sm text-fg underline decoration-border underline-offset-4" href={href} download={download}>
      {children}
    </a>
  );
}

function LibraryBackup() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [backedUp, setBackedUp] = useState(false);

  const download = async () => {
    if (archiving) return;
    setArchiving(true);
    try {
      const zipped = await buildArchive();
      const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "threshold-of-solace.zip";
      link.click();
      URL.revokeObjectURL(url);
      setBackedUp(true);
      toast("Backup exported");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not export a backup.");
    } finally {
      setArchiving(false);
    }
  };

  const upload = async (file: File) => {
    if (archiving) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast("Choose a .zip file.");
      return;
    }
    if (file.size > 80_000_000) {
      toast("That backup is too large.");
      return;
    }
    const consent = await requestUploadConsent();
    if (!consent) return;
    setArchiving(true);
    try {
      await restoreArchive(new Uint8Array(await file.arrayBuffer()));
      const state = useJournal.getState();
      const deckIds = new Set<string>();
      for (const id of state.deckOrder ?? []) deckIds.add(String(id));
      for (const id of Object.keys(state.deckLooks ?? {})) deckIds.add(id);
      if (state.activeDeckId != null) deckIds.add(String(state.activeDeckId));
      const deckConsents = { ...(state.deckConsents ?? {}) };
      for (const id of deckIds) deckConsents[id] = consent;
      useJournal.setState({
        readings: state.readings.map((reading) => ({ ...reading, consent })),
        dreams: (state.dreams ?? []).map((dream) => ({ ...dream, consent })),
        rituals: (state.rituals ?? []).map((ritual) => ({ ...ritual, consent })),
        deckConsents,
      });
      const savedHand = window.localStorage.getItem("lumen-hand");
      if (savedHand === "left" || savedHand === "right") setReadingHand(savedHand);
      await queryClient.invalidateQueries();
      toast("Backup restored");
      setOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not import that backup.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-surface p-3">
      <h2 className="font-display text-lg">Reading Table library</h2>
      <p className="mt-2 text-sm text-subtle">
        This is the table backup: journals, reading decks, and table settings. It is not a Velomere Archive and it does not replace Encounter history.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={archiving} onClick={() => void download()}>
          {archiving ? "Preparing backup…" : "Export all"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setBackedUp(false);
            setOpen(true);
          }}
        >
          Import all
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && archiving) return;
          setOpen(next);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Replace everything?</DialogTitle>
            <DialogDescription>
              Import overwrites your journals, settings, and decks with the file. Locked decks stay, including Rider-Waite-Smith. Custom decks are replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Button type="button" variant="secondary" disabled={archiving} onClick={() => void download()}>
              {archiving ? "Preparing backup…" : "Export a backup first"}
            </Button>
            {backedUp ? (
              <label className="flex flex-col gap-1.5 text-sm text-muted">
                Backup file
                <FilePicker
                  id="archive-file"
                  accept=".zip,application/zip"
                  disabled={archiving}
                  label="Choose backup"
                  onFile={(file) => void upload(file)}
                />
              </label>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setBackedUp(true)}>
                I have backed up
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={archiving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TablePreferences() {
  const reading = useSyncExternalStore(subscribeHands, readingHand, () => "right" as const);
  const velomere = useSyncExternalStore(subscribeHands, velomereHand, () => "right" as const);
  const includeReversals = useJournal((s) => s.includeReversals);
  const setIncludeReversals = useJournal((s) => s.setIncludeReversals);
  return (
    <div className="grid gap-4">
      <HandChoice
        id="reading-hand"
        label="Reading Table hand"
        note={reading === "left" ? "Left hand lifts the left side of the reading deck." : "Right hand lifts the right side of the reading deck."}
        value={reading}
        onChange={setReadingHand}
      />
      <HandChoice
        id="velomere-hand"
        label="Velomere Table hand"
        note={velomere === "left" ? "Left hand lifts the left side. The top card is still the one above." : "Right hand lifts the right side. The top card is still the one above."}
        value={velomere}
        onChange={setVelomereHand}
      />
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label htmlFor="reversals" className="text-sm text-fg">Allow reversed cards</Label>
          <p className="mt-1 text-xs text-subtle">Reading Table only. Half of draws may arrive inverted. Velomere does not use this.</p>
        </div>
        <Switch id="reversals" checked={includeReversals} onCheckedChange={setIncludeReversals} />
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <AppShell>
      <h1 className="font-display text-4xl">Settings</h1>
      <p className="mt-2 text-sm text-subtle">Configuration and the tools that built the tables. Open a section when you need it.</p>
      <div className="mt-6 grid gap-3">
        <Section
          title="Velomere Art Preferences"
          summary="Default artistic style and interpretive freedom. Veiled Luminescence and Balanced stay the defaults until you save something else. Approved pictures are not restyled."
        >
          <ArtPreferences embedded />
        </Section>
        <Section
          title="Table Preferences"
          summary="Each table keeps its own hand. Reversals belong to the Reading Table. Neither choice changes which card is the top or the bottom."
        >
          <TablePreferences />
        </Section>
        <Section
          title="Deck Creation & Processing"
          summary="The published build, the deck process, and the dialogic reference decks. These files do not replace a deck you already saved."
        >
          <div className="grid gap-6">
            <div>
              <h2 className="font-display text-lg">Full build</h2>
              <p className="mt-2 text-sm text-subtle">The published server and client of this app. Deck downloads and the reference-deck photographs stay separate, so they are not inside this file. Rewritten on every production build from the engine below.</p>
              <p className="mt-3 font-mono text-xs text-fg">{VERSION}</p>
              <p className="mt-1 font-mono text-xs text-subtle">{GRAMMAR_VERSION}</p>
              <DownloadLink href="/downloads/velomere-full-build.txt" download="velomere-full-build.txt">Download velomere-full-build.txt</DownloadLink>
            </div>
            <div>
              <h2 className="font-display text-lg">Deck process</h2>
              <p className="mt-2 text-sm text-subtle">The whole Create path, in writing and in the files that draw it. Sources, recipe, operators, and every file a deck writes. Rewritten on every production build. Same export as the full build.</p>
              <p className="mt-3 font-mono text-xs text-fg">{VERSION}</p>
              <p className="mt-1 font-mono text-xs text-subtle">{GRAMMAR_VERSION}</p>
              <DownloadLink href="/downloads/velomere-deck-process.txt" download="velomere-deck-process.txt">Download velomere-deck-process.txt</DownloadLink>
            </div>
            <div>
              <h2 className="font-display text-lg">Dialogic deck</h2>
              <p className="mt-2 text-sm text-subtle">One full deck drawn 2026-11-13, affinity 0, with VELoMERE — Dialogic Rootline. Each card is one core and one stream. A strand may leave and rejoin. The Dendrite back is shared. Saved decks are not replaced by this file. Human recognition of these pictures is not yet measured.</p>
              <DownloadLink href="/downloads/velomere-dialogic-neutral-deck.txt" download="velomere-dialogic-neutral-deck.txt">Download the neutral deck</DownloadLink>
              <p className="mt-4 text-sm text-subtle">The same date with a guest. Affinity 1 is The Shuffle, 14 is The Dance, 78 is Witness of Sigils. Paths join only when a term is attested in both passages. Otherwise the top stays open. Agreement is not assumed.</p>
              <div className="mt-1 flex flex-col">
                <DownloadLink href="/downloads/velomere-dialogic-affinity-1.txt" download="velomere-dialogic-affinity-1.txt">Affinity 1 · The Shuffle</DownloadLink>
                <DownloadLink href="/downloads/velomere-dialogic-affinity-14.txt" download="velomere-dialogic-affinity-14.txt">Affinity 14 · The Dance</DownloadLink>
                <DownloadLink href="/downloads/velomere-dialogic-affinity-78.txt" download="velomere-dialogic-affinity-78.txt">Affinity 78 · Witness of Sigils</DownloadLink>
                <DownloadLink href="/downloads/velomere-rootline-neutral-deck.txt" download="velomere-rootline-neutral-deck.txt">Earlier rising-path neutral deck</DownloadLink>
                <DownloadLink href="/downloads/velomere-v10-neutral-deck.txt" download="velomere-v10-neutral-deck.txt">Earlier readable-encounter neutral deck</DownloadLink>
              </div>
            </div>
          </div>
        </Section>
        <Section
          title="Import & Export"
          summary="A deck zip or spreadsheet is imported on that deck’s page, up to 100 MB. A Velomere Archive is a different file. The Reading Table backup is a third file, and it overwrites."
        >
          <div className="grid gap-4">
            <LibraryBackup />
            <ArchiveSettings embedded />
          </div>
        </Section>
        <Section
          title="Developer Tools"
          summary="The Rootline test bench. It draws only when you ask. Saved decks stay as they were."
        >
          <TestBench embedded />
        </Section>
      </div>
    </AppShell>
  );
}
