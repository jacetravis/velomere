"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readArtPreferences, saveArtPreferences } from "@/lib/encounters/server";
import { freedomDescription } from "@/lib/encounters/interpretive-freedom.mjs";
import { DEFAULT_ENCOUNTER_STYLE, ENCOUNTER_STYLE_CHOICES } from "@/lib/encounters/style-default.mjs";

const STYLES = ENCOUNTER_STYLE_CHOICES;

export function FreedomControl({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (level: number) => void;
}) {
  const desc = freedomDescription(value);
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm" htmlFor={id}>Interpretive freedom</label>
        <span className="text-sm">{desc.label} · {desc.level}</span>
      </div>
      <input
        id={id}
        className="h-11 w-full"
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${desc.label}, ${value}`}
        aria-describedby={`${id}-note`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="flex justify-between text-[11px] text-subtle">
        <span>0 Structural</span>
        <span>100 Intuitive</span>
      </div>
      <p id={`${id}-note`} className="text-sm text-subtle">{desc.text}</p>
    </div>
  );
}

export function ArtPreferences() {
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: ["art-preferences"], queryFn: () => readArtPreferences() });
  const [style, setStyle] = useState(DEFAULT_ENCOUNTER_STYLE);
  const [freedom, setFreedom] = useState(50);
  useEffect(() => {
    if (!prefs.data) return;
    setStyle(prefs.data.style);
    setFreedom(prefs.data.freedom);
  }, [prefs.data]);
  const save = useMutation({
    mutationFn: (input: { style: string; freedom: number }) => saveArtPreferences({ data: input }),
    onSuccess: (value) => {
      queryClient.setQueryData(["art-preferences"], value);
      toast("Saved. Approved cards and locks were not changed.");
    },
    onError: (err: Error) => toast(err.message),
  });
  const dirty = Boolean(prefs.data && (prefs.data.style !== style || prefs.data.freedom !== freedom));
  const label = STYLES.find((item) => item.id === style)?.label ?? "Veiled Luminescence";
  const desc = freedomDescription(freedom);
  return (
    <details className="mt-4 rounded-2xl bg-surface p-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm">
        Art Preferences · {label} · {desc.label} {freedom}
      </summary>
      <div className="mt-3 grid gap-3">
        <p className="text-sm text-subtle">Your default for companion art. A deck’s saved style still wins until you pick a style on that deck. Geometry stays. Locked cards stay locked. Saving this does not rewrite pictures you already approved.</p>
        <label className="text-sm" htmlFor="reader-default-style">Default artistic style</label>
        <select
          id="reader-default-style"
          className="min-h-11 rounded-xl border border-border bg-bg px-3 py-3"
          value={style}
          onChange={(event) => setStyle(event.target.value)}
        >
          {STYLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <FreedomControl id="reader-freedom" value={freedom} onChange={setFreedom} />
        <Button type="button" className="w-full sm:w-auto" disabled={!dirty || save.isPending} onClick={() => save.mutate({ style, freedom })}>
          {save.isPending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </details>
  );
}
