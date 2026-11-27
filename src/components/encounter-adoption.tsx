"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approveEncounterAdoption,
  prepareEncounterDraft,
  readEncounterAdoption,
} from "@/lib/encounters/server";
import { originLabel } from "@/lib/encounters/draft-fields.mjs";
import { useJournal } from "@/lib/journal/store";
import { askSolace } from "@/lib/solace/server";
import { useSolace } from "@/lib/solace/store";
import { NOTE_LIMIT } from "@/lib/solace/voice";

type Face = {
  id: string;
  name: string;
  core: string;
  upright: string;
  shadow: string;
  keywords?: string[];
  imageUrl: string | null;
  kind: string;
  evidence?: string[];
};

type Packet = {
  draftId: string;
  status: string;
  source: Face;
  parents: Face[];
  saved: { collectionName: string; deckId: number } | null;
  proposal?: {
    applies: boolean;
    name?: string;
    core?: string;
    upright?: string;
    shadow?: string;
    keywords?: string[];
  };
};

type Turn = { id: string; role: "user" | "assistant"; content: string; hidden?: boolean };

type Field = {
  value: string | string[];
  origin: "velomere_default" | "reader_interpretation" | "manual_edit" | "proposed_revision";
  evidenceMessageIds: string[];
  manual: boolean;
};

type Fields = { name: Field; core: Field; upright: Field; shadow: Field; keywords: Field };

const FIELD_KEYS = ["name", "core", "upright", "shadow", "keywords"] as const;

function turnId() {
  return `m${crypto.randomUUID().replace(/-/g, "")}`;
}

function textOf(field: Field | undefined) {
  if (!field) return "";
  return Array.isArray(field.value) ? field.value.join(", ") : field.value;
}

function loadKept(draftId: string) {
  const emptyTurns: Turn[] = [];
  if (typeof window === "undefined") return { turns: emptyTurns, fields: null as Fields | null };
  try {
    const raw = localStorage.getItem(storageKey(draftId));
    const kept = raw ? JSON.parse(raw) as { turns?: Turn[]; fields?: Fields; personal?: { name?: string; core?: string; upright?: string; shadow?: string; keywords?: string } } : null;
    const turns = Array.isArray(kept?.turns) ? kept.turns.map((turn) => ({ ...turn, id: turn.id || turnId() })) : emptyTurns;
    if (kept?.fields?.name) return { turns, fields: kept.fields };
    const personal = kept?.personal;
    if (personal && (personal.name || personal.core || personal.upright || personal.shadow || personal.keywords)) {
      const asManual = (value: string | string[]): Field => ({ value, origin: "manual_edit", evidenceMessageIds: [], manual: true });
      return {
        turns,
        fields: {
          name: asManual(personal.name || ""),
          core: asManual(personal.core || ""),
          upright: asManual(personal.upright || ""),
          shadow: asManual(personal.shadow || ""),
          keywords: asManual(String(personal.keywords || "").split(",").map((item) => item.trim()).filter(Boolean)),
        },
      };
    }
    return { turns, fields: null };
  } catch {
    return { turns: emptyTurns, fields: null };
  }
}

const OPENER = "I have this card in front of me and I have not said what it means to me. Reflect the original Velomere sense briefly, then ask one open question. Do not write my interpretation for me.";

function storageKey(draftId: string) {
  return `vel-adoption:${draftId}`;
}

