import type { CutScene } from "./cut";
import type { VisualFrame, VisualScene } from "./compile";

export type FluidFrame = {
  offset: number;
  transform: string;
  opacity?: number;
  zIndex?: number;
};

export type ProxyMode = "rigid-packet" | "spatial-representation";

export type FluidActor = {
  key: string;
  ids: number[];
  role: "packet" | "card";
  /** Every painted proxy is one card back. Membership stays off the table. */
  display: "single-card";
  mode: ProxyMode;
  eventSeqs: number[];
  delay: number;
  duration: number;
  frames: FluidFrame[];
  zIndex: number;
  /** Visible paper edges for a cut packet. Other grips stay one card. */
  edges?: number;
  ease?: string;
};

export type FluidShow = {
  actors: FluidActor[];
  duration: number;
  driver: "fluid" | "reduced";
};

const EASE = "cubic-bezier(0.33, 0.02, 0.18, 1)";
export const FLUID_EASE = EASE;

function pose(x: number, y: number, r: number, scale = 1) {
  const sized = scale === 1 ? "" : ` scale(${scale})`;
  return `translate3d(${x}%, ${y}%, 0) rotate(${r}deg)${sized}`;
}

function frames(points: FluidFrame[]): FluidFrame[] {
  const sorted = [...points].sort((a, b) => a.offset - b.offset);
  const next: FluidFrame[] = [];
  for (const point of sorted) {
    const offset = Math.min(1, Math.max(0, point.offset));
    const last = next.at(-1);
    if (last && offset <= last.offset) continue;
    next.push({ offset, transform: point.transform, opacity: point.opacity, zIndex: point.zIndex });
  }
  if (!next.length || next[0]!.offset > 0) next.unshift({ offset: 0, transform: points[0]?.transform ?? pose(0, 0, 0) });
  if (next.at(-1)!.offset < 1) next.push({ offset: 1, transform: next.at(-1)!.transform });
  return next;
}

function span(actors: FluidActor[]) {
  return Math.max(480, ...actors.map((actor) => actor.delay + actor.duration));
}

/** Two cut packets should read as different thicknesses when their counts differ. */
export function cutEdgeCounts(counts: number[]) {
  const deck = counts.reduce((sum, count) => sum + count, 0);
  const edges = counts.map((count) => {
    if (count <= 1 || deck <= 1) return 1;
    return Math.max(2, Math.min(8, Math.round((count / deck) * 7) + 1));
  });
  if (counts.length === 2 && counts[0] !== counts[1] && edges[0] === edges[1]) {
    const thick = counts[0] > counts[1] ? 0 : 1;
    edges[thick] = Math.min(8, edges[thick]! + 2);
    edges[1 - thick] = Math.max(1, edges[1 - thick]! - 1);
  }
  return edges;
}

/** A three-packet pile should read as a short stack, not one card and not a thick deck. */
function shortStackEdges(counts: number[]) {
  const deck = counts.reduce((sum, count) => sum + count, 0);
  return counts.map((count) => {
    if (count <= 1 || deck <= 1) return 1;
    return Math.max(2, Math.min(4, Math.round((count / deck) * 5) + 1));
  });
}

function threeLane(from: string, count: number) {
  if (count === 2) return from === "packet0" ? -1 : 1;
  if (from === "packet0") return -1;
  if (from === "packet2") return 1;
  return 0;
}

