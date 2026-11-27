export const VOICE_LIMIT = 40_000;
export const NOTE_LIMIT = 2000;
export const NAME_LIMIT = 40;
export const THREAD_LIMIT = 80;

export function spokenName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ").slice(0, NAME_LIMIT);
  return name || "Solace";
}

/** True when the name is Solace, or hides her inside another spelling. */
export function claimsSolace(value: string): boolean {
  return spokenName(value)
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .includes("solace");
}
