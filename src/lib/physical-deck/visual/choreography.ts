import type { CutScene } from "./cut";
import type { VisualFrame, VisualScene } from "./compile";

export type FluidFrame = {
  offset: number;
  transform: string;
  opacity?: number;
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
};

export type FluidShow = {
  actors: FluidActor[];
  duration: number;
  driver: "fluid" | "reduced";
};

const EASE = "cubic-bezier(0.33, 0.02, 0.18, 1)";
export const FLUID_EASE = EASE;

function pose(x: number, y: number, r: number) {
  return `translate3d(${x}%, ${y}%, 0) rotate(${r}deg)`;
}

function frames(points: FluidFrame[]): FluidFrame[] {
  const sorted = [...points].sort((a, b) => a.offset - b.offset);
  const next: FluidFrame[] = [];
  for (const point of sorted) {
    const offset = Math.min(1, Math.max(0, point.offset));
    const last = next.at(-1);
    if (last && offset <= last.offset) continue;
    next.push({ offset, transform: point.transform, opacity: point.opacity });
  }
  if (!next.length || next[0]!.offset > 0) next.unshift({ offset: 0, transform: points[0]?.transform ?? pose(0, 0, 0) });
  if (next.at(-1)!.offset < 1) next.push({ offset: 1, transform: next.at(-1)!.transform });
  return next;
}

function span(actors: FluidActor[]) {
  return Math.max(480, ...actors.map((actor) => actor.delay + actor.duration));
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
  const move = path === "cut" || path === "three" ? 1080 : 680;
  const actors: FluidActor[] = packets.map((packet, index) => {
    const side = packet.from === "right" || packet.from === "packet2" ? 1 : packet.from === "packet1" ? 0 : -1;
    const x = 46 * side * dir;
    const tilt = 7 * side * dir;
    let points: FluidFrame[];
    if (path === "overhand") {
      points = [
        { offset: 0, transform: pose(0, 0, 0) },
        { offset: 0.2, transform: pose(0, -112, tilt * -0.4) },
        { offset: 0.42, transform: pose(x * 1.35, -112, tilt) },
        { offset: 0.68, transform: pose(x * 1.15, 2, tilt * 0.2) },
        { offset: 1, transform: pose(0, 0, 0) },
      ];
    } else if (path === "hindu") {
      points = [
        { offset: 0, transform: pose(0, 0, 0) },
        { offset: 0.22, transform: pose(x * 0.85, 8, tilt * 0.45) },
        { offset: 0.4, transform: pose(x, -118, tilt) },
        { offset: 0.66, transform: pose(0, -118, 0) },
        { offset: 0.86, transform: pose(0, -8, 0) },
        { offset: 1, transform: pose(0, 0, 0) },
      ];
    } else if (path === "riffle") {
      const drop = Math.min(0.78, 0.34 + (index / Math.max(1, packets.length)) * 0.4);
      points = [
        { offset: 0, transform: pose(0, 0, 0) },
        { offset: 0.16, transform: pose(x * 1.7, 2, tilt) },
        { offset: drop, transform: pose(x * 1.7, -18, tilt * 0.4) },
        { offset: Math.min(0.96, drop + 0.14), transform: pose(0, -6, 0) },
        { offset: 1, transform: pose(0, 0, 0) },
      ];
    } else if (path === "three") {
      const back = 0.42 + (index / Math.max(1, packets.length)) * 0.4;
      points = [
        { offset: 0, transform: pose(0, 0, 0) },
        { offset: 0.28, transform: pose(x * 1.9, side === 0 ? -86 : 16, tilt) },
        { offset: back, transform: pose(x * 1.9, side === 0 ? -120 : -8, tilt * 0.2) },
        { offset: Math.min(0.94, back + 0.16), transform: pose(0, -10, 0) },
        { offset: 1, transform: pose(0, 0, 0) },
      ];
    } else {
      const upper = packet.from === "upper" || index === 0;
      points = upper
        ? [
            { offset: 0, transform: pose(0, 0, 0) },
            { offset: 0.28, transform: pose(-54 * dir, -16, -11 * dir) },
            { offset: 0.48, transform: pose(-54 * dir, -8, -6 * dir) },
            { offset: 0.72, transform: pose(0, 6, 0) },
            { offset: 1, transform: pose(0, 0, 0) },
          ]
        : [
            { offset: 0, transform: pose(0, 0, 0) },
            { offset: 0.48, transform: pose(0, 0, 0) },
            { offset: 0.72, transform: pose(0, -8, 0) },
            { offset: 1, transform: pose(0, 0, 0) },
          ];
    }
    const delay = path === "cut" ? 0 : stagger * index;
    const duration = path === "riffle" ? Math.min(2100, 1100 + Math.min(packets.length, 12) * 24) : move;
    return {
      key: packet.key,
      ids: packet.ids,
      role: "packet",
      display: "single-card",
      mode: "rigid-packet",
      eventSeqs: packet.seqs,
      delay,
      duration,
      zIndex: index + 2,
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
  const duration = reduced ? 180 : 1680;
  const n = Math.max(1, clusters.length - 1);
  const actors: FluidActor[] = clusters.map((cluster, index) => {
    const place = (point: { x: number; y: number }) =>
      pose((point.x - 0.5) * 150, (point.y - 0.5) * 108, (point.x - 0.5) * 14 * dir);
    const gather = Math.min(0.9, 0.58 + (cluster.pick / Math.max(1, scene.before.length - 1)) * 0.28);
    return {
      key: `wash-${index}`,
      ids: cluster.ids,
      role: "card",
      display: "single-card",
      mode: "spatial-representation",
      eventSeqs: cluster.seqs,
      delay: 0,
      duration,
      zIndex: clusters.length - index,
      frames: frames(
        reduced
          ? [
              { offset: 0, transform: pose(0, 0, 0), opacity: 1 },
              { offset: 1, transform: pose(0, 0, 0), opacity: 1 },
            ]
          : [
              { offset: 0, transform: pose((index - n / 2) * 1.5, 0, 0), opacity: 1 },
              { offset: 0.22, transform: place(cluster.at), opacity: 1 },
              { offset: 0.5, transform: place(cluster.end), opacity: 1 },
              { offset: gather, transform: place(cluster.end), opacity: 1 },
              { offset: 1, transform: pose(0, 0, 0), opacity: 1 },
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
    if (!reduced && show.actors[1]) show.actors[1].zIndex = 6;
    if (!reduced && show.actors[0]) show.actors[0].zIndex = 2;
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
      actor.zIndex = show.actors.length - index + 1;
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
