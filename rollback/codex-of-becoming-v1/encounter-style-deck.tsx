"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { FreedomControl } from "@/components/art-preferences";
import { CompanionProgress } from "@/components/companion-progress";
import { Button } from "@/components/ui/button";
import {
  cancelEncounterStyle,
  copyEncounterMembership,
  createEncounterCollection,
  listEncounterCollections,
  moveEncounterMembership,
  previewEncounterStyle,
  publishEncounterStyle,
  readArtPreferences,
  readEncounterCollection,
  setEncounterLock,
} from "@/lib/encounters/server";
import { DEFAULT_ENCOUNTER_STYLE, ENCOUNTER_STYLE_CHOICES } from "@/lib/encounters/style-default.mjs";

const STYLES = ENCOUNTER_STYLE_CHOICES;

function key() {
  return `s${crypto.randomUUID().replace(/-/g, "")}`;
}

export function EncounterStyleDeck({ collectionId }: { collectionId: string }) {
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState<(typeof STYLES)[number]["id"]>(DEFAULT_ENCOUNTER_STYLE);
  const [presetTouched, setPresetTouched] = useState(false);
  const [freedom, setFreedom] = useState(50);
  const [freedomTouched, setFreedomTouched] = useState(false);
  const [scope, setScope] = useState<"unlocked_only" | "unlock_all">("unlocked_only");
  const [confirmAll, setConfirmAll] = useState(false);
  const [job, setJob] = useState<{ jobId: string; candidates: Array<{ membershipId: string; imageUrl: string; geometryUrl?: string | null }> } | null>(null);
  const [copyTarget, setCopyTarget] = useState("");
  const [deckName, setDeckName] = useState("");
  const deck = useQuery({
    queryKey: ["encounter-collection", collectionId],
    queryFn: () => readEncounterCollection({ data: { collectionId } }),
  });
  useEffect(() => {
    const saved = deck.data?.style;
    if (presetTouched || !saved) return;
    if (STYLES.some((style) => style.id === saved)) setPreset(saved as (typeof STYLES)[number]["id"]);
  }, [deck.data?.style, presetTouched]);
  const prefs = useQuery({ queryKey: ["art-preferences"], queryFn: () => readArtPreferences() });
  useEffect(() => {
    if (freedomTouched || prefs.data?.freedom == null) return;
    setFreedom(prefs.data.freedom);
  }, [prefs.data?.freedom, freedomTouched]);
  const collections = useQuery({ queryKey: ["encounter-collections"], queryFn: () => listEncounterCollections() });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["encounter-collection", collectionId] });
    void queryClient.invalidateQueries({ queryKey: ["decks"] });
  };

  const lock = useMutation({
    mutationFn: (input: { membershipId: string; locked: boolean }) => setEncounterLock({ data: input }),
    onSuccess: refresh,
    onError: (err: Error) => toast(err.message),
  });

  const preview = useMutation({
    mutationFn: () => previewEncounterStyle({
      data: {
        collectionId,
        scope,
        presetId: preset,
        styleTouched: presetTouched,
        interpretiveFreedom: freedom,
        freedomTouched,
        key: key(),
        confirmUnlockAll: scope === "unlock_all" ? confirmAll : false,
      },
    }),
    onSuccess: (value) => setJob({ jobId: value.jobId, candidates: value.candidates }),
    onError: (err: Error) => toast(err.message),
  });

  const publish = useMutation({
    mutationFn: () => {
      if (!job) throw new Error("Preview the style first.");
      return publishEncounterStyle({ data: { jobId: job.jobId, approved: true } });
    },
    onSuccess: () => {
      setJob(null);
      setConfirmAll(false);
      refresh();
      toast("The deck was saved and the styled cards were locked again.");
    },
    onError: (err: Error) => toast(err.message),
  });

  const cancel = useMutation({
    mutationFn: () => {
      if (!job) throw new Error("Nothing to cancel.");
      return cancelEncounterStyle({ data: { jobId: job.jobId } });
    },
    onSuccess: () => {
      setJob(null);
      toast("Canceled. The previous pictures and locks were kept.");
    },
    onError: (err: Error) => toast(err.message),
  });

  const copy = useMutation({
    mutationFn: (input: { adoptedId: string; collectionId: string }) => copyEncounterMembership({ data: input }),
    onSuccess: () => {
      refresh();
      toast("Copied. The source deck still has the card.");
    },
    onError: (err: Error) => toast(err.message),
  });

  const move = useMutation({
    mutationFn: (input: { membershipId: string; collectionId: string }) => moveEncounterMembership({ data: input }),
    onSuccess: () => {
      refresh();
      toast("Moved. The Encounter itself was not erased.");
    },
    onError: (err: Error) => toast(err.message),
  });

  const createDeck = useMutation({
    mutationFn: () => createEncounterCollection({ data: { name: deckName.trim() } }),
    onSuccess: (created) => {
      setDeckName("");
      if (created?.id) setCopyTarget(created.id);
      void queryClient.invalidateQueries({ queryKey: ["encounter-collections"] });
      toast(created?.alreadyExisted ? "That deck is already here." : "Deck created.");
    },
    onError: (err: Error) => toast(err.message),
  });

  const data = deck.data;
  const cards = data?.cards ?? [];
  const lockedCount = cards.filter((card: { locked: boolean }) => card.locked).length;
  const unlockedCount = cards.length - lockedCount;
  const eligible = scope === "unlock_all" ? cards.length : unlockedCount;
  const blocked = eligible === 0 || (scope === "unlock_all" && !confirmAll);
  const blockReason = cards.length === 0
    ? "This deck has no cards yet."
    : eligible === 0
      ? "No unlocked cards. Unlock a card, or choose the whole deck and confirm."
      : scope === "unlock_all" && !confirmAll
        ? "Confirm the whole-deck replacement before stylizing."
        : "";
  return (
    <AppShell>
      <p className="text-sm"><Link to="/deck" className="underline">Decks</Link></p>
      <h1 className="mt-2 font-display text-4xl">{data?.name ?? "Encounter deck"}</h1>
      <p className="mt-2 max-w-xl text-sm text-subtle">Customize Deck. A style asks for a companion picture of the frozen score. Meaning and geometry stay put. A lock belongs to this deck, not to the card everywhere else.</p>
      <p className="mt-2 max-w-xl text-sm text-subtle">Stylize sends the geometric image to the image model and stages a companion. Nothing replaces the card until you approve. Cancel leaves the current picture, the geometry, and the locks alone. If you do not change the style here, this deck’s saved style is used. Your Art Preferences apply when a deck has no saved style, and they set the freedom for this job unless you move the slider.</p>
      {data?.deckId ? <p className="mt-2 text-sm"><Link to="/deck/$deckId" params={{ deckId: String(data.deckId) }} className="underline">Read this deck on the Table</Link></p> : null}
      <div className="mt-4 grid gap-3 rounded-2xl bg-surface p-4">
        <h2 className="font-display text-2xl">Customize Deck</h2>
        <p className="text-sm text-subtle">{cards.length} cards · {lockedCount} locked · {unlockedCount} unlocked · {eligible} eligible for this job</p>
        <label className="text-sm" htmlFor="style-preset">Style</label>
        <select id="style-preset" className="rounded-xl border border-border bg-bg px-3 py-3" value={preset} onChange={(event) => { setPresetTouched(true); setPreset(event.target.value as (typeof STYLES)[number]["id"]); }}>
          {STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
        </select>
        <FreedomControl id="deck-freedom" value={freedom} onChange={(level) => { setFreedomTouched(true); setFreedom(level); }} />
        <p className="text-xs text-subtle">Moving this slider sets freedom for this job only. It does not change your saved Art Preferences, and it does not restyle cards you already approved.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="style-scope" checked={scope === "unlocked_only"} onChange={() => setScope("unlocked_only")} />
          Style unlocked cards only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="style-scope" checked={scope === "unlock_all"} onChange={() => { setScope("unlock_all"); setConfirmAll(false); }} />
          Unlock all cards and apply style to whole deck
        </label>
        {scope === "unlock_all" ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmAll} onChange={(event) => setConfirmAll(event.target.checked)} />
            I understand this replaces every locked picture in this deck for this one job. Other decks are not changed.
          </label>
        ) : null}
        <Button type="button" className="w-full sm:w-auto" onClick={() => preview.mutate()} disabled={blocked || preview.isPending}>
          {preview.isPending ? "Generating companion artwork…" : "Stylize Deck"}
        </Button>
        <CompanionProgress active={preview.isPending} cards={eligible} />
        {blockReason ? <p className="text-sm text-subtle">{blockReason}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!job || publish.isPending} onClick={() => publish.mutate()}>Approve and Save Styles</Button>
          <Button type="button" variant="ghost" disabled={!job || cancel.isPending} onClick={() => cancel.mutate()}>Cancel</Button>
        </div>
      </div>
      {job ? (
        <div className="mt-4 grid gap-4">
          <h2 className="font-display text-2xl">Preview</h2>
          <p className="text-sm text-subtle">Nothing is published until you approve. Cancel leaves the current pictures and locks alone.</p>
          {job.candidates.map((candidate) => {
            const card = cards.find((item: { membershipId: string; imageUrl: string | null; artRole?: string; geometryUrl?: string | null }) => item.membershipId === candidate.membershipId);
            const role = card?.artRole;
            const currentLabel = role === "companion" || role === "legacy" ? "Current artwork" : "Geometric Base";
            const geometrySrc = candidate.geometryUrl || card?.geometryUrl || null;
            return (
              <div key={candidate.membershipId} className="grid grid-cols-2 gap-2">
                <figure>
                  {geometrySrc ? <img src={geometrySrc} alt="" className="w-full rounded-xl" /> : <div className="aspect-[3.5/5.75] rounded-xl bg-surface" />}
                  <figcaption className="mt-1 text-xs text-subtle">Original geometry</figcaption>
                </figure>
                <figure>
                  <img src={candidate.imageUrl} alt="" className="w-full rounded-xl" />
                  <figcaption className="mt-1 text-xs text-subtle">Preview companion · {STYLES.find((style) => style.id === preset)?.label} · freedom {freedom}</figcaption>
                </figure>
                {card?.imageUrl && geometrySrc && card.imageUrl !== geometrySrc ? (
                  <p className="col-span-2 text-xs text-subtle">{currentLabel} stays until you approve.</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="mt-6 grid gap-4">
        {(data?.cards ?? []).map((card: { membershipId: string; adoptedId: string; name: string; upright: string; locked: boolean; sceneHash: string; imageUrl: string | null; geometryUrl?: string | null; artLabel?: string; joins?: number | null }) => (
          <GeometryCard
            key={card.membershipId}
            card={card}
            lock={lock}
            collections={collections.data ?? []}
            collectionId={collectionId}
            destination={copyTarget}
            setDestination={setCopyTarget}
            deckName={deckName}
            setDeckName={setDeckName}
            copy={copy}
            move={move}
            createDeck={createDeck}
          />
        ))}
      </div>
    </AppShell>
  );
}

function GeometryCard({
  card,
  lock,
  collections,
  collectionId,
  destination,
  setDestination,
  deckName,
  setDeckName,
  copy,
  move,
  createDeck,
}: {
  card: { membershipId: string; adoptedId: string; name: string; upright: string; locked: boolean; sceneHash: string; imageUrl: string | null; geometryUrl?: string | null; artLabel?: string; joins?: number | null };
  lock: { mutate: (input: { membershipId: string; locked: boolean }) => void };
  collections: Array<{ id: string; name: string }>;
  collectionId: string;
  destination: string;
  setDestination: (value: string) => void;
  deckName: string;
  setDeckName: (value: string) => void;
  copy: { isPending: boolean; mutate: (input: { adoptedId: string; collectionId: string }) => void };
  move: { isPending: boolean; mutate: (input: { membershipId: string; collectionId: string }) => void };
  createDeck: { isPending: boolean; mutate: () => void };
}) {
  const [geometry, setGeometry] = useState(false);
  const face = geometry && card.geometryUrl ? card.geometryUrl : card.imageUrl;
  const others = collections.filter((item) => item.id !== collectionId);
  const busy = copy.isPending || move.isPending;
  return (
    <article className="rounded-2xl bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl">{card.name}</h2>
        <Button type="button" variant="secondary" onClick={() => lock.mutate({ membershipId: card.membershipId, locked: !card.locked })}>
          {card.locked ? "Unlock" : "Lock"}
        </Button>
      </div>
      <p className="text-xs text-subtle">{card.locked ? "Locked" : "Unlocked"} · {card.artLabel || "Current artwork"} · geometry {card.sceneHash.slice(0, 12)}</p>
      {face ? <img src={face} alt="" className="mt-3 w-full max-w-xs rounded-xl" /> : null}
      {card.geometryUrl ? (
        <Button type="button" variant="secondary" className="mt-3 min-h-11" onClick={() => setGeometry((open) => !open)}>
          {geometry ? "Return to Artwork" : "Show Original Geometry"}
        </Button>
      ) : null}
      {geometry ? <p className="mt-2 text-xs text-subtle">About this geometry. Joins {card.joins ?? "—"}. Scene {card.sceneHash.slice(0, 16)}.</p> : null}
      <p className="mt-2 text-sm">{card.upright}</p>
      <div className="mt-3 grid gap-2">
        <label className="text-xs text-subtle" htmlFor={`dest-${card.membershipId}`}>Destination deck</label>
        <select id={`dest-${card.membershipId}`} className="min-h-11 rounded-xl border border-border bg-bg px-2 py-2 text-sm" value={destination} onChange={(event) => setDestination(event.target.value)}>
          <option value="">Choose a deck</option>
          {others.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!destination || busy} onClick={() => copy.mutate({ adoptedId: card.adoptedId, collectionId: destination })}>
            Copy to Deck
          </Button>
          <Button type="button" variant="secondary" disabled={!destination || busy} onClick={() => move.mutate({ membershipId: card.membershipId, collectionId: destination })}>
            Move to Deck
          </Button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (deckName.trim()) createDeck.mutate();
          }}
        >
          <input
            className="min-h-11 flex-1 rounded-xl border border-border bg-bg px-3 text-sm"
            value={deckName}
            onChange={(event) => setDeckName(event.target.value)}
            placeholder="New personal deck"
            aria-label={`New deck for ${card.name}`}
            maxLength={60}
          />
          <Button type="submit" variant="ghost" disabled={!deckName.trim() || createDeck.isPending}>Create</Button>
        </form>
        <p className="text-xs text-subtle">Copy keeps this membership. Move leaves this deck only after the other deck has the card. The Encounter record stays.</p>
      </div>
    </article>
  );
}
