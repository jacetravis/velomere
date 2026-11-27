// @ts-nocheck
/** Event-time recipe. Date is an input. Affinity on a new public event is always 0. */
import { createHash } from "node:crypto";

export const CANON_HASH = "340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9";
export const SEED_VERSION = "event-time-v17.1.0";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const req = (ok, msg) => {
  if (!ok) throw new Error(msg);
};

export function localDay(utc, zone) {
  const t = new Date(utc);
  req(Number.isFinite(t.getTime()), "bad timestamp");
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(t);
  } catch {
    throw new Error("invalid timezone");
  }
  const s = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${s.year}-${s.month}-${s.day}`;
}

export function clockOf(input = {}) {
  let acceptedAtUtc = typeof input.acceptedAtUtc === "string" && input.acceptedAtUtc ? input.acceptedAtUtc : new Date().toISOString();
  if (!acceptedAtUtc.endsWith("Z")) {
    const parsed = new Date(acceptedAtUtc);
    req(Number.isFinite(parsed.getTime()), "bad timestamp");
    acceptedAtUtc = parsed.toISOString();
  }
  let timeZone = typeof input.timeZone === "string" && input.timeZone.trim() ? input.timeZone.trim() : "";
  let tzSource = timeZone ? input.tzSource || "device" : "fallback_utc";
  if (!timeZone) timeZone = "UTC";
  try {
    localDay(acceptedAtUtc, timeZone);
  } catch {
    timeZone = "UTC";
    tzSource = "fallback_utc";
  }
  return { acceptedAtUtc, timeZone, tzSource, localDate: localDay(acceptedAtUtc, timeZone) };
}

export function acceptEvent(ledger, input) {
  const { ownerId, sessionId, idempotencyKey, eventId, action, acceptedAtUtc, timeZone, expectedVersion, engineVersion, canonHash } = input;
  req(ownerId && sessionId && idempotencyKey && eventId, "missing IDs");
  req(["initial_pair", "next_draw", "encounter_commit"].includes(action), "invalid action");
  req(Number.isInteger(expectedVersion), "version required");
  req(canonHash === CANON_HASH, "canonical hash mismatch");
  req(input.affinity === undefined || input.affinity === 0, "no custom affinity");
  req(input.localDate === undefined && input.recipeDate === undefined, "no public date override");
  req(typeof acceptedAtUtc === "string" && acceptedAtUtc.endsWith("Z"), "must be server UTC ISO time");
  req(typeof timeZone === "string" && typeof engineVersion === "string", "timezone and engine version required");
  const key = `${ownerId}|${sessionId}|${idempotencyKey}`;
  if (ledger[key]) {
    const existing = ledger[key];
    req(existing.action === action && existing.expectedVersion === expectedVersion, "idempotency collision");
    return { ledger, event: existing, reused: true };
  }
  const date = localDay(acceptedAtUtc, timeZone);
  const seedInput = {
    version: SEED_VERSION,
    canonHash,
    ownerId,
    sessionId,
    eventId,
    action,
    date,
    timeZone,
    affinity: 0,
    expectedVersion,
    engineVersion,
    parents: input.parents || [],
  };
  const event = Object.freeze({
    eventId,
    ownerId,
    sessionId,
    idempotencyKey,
    action,
    acceptedAtUtc,
    timeZone,
    tzSource: input.tzSource || "device",
    localDate: date,
    affinity: 0,
    expectedVersion,
    engineVersion,
    canonHash,
    seedVersion: SEED_VERSION,
    seedDigest: hash(seedInput),
    parents: [...(input.parents || [])],
    payloadHash: hash({ action, expectedVersion, parents: input.parents || [], idempotencyKey }),
  });
  return { ledger: { ...ledger, [key]: event }, event, reused: false };
}

export function subSeed(event, position) {
  req(event?.seedDigest && Number.isInteger(position) && position >= 0, "valid event and slot required");
  return hash({ seed: event.seedDigest, slot: position });
}

export function drawUniqueIndex(seed, used) {
  const pool = Array.from({ length: 78 }, (_, i) => i).filter((i) => !used.includes(i));
  req(pool.length, "explicit reshuffle required after full pool");
  return pool[Number(BigInt(`0x${seed}`) % BigInt(pool.length))];
}
