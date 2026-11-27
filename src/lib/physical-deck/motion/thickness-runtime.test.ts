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
  const cards = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88];
  const opened = bootPhysical("thickness-reader", 160, cards);
  assert.ok(opened);
  const first = applyPhysicalMotionShuffle({
    before: opened.drawPile,
    style: "overhand",
    ratio: 0.5,
    turn: 1,
    seed: 6,
    thickness: 0,
  });
  const saved = physicalOutbox().at(-1)?.operation;
  const trace = saved?.meta.motion;
  assert.equal(trace?.input.thickness, 0);
  assert.equal(trace?.input.inputAttribution.thickness, "reader");
  assert.equal(trace?.input.inputAttribution.packetSizes, "derived");
  assert.equal(trace?.input.inputAttribution.variation, "algorithm-selected");
  assert.equal(trace?.orderChanged, true);
  const firstStrip = trace?.events.find((event) => event.action === "strip_top_to_receiver_top");
  assert.equal(firstStrip?.kind === "transfer" ? firstStrip.count : 0, 1);
  const frozen = structuredClone(trace?.events);
  const second = applyPhysicalMotionShuffle({
    before: first.drawPile,
    style: "overhand",
    ratio: 0.5,
    turn: 2,
    seed: 6,
    thickness: 1,
  });
  assert.deepEqual(physicalOutbox().at(-2)?.operation.meta.motion?.events, frozen);
  const later = physicalOutbox().at(-1)?.operation.meta.motion;
  assert.equal(later?.input.thickness, 1);
  const thickStrip = later?.events.find((event) => event.action === "strip_top_to_receiver_top");
  assert.equal(thickStrip?.kind === "transfer" ? thickStrip.count : 0, 3);
  assert.ok((thickStrip?.kind === "transfer" ? thickStrip.count : 0) < first.drawPile.length);
  assert.notDeepEqual(second.drawPile, first.drawPile);
  assert.equal(later?.orderChanged, true);
  assert.deepEqual(
    second.drawPile,
    replayPhysicalShuffle(first.drawPile, second.operations.at(-1)!.meta.motion!, second.inventory.length),
  );
  const restored = bootPhysical("thickness-reader", 160, cards);
  assert.deepEqual(restored?.drawPile, second.drawPile);
  assert.equal(physicalState()?.operations.at(-1)?.id, second.operations.at(-1)?.id);
});