/** Spread three piles, then restack by ducking the pile that is in the way so nothing slides through a face. */
function threeCutFrames(packets: { from: string }[], dir: number): FluidFrame[][] {
  const n = packets.length;
  const lanes = packets.map((packet) => threeLane(packet.from, n) * 118 * dir);
  const duck = 100;
  const posX = lanes.slice();
  const events: { t: number; i: number; x: number; y: number; z: number }[] = [];
  const note = (t: number, i: number, x: number, y: number, z: number) => events.push({ t, i, x, y, z });
  for (let i = 0; i < n; i += 1) {
    note(0.16, i, lanes[i] ?? 0, 0, 10);
    note(0.26, i, lanes[i] ?? 0, 0, 10);
  }
  let cursor = 0.26;
  const span = n <= 1 ? 0.2 : 0.62 / (n - 1);
  const stacked = new Set<number>(n ? [0] : []);
  for (let mover = 1; mover < n; mover += 1) {
    const anchor = [...stacked][0] ?? 0;
    const destX = posX[anchor] ?? 0;
    const fromX = posX[mover] ?? 0;
    const blockers: number[] = [];
    for (let i = mover + 1; i < n; i += 1) {
      const x = posX[i] ?? 0;
      const toward = (x - fromX) * (destX - fromX);
      if (toward > 0 && Math.abs(x - fromX) < Math.abs(destX - fromX) - 8) blockers.push(i);
    }
    const tDuck = cursor + span * 0.3;
    const tSlide = cursor + span * 0.68;
    const tRise = cursor + span;
    for (let i = 0; i < n; i += 1) {
      if (i === mover) note(tDuck, i, fromX, 0, 36 + mover);
      else if (stacked.has(i) || blockers.includes(i)) note(tDuck, i, posX[i] ?? 0, duck, stacked.has(i) ? 3 : 6);
      else note(tDuck, i, posX[i] ?? 0, 0, 10);
    }
    note(tSlide, mover, destX, 0, 36 + mover);
    for (const i of stacked) note(tSlide, i, destX, duck, 3);
    for (const i of blockers) note(tSlide, i, posX[i] ?? 0, duck, 6);
    for (let i = 0; i < n; i += 1) {
      if (i === mover) note(tRise, i, destX, 0, 36 + mover);
      else if (stacked.has(i)) note(tRise, i, destX, 0, 4);
      else if (blockers.includes(i)) note(tRise, i, posX[i] ?? 0, 0, 10);
      else note(tRise, i, posX[i] ?? 0, 0, 10);
    }
    posX[mover] = destX;
    stacked.add(mover);
    cursor = tRise;
  }
  const finalX = posX[[...stacked][0] ?? 0] ?? 0;
  if (Math.abs(finalX) > 1) {
    for (let i = 0; i < n; i += 1) note(Math.min(0.96, cursor + 0.06), i, 0, 0, 20 + i);
  }
  for (let i = 0; i < n; i += 1) note(1, i, 0, 0, 20 + i);
  return packets.map((_, index) => {
    const list: FluidFrame[] = [{ offset: 0, transform: pose(0, 0, 0), zIndex: 4 }];
    for (const event of events.filter((item) => item.i === index).sort((a, b) => a.t - b.t)) {
      const offset = Math.round(event.t * 1000) / 1000;
      if (offset <= list[list.length - 1]!.offset) continue;
      list.push({ offset, transform: pose(event.x, event.y, 0), zIndex: event.z });
    }
    if (list[list.length - 1]!.offset < 1) list.push({ offset: 1, transform: pose(0, 0, 0), zIndex: 20 + index });
    return list;
  });
}

function transfers(framesIn: readonly VisualFrame[], action: string | ((action: string) => boolean)) {
  const match = typeof action === "string" ? (value: string) => value === action : action;
  return framesIn.filter((frame) => frame.kind === "transfer" && match(frame.action) && frame.packetIds.length);
}

