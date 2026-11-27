import assert from "node:assert/strict";
import test from "node:test";
import type { SpreadDefinition } from "../spreads/engine.ts";
import { drawWaiting, newState, stageFirst } from "./state.ts";
import { displayedTableReading, resumeTableReading, tableLaysReading } from "./table-reading.ts";

const memory = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined") {
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
}

function position(order: number, name: string, meaning: string, x: number): SpreadDefinition["positions"][number] {
  return {
    id: `pos-${name}`,
    order,
    name,
    question: `Ask ${name}`,
    meaningApplication: meaning,
    x,
    y: 0.4,
    rotationDeg: 0,
    zIndex: order,
    angleNotes: { "0": "", "90": "", "180": "", "270": "" },
  };
}

test("the table shows a recovered custom spread without writing the library or the selected preference", async () => {
  const { useSpreads } = await import("../spreads/store.ts");

  const kept: SpreadDefinition = {
    id: "my-kept-layout",
    name: "Kept Layout",
    description: "The library copy stays.",
    openingQuestion: "What stays home?",
    revision: 3,
    categoryId: "my-spreads",
    tile: "/spreads/one-card.svg",
    positions: [position(1, "Kept", "Library meaning", 0.2)],
  };
  const selected = useSpreads.getState().effective("std-one-card");
  assert.ok(selected);
  const overlay: SpreadDefinition = {
    ...selected,
    description: "A saved meaning on the selected spread.",
    revision: 4,
    positions: selected.positions.map((item) => ({ ...item, meaningApplication: "Selected preference meaning" })),
  };
  useSpreads.setState({
    custom: [kept],
    customOrder: [kept.id],
    overlays: { "std-one-card": overlay },
    activeSpreadId: "std-one-card",
    session: null,
  });
  const beforeLibrary = JSON.stringify(useSpreads.getState().custom);
  const beforeOverlay = JSON.stringify(useSpreads.getState().overlays);
  const beforeSelected = useSpreads.getState().activeSpreadId;

  const recordedSpread: SpreadDefinition = {
    id: "my-hearth-path",
    name: "Hearth Path",
    description: "The reading that traveled with the deck.",
    openingQuestion: "Where is the fire?",
    revision: 6,
    categoryId: "my-spreads",
    tile: "",
    positions: [position(1, "Fire", "Recorded hearth meaning", 0.25), position(2, "Ash", "What remains", 0.7)],
  };
  let physical = newState(9, "recovered-session", [11, 22, 33]);
  physical = drawWaiting(physical, "d1");
  physical = drawWaiting(physical, "d2");
  physical = stageFirst(physical, "stage", 2);
  const recorded = {
    id: recordedSpread.id,
    name: recordedSpread.name,
    description: recordedSpread.description,
    openingQuestion: recordedSpread.openingQuestion,
    revision: recordedSpread.revision,
    positions: recordedSpread.positions,
  };
  const cards = [11, 22, 33].map((id) => ({
    id,
    name: `Card ${id}`,
    upright: "upright text",
    reversed: "reversed text",
    imageUrl: null,
    keywords: "quiet",
    suit: "wands",
    rank: String(id),
  }));

  const plan = resumeTableReading({
    physical,
    session: useSpreads.getState().session,
    cards,
    recorded,
    deckId: physical.deckId,
    deckName: "Velomere",
    adopt: (session) => useSpreads.getState().adopt(session),
  });
  assert.equal(plan.action, "replace");

  const state = useSpreads.getState();
  const shown = displayedTableReading({
    session: state.session,
    selectedId: state.activeSpreadId,
    selected: state.effective(state.activeSpreadId),
    recorded,
  });
  assert.equal(tableLaysReading(shown), true);
  assert.equal(shown.name, "Hearth Path");
  assert.equal(shown.session?.spread.id, "my-hearth-path");
  assert.equal(shown.session?.spread.positions[0]?.name, "Fire");
  assert.equal(shown.session?.spread.positions[0]?.meaningApplication, "Recorded hearth meaning");
  assert.equal(shown.session?.spread.positions[1]?.name, "Ash");
  assert.equal(shown.session?.spread.positions[0]?.x, 0.25);
  assert.equal(shown.session?.status, "staged");
  assert.deepEqual(shown.session?.assignments.map((item) => item.cardId), [11, 22]);
  assert.equal(shown.session?.assignments[0]?.location, "table");
  assert.equal(shown.session?.assignments[1]?.location, "waiting_stack");
  assert.equal(shown.spread?.id, "my-hearth-path");
  assert.notEqual(shown.spread?.id, state.activeSpreadId);

  assert.equal(state.activeSpreadId, beforeSelected);
  assert.equal(state.activeSpreadId, "std-one-card");
  assert.equal(JSON.stringify(state.custom), beforeLibrary);
  assert.equal(JSON.stringify(state.overlays), beforeOverlay);
  assert.equal(state.custom.some((item) => item.id === "my-hearth-path"), false);
  assert.equal(state.overlays["my-hearth-path"], undefined);
  assert.equal(state.effective("std-one-card")?.description, "A saved meaning on the selected spread.");
  assert.equal(state.effective("std-one-card")?.positions[0]?.meaningApplication, "Selected preference meaning");
  assert.equal(state.custom[0]?.positions[0]?.meaningApplication, "Library meaning");
  assert.equal(state.list().mine.some((item) => item.id === "my-hearth-path"), false);
});
