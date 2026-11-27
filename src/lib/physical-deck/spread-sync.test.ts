import assert from "node:assert/strict";
import test from "node:test";
import type { SpreadDefinition } from "../spreads/engine.ts";
import { captureSpread, spreadForRecovery } from "./spread-record.ts";
import { repairSpreadSession, type RepairCard } from "./spread-sync.ts";
import {
  cut,
  deliverNext,
  drawWaiting,
  flipFirst,
  gatherAll,
  newState,
  returnLatestWaiting,
  stageFirst,
} from "./state.ts";

const spread: SpreadDefinition = {
  id: "three",
  name: "Three",
  description: "",
  openingQuestion: "",
  revision: 1,
  categoryId: "standard",
  tile: "",
  positions: [1, 2, 3].map((order) => ({
    id: `p${order}`,
    order,
    name: `Place ${order}`,
    question: "",
    meaningApplication: "",
    x: 0.5,
    y: 0.3 * order,
    rotationDeg: 0,
    zIndex: order,
    angleNotes: { "0": "", "90": "", "180": "", "270": "" },
  })),
};

const cards: RepairCard[] = [11, 22, 33, 44].map((id) => ({
  id,
  name: `Card ${id}`,
  upright: "up",
  reversed: "down",
  imageUrl: null,
  keywords: "",
  suit: "cups",
  rank: String(id),
}));

test("an interrupted spread is rebuilt from the physical order without duplicating cards", () => {
  let physical = newState(4, "spread-session", [11, 22, 33, 44]);
  physical = drawWaiting(physical, "d1");
  physical = drawWaiting(physical, "d2");
  physical = drawWaiting(physical, "d3");
  const drawn = repairSpreadSession(physical, null, cards, spread, 4, "Deck");
  assert.equal(drawn.action, "replace");
  if (drawn.action !== "replace") return;
  assert.deepEqual(drawn.session.assignments.map((item) => item.cardId), [11, 22, 33]);
  assert.deepEqual(drawn.session.assignments.map((item) => item.location), ["waiting_stack", "waiting_stack", "waiting_stack"]);
  assert.equal(drawn.session.status, "collected");
  assert.deepEqual(physical.waitingStack, [11, 22, 33]);

  physical = returnLatestWaiting(physical, "back");
  const returned = repairSpreadSession(physical, drawn.session, cards, spread, 4, "Deck");
  assert.equal(returned.action, "replace");
  if (returned.action !== "replace") return;
  assert.deepEqual(returned.session.assignments.map((item) => item.cardId), [11, 22]);
  assert.equal(physical.drawPile[0], 33);

  physical = drawWaiting(physical, "d3b");
  physical = stageFirst(physical, "stage", 3);
  const staged = repairSpreadSession(physical, returned.session, cards, spread, 4, "Deck");
  assert.equal(staged.action, "replace");
  if (staged.action !== "replace") return;
  assert.equal(staged.session.status, "staged");
  assert.equal(staged.session.assignments[0]?.face, "down");
  assert.equal(staged.session.assignments[0]?.location, "table");

  physical = flipFirst(physical, "flip");
  physical = deliverNext(physical, "second", 2);
  physical = deliverNext(physical, "third", 3);
  const complete = repairSpreadSession(physical, staged.session, cards, spread, 4, "Deck");
  assert.equal(complete.action, "replace");
  if (complete.action !== "replace") return;
  assert.equal(complete.session.status, "complete");
  assert.deepEqual(complete.session.assignments.map((item) => [item.cardId, item.face]), [[11, "up"], [22, "up"], [33, "up"]]);

  const gathered = gatherAll(physical, "clear");
  const cleared = repairSpreadSession(gathered, complete.session, cards, spread, 4, "Deck");
  assert.equal(cleared.action, "clear");
  assert.deepEqual(gathered.drawPile, [11, 22, 33, 44]);
  const seen = new Set([...gathered.drawPile, ...gathered.waitingStack, ...Object.values(gathered.table).map((item) => item.cardId)]);
  assert.equal(seen.size, gathered.inventory.length);
  const defined = JSON.stringify(spread);
  const withReason = drawn.action === "replace" ? { ...drawn.session, pullReason: "kept" } : null;
  const repaired = repairSpreadSession(physical, withReason, cards, spread, 4, "Deck");
  assert.equal(repaired.action, "replace");
  if (repaired.action === "replace") {
    assert.equal(repaired.session.pullReason, "kept");
    assert.equal(repaired.session.spread.id, "three");
  }
  assert.equal(JSON.stringify(spread), defined);
});

test("missing card metadata or another deck pauses instead of inventing cards", () => {
  let physical = newState(4, "spread-session", [11, 22, 33, 44]);
  physical = drawWaiting(physical, "d1");
  const missing = repairSpreadSession(physical, null, [], spread, 4, "Deck");
  assert.equal(missing.action, "pause");
  const known = repairSpreadSession(physical, null, cards, spread, 4, "Deck");
  assert.equal(known.action, "replace");
  if (known.action !== "replace") return;
  const foreign = {
    ...known.session,
    assignments: known.session.assignments.map((item) => ({ ...item, deckId: 99 })),
  };
  const paused = repairSpreadSession(physical, foreign, cards, spread, 4, "Deck");
  assert.equal(paused.action, "pause");
  assert.equal(foreign.spread.id, "three");
});

test("a single card on the table is not turned into a spread", () => {
  const physical = cut(newState(4, "single", [1, 2, 3]), "cut", 1);
  const plan = repairSpreadSession({ ...physical, mode: "single", table: { single: { cardId: 2, drawIndex: 1, face: "up" } } }, null, [], spread, 4, "Deck");
  assert.equal(plan.action, "keep");
});

test("a new device keeps the recorded spread instead of the layout it has open", () => {
  let physical = newState(4, "spread-session", [11, 22, 33, 44]);
  physical = drawWaiting(physical, "d1");
  physical = drawWaiting(physical, "d2");
  const recorded = captureSpread(spread);
  const decoy = {
    ...spread,
    id: "other-layout",
    name: "Other",
    positions: spread.positions.slice(0, 1).map((position) => ({ ...position, id: "wrong", name: "Wrong place", x: 0.1 })),
  };
  const library = JSON.stringify(decoy);
  assert.equal(spreadForRecovery(recorded, decoy)?.id, "three");
  assert.equal(JSON.stringify(decoy), library);
  const wrong = repairSpreadSession(physical, null, cards, decoy, 4, "Deck");
  assert.equal(wrong.action, "pause");
  const plan = repairSpreadSession(physical, null, cards, spreadForRecovery(recorded, null), 4, "Deck");
  assert.equal(plan.action, "replace");
  if (plan.action !== "replace") return;
  assert.equal(plan.session.spread.id, "three");
  assert.equal(plan.session.spread.positions[0]?.name, "Place 1");
  assert.equal(plan.session.spread.positions[0]?.x, 0.5);
  assert.deepEqual(plan.session.assignments.map((item) => item.cardId), [11, 22]);
  assert.equal(plan.session.assignments.length, physical.drawHistory.length);
  assert.equal(plan.session.spread.positions[0]?.meaningApplication, "");
});
