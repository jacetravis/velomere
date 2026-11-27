import { suitLabel } from "@/lib/cards/types";
import type { ConversationOrigin } from "@/lib/solace/origin";

export type Sitting = { title: string; detail: string; source?: ConversationOrigin | null };

function lines(parts: Array<string | undefined | null>) {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
}

export function cardSitting(input: {
  name: string;
  deckName?: string;
  orientation?: string;
  suit?: string;
  rank?: string;
  keywords?: string;
  question?: string;
  notes?: string;
  meaning?: string;
  upright?: string;
  reversed?: string;
  websiteUrl?: string;
  videoUrl?: string;
  pulledAt?: string;
}): Sitting {
  const reversed = input.orientation === "reversed";
  return {
    title: input.name || "This card",
    detail: lines([
      input.name ? `Card: ${input.name}` : "",
      input.pulledAt ? `Drawn: ${input.pulledAt}` : "",
      input.deckName ? `Deck: ${input.deckName}` : "",
      input.orientation ? `Orientation: ${input.orientation}` : "",
      input.suit ? `Suit: ${input.suit}` : "",
      input.rank ? `Rank: ${input.rank}` : "",
      input.keywords ? `Keywords: ${input.keywords}` : "",
      input.question ? `On their mind: ${input.question}` : "",
      input.notes ? `What they wrote: ${input.notes}` : "",
      input.meaning ? `Meaning kept with the entry: ${input.meaning}` : "",
      reversed ? (input.reversed ? `Reversed description: ${input.reversed}` : "") : input.upright ? `Upright description: ${input.upright}` : "",
      input.websiteUrl ? `Website: ${input.websiteUrl}` : "",
      input.videoUrl ? `Video: ${input.videoUrl}` : "",
    ]),
  };
}

export function dreamSitting(input: {
  title?: string;
  dreamedOn?: string;
  dreamedTime?: string;
  body?: string;
  websiteUrl?: string;
  videoUrl?: string;
}): Sitting {
  return {
    title: input.title?.trim() || "A dream",
    detail: lines([
      input.dreamedOn ? `Dreamed: ${input.dreamedOn}${input.dreamedTime ? ` ${input.dreamedTime}` : ""}` : "",
      input.body,
      input.websiteUrl ? `Website: ${input.websiteUrl}` : "",
      input.videoUrl ? `Video: ${input.videoUrl}` : "",
    ]),
  };
}

export function ritualSitting(input: {
  title?: string;
  heldOn?: string;
  heldTime?: string;
  body?: string;
  websiteUrl?: string;
  videoUrl?: string;
}): Sitting {
  return {
    title: input.title?.trim() || "A ritual",
    detail: lines([
      input.heldOn ? `Held: ${input.heldOn}${input.heldTime ? ` ${input.heldTime}` : ""}` : "",
      input.body,
      input.websiteUrl ? `Website: ${input.websiteUrl}` : "",
      input.videoUrl ? `Video: ${input.videoUrl}` : "",
    ]),
  };
}

export function sittingFromOrigin(origin: ConversationOrigin | null | undefined): Sitting | null {
  if (!origin) return null;
  if (origin.kind === "dream") return { ...dreamSitting({ title: origin.title }), source: origin };
  if (origin.kind === "ritual") return { ...ritualSitting({ title: origin.title }), source: origin };
  if (origin.kind !== "card") return null;
  return {
    ...cardSitting({
      name: origin.cardName,
      deckName: origin.deckName,
      orientation: origin.orientation,
      suit: origin.suit ? suitLabel(origin.suit) : "",
      rank: origin.rank,
      keywords: origin.keywords,
      question: origin.question,
      meaning: origin.meaning,
      pulledAt: origin.pulledAt,
    }),
    source: origin,
  };
}
