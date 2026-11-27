import { shuffleCards } from "@/lib/cards/order";
import type { PhysicalCommit } from "./commit";
import { planPhysicalShuffle, type ShufflePlan } from "./motion/mechanics";
import type { ShuffleStyle } from "./motion/events";
import { decideAccount, type SyncMark } from "./reconcile";
import type { SpreadSnapshot } from "./spread-record";
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
  motionShuffle,
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

const VERSION = 3;

export type ReadingLink = { spreadId: string; sessionId: string };

export type AccountLookup = {
  status: "found" | "absent" | "unavailable";
  snapshot: PhysicalState | null;
  spread: SpreadSnapshot | null;
};

type OutboxItem = { operation: Operation; snapshot: PhysicalState };

type Journal = {
  version: number;
  ownerId: string;
  snapshot: PhysicalState;
  outbox: OutboxItem[];
  reading: ReadingLink | null;
  spread?: SpreadSnapshot | null;
  sync?: SyncMark;
  /** Present until the account acknowledges the first operation of a reader-authorized fresh order. */
  supersede?: boolean;
};

type Transport = (input: PhysicalCommit) => Promise<{ status: "saved" | "conflict"; revision: number; reason?: string }>;
type RemoteLoader = () => Promise<PhysicalState | null>;
type Lookup = (deckId: number) => Promise<AccountLookup>;

type Scope = {
  id: string;
  ownerId: string;
  deckId: number;
  state: PhysicalState | null;
  outbox: OutboxItem[];
  reading: ReadingLink | null;
  spread: SpreadSnapshot | null;
  sync: SyncMark;
  supersede: boolean;
  diskStamp: string | null;
  paused: string | null;
  loading: boolean;
  generation: number;
  sequence: number;
  lookupAttempts: number;
  lookupRetryToken: number;
  lookupTimerPending: boolean;
  flushChain: Promise<void>;
  reconcileTask: Promise<void> | null;
};

let epoch = 0;
let active: Scope | null = null;
const scopes = new Map<string, Scope>();
let transportOverride: Transport | null = null;
let remoteLoader: RemoteLoader | null = null;
let lookupOverride: Lookup | null = null;
let timerOverride: ((callback: () => void, delay: number) => void) | null = null;
const listeners = new Set<() => void>();

const LOOKUP_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

function blankScope(ownerId: string, deckId: number, id: string): Scope {
  return {
    id,
    ownerId,
    deckId,
    state: null,
    outbox: [],
    reading: null,
    spread: null,
    sync: "unknown",
    supersede: false,
    diskStamp: null,
    paused: null,
    loading: false,
    generation: 0,
    sequence: 0,
    lookupAttempts: 0,
    lookupRetryToken: 0,
    lookupTimerPending: false,
    flushChain: Promise.resolve(),
    reconcileTask: null,
  };
}

function ensure(ownerId: string, deckId: number) {
  const id = `${ownerId}:${deckId}`;
  const existing = scopes.get(id);
  if (existing) return existing;
  const scope = blankScope(ownerId, deckId, id);
  scopes.set(id, scope);
  return scope;
}

export function physicalState() {
  return active?.state ?? null;
}

export function physicalPause() {
  return active?.paused ?? null;
}

export function physicalLoading() {
  return active?.loading ?? false;
}

export function physicalOutbox() {
  return (active?.outbox ?? []).map((item) => ({ ...item, operation: { ...item.operation } }));
}

export function physicalReading() {
  return active?.reading ?? null;
}

export function physicalSpread() {
  return active?.spread ?? null;
}

