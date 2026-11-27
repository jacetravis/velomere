import assert from "node:assert/strict";
import test from "node:test";
import { cutCards, hinduPass, overhandPass, riffleShuffle, shuffleCards, tableWash, threePacketCut } from "./order.ts";

const deck = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

test("a shallow cut brings a card just under the top to the top", () => {
  const next = cutCards(deck, 0.08);
  assert.deepEqual(next, ["b", "c", "d", "e", "f", "g", "h", "i", "j", "a"]);
});

test("a deep cut brings a card near the bottom to the top", () => {
  const next = cutCards(deck, 0.92);
  assert.equal(next[0], "j");
  assert.deepEqual(next.slice().sort(), deck.slice().sort());
  assert.equal(next.length, deck.length);
});

test("the top of the deck sends only the top card to the bottom", () => {
  const next = cutCards(deck, 0);
  assert.deepEqual(next, ["b", "c", "d", "e", "f", "g", "h", "i", "j", "a"]);
});

test("the bottom of the deck brings only the bottom card to the top", () => {
  const next = cutCards(deck, 1);
  assert.deepEqual(next, ["j", "a", "b", "c", "d", "e", "f", "g", "h", "i"]);
});

test("a cut keeps every card once", () => {
  const next = cutCards(deck, 0.4);
  assert.equal(next.length, deck.length);
  assert.deepEqual(next.slice().sort(), deck.slice().sort());
  assert.notEqual(next[0], deck[0]);
});

test("shuffle is a permutation of the same cards", () => {
  const next = shuffleCards(deck);
  assert.equal(next.length, deck.length);
  assert.deepEqual(next.slice().sort(), deck.slice().sort());
  assert.notEqual(next, deck);
});

test("an overhand pass drops a real top packet under the deck", () => {
  const next = overhandPass(deck);
  assert.deepEqual(next, ["c", "d", "e", "f", "g", "h", "i", "j", "a", "b"]);
});

test("a hindu pass brings a real bottom packet to the top", () => {
  const next = hinduPass(deck);
  assert.deepEqual(next, ["h", "i", "j", "a", "b", "c", "d", "e", "f", "g"]);
  assert.notDeepEqual(next, deck);
});

test("a riffle keeps every card and mixes the two halves", () => {
  const next = riffleShuffle(deck, () => 0.9);
  assert.equal(next.length, deck.length);
  assert.deepEqual(next.slice().sort(), deck.slice().sort());
  assert.equal(next[0], "a");
  assert.equal(next[1], "f");
  assert.notDeepEqual(next, deck);
});

test("a three-packet cut stacks a different packet on top each pass", () => {
  const first = threePacketCut(deck, 0);
  const second = threePacketCut(first, 1);
  assert.notDeepEqual(first, deck);
  assert.notDeepEqual(second, first);
  assert.notDeepEqual(second, deck);
  assert.deepEqual(first.slice().sort(), deck.slice().sort());
  assert.deepEqual(second.slice().sort(), deck.slice().sort());
});

test("a table wash deals into piles and gathers them in a new order", () => {
  const next = tableWash(deck);
  assert.equal(next.length, deck.length);
  assert.deepEqual(next.slice().sort(), deck.slice().sort());
  assert.notDeepEqual(next, deck);
  assert.equal(next[0], "c");
});
