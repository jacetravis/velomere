import { shuffleCards } from "@/lib/cards/order";
import type { PhysicalCommit } from "./commit";
import { decideReconcile } from "./reconcile";
import {
  acceptSlip,
  checkpoint,
  cut,
  cutIndex,
  deliverNext,
  drawSingle,
  drawWaiting,
  ejectSlip,
  fingerprint,
  flipFirst,
  gatherAll,
  legacyShuffleEndpoint,
  newState,
  putBackSingle,
  replayOperation,
  returnLatestWaiting,
  returnUntappedSlip,
  sampleHash,
  stageFirst,
  verify,
  type CardId,
  type Operation,
  type PhysicalState,
  type Side,
} from "./state";

const VERSION = 2;

export type ReadingLink = { spreadId: string; sessionId: string };

type OutboxItem = { operation: Operation; snapshot: PhysicalState };

type Journal = {
  version: number;
  ownerId: string;
  snapshot: PhysicalState;
  outbox: OutboxItem[];
  reading: ReadingLink | null;
};

type Transport = (input: PhysicalCommit) => Promise<{ status: "saved" | "conflict"; revision: number; reason?: string }>;
type RemoteLoader = () => Promise<PhysicalState | null>;

let state: PhysicalState | null = null;
let ownerId = "local";
let activeDeckId = 0;
let paused: string | null = null;
let loading = false;
let sequence = 0;
let bootToken = 0;
let outbox: OutboxItem[] = [];
let readingLink: ReadingLink | null = null;
let transportOverride: Transport | null = null;
let remoteLoader: RemoteLoader | null = null;
let diskStamp: string | null = null;
let flushChain: Promise<void> = Promise.resolve();
let flushGeneration = 0;
let reconcileTask: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function physicalState() {
  return state;
}

export function physicalPause() {
  return paused;
}

export function physicalLoading() {
  return loading;
}

export function physicalOutbox() {
  return outbox.map((item) => ({ ...item, operation: { ...item.operation } }));
}

export function physicalReading() {
  return readingLink;
}

export function subscribePhysical(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function pausePhysical(message: string) {
  const changed = paused !== message || loading;
  paused = message;
  loading = false;
  if (changed) emit();
}

export function setPhysicalTransportForTests(transport: Transport | null) {
  transportOverride = transport;
}

export function setPhysicalRemoteForTests(loader: RemoteLoader | null) {
  remoteLoader = loader;
}

export async function settlePhysicalForTests() {
  if (reconcileTask) await reconcileTask;
  await flushPhysical();
}

export function resetPhysicalForTests() {
  flushGeneration += 1;
  state = null;
  outbox = [];
  readingLink = null;
  paused = null;
  loading = false;
  ownerId = "local";
  activeDeckId = 0;
  sequence = 0;
  bootToken += 1;
  transportOverride = null;
  remoteLoader = null;
  diskStamp = null;
  reconcileTask = null;
  flushChain = Promise.resolve();
}

function emit() {
  for (const listener of listeners) listener();
}

function key(owner: string, deckId: number) {
  return `solace-physical-v1:${owner}:${deckId}`;
}

function commitOf(item: OutboxItem): PhysicalCommit {
  return {
    deckId: item.snapshot.deckId,
    sessionId: item.snapshot.sessionId,
    expectedRevision: item.operation.revisionFrom,
    snapshot: item.snapshot,
    operation: item.operation,
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== key(ownerId, activeDeckId)) return;
    observeExternalJournal(event.newValue);
  });
}

export function observeExternalJournal(raw: string | null) {
  if (!state || !raw) return;
  try {
    const next = JSON.parse(raw) as Journal;
    const snapshot = next.snapshot;
    if (!snapshot || snapshot.sessionId !== state.sessionId || snapshot.revision !== state.revision || sampleHash(snapshot) !== sampleHash(state)) {
      paused = "This deck was handled in another tab. Handling is paused so nothing is overwritten.";
      emit();
    }
  } catch {
    paused = "The saved deck could not be read. Handling is paused.";
    emit();
  }
}

