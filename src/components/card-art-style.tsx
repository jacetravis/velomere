"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FreedomControl } from "@/components/art-preferences";
import { CompanionProgress } from "@/components/companion-progress";
import { Button } from "@/components/ui/button";
import {
  cancelEncounterStyle,
  listEncounterCollections,
  previewEncounterStyle,
  publishEncounterStyle,
  readArtPreferences,
  readEncounterCollection,
} from "@/lib/encounters/server";
import { DEFAULT_ENCOUNTER_STYLE, ENCOUNTER_STYLE_CHOICES } from "@/lib/encounters/style-default.mjs";
import { freedomDescription } from "@/lib/encounters/interpretive-freedom.mjs";

const STYLES = ENCOUNTER_STYLE_CHOICES;

function key() {
  return `s${crypto.randomUUID().replace(/-/g, "")}`;
}

export function CardArtStyle({ deckId }: { deckId: string }) {
  const queryClient = useQueryClient();
  const collections = useQuery({ queryKey: ["encounter-collections"], queryFn: () => listEncounterCollections() });
  const match = (collections.data ?? []).find((row: { deckId: number; id: string }) => String(row.deckId) === String(deckId));
  const deck = useQuery({
    queryKey: ["encounter-collection", match?.id],
    queryFn: () => readEncounterCollection({ data: { collectionId: match.id } }),
    enabled: Boolean(match?.id),
  });
  const [preset, setPreset] = useState<(typeof STYLES)[number]["id"]>(DEFAULT_ENCOUNTER_STYLE);
  const [presetTouched, setPresetTouched] = useState(false);
  const [freedom, setFreedom] = useState(50);
  const [freedomTouched, setFreedomTouched] = useState(false);
  const [scope, setScope] = useState<"unlocked_only" | "unlock_all">("unlocked_only");
  const [confirmAll, setConfirmAll] = useState(false);
  const [job, setJob] = useState<{ jobId: string; candidates: Array<{ membershipId: string; imageUrl: string; geometryUrl?: string | null }> } | null>(null);
  const cards = deck.data?.cards ?? [];
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
  const lockedCount = cards.filter((card: { locked: boolean }) => card.locked).length;
  const unlockedCount = cards.length - lockedCount;
  const eligible = scope === "unlock_all" ? cards.length : unlockedCount;
  const blocked = !match || eligible === 0 || (scope === "unlock_all" && !confirmAll);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["encounter-collection", match?.id] });
    void queryClient.invalidateQueries({ queryKey: ["decks"] });
  };
  const preview = useMutation({
    mutationFn: () => previewEncounterStyle({
      data: {
        collectionId: match.id,
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
    mutationFn: () => publishEncounterStyle({ data: { jobId: job?.jobId || "", approved: true } }),
    onSuccess: () => {
      setJob(null);
      refresh();
      toast("The styled cards were saved and locked.");
    },
    onError: (err: Error) => toast(err.message),
  });
  const cancel = useMutation({
    mutationFn: () => cancelEncounterStyle({ data: { jobId: job?.jobId || "" } }),
    onSuccess: () => {
      setJob(null);
      toast("Canceled. The previous pictures were kept.");
    },
    onError: (err: Error) => toast(err.message),
  });
  if (!match) {
    return <p className="text-sm text-subtle">Registered styles make a companion picture from a frozen Encounter score. This deck has no Encounter geometry, so nothing here is restyled.</p>;
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-subtle">{cards.length} cards · {lockedCount} locked · {unlockedCount} unlocked · {eligible} eligible</p>
      <p className="text-sm text-subtle">These styles direct a companion picture made from the card’s geometric score. The score is kept. Choosing a name does nothing until you stylize, and nothing is saved until you approve. If you leave the style alone, this deck’s saved style is used. Freedom starts from your Art Preferences and can be moved for this job only.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="card-art-scope" checked={scope === "unlocked_only"} onChange={() => setScope("unlocked_only")} />
        Style unlocked cards only
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="card-art-scope" checked={scope === "unlock_all"} onChange={() => { setScope("unlock_all"); setConfirmAll(false); }} />
        Unlock all and style entire deck
      </label>
      {scope === "unlock_all" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmAll} onChange={(event) => setConfirmAll(event.target.checked)} />
          This preview would replace {lockedCount} locked picture{lockedCount === 1 ? "" : "s"} in this deck only, after you approve. Other decks stay as they are.
        </label>
      ) : null}
      <p id="card-art-freedom-note" className="text-sm text-subtle">{freedomDescription(freedom).text}</p>
      <label className="text-sm" htmlFor="card-art-style">Style</label>
      <select id="card-art-style" className="rounded-xl border border-border bg-bg px-3 py-3" value={preset} onChange={(event) => { setPresetTouched(true); setPreset(event.target.value as (typeof STYLES)[number]["id"]); }}>
        {STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
      </select>
      <FreedomControl id="card-art-freedom" hideNote value={freedom} onChange={(level) => { setFreedomTouched(true); setFreedom(level); }} />
      <Button type="button" className="w-full" disabled={blocked || preview.isPending} onClick={() => preview.mutate()}>
        {preview.isPending ? `Applying style to ${eligible} ${eligible === 1 ? "card" : "cards"}…` : "Stylize Deck"}
      </Button>
      <CompanionProgress active={preview.isPending} cards={eligible} />
      {eligible === 0 ? <p className="text-sm text-subtle">No unlocked cards. Unlock one, or confirm the whole deck.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={!job || publish.isPending} onClick={() => publish.mutate()}>Approve and Save</Button>
        <Button type="button" variant="ghost" disabled={!job || cancel.isPending} onClick={() => cancel.mutate()}>Cancel</Button>
      </div>
      {job ? job.candidates.map((candidate) => {
        const card = cards.find((item: { membershipId: string; imageUrl: string | null; artRole?: string; geometryUrl?: string | null }) => item.membershipId === candidate.membershipId);
        const role = card?.artRole;
        const currentLabel = role === "companion" || role === "legacy" ? "Current artwork" : "Geometric Base";
        const geometrySrc = candidate.geometryUrl || card?.geometryUrl || null;
        return (
          <div key={candidate.membershipId} className="grid grid-cols-2 gap-2">
            <figure>
              {geometrySrc ? <img src={geometrySrc} alt="" className="w-full rounded-xl" /> : <div className="aspect-[3.5/5.75] rounded-xl bg-bg" />}
              <figcaption className="mt-1 text-xs text-subtle">Original geometry</figcaption>
            </figure>
            <figure>
              <img src={candidate.imageUrl} alt="" className="w-full rounded-xl" />
              <figcaption className="mt-1 text-xs text-subtle">Preview companion · freedom {freedom}</figcaption>
            </figure>
            {card?.imageUrl && geometrySrc && card.imageUrl !== geometrySrc ? (
              <p className="col-span-2 text-xs text-subtle">{currentLabel} stays until you approve.</p>
            ) : null}
          </div>
        );
      }) : null}
    </div>
  );
}