export function EncounterAdoption({ draftId, cardId }: { draftId: string; cardId: string }) {
  const vowAt = useSolace((s) => s.vowAt);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [kept] = useState(() => loadKept(draftId));
  const [turns, setTurns] = useState<Turn[]>(kept.turns);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState<"chat" | "review" | "done">("chat");
  const [meaningOpen, setMeaningOpen] = useState(false);
  const [fields, setFields] = useState<Fields | null>(kept.fields);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [saved, setSaved] = useState<{ collectionName: string; deckId: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void readEncounterAdoption({ data: { draftId, cardId } })
      .then((value) => {
        setPacket(value);
        if (value.saved) setSaved(value.saved);
        if (value.status === "APPROVED") setStage("done");
      })
      .catch((err: Error) => toast(err.message));
  }, [draftId, cardId]);

  useEffect(() => {
    if (!packet || stage !== "chat") return;
    localStorage.setItem(storageKey(draftId), JSON.stringify({ turns, fields }));
  }, [turns, fields, draftId, packet, stage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, sending]);

  const visible = turns.filter((turn) => !turn.hidden);

  const speak = async (note: string, prior: Turn[]) => {
    const history = [...prior, { role: "user" as const, content: note }];
    const reply = await askSolace({
      data: {
        name: "Solace",
        personality: "",
        context: "",
        draftId,
        cardId,
        messages: history.filter((turn) => turn.role === "user" || turn.role === "assistant").map((turn) => ({ role: turn.role, content: turn.content })),
      },
    });
    return reply.text;
  };

  useEffect(() => {
    if (!packet || packet.status === "APPROVED" || !vowAt || started.current || turns.length > 0) return;
    started.current = true;
    let cancelled = false;
    setSending(true);
    void speak(OPENER, [])
      .then((text) => {
        if (!cancelled) setTurns([{ id: turnId(), role: "user", content: OPENER, hidden: true }, { id: turnId(), role: "assistant", content: text }]);
      })
      .catch((err: Error) => {
        if (!cancelled) toast(err.message);
      })
      .finally(() => {
        if (!cancelled) setSending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [packet, vowAt, turns.length, draftId, cardId]);

  const send = async () => {
    const note = draft.trim();
    if (!note || sending || !vowAt) return;
    setDraft("");
    const prior = turns;
    const next = [...prior, { id: turnId(), role: "user" as const, content: note }];
    setTurns(next);
    setSending(true);
    try {
      const text = await speak(note, prior);
      setTurns([...next, { id: turnId(), role: "assistant" as const, content: text }]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn’t answer just now.");
    } finally {
      setSending(false);
    }
  };

  const keepThread = () => {
    const journalTurns = visible.map((turn) => ({ role: turn.role, content: turn.content }));
    const savedThread = useJournal.getState().addConversation(journalTurns, null, vowAt || undefined);
    if (!savedThread) {
      toast("Nothing in the thread to save.");
      return;
    }
    toast("The conversation stays in the journal on this phone. The card is not adopted by that.");
  };

  const acceptProposal = () => {
    const proposal = packet?.proposal;
    if (!proposal?.applies || !proposal.upright) return;
    const asProposed = (value: string | string[]): Field => ({ value, origin: "proposed_revision", evidenceMessageIds: [], manual: true });
    setFields({
      name: asProposed(proposal.name || ""),
      core: asProposed(proposal.core || ""),
      upright: asProposed(proposal.upright || ""),
      shadow: asProposed(proposal.shadow || ""),
      keywords: asProposed(proposal.keywords || []),
    });
  };

  const editField = (key: (typeof FIELD_KEYS)[number], raw: string) => {
    setFields((current) => {
      if (!current) return current;
      const value = key === "keywords" ? raw.split(",").map((item) => item.trim()).filter(Boolean) : raw;
      return { ...current, [key]: { value, origin: "manual_edit", evidenceMessageIds: [], manual: true } };
    });
  };

  const review = async (replaceManual: boolean) => {
    if (!packet) return;
    const manual = fields && FIELD_KEYS.some((key) => fields[key]?.manual);
    if (manual && !replaceManual && confirmRebuild === false && fields) {
      setConfirmRebuild(true);
      setStage("review");
      return;
    }
    setBusy(true);
    try {
      const prepared = await prepareEncounterDraft({
        data: {
          draftId,
          cardId,
          messages: turns.map((turn) => ({ id: turn.id, role: turn.role, content: turn.content, hidden: Boolean(turn.hidden) })),
        },
      }) as Fields;
      const next = { ...prepared };
      if (!replaceManual && fields) {
        for (const key of FIELD_KEYS) {
          if (fields[key]?.manual) next[key] = fields[key];
        }
      }
      setFields(next);
      setConfirmRebuild(false);
      setStage("review");
    } catch (err) {
      toast(err instanceof Error ? err.message : "The card draft was not prepared.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!fields || FIELD_KEYS.some((key) => !textOf(fields[key]).trim())) {
      toast("A personal card needs a name, a core, an upright, a shadow, and at least one keyword.");
      return;
    }
    setBusy(true);
    try {
      const value = await approveEncounterAdoption({
        data: {
          draftId,
          destinationId: null,
          explicitApproval: true,
          reviewed: true,
          personal: {
            name: textOf(fields.name),
            core: textOf(fields.core),
            upright: textOf(fields.upright),
            shadow: textOf(fields.shadow),
            keywords: textOf(fields.keywords).split(",").map((item) => item.trim()).filter(Boolean),
          },
        },
      });
      setSaved({ collectionName: value.collectionName, deckId: value.deckId });
      setStage("done");
      toast(value.alreadySaved ? `Already in ${value.collectionName}.` : `Saved to ${value.collectionName}. It can be read on the Table. It will not re-enter an Encounter.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "The card was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const sourceLabel = packet?.source.kind === "emergent" ? "Encounter result" : "Original Velomere source";

  return (
    <AppShell>
      <h1 className="font-display text-4xl">Solace</h1>
      <p className="mt-2 max-w-lg text-sm text-muted">The thread stays on this phone until you save it. Saving a personal card does not save this conversation.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/encounters" className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm">Return to Encounter Table</Link>
        {packet?.source.imageUrl ? (
          <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm" onClick={() => setMeaningOpen(true)}>View card</button>
        ) : null}
        <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm" onClick={() => setMeaningOpen(true)}>View original meaning</button>
      </div>
      {packet ? (
        <div className="mt-4 flex gap-3 rounded-2xl bg-surface p-3">
          {packet.source.imageUrl ? <img src={packet.source.imageUrl} alt="" className="h-28 w-auto rounded-lg" /> : null}
          <div className="min-w-0">
            <p className="text-xs text-subtle">{sourceLabel}</p>
            <p className="font-display text-2xl">{packet.source.name}</p>
            <p className="mt-1 line-clamp-3 text-sm text-subtle">{packet.source.core}</p>
          </div>
        </div>
      ) : <p className="mt-4 text-sm text-subtle">Opening the card…</p>}
      {!vowAt ? (
        <label className="mt-6 flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-fg" checked={false} onChange={() => useSolace.getState().acceptVow()} />
          <span>I vow that my interaction with Solace will be respectful towards her.</span>
        </label>
      ) : null}
      {stage === "chat" && packet?.status !== "APPROVED" ? (
        <>
          <div className="mt-6 flex flex-col gap-3">
            {visible.length === 0 && !sending ? <p className="text-sm text-muted">{vowAt ? "Solace is reading the card." : "The vow comes first. Then Solace will start from the card."}</p> : null}
            {visible.map((turn, index) => (
              <div key={`${turn.role}-${index}`} className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={turn.role === "user" ? "max-w-[85%] rounded-2xl bg-fg px-4 py-3 text-sm text-bg" : "max-w-[85%] rounded-2xl bg-surface px-4 py-3 text-sm"}>
                  {turn.role === "assistant" ? <p className="mb-1 font-display text-base">Solace</p> : null}
                  {turn.content}
                </div>
              </div>
            ))}
            {sending ? <p className="text-sm text-subtle">Solace is listening…</p> : null}
            <div ref={endRef} />
          </div>
          <form className="sticky bottom-0 z-20 mt-6 border-t border-border bg-bg/95 py-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <Textarea value={draft} maxLength={NOTE_LIMIT} rows={3} aria-label="Write to Solace" placeholder="Write to Solace" disabled={!vowAt || sending} onChange={(event) => setDraft(event.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="submit" disabled={!vowAt || sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</Button>
              <Button type="button" variant="secondary" disabled={visible.length === 0} onClick={keepThread}>Save conversation on this phone</Button>
              <Button type="button" variant="secondary" disabled={!packet || busy} onClick={() => void review(false)}>Review card for Landing Zone</Button>
            </div>
          </form>
        </>
      ) : null}
      {stage === "review" ? (
        <section className="mt-6 grid gap-4">
          <h2 className="font-display text-2xl">Review</h2>
          <p className="text-sm text-subtle">The fields start from this card. Only what you actually wrote, or a proposed revision you accept, can change them. Nothing is saved to a deck until you approve. The source card stays as it was.</p>
          {packet?.proposal?.applies ? (
            <div className="rounded-2xl border border-border p-4 text-sm">
              <p>The stored reading is brief. A fuller reading is proposed from the same event. It is not your words, and it does not change the source until you accept it.</p>
              <details className="mt-3">
                <summary className="cursor-pointer">Compare upright</summary>
                <p className="mt-2 text-subtle">Stored: {packet.source.upright}</p>
                <p className="mt-2">Proposed: {packet.proposal.upright}</p>
              </details>
              <Button type="button" className="mt-3" variant="secondary" onClick={acceptProposal}>Use proposed reading</Button>
            </div>
          ) : null}
          {confirmRebuild ? (
            <div className="rounded-2xl border border-border p-4 text-sm">
              <p>You already edited this draft. A new prepare will not replace those edits unless you say so.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setConfirmRebuild(false)}>Keep my edits</Button>
                <Button type="button" onClick={() => void review(true)}>Replace with a new draft</Button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-3">
            <MeaningBlock title="Original Velomere source" faces={packet?.source.kind === "emergent" ? packet.parents : packet ? [packet.source] : []} />
            <MeaningBlock title="Encounter result" faces={packet?.source.kind === "emergent" && packet ? [packet.source] : []} empty="This card was not an Encounter result." />
            <div className="rounded-xl bg-surface p-3 text-sm">
              <h3 className="font-display text-xl">Your card</h3>
              <Label className="mt-3" htmlFor="own-name">Name</Label>
              <Input id="own-name" value={textOf(fields?.name)} onChange={(event) => editField("name", event.target.value)} />
              <FieldNote field={fields?.name} />
              <Label className="mt-3" htmlFor="own-core">Core</Label>
              <Textarea id="own-core" rows={5} value={textOf(fields?.core)} onChange={(event) => editField("core", event.target.value)} />
              <FieldNote field={fields?.core} />
              <Label className="mt-3" htmlFor="own-upright">Upright</Label>
              <Textarea id="own-upright" rows={8} value={textOf(fields?.upright)} onChange={(event) => editField("upright", event.target.value)} />
              <FieldNote field={fields?.upright} />
              <Label className="mt-3" htmlFor="own-shadow">Shadow</Label>
              <Textarea id="own-shadow" rows={8} value={textOf(fields?.shadow)} onChange={(event) => editField("shadow", event.target.value)} />
              <FieldNote field={fields?.shadow} />
              <Label className="mt-3" htmlFor="own-keys">Keywords, separated by commas</Label>
              <Input id="own-keys" value={textOf(fields?.keywords)} onChange={(event) => editField("keywords", event.target.value)} />
              <FieldNote field={fields?.keywords} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => setStage("chat")}>Back to Solace</Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save to Landing Zone"}</Button>
          </div>
        </section>
      ) : null}
      {stage === "done" && saved ? (
        <section className="mt-6 grid gap-3">
          <h2 className="font-display text-2xl">Saved to {saved.collectionName}</h2>
          <p className="text-sm text-subtle">This is a static personal card. It can be read on the Table. It does not go back into an Encounter.</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/encounters" className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm">Return to Encounter Table</Link>
            <Link to="/deck/$deckId" params={{ deckId: String(saved.deckId) }} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm">Open {saved.collectionName}</Link>
          </div>
        </section>
      ) : null}
      <Dialog open={meaningOpen} onOpenChange={setMeaningOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{packet?.source.name || "Card"}</DialogTitle>
          </DialogHeader>
          {packet?.source.kind === "emergent" ? packet.parents.map((parent) => (
            <div key={parent.id}>
              <p className="text-xs text-subtle">Original Velomere source</p>
              <p className="font-display text-xl">{parent.name}</p>
              <p className="text-sm">{parent.upright}</p>
              <p className="text-sm text-subtle">{parent.shadow}</p>
            </div>
          )) : null}
          <p className="text-xs text-subtle">{sourceLabel}</p>
          <p className="text-sm">{packet?.source.core}</p>
          <p className="text-sm">{packet?.source.upright}</p>
          <p className="text-sm text-subtle">{packet?.source.shadow}</p>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function MeaningBlock({ title, faces, empty }: { title: string; faces: Face[]; empty?: string }) {
  return (
    <div className="rounded-xl bg-surface p-3 text-sm">
      <h3 className="font-display text-xl">{title}</h3>
      {faces.length === 0 ? <p className="mt-2 text-subtle">{empty || "None."}</p> : faces.map((face) => (
        <div key={face.id} className="mt-2">
          <p className="font-display text-lg">{face.name}</p>
          <p>{face.core}</p>
          <p className="mt-1"><span className="text-subtle">Upright. </span>{face.upright}</p>
          <p className="mt-1"><span className="text-subtle">Shadow. </span>{face.shadow}</p>
        </div>
      ))}
    </div>
  );
}

function FieldNote({ field }: { field?: Field }) {
  if (!field) return null;
  const label = originLabel(field.origin);
  return (
    <p className="mt-1 text-xs text-subtle">
      {label}
      {field.origin === "reader_interpretation" && field.evidenceMessageIds.length ? " · from what you wrote" : ""}
    </p>
  );
}