export function subscribePhysical(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(scope: Scope) {
  if (scope !== active) return;
  for (const listener of listeners) listener();
}

export function pausePhysical(message: string) {
  if (!active) return;
  const changed = active.paused !== message || active.loading;
  active.paused = message;
  active.loading = false;
  if (changed) emit(active);
}

export function setPhysicalTransportForTests(transport: Transport | null) {
  transportOverride = transport;
}

export function setPhysicalRemoteForTests(loader: RemoteLoader | null) {
  remoteLoader = loader;
}

export function setPhysicalLookupForTests(lookup: Lookup | null) {
  lookupOverride = lookup;
}

export function setPhysicalTimerForTests(timer: ((callback: () => void, delay: number) => void) | null) {
  timerOverride = timer;
}

export async function settlePhysicalForTests() {
  await Promise.all([...scopes.values()].flatMap((scope) => [scope.reconcileTask ?? Promise.resolve(), scope.flushChain]));
  if (active?.sync === "ready") await flushScope(active);
  await Promise.all([...scopes.values()].map((scope) => scope.flushChain));
}

export async function retryPhysicalSync() {
  const scope = active;
  if (!scope?.state) return;
  await queueReconcile(scope, scope.state.inventory, false);
  await flushScope(scope);
}

export function resetPhysicalForTests() {
  epoch += 1;
  scopes.clear();
  active = null;
  transportOverride = null;
  remoteLoader = null;
  lookupOverride = null;
  timerOverride = null;
}

function key(owner: string, deckId: number) {
  return `solace-physical-v1:${owner}:${deckId}`;
}

function shouldReconcile() {
  return typeof window !== "undefined" || remoteLoader != null || lookupOverride != null;
}

function commitOf(scope: Scope, item: OutboxItem): PhysicalCommit {
  return {
    deckId: item.snapshot.deckId,
    sessionId: item.snapshot.sessionId,
    expectedRevision: item.operation.revisionFrom,
    snapshot: item.snapshot,
    operation: item.operation,
    supersede: scope.supersede,
    spread: scope.spread,
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (!active || event.key !== key(active.ownerId, active.deckId)) return;
    observeExternalJournal(event.newValue);
  });
  window.addEventListener("online", () => {
    const scope = active;
    if (!scope) return;
    void queueReconcile(scope, scope.state?.inventory ?? [], false);
  });
}

export function observeExternalJournal(raw: string | null) {
  const scope = active;
  if (!scope?.state || !raw) return;
  try {
    const next = JSON.parse(raw) as Journal;
    const snapshot = next.snapshot;
    if (!snapshot || snapshot.sessionId !== scope.state.sessionId || snapshot.revision !== scope.state.revision || sampleHash(snapshot) !== sampleHash(scope.state)) {
      scope.paused = "This deck was handled in another tab. Handling is paused so nothing is overwritten.";
      emit(scope);
    }
  } catch {
    scope.paused = "The saved deck could not be read. Handling is paused.";
    emit(scope);
  }
}

function rebuildLegacy(scope: Scope, snapshot: PhysicalState): Journal | null {
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
  return {
    version: VERSION,
    ownerId: scope.ownerId,
    snapshot: checkpoint(snapshot.operations.length ? cursor : snapshot),
    outbox: rebuilt,
    reading: null,
    spread: null,
    sync: "unknown",
    supersede: false,
  };
}

function journalFrom(scope: Scope, snapshot: PhysicalState, items: OutboxItem[]): Journal {
  return {
    version: VERSION,
    ownerId: scope.ownerId,
    snapshot: checkpoint(snapshot),
    outbox: items,
    reading: scope.reading,
    spread: scope.spread,
    sync: scope.sync,
    supersede: scope.supersede,
  };
}

function parseJournal(scope: Scope, raw: string): { journal: Journal | null; pause: string | null } {
  const parsed = JSON.parse(raw) as Partial<Journal> & { snapshot?: PhysicalState };
  if (!parsed.snapshot || parsed.ownerId !== scope.ownerId) return { journal: null, pause: null };
  verify(parsed.snapshot);
  if ((parsed.version === VERSION || parsed.version === 2) && Array.isArray(parsed.outbox)) {
    for (const item of parsed.outbox) verify(item.snapshot);
    return {
      pause: null,
      journal: {
        version: VERSION,
        ownerId: scope.ownerId,
        snapshot: checkpoint(parsed.snapshot),
        outbox: parsed.outbox,
        reading: parsed.reading ?? null,
        spread: parsed.spread ?? null,
        sync: parsed.sync ?? "unknown",
        supersede: parsed.supersede === true,
      },
    };
  }
  if (parsed.version === 1) {
    const rebuilt = rebuildLegacy(scope, parsed.snapshot);
    if (!rebuilt) {
      return {
        pause: "The saved deck could not be replayed. Handling is paused so nothing is overwritten.",
        journal: {
          version: VERSION,
          ownerId: scope.ownerId,
          snapshot: checkpoint(parsed.snapshot),
          outbox: [],
          reading: null,
          spread: null,
          sync: "unknown",
          supersede: false,
        },
      };
    }
    return { journal: rebuilt, pause: null };
  }
  return { journal: null, pause: null };
}

