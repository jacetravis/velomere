export type TableReturn = {
  deckId: number;
  cardId: number;
  orientation: "upright" | "reversed";
  pulledAt: string;
  question: string;
  readingId: string | null;
};

let pending: TableReturn | null = null;
let shownKey: string | null = null;
let releaseTimer: number | null = null;

export function setTableReturn(value: TableReturn) {
  if (releaseTimer != null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  pending = value;
  shownKey = null;
}

export function peekTableReturn() {
  return pending;
}

export function tableReturnShownKey() {
  return shownKey;
}

export function markTableReturnShown(key: string) {
  shownKey = key;
}

export function clearTableReturn() {
  pending = null;
  shownKey = null;
}

export function noteTableReturnMounted() {
  if (releaseTimer != null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

export function noteTableReturnUnmounted() {
  if (releaseTimer != null) window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    pending = null;
    shownKey = null;
    releaseTimer = null;
  }, 80);
}
