import type { Suit } from "./types";

export type StarterCustomCard = {
  name: string;
  suit: Suit;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  sortOrder: number;
  imageUrl: string | null;
};

export const CUSTOM_CARDS: StarterCustomCard[] = [
  {
    name: "Ace of Hearings",
    suit: "hearings",
    rank: "Ace",
    keywords: "listen, attend, opening",
    upright:
      "The ear opens. This is the beginning of a hearing — not a verdict. Something is trying to reach you: a person, a body, a quiet fact. Give it the first unguarded listen, before you decide what it means.",
    reversed:
      "Noise mistaken for signal, or a refusal to hear. The room is too full of your own voice. Close one mouth. Lean toward the center until a shape arrives.",
    sortOrder: 800,
    imageUrl: null,
  },
];
