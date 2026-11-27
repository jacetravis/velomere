"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  cancelEncounterStyle,
  listEncounterCollections,
  previewEncounterStyle,
  publishEncounterStyle,
  readEncounterCollection,
} from "@/lib/encounters/server";
import { DEFAULT_ENCOUNTER_STYLE } from "@/lib/encounters/style-default.mjs";

const STYLES = [
  { id: "living_matter", label: "Living Matter" },
  { id: "prismatic_geometry", label: "Prismatic Geometry" },
  { id: "forged_relief", label: "Forged Relief" },
  { id: "veiled_luminescence", label: "Veiled Luminescence" },
] as const;

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
  const [scope, setScope] = useState<"unlocked_only" | "unlock_all">("unlocked_only");
  const [confirmAll, setConfirmAll] = useState(false);
  const [job, setJob] = useState<{ jobId: string; candidates: Array<{ membershipId: string; imageUrl: string }> } | null>(null);
  const cards = deck.data?.cards ?? [];
  useEffect(() => {
    const saved = deck.data?.style;
    if (presetTouched || !saved) return;
    if (STYLES.some((style) => style.id === saved)) setPreset(saved as (typeof STYLES)[number]["id"]);
  }, [deck.data?.style, presetTouched]);
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
      data: { collectionId: match.id, scope, presetId: preset, key: key(), confirmUnlockAll: scope === "unlock_all" ? confirmAll : false },
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
    return <p className="text-sm text-subtle">These four styles materialize a frozen Encounter scene. This deck has no Encounter geometry, so nothing here is restyled.</p>;
  }
  const currentImage = (membershipId: string) => cards.find((card: { membershipId: string; imageUrl: string | null }) => card.membershipId === membershipId)?.imageUrl || null;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-subtle">{cards.length} cards · {lockedCount} locked · {unlockedCount} unlocked · {eligible} eligible</p>
      <p className="text-sm text-subtle">The picture is a height-field materialization of the frozen geometry. It is not an image model, and choosing a name does not restyle anything until you stylize. The menu opens on this deck’s saved style, or on Veiled Luminescence when the deck has none. A choice here overrides that for this preview. Locked cards stay as they are.</p>
      <label className="text-sm" htmlFor="card-art-style">Style</label>
      <select id="card-art-style" className="rounded-xl border border-border bg-bg px-3 py-3" value={preset} onChange={(event) => { setPresetTouched(true); setPreset(event.target.value as (typeof STYLES)[number]["id"]); }}>
        {STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
      </select>
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
      <Button type="button" className="w-full" disabled={blocked || preview.isPending} onClick={() => preview.mutate()}>
        {preview.isPending ? "Stylizing…" : "Stylize Deck"}
      </Button>
      {eligible === 0 ? <p className="text-sm text-subtle">No unlocked cards. Unlock one, or confirm the whole deck.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={!job || publish.isPending} onClick={() => publish.mutate()}>Approve and Save</Button>
        <Button type="button" variant="ghost" disabled={!job || cancel.isPending} onClick={() => cancel.mutate()}>Cancel</Button>
      </div>
      {job ? job.candidates.map((candidate) => (
        <div key={candidate.membershipId} className="grid grid-cols-2 gap-2">
          <figure>
            {currentImage(candidate.membershipId) ? <img src={currentImage(candidate.membershipId) || ""} alt="" className="w-full rounded-xl" /> : <div className="aspect-[3.5/5.75] rounded-xl bg-bg" />}
            <figcaption className="mt-1 text-xs text-subtle">Before</figcaption>
          </figure>
          <figure>
            <img src={candidate.imageUrl} alt="" className="w-full rounded-xl" />
            <figcaption className="mt-1 text-xs text-subtle">Staged</figcaption>
          </figure>
        </div>
      )) : null}
    </div>
  );
}
