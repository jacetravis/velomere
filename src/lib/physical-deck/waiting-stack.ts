/** The side pile while a spread is being collected. Index 0 is the first card drawn and is painted on top. */
export function waitingSheets(count: number, limit = 6) {
  const shown = Math.max(0, Math.min(Math.floor(count), limit));
  return Array.from({ length: shown }, (_, index) => ({
    index,
    zIndex: shown - index,
    offset: index,
  }));
}
