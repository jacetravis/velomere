"use client";

import { useState, useSyncExternalStore, useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AccountSignOut, AppShell } from "@/components/app-shell";
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
import {
  canSpeakAloud,
  deviceVoices,
  isElevenVoice,
  openVoiceDownload,
  rememberRate,
  rememberSpeak,
  rememberVoice,
  rememberedVoice,
  speakAloud,
  speakEnabled,
  spokenRate,
  stopSpeaking,
  voiceKey,
} from "@/lib/solace/speech";
import { useJournal } from "@/lib/journal/store";
import {
  setReadingHand,
  setVelomereHand,
  subscribeHands,
  velomereHand,
  type TableHand,
} from "@/lib/table-hands";
import { setThemeId, subscribeTheme, themeId, THEMES, DEFAULT_THEME, type ThemeId } from "@/lib/themes";
import {
  canPromptInstall,
  installHelp,
  installVersion,
  isIos,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from "@/lib/install-app";
import { GRAMMAR_VERSION, VERSION } from "../../velomere-crystal/engine/export-identity.mjs";

/** Built-in tools stay closed until an app update sets this to true. */
const SHOW_BUILT_TOOLS = false;

function Section({
  title,
  summary,
  children,
  locked = false,
}: {
  title: string;
  summary: string;
  children?: ReactNode;
  locked?: boolean;
}) {
  if (locked) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3" aria-disabled="true">
        <span className="font-display text-xl">{title}</span>
        <Lock className="size-4 shrink-0 text-muted" />
      </div>
    );
  }
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
  const [choose, setChoose] = useState(false);
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
        This is the table backup: journals, reading decks, spreads, the room theme, the overlay, and table settings. It is not a Velomere Archive and it does not replace Encounter history.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={archiving} onClick={() => setChoose(true)}>
          {archiving ? "Preparing backup…" : "Export / Import"}
        </Button>
      </div>
      <Dialog open={choose} onOpenChange={setChoose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export or import</DialogTitle>
            <DialogDescription>Export the Reading Table library, or replace it from a backup.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={archiving}
              onClick={() => {
                setChoose(false);
                void download();
              }}
            >
              {archiving ? "Preparing backup…" : "Export all"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setChoose(false);
                setBackedUp(false);
                setOpen(true);
              }}
            >
              Import all
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