function readJournal(scope: Scope): Journal | null {
  if (typeof localStorage === "undefined") {
    scope.diskStamp = null;
    return null;
  }
  const raw = localStorage.getItem(key(scope.ownerId, scope.deckId));
  scope.diskStamp = raw;
  if (!raw) return null;
  const parsed = parseJournal(scope, raw);
  if (parsed.pause) scope.paused = parsed.pause;
  return parsed.journal;
}

function writeJournal(scope: Scope, snapshot: PhysicalState, items: OutboxItem[]) {
  if (typeof localStorage === "undefined") return false;
  const storageKey = key(scope.ownerId, snapshot.deckId);
  const current = localStorage.getItem(storageKey);
  if (current !== scope.diskStamp) {
    scope.paused = "This deck was handled in another tab. Handling is paused so nothing is overwritten.";
    throw new Error(scope.paused);
  }
  const raw = JSON.stringify(journalFrom(scope, snapshot, items));
  localStorage.setItem(storageKey, raw);
  scope.diskStamp = raw;
  return true;
}

export function peekPhysical(owner: string, deckId: number): PhysicalState | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key(owner, deckId));
    if (!raw) return null;
    const scope = blankScope(owner, deckId, `${owner}:${deckId}`);
    return parseJournal(scope, raw).journal?.snapshot ?? null;
  } catch {
    return null;
  }
}

function nextOp(scope: Scope, kind: string) {
  scope.sequence += 1;
  return `${kind}-${Date.now().toString(36)}-${scope.sequence}`;
}

function remember(scope: Scope, next: PhysicalState) {
  const saved = checkpoint(next);
  const operation = saved.operations.at(-1);
  if (!operation) throw new Error("The deck action was not recorded.");
  const items = [...scope.outbox, { operation, snapshot: saved }];
  try {
    const wrote = writeJournal(scope, saved, items);
    if (!wrote) {
      scope.paused = "This browser could not save the deck. Handling is paused.";
      throw new Error(scope.paused);
    }
  } catch (err) {
    if (!scope.paused) scope.paused = "This browser could not save the deck. Handling is paused.";
    throw err instanceof Error ? err : new Error(scope.paused);
  }
  scope.state = saved;
  scope.outbox = items;
  void flushScope(scope);
  return saved;
}

function commit(scope: Scope, next: PhysicalState) {
  if (next === scope.state) return next;
  return remember(scope, next);
}

function act(update: (current: PhysicalState) => PhysicalState) {
  const scope = active;
  if (!scope) throw new Error("The deck is not ready.");
  if (scope.paused) throw new Error(scope.paused);
  if (!scope.state) throw new Error("The deck is not ready.");
  return commit(scope, update(scope.state));
}

async function defaultTransport(input: PhysicalCommit) {
  const { commitPhysicalDeck } = await import("./server");
  return commitPhysicalDeck({ data: input });
}

