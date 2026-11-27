import assert from "node:assert/strict";
import test from "node:test";
import { decideReconcile } from "./reconcile.ts";
import { cut, legacyShuffleEndpoint, newState, type PhysicalState } from "./state.ts";

function prep(): PhysicalState {
  const opened = newState(1, "local", [1, 2, 3, 4]);
  return legacyShuffleEndpoint(opened, "prep", [4, 3, 2, 1], "initial_preparation", "system_initial_preparation");
}

test("reconciliation never overwrites unsent local actions", () => {
  const local = cut(prep(), "cut", 1);
  const remote = prep();
  assert.equal(decideReconcile(local, 1, remote), "flush");
  assert.equal(decideReconcile(remote, 0, local), "adopt");
  assert.equal(decideReconcile(local, 1, { ...local, revision: local.revision + 2 }), "pause");
  assert.equal(decideReconcile(local, 0, { ...local, drawPile: [...local.drawPile].reverse() }), "pause");
  assert.equal(decideReconcile(local, 0, { ...remote, sessionId: "other-device" }), "pause");
  assert.equal(decideReconcile(prep(), 1, { ...remote, sessionId: "account" }), "adopt");
  assert.equal(decideReconcile(null, 0, remote), "adopt");
  assert.equal(decideReconcile(null, 0, null), "create");
});
