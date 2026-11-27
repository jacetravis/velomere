import { sampleHash, type PhysicalState } from "./state";

export type ReconcileDecision = "flush" | "adopt" | "pause" | "keep" | "create" | "hold" | "offline";
export type AccountView = "found" | "absent" | "unavailable";
export type SyncMark = "offline" | "ready" | "unknown";

function prepOnly(state: PhysicalState) {
  return state.operations.length === 0 || state.operations.every((item) => item.meta.attribution === "system_initial_preparation");
}

/**
 * What to do when the browser and the account both know about a deck.
 * Unsent local actions are never overwritten by an older or unrelated server copy.
 * `remote === null` here means the account was reached and has no deck.
 */
export function decideReconcile(local: PhysicalState | null, unsent: number, remote: PhysicalState | null): ReconcileDecision {
  if (!local && !remote) return "create";
  if (!local && remote) return "adopt";
  if (local && !remote) return unsent > 0 ? "flush" : "keep";
  if (!local || !remote) return "keep";
  if (remote.sessionId !== local.sessionId) {
    if (prepOnly(local)) return "adopt";
    return "pause";
  }
  if (remote.revision === local.revision && sampleHash(remote) !== sampleHash(local)) return "pause";
  if (remote.revision > local.revision && unsent > 0) return "pause";
  if (remote.revision > local.revision) return "adopt";
  if (remote.revision < local.revision || unsent > 0) return "flush";
  return "keep";
}

/**
 * Unavailable is not the same as an empty account.
 * A lookup failure must not create or upload a session that could replace one.
 */
export function decideAccount(input: {
  local: PhysicalState | null;
  unsent: number;
  view: AccountView;
  remote: PhysicalState | null;
  sync: SyncMark;
  allowCreate?: boolean;
}): ReconcileDecision {
  if (input.view === "unavailable") {
    if (!input.local) return input.allowCreate === false ? "hold" : "offline";
    if (input.sync === "ready" && input.unsent > 0) return "flush";
    return "hold";
  }
  const remote = input.view === "found" ? input.remote : null;
  return decideReconcile(input.local, input.unsent, remote);
}