function flushScope(scope: Scope): Promise<void> {
  if (scope.paused || scope.sync !== "ready") return Promise.resolve();
  if (typeof window === "undefined" && !transportOverride) return Promise.resolve();
  const generation = scope.generation;
  const seen = epoch;
  const run = scope.flushChain.then(() => drain(scope, generation, seen));
  scope.flushChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function flushPhysical(): Promise<void> {
  if (!active) return Promise.resolve();
  return flushScope(active);
}

function scheduleRetry(scope: Scope) {
  if (typeof window === "undefined" && !timerOverride) return;
  const generation = scope.generation;
  const seen = epoch;
  const run = () => {
    if (epoch !== seen || scope.generation !== generation) return;
    void queueReconcile(scope, scope.state?.inventory ?? [], false);
  };
  if (timerOverride) timerOverride(run, 4000);
  else window.setTimeout(run, 4000);
}

function armLookupRetry(scope: Scope) {
  if (scope.lookupTimerPending || scope.lookupAttempts >= LOOKUP_RETRY_DELAYS.length) return;
  if (!timerOverride && typeof window === "undefined") return;
  const delay = LOOKUP_RETRY_DELAYS[scope.lookupAttempts]!;
  scope.lookupTimerPending = true;
  const token = scope.lookupRetryToken + 1;
  scope.lookupRetryToken = token;
  const generation = scope.generation;
  const seen = epoch;
  const run = () => {
    if (scope.lookupRetryToken !== token) return;
    scope.lookupTimerPending = false;
    if (epoch !== seen || scope.generation !== generation) return;
    scope.lookupAttempts += 1;
    void queueReconcile(scope, scope.state?.inventory ?? [], false);
  };
  if (timerOverride) timerOverride(run, delay);
  else window.setTimeout(run, delay);
}

function clearLookupRetry(scope: Scope) {
  scope.lookupAttempts = 0;
  scope.lookupTimerPending = false;
  scope.lookupRetryToken += 1;
}

function queueReconcile(scope: Scope, cardIds: readonly CardId[], allowCreate: boolean) {
  const run = () => reconcileScope(scope, cardIds, allowCreate);
  const previous = scope.reconcileTask ?? Promise.resolve();
  const task = previous.then(run, run);
  scope.reconcileTask = task;
  return task;
}

async function drain(scope: Scope, generation: number, seen: number) {
  if (generation !== scope.generation || seen !== epoch || scope.paused || scope.sync !== "ready") return;
  const transport = transportOverride ?? defaultTransport;
  while (scope.outbox.length && !scope.paused && scope.generation === generation && epoch === seen) {
    const item = scope.outbox[0]!;
    let result: { status: "saved" | "conflict"; revision: number; reason?: string };
    try {
      result = await transport(commitOf(scope, item));
    } catch {
      scheduleRetry(scope);
      return;
    }
    if (scope.generation !== generation || epoch !== seen) return;
    if (result.status === "conflict") {
      scope.paused = result.reason || "This deck was handled somewhere else. Handling is paused so nothing is overwritten.";
      emit(scope);
      return;
    }
    if (scope.outbox[0]?.operation.id !== item.operation.id) return;
    const rest = scope.outbox.slice(1);
    const supersede = scope.supersede;
    scope.supersede = false;
    try {
      if (typeof localStorage !== "undefined" && scope.state && !writeJournal(scope, scope.state, rest)) {
        scope.supersede = supersede;
        scope.paused = "This browser could not save the deck. Handling is paused.";
        emit(scope);
        return;
      }
    } catch {
      scope.supersede = supersede;
      if (!scope.paused) scope.paused = "This browser could not save the deck. Handling is paused.";
      emit(scope);
      return;
    }
    if (scope.generation !== generation || epoch !== seen || scope.outbox[0]?.operation.id !== item.operation.id) return;
    scope.outbox = rest;
  }
}

function adopt(scope: Scope, remote: PhysicalState, spread: SpreadSnapshot | null) {
  const previous = {
    state: scope.state,
    outbox: scope.outbox,
    spread: scope.spread,
    reading: scope.reading,
    sync: scope.sync,
    supersede: scope.supersede,
  };
  scope.sync = "ready";
  scope.supersede = false;
  scope.spread = spread;
  if (previous.state && remote.sessionId !== previous.state.sessionId) scope.reading = null;
  const saved = checkpoint(remote);
  try {
    if (!writeJournal(scope, saved, [])) {
      scope.paused = "This browser could not save the deck. Handling is paused.";
      scope.state = previous.state;
      scope.outbox = previous.outbox;
      scope.spread = previous.spread;
      scope.reading = previous.reading;
      scope.sync = previous.sync;
      scope.supersede = previous.supersede;
      return;
    }
  } catch {
    scope.state = previous.state;
    scope.outbox = previous.outbox;
    scope.spread = previous.spread;
    scope.reading = previous.reading;
    scope.sync = previous.sync;
    scope.supersede = previous.supersede;
    if (!scope.paused) scope.paused = "This browser could not save the deck. Handling is paused.";
    return;
  }
  scope.state = saved;
  scope.outbox = [];
}

function applySaved(scope: Scope, saved: Journal) {
  scope.state = saved.snapshot;
  scope.outbox = saved.outbox;
  scope.reading = saved.reading;
  scope.spread = saved.spread ?? null;
  scope.sync = saved.sync ?? "unknown";
  scope.supersede = saved.supersede === true;
}

export function bootPhysical(owner: string, deckId: number, cardIds: readonly CardId[]): PhysicalState | null {
  const scope = ensure(owner || "local", deckId);
  scope.generation += 1;
  scope.lookupRetryToken += 1;
  scope.lookupTimerPending = false;
  scope.lookupAttempts = 0;
  scope.supersede = false;
  active = scope;
  scope.paused = null;
  scope.loading = false;
  let saved: Journal | null = null;
  try {
    saved = readJournal(scope);
  } catch {
    scope.paused = "The saved deck could not be read. Handling is paused.";
    scope.state = null;
    scope.outbox = [];
    return null;
  }
  if (scope.paused && saved) {
    applySaved(scope, saved);
    return saved.snapshot;
  }
  if (saved) {
    if (fingerprint(saved.snapshot.inventory) !== fingerprint(cardIds)) {
      scope.paused = "This deck's cards changed. The saved order is paused.";
      applySaved(scope, saved);
      return saved.snapshot;
    }
    applySaved(scope, saved);
    if (shouldReconcile()) scope.reconcileTask = queueReconcile(scope, cardIds, false);
    return saved.snapshot;
  }
  if (!shouldReconcile()) return createFresh(scope, cardIds, "ready");
  scope.state = null;
  scope.outbox = [];
  scope.loading = true;
  scope.reconcileTask = queueReconcile(scope, cardIds, true);
  return null;
}

function createFresh(scope: Scope, cardIds: readonly CardId[], sync: SyncMark) {
  const canonical = [...cardIds].sort((a, b) => a - b);
  const sessionId = `phys-${scope.deckId}-${Math.random().toString(36).slice(2, 10)}`;
  let next = newState(scope.deckId, sessionId, canonical);
  if (canonical.length > 1) {
    next = legacyShuffleEndpoint(next, `prep-${sessionId}`, shuffleCards(canonical), "initial_preparation", "system_initial_preparation");
  }
  scope.sync = sync;
  scope.supersede = false;
  scope.state = null;
  scope.outbox = [];
  scope.reading = null;
  scope.spread = null;
  return commit(scope, next);
}

async function loadAccount(deckId: number): Promise<AccountLookup> {
  try {
    if (lookupOverride) return await lookupOverride(deckId);
    if (remoteLoader) {
      const snapshot = await remoteLoader();
      return snapshot
        ? { status: "found", snapshot, spread: null }
        : { status: "absent", snapshot: null, spread: null };
    }
    const { loadPhysicalDeck } = await import("./server");
    const loaded = await loadPhysicalDeck({ data: { deckId } });
    if (!loaded?.snapshot) return { status: "absent", snapshot: null, spread: null };
    verify(loaded.snapshot);
    return { status: "found", snapshot: loaded.snapshot, spread: loaded.spread ?? null };
  } catch {
    return { status: "unavailable", snapshot: null, spread: null };
  }
}

async function reconcileScope(scope: Scope, cardIds: readonly CardId[], allowCreate: boolean) {
  const generation = scope.generation;
  const seen = epoch;
  const account = await loadAccount(scope.deckId);
  if (scope.generation !== generation || epoch !== seen) return;
  if (account.status === "found" && account.snapshot && fingerprint(account.snapshot.inventory) !== fingerprint(cardIds)) {
    scope.paused = "This deck's cards changed. The saved order is paused.";
    if (!scope.state) scope.state = checkpoint(account.snapshot);
    scope.loading = false;
    emit(scope);
    return;
  }
  const view = account.status === "found" && !account.snapshot ? "unavailable" : account.status;
  if (view === "unavailable") armLookupRetry(scope);
  else clearLookupRetry(scope);
  const decision = decideAccount({
    local: scope.state,
    unsent: scope.outbox.length,
    view,
    remote: account.snapshot,
    sync: scope.sync,
    allowCreate,
    authorizedFresh: scope.supersede,
  });
  if (decision === "offline") {
    try {
      createFresh(scope, cardIds, "offline");
      scope.loading = false;
      emit(scope);
    } catch (err) {
      scope.paused = err instanceof Error ? err.message : "The deck could not be prepared.";
      scope.loading = false;
      emit(scope);
    }
    return;
  }
  if (decision === "hold") {
    scope.loading = false;
    emit(scope);
    return;
  }
  if (decision === "pause") {
    scope.paused = "This deck was handled somewhere else. Handling is paused so nothing is overwritten.";
    scope.loading = false;
    emit(scope);
    return;
  }
  if (decision === "adopt" && account.snapshot) {
    if (scope.supersede && scope.state && account.snapshot.sessionId !== scope.state.sessionId) {
      scope.loading = false;
      emit(scope);
      return;
    }
    adopt(scope, account.snapshot, account.spread);
    scope.loading = false;
    emit(scope);
    return;
  }
  if (decision === "create" && allowCreate) {
    try {
      createFresh(scope, cardIds, "ready");
      scope.loading = false;
      emit(scope);
    } catch (err) {
      scope.paused = err instanceof Error ? err.message : "The deck could not be prepared.";
      scope.loading = false;
      emit(scope);
    }
    return;
  }
  if (decision === "flush") {
    if (scope.sync !== "ready") scope.sync = "ready";
    if (account.spread && scope.state && account.snapshot?.sessionId === scope.state.sessionId && !scope.spread) {
      scope.spread = account.spread;
    }
    try {
      if (scope.state) writeJournal(scope, scope.state, scope.outbox);
    } catch {
      if (!scope.paused) scope.paused = "This browser could not save the deck. Handling is paused.";
      scope.loading = false;
      emit(scope);
      return;
    }
    scope.loading = false;
    emit(scope);
    void flushScope(scope);
    return;
  }
  if (account.spread && scope.state && account.snapshot?.sessionId === scope.state.sessionId && !scope.spread) {
    scope.spread = account.spread;
    try {
      writeJournal(scope, scope.state, scope.outbox);
    } catch {
      if (!scope.paused) scope.paused = "This browser could not save the deck. Handling is paused.";
    }
  }
  scope.loading = false;
  emit(scope);
}

export function startFreshPhysical(cardIds: readonly CardId[], deckId = active?.state?.deckId || active?.deckId || 0) {
  if (!deckId) throw new Error("The deck is not ready.");
  const owner = active?.ownerId || "local";
  const scope = ensure(owner, deckId);
  scope.generation += 1;
  scope.lookupRetryToken += 1;
  scope.lookupTimerPending = false;
  scope.lookupAttempts = 0;
  active = scope;
  scope.paused = null;
  scope.loading = false;
  scope.outbox = [];
  scope.reading = null;
  scope.spread = null;
  scope.sync = "ready";
  scope.supersede = true;
  scope.reconcileTask = null;
  if (typeof localStorage !== "undefined") scope.diskStamp = localStorage.getItem(key(owner, deckId));
  const canonical = [...cardIds].sort((a, b) => a - b);
  const sessionId = `phys-${deckId}-${Math.random().toString(36).slice(2, 10)}`;
  let next = newState(deckId, sessionId, canonical);
  if (canonical.length > 1) {
    next = legacyShuffleEndpoint(next, `prep-${sessionId}`, shuffleCards(canonical), "initial_preparation", "system_initial_preparation");
  }
  scope.state = null;
  return commit(scope, next);
}

export function setPhysicalReading(link: ReadingLink | null, spread?: SpreadSnapshot | null) {
  const scope = active;
  if (!scope) return;
  scope.reading = link;
  scope.spread = spread ?? null;
  if (!scope.state) return;
  try {
    writeJournal(scope, scope.state, scope.outbox);
  } catch {
    if (!scope.paused) pausePhysical("This browser could not save the deck. Handling is paused.");
    else pausePhysical(scope.paused);
  }
  if (scope.sync === "ready" && spread && scope.state) void pushSpread(scope);
}

async function pushSpread(scope: Scope) {
  if (typeof window === "undefined" || !scope.state || !scope.spread) return;
  try {
    const { recordPhysicalSpread } = await import("./server");
    await recordPhysicalSpread({
      data: { deckId: scope.deckId, sessionId: scope.state.sessionId, spread: scope.spread },
    });
  } catch {
    scheduleRetry(scope);
  }
}

export function orderIds() {
  return active?.state ? [...active.state.drawPile] : [];
}

export function applyRealizedShuffle(before: readonly CardId[], after: readonly CardId[], style: string) {
  return act((current) => {
    if (current.drawPile.join(",") !== before.join(",")) throw new Error("The deck moved before this shuffle could be saved.");
    return legacyShuffleEndpoint(current, nextOp(active!, "shuffle"), [...after], style);
  });
}

function motionSeed() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] || 1;
}

