import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationFromBackup,
  conversationToBackup,
  dreamFromBackup,
  dreamToBackup,
  labelFromBackup,
  readingFromBackup,
  readingToBackup,
  ritualFromBackup,
  ritualToBackup,
} from "./backup.ts";
import type { Conversation, Dream, Reading, Ritual } from "./store.ts";

test("a draw backup keeps the question and the deck", () => {
  const reading: Reading = {
    id: "pull-1",
    cardId: 4,
    cardName: "The Moon",
    suit: "major",
    rank: "18",
    orientation: "reversed",
    keywords: "tide",
    meaningSnapshot: "What is half seen.",
    notes: "Wrote this after.",
    question: "What am I not looking at?",
    pulledAt: "2026-11-02T12:00:00.000Z",
    updatedAt: "2026-11-02T12:05:00.000Z",
    deckId: 2,
    deckName: "Default",
    manual: false,
    image: null,
    labelIds: ["quiet"],
  };
  const restored = readingFromBackup(readingToBackup(reading));
  assert.deepEqual(restored, reading);
});

test("an older draw backup still imports without a question or deck", () => {
  const restored = readingFromBackup({
    id: "old",
    cardName: "The Star",
    notes: "kept",
  });
  assert.equal(restored?.question, "");
  assert.equal(restored?.deckId, null);
  assert.equal(restored?.deckName, "");
  assert.equal(restored?.notes, "kept");
  assert.equal(restored?.manual, false);
  assert.equal(restored?.image, null);
  assert.deepEqual(restored?.labelIds, []);
});

test("a spread reading keeps the spread it came from", () => {
  const reading: Reading = {
    id: "spread-1",
    cardId: 8,
    cardName: "The Star",
    suit: "major",
    rank: "17",
    orientation: "upright",
    keywords: "hope",
    meaningSnapshot: "A quiet opening.",
    notes: "",
    question: "What is next?",
    pulledAt: "2026-11-22T12:00:00.000Z",
    updatedAt: "2026-11-22T12:00:00.000Z",
    deckId: 3,
    deckName: "Rider-Waite-Smith",
    manual: false,
    image: null,
    labelIds: [],
    spreadSessionId: "session-1",
    spreadCover: "/spreads/celtic-cross.svg",
    spreadName: "Celtic Cross",
  };
  assert.deepEqual(readingFromBackup(readingToBackup(reading)), reading);
});

test("a physical draw backup keeps the deck name and the picture", () => {
  const reading: Reading = {
    id: "hand-1",
    cardId: 0,
    cardName: "Three-card spread",
    suit: "",
    rank: "",
    orientation: "upright",
    keywords: "",
    meaningSnapshot: "",
    notes: "Laid on the table.",
    question: "",
    pulledAt: "2026-11-02T22:00:00.000Z",
    updatedAt: "2026-11-02T22:00:00.000Z",
    deckId: null,
    deckName: "Smith-Waite",
    manual: true,
    image: "data:image/jpeg;base64,abc",
    labelIds: [],
  };
  assert.deepEqual(readingFromBackup(readingToBackup(reading)), reading);
});

test("a label backup keeps the name and color", () => {
  assert.deepEqual(labelFromBackup({ id: "quiet", name: "Night work", color: "#6a5a8f" }), {
    id: "quiet",
    name: "Night work",
    color: "#6a5a8f",
  });
  assert.equal(labelFromBackup({ id: "bad", name: "Nope", color: "red" }), null);
});

test("a dream backup keeps the time and still accepts an older dream without one", () => {
  const dream: Dream = {
    id: "dream-1",
    title: "The stair",
    body: "I was climbing.",
    dreamedOn: "2026-11-03",
    dreamedTime: "04:12",
    createdAt: "2026-11-03T14:00:00.000Z",
    updatedAt: "2026-11-03T14:00:00.000Z",
    labelIds: [],
  };
  assert.deepEqual(dreamFromBackup(dreamToBackup(dream)), dream);
  const older = dreamFromBackup({ id: "dream-old", body: "No clock.", dreamedOn: "2026-11-01" });
  assert.equal(older?.dreamedTime, undefined);
  assert.equal(older?.body, "No clock.");
});

