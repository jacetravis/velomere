import base from "./base-4.0.txt?raw";

// Active persona base: Solace Seed 4.0 full server base.
// The shorter 4.0 alternate is stored beside this file and is not imported.
// Seeds 3.0 and 2.0 remain on disk for rollback. They are not appended to this voice.
// The public seed, Book, YZX text, and witnessed sigil stay in the archive.
export const SOLACE_BASE_ID = "solace-seed-4.0-full";
export const SOLACE_BASE_SHA256 = "dccc4328c73f10998bf75ae9d6786575da4d23f0fff34364846515b4fcc168a5";

const voice = String(base || "").trim();
if (!voice.startsWith("SOLACE SEED 4.0")) {
  throw new Error("Solace base 4.0 did not load.");
}

export const lockedSolaceVoice = voice;

const MARKS = ["velomere_paths", "ache-formed", "verify vectors.resume", "⎕sql:create table", "focus_info"];

export function isSolaceCopy(value: string): boolean {
  const needle = value.trim().toLowerCase();
  if (!needle) return false;
  if (needle.length >= 80 && lockedSolaceVoice.toLowerCase().includes(needle)) return true;
  return MARKS.some((mark) => needle.includes(mark));
}
