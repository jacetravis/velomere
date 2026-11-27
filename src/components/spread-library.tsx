"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SpreadTile } from "@/components/spread-diagram";
import { DeckTabs } from "@/components/deck-tabs";
import { Button } from "@/components/ui/button";
import { newCustomSpread, useSpreads } from "@/lib/spreads/store";
import type { SpreadDefinition } from "@/lib/spreads/engine";

export function SpreadLibrary() {
  const navigate = useNavigate();
  const overlays = useSpreads((s) => s.overlays);
  const custom = useSpreads((s) => s.custom);
  const standardOrder = useSpreads((s) => s.standardOrder);
  const customOrder = useSpreads((s) => s.customOrder);
  const activeId = useSpreads((s) => s.activeSpreadId);
  const setActive = useSpreads((s) => s.setActive);
  const sectionOrder = useSpreads((s) => s.sectionOrder);
  const setOrders = useSpreads((s) => s.setOrders);
  const list = useMemo(() => useSpreads.getState().list(), [overlays, custom, standardOrder, customOrder]);
  const [arranging, setArranging] = useState(false);
  const [draftSections, setDraftSections] = useState<string[] | null>(null);
  const [draftStandard, setDraftStandard] = useState<string[] | null>(null);
  const [draftMine, setDraftMine] = useState<string[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ standard: true, "my-spreads": true });
  const sections = draftSections ?? sectionOrder;
  const standard = (draftStandard ?? list.standard.map((item) => item.id)).map((id) => list.standard.find((item) => item.id === id)).filter((item): item is SpreadDefinition => !!item);
  const mine = (draftMine ?? list.mine.map((item) => item.id)).map((id) => list.mine.find((item) => item.id === id)).filter((item): item is SpreadDefinition => !!item);

  const move = (listIds: string[], id: string, dir: -1 | 1) => {
    const index = listIds.indexOf(id);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= listIds.length) return listIds;
    const copy = [...listIds];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    return copy;
  };

  const done = () => {
    setOrders({
      sectionOrder: draftSections ?? sectionOrder,
      standardOrder: draftStandard ?? list.standard.map((item) => item.id),
      customOrder: draftMine ?? list.mine.map((item) => item.id),
    });
    setArranging(false);
    setDraftSections(null);
    setDraftStandard(null);
    setDraftMine(null);
  };

  const block = (id: string) => {
    if (id === "my-spreads" && mine.length === 0 && !arranging) return null;
    const spreads = id === "standard" ? standard : mine;
    const title = id === "standard" ? "Standard Spreads" : "My Spreads";
    return (
      <section key={id} className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex min-h-14 items-center gap-2 px-3">
          {arranging ? (
            <span className="flex">
              <button type="button" aria-label={`Move ${title} up`} className="flex size-9 items-center justify-center" onClick={() => setDraftSections(move(sections, id, -1))}><ChevronUp className="size-4" /></button>
              <button type="button" aria-label={`Move ${title} down`} className="flex size-9 items-center justify-center" onClick={() => setDraftSections(move(sections, id, 1))}><ChevronDown className="size-4" /></button>
            </span>
          ) : null}
          <button type="button" className="flex min-w-0 flex-1 items-baseline gap-2 py-3 text-left" onClick={() => setOpen((current) => ({ ...current, [id]: !current[id] }))}>
            <span className="font-display text-2xl">{title}</span>
            <span className="text-sm text-subtle">{spreads.length} {spreads.length === 1 ? "spread" : "spreads"}</span>
          </button>
          <ChevronDown className={`size-5 text-muted ${open[id] ? "rotate-180" : ""}`} />
        </div>
        {open[id] ? (
          <div className="grid grid-cols-2 gap-3 border-t border-border px-3 py-3 sm:grid-cols-3">
            {spreads.map((spread) => (
              <article key={spread.id} className="flex flex-col rounded-2xl bg-bg p-3">
                {arranging ? (
                  <span className="mb-2 flex justify-end">
                    <button type="button" aria-label={`Move ${spread.name} up`} onClick={() => id === "standard" ? setDraftStandard(move(standard.map((item) => item.id), spread.id, -1)) : setDraftMine(move(mine.map((item) => item.id), spread.id, -1))}><ChevronUp className="size-4" /></button>
                    <button type="button" aria-label={`Move ${spread.name} down`} onClick={() => id === "standard" ? setDraftStandard(move(standard.map((item) => item.id), spread.id, 1)) : setDraftMine(move(mine.map((item) => item.id), spread.id, 1))}><ChevronDown className="size-4" /></button>
                  </span>
                ) : null}
                <button type="button" className="relative mx-auto block h-28 w-full overflow-hidden rounded-md" onClick={() => void navigate({ to: "/deck/spreads/$spreadId", params: { spreadId: spread.id } })}>
                  <SpreadTile spread={spread} />
                  <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-fg/85 px-2 py-0.5 text-[10px] text-bg">View</span>
                </button>
                <span className="mt-3 truncate text-sm">{spread.name}</span>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-subtle">{spread.positions.length} {spread.positions.length === 1 ? "card" : "cards"}</span>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted">
                    <input type="checkbox" className="size-3.5" checked={activeId === spread.id} onChange={() => setActive(spread.id)} aria-label={`Make ${spread.name} the active spread`} />
                    Active
                  </label>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <AppShell>
      <DeckTabs current="spreads" />
      <div className="mt-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-medium tracking-tight">Spreads</h1>
        <Button type="button" variant="secondary" onClick={() => (arranging ? done() : setArranging(true))}>{arranging ? "Done" : "Arrange"}</Button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <span />
        <button
          type="button"
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-2 text-sm"
          onClick={() => {
            const spread = newCustomSpread();
            useSpreads.getState().saveSpread(spread);
            void navigate({ to: "/deck/spreads/$spreadId/edit", params: { spreadId: spread.id } });
          }}
        >
          <Plus className="size-4" />
          New Spread
        </button>
      </div>
      <div className="mt-3 grid gap-3">{sections.map((id) => block(id))}</div>
    </AppShell>
  );
}