/** Reader shuffle. One recorded movement trace becomes one durable operation. Fewer than two cards is not an operation. */
export function applyPhysicalMotionShuffle(input: {
  before: readonly CardId[];
  style: ShuffleStyle;
  ratio: number;
  turn: number;
  thickness?: number;
  seed?: number;
  packetSizes?: ShufflePlan["packetSizes"];
  cutPoints?: ShufflePlan["cutPoints"];
  pickupOrder?: ShufflePlan["pickupOrder"];
  cutSequence?: ShufflePlan["cutSequence"];
  cutSequenceIndex?: number;
  readerChoices?: ShufflePlan["readerChoices"];
}) {
  return act((current) => {
    if (current.drawPile.join(",") !== input.before.join(",")) throw new Error("The deck moved before this shuffle could be saved.");
    if (current.mode !== "ready" && current.mode !== "collecting") throw new Error("Deck not available");
    if (current.drawPile.length < 2) return current;
    const trace = planPhysicalShuffle({
      style: input.style,
      before: current.drawPile,
      ratio: input.ratio,
      turn: input.turn,
      thickness: input.thickness,
      seed: input.seed ?? motionSeed(),
      packetSizes: input.packetSizes,
      cutPoints: input.cutPoints,
      pickupOrder: input.pickupOrder,
      cutSequence: input.cutSequence,
      cutSequenceIndex: input.cutSequenceIndex,
      originalDeckCount: current.inventory.length,
      readerChoices: input.readerChoices,
    });
    if (!trace.events.length) return current;
    return motionShuffle(current, nextOp(active!, "motion"), trace);
  });
}

