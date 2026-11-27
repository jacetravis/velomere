"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useBlocker } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renumber, useSpreads } from "@/lib/spreads/store";
import { fittedCardWidth } from "@/lib/spreads/fit";
import type { QuarterTurn, SpreadDefinition, SpreadPosition } from "@/lib/spreads/engine";

const TURNS: QuarterTurn[] = [0, 90, 180, 270];

export function SpreadEditor({ spreadId }: { spreadId: string }) {
  const source = useSpreads((s) => s.effective(spreadId));
  const saveSpread = useSpreads((s) => s.saveSpread);
  const [draft, setDraft] = useState<SpreadDefinition | null>(source ? structuredClone(source) : null);
  const [selected, setSelected] = useState(source?.positions[0]?.id ?? "");
  const [dirty, setDirty] = useState(false);
  const past = useRef<SpreadDefinition[]>([]);
  const future = useRef<SpreadDefinition[]>([]);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const shouldBlockFn = useCallback(() => dirtyRef.current, []);
  const blockUnload = useCallback(() => dirtyRef.current, []);
  const blocker = useBlocker({
    shouldBlockFn,
    withResolver: true,
    enableBeforeUnload: blockUnload,
    disabled: !dirty,
  });
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasBox, setCanvasBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => setCanvasBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [draft == null]);
  if (!draft) {
    return (
      <AppShell>
        <p className="mt-8 text-sm text-muted">That spread is not here.</p>
      </AppShell>
    );
  }
  const change = (next: SpreadDefinition) => {
    past.current = [...past.current.slice(-30), draft];
    future.current = [];
    setDraft(next);
    setDirty(true);
  };
  const marker = canvasBox.w
    ? fittedCardWidth({
        width: canvasBox.w,
        height: canvasBox.h,
        aspect: 0.62,
        positions: draft.positions,
      })
    : 48;
  const selectedPosition = draft.positions.find((item) => item.id === selected) ?? draft.positions[0];
  const patchPosition = (id: string, patch: Partial<SpreadPosition>) => {
    change({ ...draft, positions: draft.positions.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  };
  const onCanvas = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedPosition) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(0.92, Math.max(0.08, (event.clientX - rect.left) / rect.width));
    const y = Math.min(0.92, Math.max(0.08, (event.clientY - rect.top) / rect.height));
    patchPosition(selectedPosition.id, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  };
  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost"><Link to="/deck/spreads/$spreadId" params={{ spreadId }}>Cancel</Link></Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={!past.current.length} onClick={() => {
            const prev = past.current.pop();
            if (!prev) return;
            future.current.push(draft);
            setDraft(prev);
          }}>Undo</Button>
          <Button type="button" variant="secondary" disabled={!future.current.length} onClick={() => {
            const next = future.current.pop();
            if (!next) return;
            past.current.push(draft);
            setDraft(next);
          }}>Redo</Button>
          <Button type="button" onClick={() => {
            const positions = renumber(draft.positions);
            saveSpread({ ...draft, positions });
            setDirty(false);
            dirtyRef.current = false;
          }}>Save</Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <Label htmlFor="spread-name">Name</Label>
        <Input id="spread-name" value={draft.name} maxLength={80} onChange={(event) => change({ ...draft, name: event.target.value })} />
        <Label htmlFor="spread-description">Description</Label>
        <Textarea id="spread-description" value={draft.description} onChange={(event) => change({ ...draft, description: event.target.value })} />
        <Label htmlFor="spread-question">Opening question</Label>
        <Input id="spread-question" value={draft.openingQuestion} onChange={(event) => change({ ...draft, openingQuestion: event.target.value })} />
      </div>
      <div
        ref={canvasRef}
        className="relative mt-6 aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border bg-bg"
        onPointerDown={onCanvas}
      >
        {draft.positions.map((position) => (
          <button
            key={position.id}
            type="button"
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border text-[10px] ${position.id === selected ? "border-fg bg-fg text-bg" : "border-accent/70 bg-surface text-fg"}`}
            style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, width: marker, aspectRatio: "0.62", borderRadius: 4, rotate: `${position.rotationDeg}deg`, zIndex: position.zIndex }}
            onPointerDown={(event) => {
              event.stopPropagation();
              setSelected(position.id);
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {position.order}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-subtle">Tap a card, then tap the table to place it. On the reading table the layout opens to the edges, and every card keeps one scale. The face-down stack can be dragged.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => {
          const position = {
            ...draft.positions[0],
            id: crypto.randomUUID(),
            name: `Position ${draft.positions.length + 1}`,
            order: draft.positions.length + 1,
            x: 0.5,
            y: 0.5,
          };
          change({ ...draft, positions: renumber([...draft.positions, position]) });
          setSelected(position.id);
        }}>Add position</Button>
        <Button type="button" variant="secondary" disabled={draft.positions.length < 2} onClick={() => {
          const positions = renumber(draft.positions.filter((item) => item.id !== selectedPosition?.id));
          change({ ...draft, positions });
          setSelected(positions[0]?.id ?? "");
        }}>Remove position</Button>
      </div>
      {selectedPosition ? (
        <div className="mt-4 grid gap-3 rounded-xl bg-surface p-4">
          <p className="text-sm">Position {selectedPosition.order}</p>
          <Label htmlFor="pos-name">Name</Label>
          <Input id="pos-name" value={selectedPosition.name} onChange={(event) => patchPosition(selectedPosition.id, { name: event.target.value })} />
          <Label htmlFor="pos-question">Question</Label>
          <Textarea id="pos-question" value={selectedPosition.question} onChange={(event) => patchPosition(selectedPosition.id, { question: event.target.value })} />
          <Label htmlFor="pos-meaning">How the card's meaning applies</Label>
          <Textarea id="pos-meaning" value={selectedPosition.meaningApplication} onChange={(event) => patchPosition(selectedPosition.id, { meaningApplication: event.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pos-x">X</Label>
              <Input id="pos-x" type="number" min={0} max={1} step={0.01} value={selectedPosition.x} onChange={(event) => patchPosition(selectedPosition.id, { x: Number(event.target.value) })} />
            </div>
            <div>
              <Label htmlFor="pos-y">Y</Label>
              <Input id="pos-y" type="number" min={0} max={1} step={0.01} value={selectedPosition.y} onChange={(event) => patchPosition(selectedPosition.id, { y: Number(event.target.value) })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {TURNS.map((turn) => (
              <Button key={turn} type="button" variant={selectedPosition.rotationDeg === turn ? "default" : "secondary"} onClick={() => patchPosition(selectedPosition.id, { rotationDeg: turn })}>{turn}°</Button>
            ))}
            <Button type="button" variant="secondary" onClick={() => {
              const index = draft.positions.findIndex((item) => item.id === selectedPosition.id);
              if (index <= 0) return;
              const positions = [...draft.positions];
              const [item] = positions.splice(index, 1);
              positions.splice(index - 1, 0, item);
              change({ ...draft, positions: renumber(positions) });
            }}>Earlier</Button>
            <Button type="button" variant="secondary" onClick={() => {
              const index = draft.positions.findIndex((item) => item.id === selectedPosition.id);
              if (index < 0 || index >= draft.positions.length - 1) return;
              const positions = [...draft.positions];
              const [item] = positions.splice(index, 1);
              positions.splice(index + 1, 0, item);
              change({ ...draft, positions: renumber(positions) });
            }}>Later</Button>
          </div>
          <Label htmlFor="pos-note">Note for {selectedPosition.rotationDeg}°</Label>
          <Textarea
            id="pos-note"
            value={selectedPosition.angleNotes[String(selectedPosition.rotationDeg) as "0" | "90" | "180" | "270"]}
            onChange={(event) => patchPosition(selectedPosition.id, { angleNotes: { ...selectedPosition.angleNotes, [String(selectedPosition.rotationDeg)]: event.target.value } })}
          />
        </div>
      ) : null}
      {blocker.status === "blocked" ? (
        <div className="mt-4 rounded-xl bg-surface p-4 text-sm">
          <p>Save these spread edits before leaving?</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="ghost" onClick={() => blocker.proceed?.()}>Discard</Button>
            <Button type="button" onClick={() => blocker.reset?.()}>Stay</Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
