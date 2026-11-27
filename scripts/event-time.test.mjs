import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { CANON_HASH, acceptEvent, drawUniqueIndex, localDay, subSeed } from "../src/lib/encounters/event-time.mjs";
import { compileDraw } from "../velomere-crystal/engine/encounter-v17.mjs";

const initial = {
  ownerId: "u",
  sessionId: "s",
  eventId: "e1",
  idempotencyKey: "i1",
  action: "initial_pair",
  acceptedAtUtc: "2026-11-15T09:59:00.000Z",
  timeZone: "Pacific/Honolulu",
  expectedVersion: 0,
  engineVersion: "v17.1",
  canonHash: CANON_HASH,
};

test("canonical csv hash is unchanged", async () => {
  const text = await readFile(new URL("../velomere-crystal/DATA/canonical_cards.csv", import.meta.url));
  assert.equal(createHash("sha256").update(text).digest("hex"), CANON_HASH);
});

test("local Hawaiian date is distinct from UTC date, affinity zero", () => {
  const event = acceptEvent({}, initial).event;
  assert.equal(event.localDate, "2026-11-14");
  assert.equal(event.affinity, 0);
});

test("later encounter uses later date, original immutable", () => {
  const first = acceptEvent({}, initial);
  const second = acceptEvent(first.ledger, {
    ...initial,
    eventId: "e2",
    idempotencyKey: "i2",
    action: "encounter_commit",
    expectedVersion: 1,
    parents: ["A", "B"],
    acceptedAtUtc: "2026-11-17T18:00:00.000Z",
  });
  assert.equal(second.event.localDate, "2026-11-17");
  assert.notEqual(first.event.seedDigest, second.event.seedDigest);
  assert.equal(second.ledger["u|s|i1"], first.event);
});

test("retry after date change returns same event and no new seed", () => {
  const first = acceptEvent({}, initial);
  const retry = acceptEvent(first.ledger, { ...initial, eventId: "different", acceptedAtUtc: "2026-11-19T11:00:00.000Z" });
  assert.equal(retry.reused, true);
  assert.equal(retry.event, first.event);
  assert.equal(Object.keys(retry.ledger).length, 1);
});

test("two initial slots are independent and choose distinct canonical sources", () => {
  const event = acceptEvent({}, initial).event;
  const left = subSeed(event, 0);
  const right = subSeed(event, 1);
  assert.notEqual(left, right);
  const i = drawUniqueIndex(left, []);
  const j = drawUniqueIndex(right, [i]);
  assert.notEqual(i, j);
});

test("timezone, DST and leap day boundaries", () => {
  assert.equal(localDay("2026-11-15T05:00:00.000Z", "Pacific/Honolulu"), "2026-11-14");
  assert.equal(localDay("2026-11-15T05:00:00.000Z", "America/New_York"), "2026-11-15");
  assert.equal(localDay("2028-02-29T23:00:00.000Z", "Pacific/Honolulu"), "2028-02-29");
  assert.equal(localDay("2026-03-08T06:00:00.000Z", "America/New_York"), "2026-03-08");
  assert.throws(() => localDay("2026-11-15T00:00:00.000Z", "Bad/Zone"));
});

test("cannot accept old recipe override or custom affinity", () => {
  assert.throws(() => acceptEvent({}, { ...initial, affinity: 14 }));
  assert.throws(() => acceptEvent({}, { ...initial, recipeDate: "2026-01-01" }));
  assert.throws(() => acceptEvent({}, { ...initial, localDate: "2026-01-01" }));
});

test("same fixed receipt deterministically reproduces seed", () => {
  assert.equal(acceptEvent({}, initial).event.seedDigest, acceptEvent({}, initial).event.seedDigest);
});

test("date changes the geometry of the same source card", async () => {
  const earlier = await compileDraw(0, "2026-11-14", 0);
  const later = await compileDraw(0, "2026-11-17", 0);
  assert.equal(earlier.participant.meaning.name, later.participant.meaning.name);
  assert.equal(earlier.participant.meaning.upright, later.participant.meaning.upright);
  assert.notEqual(earlier.geometry.hash, later.geometry.hash);
});