function rebuildLegacy(snapshot: PhysicalState): Journal | null {
  const sorted = [...snapshot.inventory].sort((a, b) => a - b);
  let cursor = newState(snapshot.deckId, snapshot.sessionId, sorted);
  const rebuilt: OutboxItem[] = [];
  for (const operation of snapshot.operations) {
    let next: PhysicalState;
    try {
      next = replayOperation(cursor, operation);
    } catch {
      return null;
    }
    const produced = next.operations.at(-1);
    if (!produced || produced.afterHash !== operation.afterHash) return null;
    rebuilt.push({ operation, snapshot: checkpoint(next) });
    cursor = next;
  }
  if (sampleHash(cursor) !== sampleHash(snapshot)) return null;
  return { version: VERSION, ownerId, snapshot: checkpoint(snapshot.operations.length ? cursor : snapshot), outbox: rebuilt, reading: null };
}

function journalFrom(owner: string, snapshot: PhysicalState, items: OutboxItem[], reading: ReadingLink | null): Journal {
  return { version: VERSION, ownerId: owner, snapshot: checkpoint(snapshot), outbox: items, reading };
}

function parseJournal(owner: string, raw: string): Journal | null {
  const parsed = JSON.parse(raw) as Partial<Journal> & { snapshot?: PhysicalState };
  if (!parsed.snapshot || parsed.ownerId !== owner) return null;
  verify(parsed.snapshot);
  if (parsed.version === VERSION && Array.isArray(parsed.outbox)) {
    for (const item of parsed.outbox) verify(item.snapshot);
    return {
      version: VERSION,
      ownerId: owner,
      snapshot: checkpoint(parsed.snapshot),
      outbox: parsed.outbox,
      reading: parsed.reading ?? null,
    };
  }
  if (parsed.version === 1) {
    const rebuilt = rebuildLegacy(parsed.snapshot);
    if (!rebuilt) {
      paused = "The saved deck could not be replayed. Handling is paused so nothing is overwritten.";
      return { version: VERSION, ownerId: owner, snapshot: checkpoint(parsed.snapshot), outbox: [], reading: null };
    }
    rebuilt.ownerId = owner;
    return rebuilt;
  }
  return null;
}

function readJournal(owner: string, deckId: number): Journal | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(key(owner, deckId));
  diskStamp = raw;
  if (!raw) return null;
  return parseJournal(owner, raw);
}

function writeJournal(snapshot: PhysicalState, items: OutboxItem[]) {
  if (typeof localStorage === "undefined") return false;
  const storageKey = key(ownerId, snapshot.deckId);
  const current = localStorage.getItem(storageKey);
  if (current !== diskStamp) {
    paused = "This deck was handled in another tab. Handling is paused so nothing is overwritten.";
    throw new Error(paused);
  }
  const payload = journalFrom(ownerId, snapshot, items, readingLink);
  const raw = JSON.stringify(payload);
  localStorage.setItem(storageKey, raw);
  diskStamp = raw;
  return true;
}

export function peekPhysical(owner: string, deckId: number): PhysicalState | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key(owner, deckId));
    if (!raw) return null;
    return parseJournal(owner, raw)?.snapshot ?? null;
  } catch {
    return null;
  }
}

function nextOp(kind: string) {
  sequence += 1;
  return `${kind}-${Date.now().toString(36)}-${sequence}`;
}

function remember(next: PhysicalState) {
  const saved = checkpoint(next);
  const operation = saved.operations.at(-1);
  if (!operation) throw new Error("The deck action was not recorded.");
  const items = [...outbox, { operation, snapshot: saved }];
  try {
    const wrote = writeJournal(saved, items);
    if (!wrote) {
      paused = "This browser could not save the deck. Handling is paused.";
      throw new Error(paused);
    }
  } catch (err) {
    if (!paused) paused = "This browser could not save the deck. Handling is paused.";
    throw err instanceof Error ? err : new Error(paused);
  }
  state = saved;
  outbox = items;
  void flushPhysical();
  return saved;
}

function commit(next: PhysicalState) {
  if (next === state) return next;
  return remember(next);
}

function act(update: (current: PhysicalState) => PhysicalState) {
  if (paused) throw new Error(paused);
  if (!state) throw new Error("The deck is not ready.");
  return commit(update(state));
}

async function defaultTransport(input: PhysicalCommit) {
  const { commitPhysicalDeck } = await import("./server");
  return commitPhysicalDeck({ data: input });
}