function packetShow(
  packets: { ids: number[]; from: string; key: string; seqs: number[] }[],
  dir: number,
  reduced: boolean,
  path: "overhand" | "hindu" | "riffle" | "cut" | "three",
): FluidShow {
  if (reduced) {
    const actors = packets.map((packet, index) => ({
      key: packet.key,
      ids: packet.ids,
      role: "packet" as const,
      display: "single-card" as const,
      mode: "rigid-packet" as const,
      eventSeqs: packet.seqs,
      delay: 0,
      duration: 180,
      zIndex: index + 1,
      frames: frames([
        { offset: 0, transform: pose(0, 0, 0), opacity: 1 },
        { offset: 1, transform: pose(0, 0, 0), opacity: 1 },
      ]),
    }));
    return { actors, duration: 180, driver: "reduced" };
  }
  const stagger = Math.round(Math.min(160, Math.max(42, 1100 / Math.max(1, packets.length))));
  const move = path === "cut" ? 1050 : path === "three" ? 1580 : 680;
  const cutEdges = path === "cut"
    ? cutEdgeCounts(packets.map((packet) => packet.ids.length))
    : path === "three"
      ? shortStackEdges(packets.map((packet) => packet.ids.length))
      : [];
  const threeFrames = path === "three" ? threeCutFrames(packets, dir) : [];
  const actors: FluidActor[] = packets.map((packet, index) => {
    const side = packet.from === "right" || packet.from === "packet2" ? 1 : packet.from === "packet1" ? 0 : -1;
    let points: FluidFrame[];
    if (path === "overhand") {
      const count = Math.max(1, packets.length);
      const peel = 0.05 + (index / count) * 0.5;
      const aside = Math.min(0.68, peel + 0.1);
      const drop = Math.min(0.76, peel + 0.16);
      const x = 58 * dir;
      points = [
        { offset: 0, transform: pose(0, 0, 0), zIndex: count - index },
        { offset: peel, transform: pose(0, -24, -4 * dir), zIndex: 24 + index },
        { offset: aside, transform: pose(x, -20, 5 * dir), zIndex: 24 + index },
        { offset: drop, transform: pose(x, 0, 0), zIndex: 8 + index },
        { offset: 0.84, transform: pose(x, 0, 0), zIndex: 8 + index },
        { offset: 1, transform: pose(0, 0, 0), zIndex: 8 + index },
      ];
    } else if (path === "hindu") {
      const count = Math.max(1, packets.length);
      const last = index === count - 1;
      const lane = 118 * dir;
      if (last) {
        points = [
          { offset: 0, transform: pose(0, 0, 0), zIndex: 24 },
          { offset: 0.8, transform: pose(0, 0, 0), zIndex: 24 },
          { offset: 0.84, transform: pose(0, 0, 0), zIndex: 2 },
          { offset: 1, transform: pose(0, 0, 0), zIndex: 2 },
        ];
      } else {
        const pull = 0.12 + (index / Math.max(1, count - 1)) * 0.46;
        points = [
          { offset: 0, transform: pose(0, 0, 0), zIndex: 3 },
          { offset: pull, transform: pose(0, 0, 0), zIndex: 3 },
          { offset: Math.min(0.64, pull + 0.1), transform: pose(lane, 3, 4 * dir), zIndex: 14 + index },
          { offset: Math.min(0.72, pull + 0.16), transform: pose(lane, 0, 0), zIndex: 14 + index },
          { offset: 0.8, transform: pose(lane, 0, 0), zIndex: 14 + index },
          { offset: 1, transform: pose(0, 0, 0), zIndex: 14 + index },
        ];
      }
    } else if (path === "riffle") {
      const count = Math.max(1, packets.length);
      const lane = side * 112 * dir;
      const lean = side * 7 * dir;
      const release = count === 1 ? 0.42 : 0.24 + (index / (count - 1)) * 0.46;
      const land = release + 0.08;
      points = [
        { offset: 0, transform: pose(0, 0, 0), zIndex: 4 },
        { offset: 0.18, transform: pose(lane, 0, lean), zIndex: 4 + index },
        { offset: release, transform: pose(lane, -6, lean), zIndex: 30 + index },
        { offset: land, transform: pose(0, -4, 0), zIndex: 30 + index },
        { offset: 0.84, transform: pose(0, 0, 0), zIndex: 30 + index },
        { offset: 0.92, transform: pose(0, -7, 0), zIndex: 30 + index },
        { offset: 1, transform: pose(0, 0, 0), zIndex: 30 + index },
      ];
    } else if (path === "three") {
      points = threeFrames[index] ?? [{ offset: 0, transform: pose(0, 0, 0) }, { offset: 1, transform: pose(0, 0, 0) }];
    } else {
      const upper = packet.from === "upper" || index === 0;
      // Clear the deck completely, then slide back underneath. The halves never share a face.
      points = upper
        ? [
            { offset: 0, transform: pose(0, 0, 0), zIndex: 14 },
            { offset: 0.42, transform: pose(122 * dir, 4, 5 * dir), zIndex: 14 },
            { offset: 0.52, transform: pose(122 * dir, 4, 2 * dir), zIndex: 2 },
            { offset: 1, transform: pose(0, 0, 0), zIndex: 2 },
          ]
        : [
            { offset: 0, transform: pose(0, 0, 0), zIndex: 8 },
            { offset: 1, transform: pose(0, 0, 0), zIndex: 8 },
          ];
    }
    const delay = path === "cut" || path === "overhand" || path === "riffle" || path === "hindu" || path === "three" ? 0 : stagger * index;
    const duration = path === "riffle" ? 1680 : path === "hindu" ? 1500 : path === "three" ? 1580 : path === "overhand" ? Math.min(2000, 1200 + packets.length * 36) : move;
    const upperCut = path === "cut" && (packet.from === "upper" || index === 0);
    return {
      key: packet.key,
      ids: packet.ids,
      role: "packet",
      display: "single-card",
      mode: "rigid-packet",
      eventSeqs: packet.seqs,
      delay,
      duration,
      zIndex: upperCut ? 1 : index + 2,
      edges: cutEdges[index],
      ease: path === "cut" || path === "riffle" || path === "hindu" || path === "three" ? "cubic-bezier(0.37, 0.01, 0.2, 1)" : undefined,
      frames: frames(points),
    };
  });
  return { actors, duration: span(actors), driver: "fluid" };
}

