"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
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
import labels from "@/lib/cards/d3-labels.json";
import { readVelomereEncounter } from "@/lib/cards/server";

type Trace = {
  firstName?: string;
  secondName?: string | null;
  origin?: string;
  operators?: string[];
  intensity?: number;
  cause?: string | null;
  question?: string | null;
  consequence?: string | null;
  counter?: string | null;
  noNewStrokeReason?: string | null;
  reference?: string | null;
  notice?: string;
};

function optionLabel(index: number) {
  return `${index + 1} · ${labels[index]?.name ?? "Card"}`;
}

export function VelomereEncounter({
  initialFirst = 14,
  initialSecond = 12,
  embedded = false,
}: {
  initialFirst?: number;
  initialSecond?: number;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [first, setFirst] = useState(initialFirst);
  const [second, setSecond] = useState(initialSecond);
  const ask = useMutation({
    mutationFn: () => readVelomereEncounter({ data: { first, second } }),
    onError: (err: Error) => toast(err.message),
  });
  useEffect(() => {
    if (!embedded) return;
    setFirst(initialFirst);
    setSecond(initialSecond);
    ask.reset();
    // The pair is chosen by the reading. Looking it up still waits for an explicit press.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, initialFirst, initialSecond]);
  const result = ask.data as Trace | undefined;
  const body = (
    <>
      <div className="grid gap-3">
        <label className="flex flex-col gap-1.5">
          <Label htmlFor="encounter-first">Card</Label>
          <select id="encounter-first" className="rounded-md bg-bg px-3 py-2 text-sm text-fg" value={first} onChange={(event) => setFirst(Number(event.target.value))}>
            {labels.map((row, index) => (
              <option key={row.name} value={index + 1}>{optionLabel(index)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <Label htmlFor="encounter-second">Affinity</Label>
          <select id="encounter-second" className="rounded-md bg-bg px-3 py-2 text-sm text-fg" value={second} onChange={(event) => setSecond(Number(event.target.value))}>
            {labels.map((row, index) => (
              <option key={`b-${row.name}`} value={index + 1}>{optionLabel(index)}</option>
            ))}
          </select>
        </label>
      </div>
      {result ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-fg">{result.firstName} with {result.secondName}. This preview writes nothing.</p>
          <p className="text-xs uppercase tracking-wide text-subtle">{result.origin?.replaceAll("-", " ")} · intensity {result.intensity ?? 0}</p>
          {result.cause ? <p className="text-fg">{result.cause}</p> : null}
          {result.consequence ? <p className="text-subtle whitespace-pre-wrap">{result.consequence}</p> : null}
          {result.counter ? <p className="text-subtle whitespace-pre-wrap">{result.counter}</p> : null}
          {result.question ? <p className="text-fg">{result.question}</p> : null}
          <p className="text-xs text-subtle">
            {result.operators?.length ? `Geometry: ${result.operators.join(", ")}` : result.noNewStrokeReason}
          </p>
          {result.notice ? <p className="text-xs text-subtle">{result.notice}</p> : null}
        </div>
      ) : null}
    </>
  );
  if (embedded) {
    return (
      <div className="mt-3 w-full rounded-xl bg-surface p-3 text-left">
        <p className="text-sm text-fg">These two cards meet</p>
        <p className="mt-1 text-xs text-subtle">A preview only. It does not change the spread or the saved meanings.</p>
        <div className="mt-3 flex flex-col gap-3">{body}</div>
        <Button type="button" className="mt-3" disabled={ask.isPending} onClick={() => ask.mutate()}>
          {ask.isPending ? "Reading…" : "Read the meeting"}
        </Button>
      </div>
    );
  }
  return (
    <>
      <button type="button" className="mt-3 text-left text-sm text-subtle underline" onClick={() => setOpen(true)}>
        Preview a pair
      </button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) ask.reset(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>One card meets an affinity</DialogTitle>
            <DialogDescription>
              Nothing is drawn. Dance pairs use the authored reference. Every other pair is a generated reading, not a certified text.
            </DialogDescription>
          </DialogHeader>
          {body}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            <Button type="button" disabled={ask.isPending} onClick={() => ask.mutate()}>{ask.isPending ? "Reading…" : "Read the meeting"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const DendriteEncounter = VelomereEncounter;