export function flushPhysical(): Promise<void> {
  if (paused) return Promise.resolve();
  if (typeof window === "undefined" && !transportOverride) return Promise.resolve();
  const generation = flushGeneration;
  const run = flushChain.then(() => drain(generation));
  flushChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function drain(generation: number) {
  if (generation !== flushGeneration || paused) return;
  const transport = transportOverride ?? defaultTransport;
  while (outbox.length && !paused && generation === flushGeneration) {
    const item = outbox[0]!;
    let result: { status: "saved" | "conflict"; revision: number; reason?: string };
    try {
      result = await transport(commitOf(item));
    } catch {
      return;
    }
    if (generation !== flushGeneration) return;
    if (result.status === "conflict") {
      paused = result.reason || "This deck was handled somewhere else. Handling is paused so nothing is overwritten.";
      emit();
      return;
    }
    const rest = outbox.slice(1);
    try {
      if (typeof localStorage !== "undefined" && state && !writeJournal(state, rest)) {
        paused = "This browser could not save the deck. Handling is paused.";
        emit();
        return;
      }
    } catch {
      if (!paused) paused = "This browser could not save the deck. Handling is paused.";
      emit();
      return;
    }
    if (generation !== flushGeneration) return;
    outbox = rest;
  }
}

function adopt(remote: PhysicalState) {
  const saved = checkpoint(remote);
  try {
    if (!writeJournal(saved, [])) {
      paused = "This browser could not save the deck. Handling is paused.";
      return;
    }
  } catch {
    if (!paused) paused = "This browser could not save the deck. Handling is paused.";
    return;
  }
  outbox = [];
  state = saved;
}

export function bootPhysical(owner: string, deckId: number, cardIds: readonly CardId[]): PhysicalState | null {
  const token = ++bootToken;
  ownerId = owner || "local";
  activeDeckId = deckId;
  paused = null;
  loading = false;
  outbox = [];
  readingLink = null;
  let saved: Journal | null = null;
  try {
    saved = readJournal(ownerId, deckId);
  } catch {
    paused = "The saved deck could not be read. Handling is paused.";
    state = null;
    return null;
  }
  if (paused && saved) {
    state = saved.snapshot;
    outbox = saved.outbox;
    return saved.snapshot;
  }
  if (saved) {
    if (fingerprint(saved.snapshot.inventory) !== fingerprint(cardIds)) {
      paused = "This deck's cards changed. The saved order is paused.";
      state = saved.snapshot;
      outbox = saved.outbox;
      readingLink = saved.reading;
      return saved.snapshot;
    }
    state = saved.snapshot;
    outbox = saved.outbox;
    readingLink = saved.reading;
    if (typeof window !== "undefined" || transportOverride || remoteLoader) {
      reconcileTask = reconcile(token, cardIds, false);
    }
    return saved.snapshot;
  }
  if (typeof window === "undefined" && !transportOverride && !remoteLoader) return createFresh(cardIds);
  state = null;
  loading = true;
  reconcileTask = reconcile(token, cardIds, true);
  return null;
}

function createFresh(cardIds: readonly CardId[]) {
  const deckId = activeDeckId;
  const canonical = [...cardIds].sort((a, b) => a - b);
  const sessionId = `phys-${deckId}-${Math.random().toString(36).slice(2, 10)}`;
  let next = newState(deckId, sessionId, canonical);
  if (canonical.length > 1) {
    next = legacyShuffleEndpoint(next, `prep-${sessionId}`, shuffleCards(canonical), "initial_preparation", "system_initial_preparation");
  }
  state = null;
  outbox = [];
  return commit(next);
}

async function loadRemote(): Promise<PhysicalState | null> {
  try {
    if (remoteLoader) {
      const snapshot = await remoteLoader();
      if (!snapshot) return null;
      verify(snapshot);
      return snapshot;
    }
    const { loadPhysicalDeck } = await import("./server");
    const loaded = await loadPhysicalDeck({ data: { deckId: activeDeckId } });
    if (!loaded?.snapshot) return null;
    verify(loaded.snapshot);
    return loaded.snapshot;
  } catch {
    return null;
  }
}

async function reconcile(token: number, cardIds: readonly CardId[], allowCreate: boolean) {
  const remote = await loadRemote();
  if (token !== bootToken) return;
  if (remote && fingerprint(remote.inventory) !== fingerprint(cardIds)) {
    paused = "This deck's cards changed. The saved order is paused.";
    if (!state) state = checkpoint(remote);
    loading = false;
    emit();
    return;
  }
  const decision = decideReconcile(state, outbox.length, remote);
  if (decision === "pause") {
    paused = "This deck was handled somewhere else. Handling is paused so nothing is overwritten.";
    loading = false;
    emit();
    return;
  }
  if (decision === "adopt" && remote) {
    adopt(remote);
    loading = false;
    emit();
    return;
  }
  if (decision === "create" && allowCreate) {
    try {
      createFresh(cardIds);
      loading = false;
      emit();
    } catch (err) {
      paused = err instanceof Error ? err.message : "The deck could not be prepared.";
      loading = false;
      emit();
    }
    return;
  }
  loading = false;
  if (decision === "flush") void flushPhysical();
}

export function startFreshPhysical(cardIds: readonly CardId[], deckId = state?.deckId || activeDeckId) {
  if (!deckId) throw new Error("The deck is not ready.");
  bootToken += 1;
  flushGeneration += 1;
  activeDeckId = deckId;
  paused = null;
  loading = false;
  outbox = [];
  readingLink = null;
  reconcileTask = null;
  if (typeof localStorage !== "undefined") diskStamp = localStorage.getItem(key(ownerId, deckId));
  const canonical = [...cardIds].sort((a, b) => a - b);
  const sessionId = `phys-${deckId}-${Math.random().toString(36).slice(2, 10)}`;
  let next = newState(deckId, sessionId, canonical);
  if (canonical.length > 1) {
    next = legacyShuffleEndpoint(next, `prep-${sessionId}`, shuffleCards(canonical), "initial_preparation", "system_initial_preparation");
  }
  state = null;
  return commit(next);
}

export function setPhysicalReading(link: ReadingLink | null) {
  readingLink = link;
  if (!state) return;
  try {
    writeJournal(state, outbox);
  } catch {
    if (!paused) pausePhysical("This browser could not save the deck. Handling is paused.");
    else pausePhysical(paused);
  }
}

export function orderIds() {
  return state ? [...state.drawPile] : [];
}

export function applyRealizedShuffle(before: readonly CardId[], after: readonly CardId[], style: string) {
  return act((current) => {
    if (current.drawPile.join(",") !== before.join(",")) throw new Error("The deck moved before this shuffle could be saved.");
    return legacyShuffleEndpoint(current, nextOp("shuffle"), [...after], style);
  });
}

export function applyCut(before: readonly CardId[], ratio: number) {
  return act((current) => {
    if (current.drawPile.join(",") !== before.join(",")) throw new Error("The deck moved before this cut could be saved.");
    return cut(current, nextOp("cut"), cutIndex(before.length, ratio));
  });
}

export function applyDrawSingle(side: Side) {
  return act((current) => drawSingle(current, nextOp("single"), side));
}

export function applyPutBack() {
  return act((current) => putBackSingle(current, nextOp("return")));
}

export function applyDrawWaiting() {
  return act((current) => drawWaiting(current, nextOp("wait")));
}

export function applyReturnWaiting() {
  return act((current) => returnLatestWaiting(current, nextOp("unwait")));
}

export function applyStage() {
  return act((current) => stageFirst(current, nextOp("stage"), current.drawHistory.length));
}

export function applyFlip() {
  return act((current) => flipFirst(current, nextOp("flip")));
}

export function applyDeliver() {
  return act((current) => {
    const placed = Object.keys(current.table).filter((item) => item.startsWith("spread:")).length;
    return deliverNext(current, nextOp("deliver"), placed + 1);
  });
}

export function applyEject(index: number) {
  return act((current) => ejectSlip(current, nextOp("slip"), index));
}

export function applyAcceptSlip(destination: "single" | "waiting", side: Side = 0) {
  return act((current) => acceptSlip(current, nextOp("take-slip"), destination, side));
}

export function applyReturnSlip() {
  return act((current) => returnUntappedSlip(current, nextOp("unslip")));
}

export function applyGather() {
  if (!state || (state.mode === "ready" && state.slippedCard == null)) return state;
  return act((current) => gatherAll(current, nextOp("gather")));
}