/** A full-deck wash is a fan of whole cards, not one sprite per physical card. */
export function washProxyBudget(count: number) {
  if (count <= 14) return count;
  return 12;
}

/** Lay a wash across the felt in recorded left-to-right order, with a real gap between cards. */
function washSeats(points: { x: number; y: number }[], dir: number) {
  const n = points.length;
  const ranked = points
    .map((point, index) => ({ index, x: point.x, y: point.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y || a.index - b.index);
  const rows = n <= 3 ? 1 : n <= 6 ? 2 : 3;
  const cols = Math.ceil(n / rows);
  const scale = rows === 1 ? 1 : rows === 2 ? 0.7 : 0.52;
  const half = scale * 50;
  const xLimit = 146 - half;
  const yGap = rows === 3 ? 56 : 78;
  const seats = new Array<{ x: number; y: number; r: number; scale: number }>(n);
  ranked.forEach((item, rank) => {
    const row = rows === 1 ? 0 : rank < cols ? 0 : rank < cols * 2 ? 1 : 2;
    const rowCount = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const rowIndex = rank - cols * row;
    const step = rowCount <= 1 ? 0 : Math.min(120, (xLimit * 2) / (rowCount - 1));
    const origin = -((rowCount - 1) * step) / 2;
    seats[item.index] = {
      x: (origin + rowIndex * step) * dir,
      y: (row - (rows - 1) / 2) * yGap,
      r: (rowIndex - (rowCount - 1) / 2) * 1.1 * dir,
      scale,
    };
  });
  return seats;
}

function washShow(scene: VisualScene, dir: number, reduced: boolean): FluidShow {
  const spread = new Map<number, { x: number; y: number }>();
  const last = new Map<number, { x: number; y: number }>();
  const seqs = new Map<number, number[]>();
  const pickup: number[] = [];
  for (const frame of scene.frames) {
    if (frame.cardId == null) continue;
    const owned = seqs.get(frame.cardId) ?? [];
    owned.push(frame.seq);
    seqs.set(frame.cardId, owned);
    if (frame.action === "spread_on_workspace" && frame.slideTo) {
      spread.set(frame.cardId, frame.slideTo);
      last.set(frame.cardId, frame.slideTo);
    } else if (frame.kind === "slide" && frame.slideTo && frame.action.startsWith("wash_stroke_")) {
      last.set(frame.cardId, frame.slideTo);
    } else if (frame.action === "gather_from_table") pickup.push(frame.cardId);
  }
  const order = new Map(pickup.map((id, index) => [id, index]));
  const cards = scene.before.map((id) => ({
    id,
    at: spread.get(id) ?? { x: 0.5, y: 0.5 },
    end: last.get(id) ?? spread.get(id) ?? { x: 0.5, y: 0.5 },
    pick: order.get(id) ?? 0,
    seqs: seqs.get(id) ?? [],
  }));
  const angled = [...cards].sort((a, b) => {
    const turn = Math.atan2(a.at.y - 0.5, a.at.x - 0.5) - Math.atan2(b.at.y - 0.5, b.at.x - 0.5);
    return Math.abs(turn) > 1e-9 ? turn : a.pick - b.pick;
  });
  const budget = washProxyBudget(cards.length);
  const clusters: { ids: number[]; at: { x: number; y: number }; end: { x: number; y: number }; pick: number; seqs: number[] }[] = [];
  for (let index = 0; index < budget; index += 1) {
    const start = Math.floor((index * angled.length) / budget);
    const stop = Math.floor(((index + 1) * angled.length) / budget);
    const slice = angled.slice(start, stop);
    if (!slice.length) continue;
    const members = [...slice].sort((a, b) => a.pick - b.pick);
    const face = slice[Math.floor(slice.length / 2)]!;
    clusters.push({
      ids: members.map((item) => item.id),
      at: face.at,
      end: face.end,
      pick: members[0]!.pick,
      seqs: members.flatMap((item) => item.seqs),
    });
  }
  const duration = reduced ? 180 : 1760;
  const seats = washSeats(clusters.map((cluster) => cluster.at), dir);
  const maxPick = Math.max(1, ...clusters.map((cluster) => cluster.pick));
  const actors: FluidActor[] = clusters.map((cluster, index) => {
    const seat = seats[index] ?? { x: 0, y: 0, r: 0, scale: 1 };
    const nudgeX = Math.max(-4, Math.min(4, (cluster.end.x - cluster.at.x) * 24));
    const nudgeY = Math.max(-3, Math.min(3, (cluster.end.y - cluster.at.y) * 16));
    const spreadAt = clusters.length === 1 ? 0.28 : 0.14 + (index / (clusters.length - 1)) * 0.2;
    const settled = Math.min(0.46, spreadAt + 0.1);
    const gather = 0.56 + (cluster.pick / maxPick) * 0.28;
    const home = Math.min(0.96, gather + 0.08);
    return {
      key: `wash-${index}`,
      ids: cluster.ids,
      role: "card",
      display: "single-card",
      mode: "spatial-representation",
      eventSeqs: cluster.seqs,
      delay: 0,
      duration,
      zIndex: index + 2,
      ease: EASE,
      frames: frames(
        reduced
          ? [
              { offset: 0, transform: pose(0, 0, 0), opacity: 1 },
              { offset: 1, transform: pose(0, 0, 0), opacity: 1 },
            ]
          : [
              { offset: 0, transform: pose(0, 0, 0), zIndex: 2 },
              { offset: spreadAt, transform: pose(seat.x, seat.y, seat.r, seat.scale), zIndex: 4 + index },
              { offset: settled, transform: pose(seat.x + nudgeX, seat.y + nudgeY, seat.r, seat.scale), zIndex: 4 + index },
              { offset: gather, transform: pose(seat.x + nudgeX, seat.y + nudgeY - 4, seat.r * 0.3, seat.scale), zIndex: 40 + index },
              { offset: home, transform: pose(0, 0, 0), zIndex: 40 + index },
              { offset: 1, transform: pose(0, 0, 0), zIndex: 40 + index },
            ],
      ),
    };
  });
  return { actors, duration, driver: reduced ? "reduced" : "fluid" };
}

/** Precompiled movement. Every actor is a recorded set of card ids. Timing is not one tick per event. */
export function compileFluid(scene: VisualScene | CutScene, dir: number, reduced: boolean): FluidShow {
  if (scene.kind === "cut") {
    const lifted = scene.frames[0]?.packetIds ?? [];
    const rest = scene.before.filter((id) => !lifted.includes(id));
    const show = packetShow(
      [
        { ids: [...lifted], from: "upper", key: "cut-upper", seqs: [scene.frames[0]?.seq ?? 0] },
        { ids: rest, from: "draw", key: "cut-lower", seqs: [scene.frames[1]?.seq ?? 1] },
      ].filter((packet) => packet.ids.length),
      dir,
      reduced,
      "cut",
    );
    return show;
  }
  if (scene.style === "table_wash") return washShow(scene, dir, reduced);
  if (scene.style === "overhand") {
    return packetShow(
      transfers(scene.frames, "strip_top_to_receiver_top").map((frame, index) => ({ ids: [...frame.packetIds], from: "held", key: `over-${index}`, seqs: [frame.seq] })),
      dir,
      reduced,
      "overhand",
    );
  }
  if (scene.style === "hindu") {
    return packetShow(
      transfers(scene.frames, (action) => action === "strip_bottom_to_receiver_top" || action === "place_remaining_below_receiver").map((frame, index) => ({
        ids: [...frame.packetIds],
        from: "held",
        key: `hindu-${index}`,
        seqs: [frame.seq],
      })),
      dir,
      reduced,
      "hindu",
    );
  }
  if (scene.style === "riffle_bridge") {
    return packetShow(
      transfers(scene.frames, (action) => action.startsWith("riffle_release_")).map((frame, index) => ({
        ids: [...frame.packetIds],
        from: frame.from ?? "left",
        key: `riffle-${index}`,
        seqs: [frame.seq],
      })),
      dir,
      reduced,
      "riffle",
    );
  }
  if (scene.style === "three_packet_cut") {
    const made = transfers(scene.frames, (action) => action.startsWith("make_"));
    const picks = scene.frames.filter((frame) => frame.action.startsWith("pick_") || frame.action.startsWith("pickup_packet_"));
    const rank = new Map(picks.map((frame, index) => [frame.from ?? frame.action, index]));
    const packets = made.map((frame, index) => ({ ids: [...frame.packetIds], from: frame.to ?? "packet0", key: `three-${index}`, seqs: [frame.seq] }));
    packets.sort((a, b) => (rank.get(a.from) ?? 0) - (rank.get(b.from) ?? 0));
    const show = packetShow(packets, dir, reduced, "three");
    show.actors.forEach((actor, index) => {
      actor.zIndex = index + 2;
    });
    return show;
  }
  const lifted = transfers(scene.frames, "lift_upper_packet")[0];
  const lower = transfers(scene.frames, "put_lower_on_result")[0];
  return packetShow(
    [
      lifted ? { ids: [...lifted.packetIds], from: "upper", key: "original-upper", seqs: [lifted.seq] } : null,
      lower ? { ids: [...lower.packetIds], from: "draw", key: "original-lower", seqs: [lower.seq] } : null,
    ].filter((packet): packet is { ids: number[]; from: string; key: string; seqs: number[] } => !!packet && packet.ids.length > 0),
    dir,
    reduced,
    "cut",
  );
}
