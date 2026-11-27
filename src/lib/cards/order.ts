export function shuffleCards<T>(cards: readonly T[]): T[] {
  const next = cards.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i];
    next[i] = next[j] as T;
    next[j] = current as T;
  }
  return next;
}

export function cutCards<T>(cards: readonly T[], ratio: number): T[] {
  if (cards.length < 2) return cards.slice();
  const clamped = Math.min(1, Math.max(0, ratio));
  const index = Math.min(
    cards.length - 1,
    Math.max(1, Math.ceil(clamped * (cards.length - 1))),
  );
  return cards.slice(index).concat(cards.slice(0, index));
}

function sameCards<T>(cards: readonly T[]): T[] {
  return cards.slice();
}

function packetTake(length: number, portion: number) {
  return Math.max(1, Math.min(length - 1, Math.round(length * portion)));
}

/** How many real cards are in each pile for this shuffle. The picture of the deck uses the same split. */
export function shuffleSplit(style: string, count: number): number[] {
  if (count < 2) return [Math.max(1, count)];
  if (style === "overhand") {
    const take = packetTake(count, 0.2);
    return [take, count - take];
  }
  if (style === "hindu") {
    const take = packetTake(count, 0.26);
    return [count - take, take];
  }
  if (style === "riffle_bridge") {
    const cut = packetTake(count, 0.5);
    return [cut, count - cut];
  }
  if (style === "three_packet_cut") {
    if (count < 3) return [Math.ceil(count / 2), Math.floor(count / 2)];
    const first = Math.max(1, Math.min(count - 2, Math.round(count / 3)));
    const second = Math.max(first + 1, Math.min(count - 1, Math.round((count * 2) / 3)));
    return [first, second - first, count - second];
  }
  const base = Math.floor(count / 4);
  let extra = count - base * 4;
  return [0, 1, 2, 3].map((index) => {
    const size = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    return Math.max(1, size);
  });
}

/** Turn real card counts into the number of visible sheets in each pile. */
export function sheetsForSplit(counts: number[], sheets: number): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0) || 1;
  const sizes = counts.map((count) => Math.max(0, Math.floor((count / total) * sheets)));
  let left = sheets - sizes.reduce((sum, count) => sum + count, 0);
  for (let index = 0; left > 0; index = (index + 1) % Math.max(1, sizes.length)) {
    sizes[index] = (sizes[index] ?? 0) + 1;
    left -= 1;
  }
  return sizes;
}

/** Lift a top packet and drop the rest of the deck onto it. */
export function overhandPass<T>(cards: readonly T[]): T[] {
  if (cards.length < 2) return sameCards(cards);
  const take = shuffleSplit("overhand", cards.length)[0] ?? 1;
  return cards.slice(take).concat(cards.slice(0, take));
}

/** Draw the bottom packet out and set it on top. */
export function hinduPass<T>(cards: readonly T[]): T[] {
  if (cards.length < 2) return sameCards(cards);
  const take = shuffleSplit("hindu", cards.length)[1] ?? 1;
  return cards.slice(cards.length - take).concat(cards.slice(0, cards.length - take));
}

/** Split the deck and riffle the two halves together. Both halves always end up mixed. */
export function riffleShuffle<T>(cards: readonly T[], random: () => number = Math.random): T[] {
  if (cards.length < 2) return sameCards(cards);
  const cut = shuffleSplit("riffle_bridge", cards.length)[0] ?? 1;
  const left = cards.slice(0, cut);
  const right = cards.slice(cut);
  const next: T[] = [];
  let a = 0;
  let b = 0;
  let turn = 0;
  while (a < left.length || b < right.length) {
    const fromLeft = b >= right.length || (a < left.length && (turn % 2 === 0 || random() < 0.35));
    const run = 1 + (random() < 0.22 ? 1 : 0);
    if (fromLeft) {
      next.push(...left.slice(a, a + run));
      a += run;
    } else {
      next.push(...right.slice(b, b + run));
      b += run;
    }
    turn += 1;
  }
  return next;
}

/** Which third ends up on top. Each pass uses the next order so the cut does not undo itself. */
export const THREE_PACKET_ORDERS = [
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const;

/** Split into three piles and pick them up in a new order. The cuts shift each pass so the deck does not return to the start. */
export function threePacketCut<T>(cards: readonly T[], turn = 0): T[] {
  if (cards.length < 3) return sameCards(cards);
  const n = cards.length;
  const [topCount, middleCount] = shuffleSplit("three_packet_cut", n);
  const top = cards.slice(0, topCount);
  const middle = cards.slice(topCount, topCount + (middleCount ?? 0));
  const bottom = cards.slice(topCount + (middleCount ?? 0));
  const packets = [top, middle, bottom];
  const seq = THREE_PACKET_ORDERS[Math.abs(turn) % THREE_PACKET_ORDERS.length] ?? THREE_PACKET_ORDERS[0];
  const stacked = seq.flatMap((index) => packets[index] ?? []);
  const nudge = 1 + (Math.abs(turn) % Math.max(1, n - 2));
  return stacked.slice(nudge).concat(stacked.slice(0, nudge));
}

/** Deal the deck into four piles, then gather those piles in a new order. */
export function tableWash<T>(cards: readonly T[]): T[] {
  if (cards.length < 2) return sameCards(cards);
  const piles: T[][] = [[], [], [], []];
  cards.forEach((card, index) => {
    piles[index % 4]?.push(card);
  });
  return [2, 0, 3, 1].flatMap((index) => piles[index] ?? []);
}

export function shuffleByStyle<T>(style: string, cards: readonly T[], ratio: number, random: () => number = Math.random, turn = 0): T[] {
  if (style === "overhand") return overhandPass(cards);
  if (style === "hindu") return hinduPass(cards);
  if (style === "riffle_bridge") return riffleShuffle(cards, random);
  if (style === "three_packet_cut") return threePacketCut(cards, turn);
  if (style === "table_wash") return tableWash(cards);
  return cutCards(shuffleCards(cards), ratio);
}