export function applyCut(before: readonly CardId[], ratio: number) {
  return act((current) => {
    if (current.drawPile.join(",") !== before.join(",")) throw new Error("The deck moved before this cut could be saved.");
    return cut(current, nextOp(active!, "cut"), cutIndex(before.length, ratio));
  });
}

export function applyDrawSingle(side: Side) {
  return act((current) => drawSingle(current, nextOp(active!, "single"), side));
}

export function applyPutBack() {
  return act((current) => putBackSingle(current, nextOp(active!, "return")));
}

export function applyDrawWaiting() {
  return act((current) => drawWaiting(current, nextOp(active!, "wait")));
}

export function applyReturnWaiting() {
  return act((current) => returnLatestWaiting(current, nextOp(active!, "unwait")));
}

export function applyStage() {
  return act((current) => stageFirst(current, nextOp(active!, "stage"), current.drawHistory.length));
}

export function applyFlip() {
  return act((current) => flipFirst(current, nextOp(active!, "flip")));
}

export function applyDeliver() {
  return act((current) => {
    const placed = Object.keys(current.table).filter((item) => item.startsWith("spread:")).length;
    return deliverNext(current, nextOp(active!, "deliver"), placed + 1);
  });
}

export function applyEject(index: number) {
  return act((current) => ejectSlip(current, nextOp(active!, "slip"), index));
}

export function applyAcceptSlip(destination: "single" | "waiting", side: Side = 0) {
  return act((current) => acceptSlip(current, nextOp(active!, "take-slip"), destination, side));
}

export function applyReturnSlip() {
  return act((current) => returnUntappedSlip(current, nextOp(active!, "unslip")));
}

export function applyGather() {
  if (!active?.state || (active.state.mode === "ready" && active.state.slippedCard == null)) return active?.state ?? null;
  return act((current) => gatherAll(current, nextOp(active!, "gather")));
}
