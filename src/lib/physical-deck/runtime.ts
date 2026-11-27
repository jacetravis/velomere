import { shuffleCards } from "@/lib/cards/order";
import {
  acceptSlip,
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
  returnLatestWaiting,
  returnUntappedSlip,
  stageFirst,
  verify,
  type CardId,
  type PhysicalState,
  type Side,
} from "./state";

const VERSION = 1;

type Saved = { version: number; ownerId: string; snapshot: PhysicalState };

let state: PhysicalState | null = null;
let ownerId = "local";
let activeDeckId = 0;
let paused: string | null = null;
let loading = false;
let sequence = 0;
let bootToken = 0;
const pending: PhysicalState[] = [];
let flushing = false;
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

function emit() {
  for (const listener of listeners) listener();
}

function key(owner: string, deckId: number) {
  return `solace-physical-v1:${owner}:${deckId}`;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (!state || event.key !== key(ownerId, activeDeckId) || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as Saved;
      const next = parsed.snapshot;
      if (!next || next.sessionId !== state.sessionId || next.revision !== state.revision) {
        paused = "This deck was handled in another tab. Handling is paused so nothing is overwritten.";
        emit();
      }
    } catch {
      paused = "The saved deck could not be read. Handling is paused.";
      emit();
    }
  });
}

function readSaved(owner: string, deckId: number): PhysicalState | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(key(owner, deckId));
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Saved;
  if (parsed.version !== VERSION || parsed.ownerId !== owner) return null;
  verify(parsed.snapshot);
  return parsed.snapshot;
}

function readLocal(owner: string, deckId: number): PhysicalState | null {
  return readSaved(owner, deckId);
}

export function peekPhysical(owner: string, deckId: number): PhysicalState | null {
  try {
    return readSaved(owner, deckId);
  } catch {
    return null;
  }
}

function writeLocal(owner: string, snapshot: PhysicalState) {
  if (typeof localStorage === "undefined") return false;
  const payload: Saved = { version: VERSION, ownerId: owner, snapshot };
  localStorage.setItem(key(owner, snapshot.deckId), JSON.stringify(payload));
  return true;
}

function nextOp(kind: string) {
  sequence += 1;
  return `${kind}-${Date.now().toString(36)}-${sequence}`;
}

function commit(next: PhysicalState) {
  if (next === state) return next;
  let saved = false;
  try {
    saved = writeLocal(ownerId, next);
  } catch {
    saved = false;
  }
  if (!saved) {
    paused = "This browser could not save the deck. Handling is paused.";
    throw new Error(paused);
  }
  state = next;
  pending.push(next);
  void flush();
  return next;
}

function act(update: (current: PhysicalState) => PhysicalState) {
  if (paused) throw new Error(paused);
  if (!state) throw new Error("The deck is not ready.");
  return commit(update(state));
}

async function flush() {
  if (flushing || paused || typeof window === "undefined") return;
  flushing = true;
  try {
    const { commitPhysicalDeck } = await import("./server");
    while (pending.length && !paused) {
      const snapshot = pending[0]!;
      const operation = snapshot.operations.at(-1);
      if (!operation) {
        pending.shift();
        continue;
      }
      const result = await commitPhysicalDeck({
        data: {
          deckId: snapshot.deckId,
          sessionId: snapshot.sessionId,
          expectedRevision: operation.revisionFrom,
          snapshot,
          operation,
        },
      });
      if (result.status === "conflict") {
        paused = "This deck was handled somewhere else. Handling is paused so nothing is overwritten.";
        emit();
        break;
      }
      pending.shift();
    }
  } catch {
    // The local journal already has the order. The server can catch up on the next change.
  } finally {
    flushing = false;
  }
}

export function bootPhysical(owner: string, deckId: number, cardIds: readonly CardId[]): PhysicalState | null {
  const token = ++bootToken;
  ownerId = owner || "local";
  activeDeckId = deckId;
  paused = null;
  loading = false;
  let saved: PhysicalState | null = null;
  try {
    saved = readLocal(ownerId, deckId);
  } catch {
    paused = "The saved deck could not be read. Handling is paused.";
    state = null;
    return null;
  }
  if (saved) {
    if (fingerprint(saved.inventory) !== fingerprint(cardIds)) {
      paused = "This deck's cards changed. The saved order is paused.";
      state = saved;
      return saved;
    }
    state = saved;
    if (typeof window !== "undefined") void reconcile(token, cardIds, false);
    return saved;
  }
  if (typeof window === "undefined") return createFresh(cardIds);
  state = null;
  loading = true;
  void reconcile(token, cardIds, true);
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
  return commit(next);
}

async function reconcile(token: number, cardIds: readonly CardId[], allowCreate: boolean) {
  let remote: PhysicalState | null = null;
  try {
    const { loadPhysicalDeck } = await import("./server");
    const loaded = await loadPhysicalDeck({ data: { deckId: activeDeckId } });
    if (loaded?.snapshot) {
      verify(loaded.snapshot);
      remote = loaded.snapshot;
    }
  } catch {
    remote = null;
  }
  if (token !== bootToken) return;
  if (remote && fingerprint(remote.inventory) !== fingerprint(cardIds)) {
    paused = "This deck's cards changed. The saved order is paused.";
    state = state ?? remote;
    loading = false;
    emit();
    return;
  }
  if (!state && remote) {
    state = remote;
    try {
      writeLocal(ownerId, remote);
    } catch {
      paused = "This browser could not save the deck. Handling is paused.";
    }
    loading = false;
    emit();
    return;
  }
  if (state && remote && remote.sessionId === state.sessionId && remote.revision > state.revision && pending.length === 0) {
    state = remote;
    try {
      writeLocal(ownerId, remote);
    } catch {
      paused = "This browser could not save the deck. Handling is paused.";
    }
    loading = false;
    emit();
    return;
  }
  if (state && remote && remote.sessionId !== state.sessionId) {
    const localIsPrep = state.operations.every((item) => item.meta.attribution === "system_initial_preparation");
    if (localIsPrep && pending.length === 0) {
      state = remote;
      try {
        writeLocal(ownerId, remote);
      } catch {
        paused = "This browser could not save the deck. Handling is paused.";
      }
    } else {
      paused = "This deck was handled somewhere else. Handling is paused so nothing is overwritten.";
    }
    loading = false;
    emit();
    return;
  }
  if (state && remote && remote.revision > state.revision && pending.length > 0) {
    paused = "This deck was handled somewhere else. Handling is paused so nothing is overwritten.";
    loading = false;
    emit();
    return;
  }
  if (!state && allowCreate) {
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
  if (state && remote && remote.revision < state.revision) void flush();
}

export function startFreshPhysical(cardIds: readonly CardId[], deckId = state?.deckId || activeDeckId) {
  if (!deckId) throw new Error("The deck is not ready.");
  bootToken += 1;
  activeDeckId = deckId;
  paused = null;
  loading = false;
  const canonical = [...cardIds].sort((a, b) => a - b);
  const sessionId = `phys-${deckId}-${Math.random().toString(36).slice(2, 10)}`;
  let next = newState(deckId, sessionId, canonical);
  if (canonical.length > 1) {
    next = legacyShuffleEndpoint(next, `prep-${sessionId}`, shuffleCards(canonical), "initial_preparation", "system_initial_preparation");
  }
  state = null;
  pending.length = 0;
  return commit(next);
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
