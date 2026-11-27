export const SUITS = [
  "major",
  "wands",
  "cups",
  "swords",
  "pentacles",
  "hearings",
  "custom",
] as const;

export type Suit = (typeof SUITS)[number];

export type Card = {
  id: number;
  name: string;
  suit: string;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  imageUrl: string | null;
  isSeed: boolean;
  sortOrder: number;
  imageScale: number;
  imageX: number;
  imageY: number;
  imageRadius: number;
  createdAt: string;
};

export type CardInput = {
  name: string;
  suit: string;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  imageUrl: string | null;
  sortOrder?: number;
  imageScale?: number;
  imageX?: number;
  imageY?: number;
  imageRadius?: number;
};

export const SUIT_LABEL: Record<Suit, string> = {
  major: "Major Arcana",
  wands: "Wands",
  cups: "Cups",
  swords: "Swords",
  pentacles: "Pentacles",
  hearings: "Hearings",
  custom: "Other",
};

export function isSuit(value: string): value is Suit {
  return (SUITS as readonly string[]).includes(value);
}

const SUIT_ALIAS: Record<string, Suit> = {
  major: "major",
  "major arcana": "major",
  majors: "major",
  wands: "wands",
  wand: "wands",
  cups: "cups",
  cup: "cups",
  swords: "swords",
  sword: "swords",
  pentacles: "pentacles",
  pentacle: "pentacles",
  coins: "pentacles",
  coin: "pentacles",
  disks: "pentacles",
  disk: "pentacles",
  hearings: "hearings",
  hearing: "hearings",
  custom: "custom",
  other: "custom",
};

export function normalizeSuit(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return "custom";
  const known = SUIT_ALIAS[key];
  if (known) return known;
  const slug = key
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 40);
  return slug || "custom";
}

export function suitLabel(suit: string): string {
  if (isSuit(suit)) return SUIT_LABEL[suit];
  return suit.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function rankNumber(rank: string): number | null {
  const text = rank.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const lower = text.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(lower)) return null;
  const value: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  for (let i = 0; i < lower.length; i += 1) {
    const current = value[lower[i]] ?? 0;
    const next = value[lower[i + 1]] ?? 0;
    total += current < next ? -current : current;
  }
  return total;
}

export function defaultSort(suit: string): number {
  if (suit === "major") return 0;
  if (suit === "wands") return 100;
  if (suit === "cups") return 200;
  if (suit === "swords") return 300;
  if (suit === "pentacles") return 400;
  if (suit === "custom") return 900;
  return 800;
}