function SolaceVoice() {
  const [enabled, setEnabled] = useState(speakEnabled);
  const [rate, setRate] = useState(spokenRate);
  const [voiceURI, setVoiceURI] = useState(rememberedVoice);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [installNote, setInstallNote] = useState(false);
  useEffect(() => {
    if (!canSpeakAloud()) return;
    const load = () => setVoices(deviceVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label htmlFor="solace-speak" className="text-sm text-fg">Read replies aloud</Label>
          <p className="mt-1 text-xs text-subtle">New replies in the Solace chat are spoken. A reply can still be read on its own.</p>
        </div>
        <Switch
          id="solace-speak"
          checked={enabled}
          disabled={!canSpeakAloud()}
          onCheckedChange={(on) => {
            setEnabled(on);
            rememberSpeak(on);
            if (!on) stopSpeaking();
          }}
        />
      </div>
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="solace-rate" className="text-sm text-fg">Speaking speed</Label>
          <span className="text-xs text-subtle tabular-nums">{rate.toFixed(2)}×</span>
        </div>
        <input
          id="solace-rate"
          type="range"
          min={0.6}
          max={1.4}
          step={0.05}
          value={rate}
          className="mt-3 w-full"
          onChange={(event) => {
            const next = Number(event.target.value);
            setRate(next);
            rememberRate(next);
          }}
        />
        <div className="mt-1 flex justify-between text-[11px] text-subtle">
          <span>Slower</span>
          <span>Faster</span>
        </div>
        <Button type="button" variant="secondary" className="mt-3" disabled={!canSpeakAloud()} onClick={() => speakAloud("I'm here.")}>
          Hear this speed
        </Button>
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-sm text-fg">Voice</p>
        <p className="mt-1 text-xs text-subtle">Solace uses ElevenReader when your phone offers it. Other voices are the ones this browser can see.</p>
        <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-border">
          <button
            type="button"
            className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-3 text-left ${voiceURI === "" || voiceURI === "eleven" ? "bg-surface" : ""}`}
            onClick={() => {
              setVoiceURI("eleven");
              rememberVoice("eleven");
              speakAloud("This is ElevenReader.");
            }}
          >
            <span>
              <span className="block text-sm">ElevenReader</span>
              <span className="block text-xs text-subtle">The text-to-speech engine on this phone</span>
            </span>
            {voiceURI === "eleven" ? <span className="text-xs text-subtle">Selected</span> : null}
          </button>
          {voices.length === 0 ? <p className="px-3 py-3 text-sm text-subtle">No other voices are ready yet.</p> : null}
          {voices.map((voice) => {
            const key = voiceKey(voice);
            const selected = key === voiceURI;
            return (
              <button
                key={key}
                type="button"
                className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-3 text-left last:border-b-0 ${selected ? "bg-surface" : ""}`}
                onClick={() => {
                  setVoiceURI(key);
                  rememberVoice(key);
                  speakAloud(`This is ${voice.name}.`);
                }}
              >
                <span>
                  <span className="block text-sm">{voice.name}</span>
                  <span className="block text-xs text-subtle">{isElevenVoice(voice) ? "ElevenReader" : voice.lang}</span>
                </span>
                {selected ? <span className="text-xs text-subtle">Selected</span> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const opened = openVoiceDownload();
              setInstallNote(true);
              if (!opened) toast("Open your phone's text-to-speech settings to download a voice.");
            }}
          >
            Download voices
          </Button>
          <Button type="button" variant="ghost" onClick={() => setVoices(deviceVoices())}>
            Refresh voices
          </Button>
        </div>
        {installNote ? (
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            Keep ElevenReader as the preferred engine. Tap the gear beside it and install a voice there. Then come back and tap Refresh voices. If ElevenReader still is not listed, open Solace in Samsung Internet. That browser uses the engine you chose.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TablePreferences() {
  const velomere = useSyncExternalStore(subscribeHands, velomereHand, () => "right" as const);
  return (
    <div className="grid gap-4">
      <HandChoice
        id="velomere-hand"
        label="Velomere Table hand"
        note={velomere === "left" ? "Left hand lifts the left side. The top card is still the one above." : "Right hand lifts the right side. The top card is still the one above."}
        value={velomere}
        onChange={setVelomereHand}
      />
    </div>
  );
}

function RoomThemes() {
  const current = useSyncExternalStore(subscribeTheme, themeId, () => DEFAULT_THEME);
  return (
    <div className="grid gap-3">
      {THEMES.map((theme) => {
        const selected = current === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            aria-pressed={selected}
            onClick={() => setThemeId(theme.id as ThemeId)}
            className={`flex items-center gap-3 rounded-2xl border p-2 text-left ${selected ? "border-accent bg-surface" : "border-border"}`}
          >
            <img src={theme.table} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
            <span className="min-w-0">
              <span className="block font-display text-xl">{theme.name}</span>
              <span className="mt-1 block text-sm text-subtle">{theme.note}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function InstallApp() {
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  useSyncExternalStore(subscribeInstall, installVersion, () => 0);
  useEffect(() => {
    setInstalled(isStandalone());
  }, []);
  if (installed) return null;
  return (
    <>
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-4 text-left text-accent-fg"
        onClick={() => {
          if (canPromptInstall()) {
            void promptInstall();
            return;
          }
          if (isIos()) {
            window.location.assign("/?install=1&platform=ios");
            return;
          }
          setHelp(true);
        }}
      >
        <span className="min-w-0">
          <span className="block font-display text-xl">Install app</span>
          <span className="mt-1 block text-sm opacity-80">Add this to your phone’s home screen.</span>
        </span>
      </button>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install app</DialogTitle>
            <DialogDescription>{installHelp()}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setHelp(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SettingsPage() {
  return (
    <AppShell>
      <h1 className="font-display text-4xl">Settings</h1>
      <p className="mt-2 text-sm text-subtle">Configuration and the tools that built the tables. Open a section when you need it.</p>
      <div className="mt-6 grid gap-3">
        <InstallApp />
        <Section
          title="Room"
          summary="The whole app, and the table under the cards. A deck with its own table picture keeps that picture."
        >
          <RoomThemes />
        </Section>
        <AccountSignOut />
        <Section
          title="Table Preferences"
          summary="The Velomere Table keeps its own hand. The Reading Table hand and reversals are on the table."
        >
          <TablePreferences />
        </Section>
        <Section
          title="Solace Voice"
          summary="How Solace sounds when she reads a reply, and how fast she speaks."
        >
          <SolaceVoice />
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
        {SHOW_BUILT_TOOLS ? (
          <Link to="/guide" className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border px-4 py-4">
            <span className="min-w-0">
              <span className="block font-display text-xl">Guide</span>
              <span className="mt-1 block text-sm text-subtle">Living meanings for the Velomere cards.</span>
            </span>
            <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted" />
          </Link>
        ) : (
          <Section title="Guide" summary="Living meanings for the Velomere cards." locked />
        )}
        {SHOW_BUILT_TOOLS ? (
          <Section
            title="Velomere Art Preferences"
            summary="Default artistic style and interpretive freedom. Veiled Luminescence and Balanced stay the defaults until you save something else. Approved pictures are not restyled."
          >
            <ArtPreferences embedded />
          </Section>
        ) : (
          <Section
            title="Velomere Art Preferences"
            summary="Default artistic style and interpretive freedom. Veiled Luminescence and Balanced stay the defaults until you save something else. Approved pictures are not restyled."
            locked
          />
        )}
        {SHOW_BUILT_TOOLS ? (
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
        ) : (
          <Section
            title="Deck Creation & Processing"
            summary="The published build, the deck process, and the dialogic reference decks. These files do not replace a deck you already saved."
            locked
          />
        )}
        {SHOW_BUILT_TOOLS ? (
        <Section
          title="Codex of Becoming — staged review"
          summary="Test plates only. Nothing here is approved, locked, or written onto a deck."
        >
          <div className="grid gap-4 text-sm">
            <p className="text-subtle">The Velomere, The Null, and Narrow Question. Original geometry is on the left of each row in the files below. Codex paintings keep the same engraved register at freedom 20, 60, and 95. Veiled Luminescence is the comparison, not the new style. Explain Symbols on a card reads the same register from that card’s stored score.</p>
            {[
              ["The Velomere · geometry", "/codex-review/velomere-geometry.png"],
              ["The Velomere · Codex · freedom 20", "/codex-review/velomere-codex-20.png"],
              ["The Velomere · Codex · freedom 60", "/codex-review/velomere-codex-60.png"],
              ["The Velomere · Codex · freedom 95", "/codex-review/velomere-codex-95.png"],
              ["The Velomere · Veiled Luminescence · freedom 60", "/codex-review/velomere-veiled-60.png"],
              ["The Null · geometry", "/codex-review/null-geometry.png"],
              ["The Null · Codex · freedom 60", "/codex-review/null-codex-60.png"],
              ["Narrow Question · geometry", "/codex-review/question-geometry.png"],
              ["Narrow Question · Codex · freedom 60", "/codex-review/question-codex-60.png"],
            ].map(([label, src]) => (
              <figure key={src}>
                <img src={src} alt="" className="w-full max-w-xs rounded-xl" />
                <figcaption className="mt-1 text-xs text-subtle">{label}</figcaption>
              </figure>
            ))}
          </div>
        </Section>
        ) : (
          <Section
            title="Codex of Becoming — staged review"
            summary="Test plates only. Nothing here is approved, locked, or written onto a deck."
            locked
          />
        )}
        {SHOW_BUILT_TOOLS ? (
        <Section
          title="Developer Tools"
          summary="The Rootline test bench. It draws only when you ask. Saved decks stay as they were."
        >
          <TestBench embedded />
        </Section>
        ) : (
          <Section
            title="Developer Tools"
            summary="The Rootline test bench. It draws only when you ask. Saved decks stay as they were."
            locked
          />
        )}
      </div>
    </AppShell>
  );
}
