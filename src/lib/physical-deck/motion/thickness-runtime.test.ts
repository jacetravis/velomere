import assert from "node:assert/strict";
import test from "node:test";
import { replayPhysicalShuffle } from "./replay.ts";
import {
  applyPhysicalMotionShuffle,
  bootPhysical,
  physicalOutbox,
  physicalState,
  resetPhysicalForTests,
} from "../runtime.ts";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
  },
});

test("the held thickness is stored on that pass and a later thickness does not replace it", () => {
  memory.clear();
  resetPhysicalForTests();
  const opened = bootPhysical("thickness-reader", 160, [4, 8, 12, 16, 20, 24, 28, 32]);
  assert.ok(opened);
  const first = applyPhysicalMotionShuffle({
    before: opened.drawPile,
    style: "original",
    ratio: 0.5,
    turn: 1,
    seed: 6,
    thickness: 0,
  });
  const saved = physicalOutbox().at(-1)?.operation;
  assert.equal(saved?.meta.motion?.input.thickness, 0);
  const frozen = structuredClone(saved?.meta.motion?.events);
  const second = applyPhysicalMotionShuffle({
    before: first.drawPile,
    style: "original",
    ratio: 0.5,
    turn: 2,
    seed: 6,
    thickness: 1,
  });
  assert.deepEqual(physicalOutbox().at(-2)?.operation.meta.motion?.events, frozen);
  assert.equal(physicalOutbox().at(-1)?.operation.meta.motion?.input.thickness, 1);
  assert.notDeepEqual(second.drawPile, first.drawPile);
  assert.deepEqual(
    second.drawPile,
    replayPhysicalShuffle(first.drawPile, second.operations.at(-1)!.meta.motion!, second.inventory.length),
  );
  assert.equal(physicalState()?.operations.at(-1)?.id, second.operations.at(-1)?.id);
});
