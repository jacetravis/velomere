import assert from "node:assert/strict";
import test from "node:test";
import { drawNext, flipFirst, project, returnLatestWaiting, revealNextFromStack, stageSpread, startSession, type DrawnCard, type SpreadDefinition } from "./engine.ts";

function spread(count: number, cross = false): SpreadDefinition {
  return {
    id: "test",
    name: "Test",
    description: "",
    openingQuestion: "?",
    revision: 1,
    categoryId: "standard",
    tile: "/spreads/one-card.svg",
    positions: Array.from({ length: count }, (_, index) => ({
      id: `p${index + 1}`,
      order: index + 1,
      name: `P${index + 1}`,
      question: "q",
      meaningApplication: "m",
      x: cross && index === 1 ? 0.5 : 0.2 + index * 0.05,
      y: 0.5,
      rotationDeg: cross && index === 1 ? 90 : 0,
      zIndex: cross && index === 1 ? 5 : index + 1,
      angleNotes: { "0": "", "90": "", "180": "", "270": "" },
    })),
  };
}

function card(n: number): DrawnCard {
  return {
    deckId: 1,
    deckName: "Deck",
    cardId: n,
    cardName: `Card ${n}`,
    upright: "up",
    reversed: "rev",
    imageUrl: null,
    keywords: "",
    suit: "cups",
    rank: String(n),
  };
}

function drawAll(count: number, cross = false) {
  let session = startSession(spread(count, cross));
  for (let i = 1; i <= count; i += 1) session = drawNext(session, `d${i}`, card(i));
  return session;
}

test("a returned card can be drawn again into the stack", () => {
  const returned = returnLatestWaiting(drawAll(2));
  assert.ok(returned);
  const again = drawNext(returned.session, "again", card(9));
  assert.equal(again.drawnCount, 2);
  assert.equal(again.assignments.at(-1)?.cardId, 9);
  assert.equal(again.assignments.at(-1)?.location, "waiting_stack");
});

test("the latest waiting card can go back on the deck before the spread is laid out", () => {
  const stacked = drawAll(3);
  const returned = returnLatestWaiting(stacked);
  assert.equal(returned?.cardId, 3);
  assert.equal(returned?.session.status, "collecting");
  assert.equal(returned?.session.drawnCount, 2);
  assert.deepEqual(
    returned?.session.assignments.map((item) => item.positionOrder),
    [1, 2],
  );
  assert.equal(returnLatestWaiting(stageSpread(stacked, "stage")), null);
});

test("three draws stay face down in the side stack, oldest on top, until the deck leaves", () => {
  const stacked = drawAll(3);
  assert.equal(stacked.status, "collected");
  assert.deepEqual(
    stacked.assignments.map((item) => item.positionOrder),
    [1, 2, 3],
  );
  assert.equal(stacked.assignments.every((item) => item.location === "waiting_stack" && item.face === "down"), true);
  assert.equal(project(stacked, 3).deckVisible, true);
  const session = stageSpread(stacked, "stage");
  assert.equal(session.status, "staged");
  assert.equal(session.assignments.filter((item) => item.location === "table").length, 1);
  assert.equal(session.assignments.find((item) => item.positionOrder === 1)?.face, "down");
  assert.equal(session.assignments.filter((item) => item.location === "waiting_stack").length, 2);
  const view = project(session, 3);
  assert.equal(view.deckVisible, false);
  assert.equal(view.nextAction, "flip_first");
  assert.equal(view.positions.some((item) => item.revealed), false);
  assert.equal(stageSpread(session, "stage"), session);
});

test("first flip does not open the rest, and each stack tap delivers one face up", () => {
  let session = stageSpread(drawAll(3), "stage");
  session = flipFirst(session, session.version, "flip");
  assert.equal(session.status, "revealing");
  assert.equal(session.assignments.find((item) => item.positionOrder === 1)?.face, "up");
  assert.equal(session.assignments.filter((item) => item.face === "up").length, 1);
  const again = flipFirst(session, session.version, "flip");
  assert.equal(again, session);
  session = revealNextFromStack(session, 2, session.version, "s2");
  assert.equal(session.assignments.find((item) => item.positionOrder === 2)?.face, "up");
  assert.equal(session.assignments.find((item) => item.positionOrder === 2)?.location, "table");
  assert.equal(revealNextFromStack(session, 2, session.version, "s2"), session);
  assert.throws(() => revealNextFromStack(session, 2, session.version, "other"));
  session = revealNextFromStack(session, 3, session.version, "s3");
  assert.equal(session.status, "complete");
  assert.equal(project(session, 3).waitingStackRemaining, 0);
  assert.equal(project(session, 3).nextAction, "journal_or_solace");
});

test("one card is not staged by the multi-card collector", () => {
  const session = drawAll(1);
  assert.equal(session.status, "collected");
  assert.equal(session.assignments[0]?.location, "waiting_stack");
});

test("celtic crossing stays a ghost until the stack delivers it face up at 90 degrees", () => {
  let session = stageSpread(drawAll(10, true), "stage");
  const crossing = session.spread.positions.find((item) => item.order === 2);
  assert.equal(crossing?.rotationDeg, 90);
  assert.equal(session.assignments.find((item) => item.positionOrder === 2)?.location, "waiting_stack");
  session = flipFirst(session, session.version, "flip");
  session = revealNextFromStack(session, 2, session.version, "cross");
  const placed = session.assignments.find((item) => item.positionOrder === 2);
  assert.equal(placed?.face, "up");
  assert.equal(placed?.physicalAngle, 90);
  assert.equal(session.assignments.filter((item) => item.face === "up").length, 2);
});