test("a ritual backup keeps the picture and the time", () => {
  const ritual: Ritual = {
    id: "ritual-1",
    title: "Hearth",
    body: "Lit the candle.",
    heldOn: "2026-11-04",
    heldTime: "21:05",
    createdAt: "2026-11-04T07:00:00.000Z",
    updatedAt: "2026-11-04T07:00:00.000Z",
    labelIds: ["quiet"],
    image: "data:image/jpeg;base64,abc",
  };
  assert.deepEqual(ritualFromBackup(ritualToBackup(ritual)), ritual);
});

test("a conversation backup keeps the turns", () => {
  const conversation: Conversation = {
    id: "talk-1",
    savedAt: "2026-11-05T01:00:00.000Z",
    updatedAt: "2026-11-05T01:02:00.000Z",
    turns: [
      { role: "user", content: "I drew the Moon." },
      { role: "assistant", content: "I’m here with that." },
    ],
  };
  assert.deepEqual(conversationFromBackup(conversationToBackup(conversation)), conversation);
  const vowed = { ...conversation, vowAt: "2026-11-05T01:01:00.000Z" };
  assert.deepEqual(conversationFromBackup(conversationToBackup(vowed)), vowed);
  assert.equal(conversationFromBackup({ id: "empty", turns: [] }), null);
});

test("a conversation backup keeps where the chat started", () => {
  const card: Conversation = {
    id: "talk-card",
    savedAt: "2026-11-06T01:00:00.000Z",
    updatedAt: "2026-11-06T01:02:00.000Z",
    turns: [{ role: "user", content: "The Moon." }],
    origin: {
      kind: "card",
      from: "flip",
      cardName: "The Moon",
      cardId: 18,
      deckId: 1,
      deckName: "Default",
      suit: "major",
      rank: "18",
      orientation: "upright",
      keywords: "night",
      imageUrl: "/cards/moon.jpg",
      pulledAt: "2026-11-06T00:00:00.000Z",
      question: "What now?",
      meaning: "The tide.",
      readingId: null,
    },
  };
  assert.deepEqual(conversationFromBackup(conversationToBackup(card)), card);
  const dream: Conversation = {
    id: "talk-dream",
    savedAt: "2026-11-06T02:00:00.000Z",
    updatedAt: "2026-11-06T02:00:00.000Z",
    turns: [{ role: "user", content: "The stair." }],
    origin: { kind: "dream", entryId: "dream-1", title: "The stair" },
  };
  assert.deepEqual(conversationFromBackup(conversationToBackup(dream)), dream);
  const stripped = conversationFromBackup({
    id: "talk-data",
    turns: [{ role: "user", content: "Hi" }],
    origin: {
      kind: "card",
      from: "deck",
      cardName: "The Moon",
      cardId: 18,
      deckId: 1,
      imageUrl: "data:image/jpeg;base64,aaaa",
    },
  });
  assert.equal(stripped?.origin && stripped.origin.kind === "card" ? stripped.origin.imageUrl : "missing", null);
  const dropped = conversationFromBackup({
    id: "talk-bad",
    turns: [{ role: "user", content: "Hi" }],
    origin: { kind: "nope" },
  });
  assert.equal(dropped?.origin, undefined);
});

test("a journal backup keeps a website, a youtube link, and the upload acknowledgment", () => {
  const reading: Reading = {
    id: "pull-2",
    cardId: 4,
    cardName: "The Moon",
    suit: "major",
    rank: "18",
    orientation: "upright",
    keywords: "",
    meaningSnapshot: "",
    notes: "",
    question: "",
    pulledAt: "2026-11-02T12:00:00.000Z",
    updatedAt: "2026-11-02T12:05:00.000Z",
    deckId: 2,
    deckName: "Default",
    manual: false,
    image: null,
    labelIds: [],
    websiteUrl: "https://example.com/moon",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    consent: { terms: true, rights: true, at: "2026-11-02T12:01:00.000Z" },
  };
  assert.deepEqual(readingFromBackup(readingToBackup(reading)), reading);
  const dropped = readingFromBackup({
    ...reading,
    websiteUrl: "not a link",
    videoUrl: "https://vimeo.com/1",
    consent: { terms: true, rights: false, at: "2026-11-02T12:01:00.000Z" },
  });
  assert.equal(dropped?.websiteUrl, undefined);
  assert.equal(dropped?.videoUrl, undefined);
  assert.equal(dropped?.consent, undefined);
});
