"use client";

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SpreadDiagram } from "@/components/spread-diagram";
import { useSpreads } from "@/lib/spreads/store";

export function SpreadDetail({ spreadId }: { spreadId: string }) {
  const navigate = useNavigate();
  const spread = useSpreads((s) => s.effective(spreadId));
  const activeId = useSpreads((s) => s.activeSpreadId);
  const setActive = useSpreads((s) => s.setActive);
  const duplicate = useSpreads((s) => s.duplicate);
  const resetStandard = useSpreads((s) => s.resetStandard);
  const removeCustom = useSpreads((s) => s.removeCustom);
  const modified = useSpreads((s) => !!s.overlays[spreadId]);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);
  if (!spread) {
    return (
      <AppShell>
        <p className="mt-8 text-sm text-muted">That spread is gone.</p>
        <Button asChild className="mt-4" variant="secondary"><Link to="/deck/spreads">Back to spreads</Link></Button>
      </AppShell>
    );
  }
  const custom = spread.categoryId === "my-spreads";
  return (
    <AppShell>
      <Button asChild variant="ghost" className="mb-3"><Link to="/deck/spreads">Spreads</Link></Button>
      <h1 className="font-display text-4xl">{spread.name}</h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{spread.description}</p>
      <p className="mt-2 text-sm text-fg">Opening question: {spread.openingQuestion}</p>
      <p className="mt-1 text-xs text-subtle">{activeId === spread.id ? "This is the active spread." : "Not the active spread."}</p>
      <SpreadDiagram spread={spread} className="mt-6" />
      <ol className="mt-6 grid gap-3">
        {spread.positions.map((position) => (
          <li key={position.id} className="rounded-xl bg-surface p-4">
            <p className="text-sm">{position.order}. {position.name} · {position.rotationDeg}°</p>
            <p className="mt-1 text-sm text-muted">{position.question}</p>
            <p className="mt-1 text-xs text-subtle">{position.meaningApplication}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" onClick={() => setActive(spread.id)} disabled={activeId === spread.id}>Make active</Button>
        <Button type="button" variant="secondary" onClick={() => void navigate({ to: "/deck/spreads/$spreadId/edit", params: { spreadId: spread.id } })}>Edit</Button>
        <Button type="button" variant="secondary" onClick={() => {
          const id = duplicate(spread.id);
          if (id) void navigate({ to: "/deck/spreads/$spreadId", params: { spreadId: id } });
        }}>Duplicate</Button>
        {modified && !custom ? <Button type="button" variant="secondary" onClick={() => setConfirm("reset")}>Reset to original</Button> : null}
        {custom ? <Button type="button" variant="secondary" onClick={() => setConfirm("delete")}>Delete</Button> : null}
      </div>
      <Dialog open={confirm != null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "delete" ? "Delete this spread?" : "Reset this spread?"}</DialogTitle>
            <DialogDescription>
              {confirm === "delete"
                ? "Your copy goes away. Readings already kept stay as they were."
                : "Your edits to this standard spread are dropped. The original positions come back. Past readings stay as they were."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={() => {
              if (confirm === "delete") {
                removeCustom(spread.id);
                void navigate({ to: "/deck/spreads" });
              } else {
                resetStandard(spread.id);
                setConfirm(null);
              }
            }}>{confirm === "delete" ? "Delete" : "Reset"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
