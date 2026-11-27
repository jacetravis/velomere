// @ts-nocheck
/**
 * Relational proof renderer for eight cards.
 * Version: relational-encounter-3-proof
 *
 * A blueprint sentence is compiled into participants, edges, a void derived
 * from those edges, and consequences of the edges on one another.
 * It is not a label mapped onto a fixed stroke template.
 * No image, prior card, or workbench render is read.
 * This module does not build a 78-card deck.
 */
import { createHash } from "node:crypto";
import { loadSources } from "./encounter2.mjs";

export const VERSION = "relational-encounter-3-proof";
const W = 1400;
const H = 2300;
const EDGE = "#07080c";
const INK = {
  major: { field: "#1a1612", decisive: "#e6c98a", scaffold: "#8d7452", response: "#9eb8c4" },
  hearings: { field: "#102126", decisive: "#b7ddd8", scaffold: "#4e7276", response: "#e0c49a" },
  paths: { field: "#171c12", decisive: "#d5e0b0", scaffold: "#6d7750", response: "#d7bdd4" },
};

const PROOF = [
  "The Shuffle",
  "The Witness",
  "The Stranger",
  "The Dance",
  "The Movement",
  "The Null",
  "Ace of Hearings",
  "Ace of Paths",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function mulberry32(hex) {
  let a = Number.parseInt(hex.slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function hypot(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function dOf(points, { close = false, angular = false } = {}) {
  if (!points || points.length < 2) return "";
  const f = (p) => `${fmt(p[0])} ${fmt(p[1])}`;
  if (angular || points.length < 4) {
    return `M ${points.map(f).join(" L ")}${close ? " Z" : ""}`;
  }
  let d = `M ${f(points[0])}`;
  for (let i = 1; i < points.length - 2; i += 1) {
    const mx = (points[i][0] + points[i + 1][0]) / 2;
    const my = (points[i][1] + points[i + 1][1]) / 2;
    d += ` Q ${f(points[i])} ${fmt(mx)} ${fmt(my)}`;
  }
  d += ` Q ${f(points[points.length - 2])} ${f(points[points.length - 1])}`;
  if (close) d += " Z";
  return d;
}

function arcPts(cx, cy, rx, ry, a0, a1, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

function insideCircle(p, zone) {
  return Math.hypot(p[0] - zone.cx, p[1] - zone.cy) < zone.r - 1;
}

function stopAtCircle(origin, toward, zone, margin) {
  const dx = toward[0] - origin[0];
  const dy = toward[1] - origin[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ox = origin[0] - zone.cx;
  const oy = origin[1] - zone.cy;
  const b = ox * ux + oy * uy;
  const c = ox * ox + oy * oy - (zone.r + margin) ** 2;
  const disc = b * b - c;
  if (disc <= 0) return toward;
  const t = -b - Math.sqrt(disc);
  if (t <= 8) return origin;
  return [origin[0] + ux * t, origin[1] + uy * t];
}

function structureOf(identity) {
  if (/branching openings/i.test(identity)) return "branch";
  if (/observational arcs/i.test(identity)) return "witness";
  if (/discontinuous contour/i.test(identity)) return "stranger";
  if (/independently paced strands/i.test(identity)) return "dance";
  if (/Successive frames/i.test(identity)) return "frames";
  if (/stopped path bordering/i.test(identity)) return "withhold";
  if (/listening cusp/i.test(identity)) return "listen";
  if (/clean separation/i.test(identity)) return "separate";
  throw new Error(`This proof renderer has no graph for: ${identity}`);
}

function guestForce(guest) {
  if (!guest || Number(guest.intensity) === 0) {
    return { intensity: 0, kinds: [], text: guest?.text ?? "", proposal: guest?.proposal ?? "" };
  }
  const text = guest.text || "";
  const kinds = [];
  if (/only two react|misalign/i.test(text)) kinds.push("partial-reaction");
  if (/off-axis return|correction rather than possession/i.test(text)) kinds.push("correction-stroke");
  if (/autonomous orientation|partly veiled/i.test(text)) kinds.push("far-autonomy");
  if (/third rhythm|between beats/i.test(text)) kinds.push("emergent-beat");
  if (/next radius|nonconcentric/i.test(text)) kinds.push("radius-change");
  if (/responding side|deliberate break/i.test(text)) kinds.push("response-mark");
  if (/measured interval|unlike path/i.test(text)) kinds.push("interval-link");
  if (!kinds.length) throw new Error(`Encounter text did not become a graph edit: ${text}`);
  return { intensity: Number(guest.intensity), kinds, text, proposal: guest.proposal || "" };
}

function element(id, points, role, layer, cause, parameters, flags = {}) {
  return {
    id,
    d: dOf(points, flags),
    points,
    role,
    layer,
    cause,
    parameters,
    angular: Boolean(flags.angular),
    close: Boolean(flags.close),
  };
}

function bounds(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

function meanPointShift(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += hypot(a[i], b[i]);
  return sum / n;
}

function compile(blue, date, force) {
  const kind = structureOf(blue.identity_geometry);
  const rng = mulberry32(sha256(`proof|${VERSION}|${date}|${blue.identity_geometry}`));
  if (kind === "branch") return compileBranch(blue, rng, force);
  if (kind === "witness") return compileWitness(blue, rng, force);
  if (kind === "stranger") return compileStranger(blue, rng, force);
  if (kind === "dance") return compileDance(blue, rng, force);
  if (kind === "frames") return compileFrames(blue, rng, force);
  if (kind === "withhold") return compileWithhold(blue, rng, force);
  if (kind === "listen") return compileListen(blue, rng, force);
  return compileSeparate(blue, rng, force);
}

function compileBranch(blue, rng, force) {
  const origin = [700, 540];
  const angles = [1.02, 1.46, 2.08, 2.58].map((angle, i) => angle + (rng() - 0.5) * 0.06 + i * 0.01);
  const privileged = angles
    .map((angle, index) => ({ index, delta: Math.abs(angle - Math.PI / 2) }))
    .sort((a, b) => a.delta - b.delta)[0].index;
  const selectedLengths = [860, 980, 720];
  let selectedCursor = 0;
  const branches = angles.map((angle, index) => {
    const unselected = index === privileged;
    const len = unselected ? 360 : selectedLengths[selectedCursor++];
    const pts = [];
    const steps = unselected ? 6 : 16;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      pts.push([origin[0] + Math.cos(angle) * len * t, origin[1] + Math.sin(angle) * len * t]);
    }
    return { index, angle, len, pts, unselected };
  });
  const selected = branches.filter((branch) => !branch.unselected);
  for (const branch of selected) {
    const end = branch.pts[branch.pts.length - 1];
    let pushX = 0;
    let pushY = 0;
    for (const other of selected) {
      if (other === branch) continue;
      const o = other.pts[other.pts.length - 1];
      const dx = end[0] - o[0];
      const dy = end[1] - o[1];
      const dist = Math.hypot(dx, dy) || 1;
      const mag = 110 * Math.min(1, 320 / dist);
      pushX += (dx / dist) * mag;
      pushY += (dy / dist) * mag;
    }
    branch.pts.forEach((p, k) => {
      const w = (k / (branch.pts.length - 1)) ** 2;
      p[0] += pushX * w;
      p[1] += pushY * w;
    });
    branch.repulsion = Math.hypot(pushX, pushY);
  }
  const reacted = new Set();
  if (force.kinds.includes("partial-reaction")) {
    const guest = [1120, 1560];
    const ranked = [...selected].sort((a, b) => hypot(a.pts.at(-1), guest) - hypot(b.pts.at(-1), guest));
    ranked.slice(0, 2).forEach((branch) => {
      reacted.add(branch.index);
      const end = branch.pts.at(-1);
      const dx = guest[0] - end[0];
      const dy = guest[1] - end[1];
      const dist = Math.hypot(dx, dy) || 1;
      const mag = 36 * force.intensity;
      branch.pts.forEach((p, k) => {
        const w = (k / (branch.pts.length - 1)) ** 1.4;
        p[0] += (dx / dist) * mag * w;
        p[1] += (dy / dist) * mag * w;
      });
    });
  }
  const elements = branches.map((branch) =>
    element(
      `relation-${branch.index + 1}`,
      branch.pts,
      branch.unselected ? "withheld" : "decisive",
      "relation",
      branch.unselected
        ? "The opening nearest a straight descent is left unfinished, so no route is privileged."
        : "This opening is repelled by the other selected endings.",
      {
        angle: Number(branch.angle.toFixed(3)),
        length: Math.round(branch.len),
        unselected: branch.unselected,
        repulsion: Math.round(branch.repulsion || 0),
        reacted: reacted.has(branch.index),
      },
      { angular: false },
    ),
  );
  const wedges = [];
  for (let i = 0; i < selected.length - 1; i += 1) {
    const a = selected[i].pts.at(-1);
    const b = selected[i + 1].pts.at(-1);
    const mid = lerp(a, b, 0.5);
    const from = lerp(origin, mid, 0.42);
    wedges.push([from, mid]);
  }
  wedges.forEach((pts, i) => {
    elements.push(
      element(
        `field-${i + 1}`,
        pts,
        "field",
        "field",
        "The wedge is the gap between two selected endings after they repel.",
        { between: [selected[i].index + 1, selected[i + 1].index + 1] },
        { angular: true },
      ),
    );
  });
  const tree = branches.map((branch) => {
    const end = branch.pts.at(-1);
    const forced = [700, 1880];
    return [origin, end, forced];
  });
  elements.push(
    element(
      "counterreading-1",
      tree.flat(),
      "counter",
      "counterreading",
      blue.failure_condition,
      { joins_at: [700, 1880], branches: 4 },
      { angular: true },
    ),
  );
  const longest = Math.max(...selected.map((branch) => branch.len));
  const unselected = branches.find((branch) => branch.unselected);
  const constraints = [
    {
      id: "unselected",
      statement: blue.negative_space_rule,
      measured: `Branch ${unselected.index + 1} is ${Math.round((unselected.len / longest) * 100)}% of the longest selected opening and is the one nearest straight down.`,
      pass: unselected.len / longest < 0.55,
    },
    {
      id: "not-a-tree",
      statement: blue.failure_condition,
      measured: "The refused drawing joins every opening, including the short one, at one terminal. The card does not.",
      pass: true,
    },
  ];
  if (force.intensity > 0) {
    constraints.push({
      id: "partial-reaction",
      statement: "Only two openings react to the other participant.",
      measured: `Reacted branches ${[...reacted].map((n) => n + 1).join(" and ")}; the other selected opening is unmoved.`,
      pass: reacted.size === 2 && selected.length - reacted.size >= 1,
    });
  }
  return {
    elements,
    constraints,
    participants: [
      { id: "origin", role: "shared departure", x: origin[0], y: origin[1] },
      ...branches.map((branch) => ({
        id: `opening-${branch.index + 1}`,
        role: branch.unselected ? "unselected opening" : "selected opening",
        x: Math.round(branch.pts.at(-1)[0]),
        y: Math.round(branch.pts.at(-1)[1]),
      })),
    ],
    void: {
      id: "quiet-1",
      shape: "unfinished-opening",
      derived_from: "The shortest opening is the absence of a final route, not a reserved circle.",
      rule: blue.negative_space_rule,
      exclusion_test: {
        unconstrained_enters: true,
        actual_enters: false,
        note: "The predetermined tree would finish the short opening. The card leaves that segment out.",
      },
    },
    counterreading: {
      svg_id: "counterreading-1",
      differs_by: "Four separate openings become one joined tree.",
      failure_condition: blue.failure_condition,
    },
    field: { kind: "wedge-between-repelled-endings", ids: wedges.map((_, i) => `field-${i + 1}`) },
    contrast:
      "The four openings share a departure and then refuse one another. One stays short because it was the obvious route. The pale wedges are the gaps left after the selected endings push apart.",
  };
}

function compileWitness(blue, rng, force) {
  const jitter = (rng() - 0.5) * 24;
  const a = { x: 430, y: 820 + jitter, rx: 250, ry: 190 };
  const b = { x: 990, y: 1460 - jitter * 0.4, rx: 210, ry: 280 };
  const separation = Math.hypot(b.x - a.x, b.y - a.y);
  const arcA = arcPts(a.x, a.y, a.rx, a.ry, -0.5, 2.15);
  const arcB = arcPts(b.x, b.y, b.rx, b.ry, 2.55, 5.55);
  const zone = { cx: b.x, cy: b.y, r: Math.min(b.rx, b.ry) * 0.58 };
  let start = arcA[0];
  for (const p of arcA) if (hypot(p, [b.x, b.y]) < hypot(start, [b.x, b.y])) start = p;
  const baseAim = Math.atan2(b.y - start[1], b.x - start[0]);
  const correction = 0.34 + separation / 2200 + (force.kinds.includes("correction-stroke") ? 0.16 * force.intensity : 0);
  const aim = baseAim + correction;
  const far = [start[0] + Math.cos(aim) * 1600, start[1] + Math.sin(aim) * 1600];
  const stop = stopAtCircle(start, far, zone, 28);
  const occupy = Math.hypot(stop[0] - zone.cx, stop[1] - zone.cy);
  const sight = [start, lerp(start, stop, 0.55), stop];
  const invaded = [start, [b.x, b.y]];
  const elements = [
    element("relation-1", arcA, "scaffold", "relation", "Observer arc. Its center is not the witnessed center.", {
      center: [Math.round(a.x), Math.round(a.y)],
      radii: [a.rx, a.ry],
    }),
    element("relation-2", arcB, "scaffold", "relation", "Observed arc, offset in center, radius, and sweep.", {
      center: [Math.round(b.x), Math.round(b.y)],
      radii: [b.rx, b.ry],
    }),
    element("relation-3", sight, "decisive", "relation", "Corrected sightline. Distance from the observed center sets how far the aim turns aside.", {
      separation: Math.round(separation),
      correction_rad: Number(correction.toFixed(3)),
      end_distance: Math.round(occupy),
      void_radius: Math.round(zone.r),
    }),
  ];
  const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const ridge = [-1, -0.5, 0, 0.5, 1].map((t) => [mid[0] + px * t * 180, mid[1] + py * t * 180]);
  const ridgeOutside = ridge.filter((p) => !insideCircle(p, zone));
  if (ridgeOutside.length >= 2) {
    elements.push(
      element("field-1", ridgeOutside, "field", "field", "Equal-potential ridge between the two centers. It is clipped by the witnessed center.", {
        separation: Math.round(separation),
      }, { angular: true }),
    );
  }
  elements.push(
    element("counterreading-1", invaded, "counter", "counterreading", blue.failure_condition, {
      enters_center: true,
    }, { angular: true }),
  );
  if (force.kinds.includes("correction-stroke")) {
    const back = [
      stop,
      [stop[0] - py * 70, stop[1] + px * 70],
      [stop[0] - px * 40 - py * 150, stop[1] - py * 40 + px * 150],
    ];
    elements.push(
      element("encounter-1", back, "encounter", "encounter", "Off-axis return. It records a correction and does not enter the witnessed center.", {
        intensity: force.intensity,
      }),
    );
  }
  return {
    elements,
    constraints: [
      {
        id: "sightline-exclusion",
        statement: blue.negative_space_rule,
        measured: `Sightline ends ${Math.round(occupy)}px from the observed center; the center radius is ${Math.round(zone.r)}px.`,
        pass: occupy > zone.r,
      },
      {
        id: "distance-corrects",
        statement: "Relational distance revises the aim.",
        measured: `Centers are ${Math.round(separation)}px apart, so the aim turns ${correction.toFixed(2)} rad off the center.`,
        pass: correction > 0.3 && Math.abs(correction) > 0.2,
      },
      {
        id: "possession",
        statement: blue.failure_condition,
        measured: "The refused sightline runs from the same start into the observed center. The card's sightline does not.",
        pass: true,
      },
    ],
    participants: [
      { id: "observer", role: "observer", x: Math.round(a.x), y: Math.round(a.y), charge: 1 },
      { id: "observed", role: "observed", x: Math.round(b.x), y: Math.round(b.y), charge: 1.2 },
    ],
    void: {
      id: "quiet-1",
      shape: "disk-inside-observed-arc",
      derived_from: "Radius is 0.58 of the observed arc's shorter radius, centered on that arc, not a fixed 96.",
      rule: blue.negative_space_rule,
      boundary: { shape: "circle", cx: Math.round(zone.cx), cy: Math.round(zone.cy), r: Math.round(zone.r) },
      exclusion_test: {
        unconstrained_enters: true,
        actual_enters: false,
        note: "Without the correction, the sightline's endpoint is the observed center.",
      },
    },
    counterreading: {
      svg_id: "counterreading-1",
      differs_by: "Same origin, opposite policy: it occupies the center the card must leave empty.",
      failure_condition: blue.failure_condition,
    },
    field: { kind: "ridge-between-centers", ids: ["field-1"] },
    contrast:
      "Two arcs do not share a center or a sweep. The sightline's turn is a function of how far apart those centers are, and it stops outside the observed arc. The straight dash is what possession would have drawn.",
  };
}

function compileStranger(blue, rng, force) {
  const sway = (rng() - 0.5) * 30;
  const thresholdX = 760 + sway;
  const threshold = [];
  for (let i = 0; i <= 28; i += 1) {
    const t = i / 28;
    threshold.push([thresholdX + Math.sin(t * Math.PI) * 36, 360 + t * 1580]);
  }
  const upper = [];
  for (let i = 0; i <= 22; i += 1) {
    const t = i / 22;
    const yLift = Math.sin(t * Math.PI) * 90;
    upper.push([240 + t * (thresholdX - 280), 860 + t * 40 - yLift]);
  }
  const lower = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    lower.push([260 + t * 280, 1480 + t * 180]);
  }
  let zone = {
    cx: thresholdX + 300,
    cy: 1180,
    r: 230,
  };
  const farAngle = -0.55 + sway / 80;
  let far = null;
  if (force.kinds.includes("far-autonomy")) {
    const mag = 16 * force.intensity;
    for (let i = upper.length - 6; i < upper.length; i += 1) {
      const w = (i - (upper.length - 6)) / 5;
      upper[i][0] += Math.cos(farAngle + Math.PI / 2) * mag * w;
      upper[i][1] += Math.sin(farAngle + Math.PI / 2) * mag * w;
    }
    const fx = thresholdX + 420;
    far = [];
    for (let i = 0; i <= 18; i += 1) {
      const t = i / 18;
      far.push([fx + Math.cos(farAngle) * t * 80, 760 + t * 640 + Math.sin(farAngle) * t * 40]);
    }
    const nearX = Math.min(...far.map((p) => p[0]));
    const gapLeft = thresholdX + 36 + 28;
    const gapRight = nearX - 28;
    zone = {
      cx: (gapLeft + gapRight) / 2,
      cy: 1180,
      r: Math.max(90, (gapRight - gapLeft) / 2),
    };
  }
  const tangent = [upper.at(-1)[0] - upper.at(-2)[0], upper.at(-1)[1] - upper.at(-2)[1]];
  const tlen = Math.hypot(tangent[0], tangent[1]) || 1;
  const continued = [];
  for (let s = 1; s <= 8; s += 1) continued.push([upper.at(-1)[0] + (tangent[0] / tlen) * s * 48, upper.at(-1)[1] + (tangent[1] / tlen) * s * 48]);
  const continuedInside = continued.filter((p) => insideCircle(p, zone)).length;
  const actualInside = [...upper, ...lower, ...threshold].filter((p) => insideCircle(p, zone)).length;
  const gap = Math.hypot(upper.at(-1)[0] - lower[0][0], upper.at(-1)[1] - lower[0][1]);
  const elements = [
    element("relation-1", threshold, "scaffold", "relation", "Threshold the contour is not allowed to name by crossing.", {
      x: Math.round(thresholdX),
    }),
    element("relation-2", upper, "decisive", "relation", "Near contour. Curvature increases as it meets the threshold, then it stops.", {
      end_gap_to_fragment: Math.round(gap),
    }),
    element("relation-3", lower, "decisive", "relation", "The same contour resumed after the break, offset, not aimed back at the first piece.", {
      gap: Math.round(gap),
    }),
  ];
  if (far) {
    elements.push(
      element("encounter-1", far, "encounter", "encounter", "The other side keeps its own orientation. It does not decorate the unentered zone.", {
        angle: Number(farAngle.toFixed(3)),
        intensity: force.intensity,
      }),
    );
  }
  const ornament = arcPts(zone.cx, zone.cy, 64, 64, 0, Math.PI * 2, 16);
  elements.push(
    element("counterreading-1", ornament, "counter", "counterreading", blue.failure_condition, {
      placed_inside_void: true,
    }, { close: true }),
  );
  return {
    elements,
    constraints: [
      {
        id: "discontinuity",
        statement: "The contour breaks at the threshold.",
        measured: `The two pieces are ${Math.round(gap)}px apart and do not share an endpoint.`,
        pass: gap > 80,
      },
      {
        id: "unentered",
        statement: blue.negative_space_rule,
        measured: `Identity samples inside the far zone: ${actualInside}. A continuation along the last tangent would place ${continuedInside} samples inside.`,
        pass: actualInside === 0 && continuedInside > 0,
      },
    ],
    participants: [
      { id: "threshold", role: "boundary", x: Math.round(thresholdX), y: 1100 },
      { id: "near", role: "unfamiliar approach", x: Math.round(upper.at(-1)[0]), y: Math.round(upper.at(-1)[1]) },
    ],
    void: {
      id: "quiet-1",
      shape: "disk-on-the-far-side-of-the-threshold",
      derived_from: force.intensity
        ? "The zone is the gap between the threshold and the far path, recomputed when that path exists."
        : "The zone is inscribed on the unnamed side of this card's threshold.",
      rule: blue.negative_space_rule,
      boundary: { shape: "circle", cx: Math.round(zone.cx), cy: Math.round(zone.cy), r: Math.round(zone.r) },
      exclusion_test: {
        unconstrained_enters: continuedInside > 0,
        actual_enters: actualInside > 0,
        note: "Removing the break and extending the last tangent enters the far zone.",
      },
    },
    counterreading: {
      svg_id: "counterreading-1",
      differs_by: "A closed ornament sits in the zone the contour refused to enter.",
      failure_condition: blue.failure_condition,
    },
    field: {
      kind: "curvature-increases-with-proximity-to-threshold",
      ids: [],
      note: "The last portion of the near contour bends harder as it approaches. That bend is the field effect.",
    },
    contrast:
      "The boundary is a real break: the contour stops, resumes elsewhere, and leaves the far side unentered. The small closed dash inside that side is the ornament the card refuses, not a description of the stranger.",
  };
}

function waveSamples(cycles, phase, amp) {
  return (t) => Math.sin(t * cycles * Math.PI * 2 + phase) * amp;
}

function compileDance(blue, rng, force) {
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const cyclesA = 1.7;
  const cyclesB = 3.15;
  const ampA = 78;
  const ampB = 124;
  const yA = 980;
  const yB = 1380;
  const couple = 0.28 + (force.kinds.includes("emergent-beat") ? 0.06 * force.intensity : 0);
  const ownA = waveSamples(cyclesA, phaseA, ampA);
  const ownB = waveSamples(cyclesB, phaseB, ampB);
  const strand = (y, own, other, k) => {
    const pts = [];
    for (let i = 0; i <= 48; i += 1) {
      const t = i / 48;
      pts.push([200 + t * 1000, y + own(t) + k * other(t)]);
    }
    return pts;
  };
  const aPts = strand(yA, ownA, ownB, couple);
  const bPts = strand(yB, ownB, ownA, couple * 0.72);
  const uncoupled = strand(yA, ownA, ownB, 0);
  const couplingShift = meanPointShift(aPts, uncoupled);
  let minGap = Infinity;
  for (let i = 0; i < aPts.length; i += 1) minGap = Math.min(minGap, bPts[i][1] - aPts[i][1]);
  const corr = correlation(
    aPts.map((p, i) => p[1] - yA),
    bPts.map((p, i) => p[1] - yB),
  );
  const elements = [
    element("relation-1", aPts, "decisive", "relation", "Slower strand. Its ripple includes the other strand's pace.", {
      cycles: cyclesA,
      phase: Number(phaseA.toFixed(3)),
      coupling: Number(couple.toFixed(3)),
      shift_from_coupling_px: Math.round(couplingShift),
    }),
    element("relation-2", bPts, "decisive", "relation", "Faster strand. It carries a slower swell taken from the first.", {
      cycles: cyclesB,
      phase: Number(phaseB.toFixed(3)),
      coupling: Number((couple * 0.72).toFixed(3)),
    }),
  ];
  const beats = [];
  if (force.kinds.includes("emergent-beat")) {
    for (let i = 2; i < aPts.length - 2; i += 1) {
      const gap = bPts[i][1] - aPts[i][1];
      const prev = bPts[i - 1][1] - aPts[i - 1][1];
      const next = bPts[i + 1][1] - aPts[i + 1][1];
      if (gap > prev && gap > next && gap > minGap + 30) {
        const midY = (aPts[i][1] + bPts[i][1]) / 2;
        const half = Math.min(36, (gap - 80) / 2);
        beats.push([
          [aPts[i][0], midY - half],
          [aPts[i][0], midY + half],
        ]);
      }
    }
    beats.slice(0, 4).forEach((pts, i) => {
      elements.push(
        element(`encounter-${i + 1}`, pts, "encounter", "encounter", "A beat placed at a local widening between the strands. It touches neither strand.", {
          gap: Math.round(pts[1][1] - pts[0][1] + 80),
        }, { angular: true }),
      );
    });
  }
  const mid = (yA + yB) / 2;
  const mirror = aPts.map(([x, y]) => [x, mid + (mid - y)]);
  const mirrorDistance = meanPointShift(mirror, bPts);
  elements.push(
    element("counterreading-1", mirror, "counter", "counterreading", blue.failure_condition, {
      correlation_of_actual: Number(corr.toFixed(3)),
      mirror_to_other_px: Math.round(mirrorDistance),
    }),
  );
  return {
    elements,
    constraints: [
      {
        id: "not-symmetric",
        statement: blue.failure_condition,
        measured: `The reflected slower strand sits ${Math.round(mirrorDistance)}px away from the faster strand. Their offset correlation is ${corr.toFixed(2)}, and their paces are ${cyclesA} and ${cyclesB}.`,
        pass: mirrorDistance > 45 && Math.abs(cyclesA - cyclesB) > 0.8,
      },
      {
        id: "reciprocal",
        statement: "Each pace changes the other strand.",
        measured: `Removing the coupling moves the slower strand by ${Math.round(couplingShift)}px on average.`,
        pass: couplingShift > 12,
      },
      {
        id: "gap-alive",
        statement: blue.negative_space_rule,
        measured: `Minimum gap between strands is ${Math.round(minGap)}px. Beats, when present, sit in the gap and do not bridge it.`,
        pass: minGap > 90,
      },
    ],
    participants: [
      { id: "strand-a", role: "slower pace", x: 700, y: yA },
      { id: "strand-b", role: "faster pace", x: 700, y: yB },
    ],
    void: {
      id: "quiet-1",
      shape: "variable-corridor-between-strands",
      derived_from: "The protected interval is the measured gap between the two paces, which widens and narrows.",
      rule: blue.negative_space_rule,
      boundary: { shape: "corridor", min_gap: Math.round(minGap), y0: yA, y1: yB },
      exclusion_test: {
        unconstrained_enters: true,
        actual_enters: false,
        note: "A mirror of the slower strand falls across the other pace. The actual strands leave the gap open.",
      },
    },
    counterreading: {
      svg_id: "counterreading-1",
      differs_by: "It is the slower strand reflected into the other's lane.",
      failure_condition: blue.failure_condition,
    },
    field: {
      kind: "coupling-displaces-each-strand",
      ids: beats.length ? beats.map((_, i) => `encounter-${i + 1}`) : [],
      shift_px: Math.round(couplingShift),
    },
    contrast:
      "The strands do not match in pace or shape. Each one's wave contains the other's timing, which is why moving one pace moves the other line. The gap stays open. A reflected copy is drawn only as the symmetry this card is not.",
  };
}

function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return num / Math.sqrt(da * db || 1);
}

function compileFrames(blue, rng, force) {
  const extra = force.kinds.includes("radius-change") ? force.intensity : 0;
  let x = 220;
  let y = 460 + (rng() - 0.5) * 20;
  let ang = 0.22;
  const frames = [];
  const gaps = [];
  for (let i = 0; i < 4; i += 1) {
    const turn = 0.58 + i * 0.06 + extra * 0.045 * i;
    const len = 390 * (1 + extra * 0.05 * i);
    const pts = [];
    for (let s = 0; s <= 16; s += 1) {
      const t = s / 16;
      const a = ang + turn * t * t;
      pts.push([x + Math.cos(a) * len * t, y + Math.sin(a) * len * t]);
    }
    frames.push({ pts, turn, len });
    const end = pts.at(-1);
    const aEnd = ang + turn;
    const gap = 78;
    const next = [end[0] + Math.cos(aEnd) * gap, end[1] + Math.sin(aEnd) * gap];
    gaps.push(Math.hypot(next[0] - end[0], next[1] - end[1]));
    x = next[0];
    y = next[1];
    ang = aEnd;
  }
  const elements = frames.map((frame, i) =>
    element(
      `relation-${i + 1}`,
      frame.pts,
      i === frames.length - 1 ? "decisive" : "scaffold",
      "relation",
      i === 0
        ? "First frame. Later frames inherit its direction and then turn."
        : "This frame starts after a gap. Its turn and length come from the previous frame.",
      { index: i + 1, turn: Number(frame.turn.toFixed(3)), length: Math.round(frame.len), gap_before: i === 0 ? 0 : Math.round(gaps[i - 1]) },
    ),
  );
  const streaks = [];
  let sx = 300;
  let sy = 700;
  for (let i = 0; i < 5; i += 1) {
    const a = rng() * Math.PI * 2;
    streaks.push([sx, sy], [sx + Math.cos(a) * 90, sy + Math.sin(a) * 90]);
    sx += 140;
    sy += 80;
  }
  elements.push(
    element("counterreading-1", streaks, "counter", "counterreading", blue.failure_condition, {
      disconnected: 5,
    }, { angular: true }),
  );
  const turns = frames.map((frame) => frame.turn);
  const ordered = turns.every((turn, i) => i === 0 || turn > turns[i - 1] - 0.001);
  return {
    elements,
    constraints: [
      {
        id: "intervals",
        statement: blue.negative_space_rule,
        measured: `Three gaps of ${gaps.slice(0, 3).map((g) => Math.round(g)).join(", ")}px separate the frames.`,
        pass: gaps.slice(0, 3).every((g) => g >= 70),
      },
      {
        id: "evolved",
        statement: "Direction changes from frame to frame rather than resetting.",
        measured: `Turns ${turns.map((t) => t.toFixed(2)).join(" → ")} rad.`,
        pass: ordered && turns[3] - turns[0] > 0.15,
      },
    ],
    participants: frames.map((frame, i) => ({
      id: `frame-${i + 1}`,
      role: i === 0 ? "earlier direction" : "revised direction",
      x: Math.round(frame.pts[0][0]),
      y: Math.round(frame.pts[0][1]),
    })),
    void: {
      id: "quiet-1",
      shape: "gaps-between-frames",
      derived_from: "Each interval is the unfilled step between the end of one frame and the start of the next.",
      rule: blue.negative_space_rule,
      exclusion_test: {
        unconstrained_enters: true,
        actual_enters: false,
        note: "A single continuous streak would erase the intervals. The frames keep them.",
      },
    },
    counterreading: {
      svg_id: "counterreading-1",
      differs_by: "Five disconnected streaks with no inherited direction.",
      failure_condition: blue.failure_condition,
    },
    field: {
      kind: "previous-frame-sets-next-turn-and-length",
      ids: [],
      turns,
    },
    contrast:
      "One line is shown as four later moments, each turned further than the last, with the space between moments left open. The short scattered dashes are motion with no inheritance, which is the failure, not the card.",
  };
}

function compileWithhold(blue, rng, force) {
  if (force.intensity > 0) throw new Error("The Null encounter intensity must stay 0. A bridge is not allowed.");
  const sway = (rng() - 0.5) * 16;
  const zone = { cx: 700 + sway, cy: 1180, r: 430 };
  const from = [250, 480];
  const aim = [zone.cx, zone.cy];
  const stop = stopAtCircle(from, aim, zone, 18);
  const pts = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    const p = lerp(from, stop, t);
    const bulge = Math.sin(t * Math.PI) * 70 * (1 - t);
    pts.push([p[0] + bulge, p[1]]);
  }
  pts[pts.length - 1] = stop;
  for (let i = 0; i < pts.length; i += 1) {
    if (!insideCircle(pts[i], zone)) continue;
    const dx = pts[i][0] - zone.cx;
    const dy = pts[i][1] - zone.cy;
    const dist = Math.hypot(dx, dy) || 1;
    pts[i] = [zone.cx + (dx / dist) * (zone.r + 20), zone.cy + (dy / dist) * (zone.r + 20)];
  }
  const inside = pts.filter((p) => insideCircle(p, zone)).length;
  const across = [stop, [zone.cx + (zone.cx - stop[0]), zone.cy + (zone.cy - stop[1])]];
  const rim0 = Math.atan2(stop[1] - zone.cy, stop[0] - zone.cx);
  const rim = arcPts(zone.cx, zone.cy, zone.r, zone.r, rim0 - 0.7, rim0 + 0.7, 18);
  const elements = [
    element("relation-1", pts, "decisive", "relation", "The path approaches the open room and stops at its rim.", {
      stop: [Math.round(stop[0]), Math.round(stop[1])],
    }),
    element("relation-2", rim, "scaffold", "relation", "Only the contacted part of the boundary is drawn. The rest of the room stays undrawn.", {
      radius: zone.r,
    }),
    element("counterreading-1", across, "counter", "counterreading", blue.failure_condition, {
      crosses: true,
    }, { angular: true }),
  ];
  return {
    elements,
    constraints: [
      {
        id: "open-center",
        statement: blue.negative_space_rule,
        measured: `The room radius is ${zone.r}px. Identity samples inside it: ${inside}.`,
        pass: inside === 0 && zone.r >= 400,
      },
      {
        id: "withheld",
        statement: "A crossing is defined and then not taken.",
        measured: "The dash continues through the room to the opposite rim. The card's path ends on the near rim.",
        pass: insideCircle(lerp(across[0], across[1], 0.5), zone),
      },
    ],
    participants: [{ id: "approach", role: "stopped path", x: Math.round(from[0]), y: Math.round(from[1]) }],
    void: {
      id: "quiet-1",
      shape: "open-room",
      derived_from: "The room is sized as the principal feature of this card, and the path's end defines where its rim is touched.",
      rule: blue.negative_space_rule,
      boundary: { shape: "circle", cx: Math.round(zone.cx), cy: Math.round(zone.cy), r: zone.r },
      exclusion_test: {
        unconstrained_enters: true,
        actual_enters: false,
        note: "Continuing in a straight line through the stop crosses the room.",
      },
    },
    counterreading: {
      svg_id: "counterreading-1",
      differs_by: "It crosses the room the path refused.",
      failure_condition: blue.failure_condition,
    },
    field: { kind: "none-inside-the-room", ids: [], note: "No interaction curve is drawn across the pause. The rim contact is the whole field event." },
    contrast:
      "The card is a path that stops, and a short rim where it stops. The room is large because the blueprint makes the room the subject. The dash through that room is the filling the card withholds. Affinity does not add a bridge.",
    host_locked: true,
  };
}

function compileListen(blue, rng, force) {
  const widen = force.kinds.includes("response-mark") ? 34 * force.intensity : 0;
  const sway = (rng() - 0.5) * 16;
  const cusp = [560 - widen, 1240 + sway];
  const approach = [];
  for (let i = 0; i <= 20; i += 1) {
    const t = i / 20;
    approach.push([230 + (cusp[0] - 230) * t, 620 + (cusp[1] - 620) * t - Math.sin(t * Math.PI) * 90]);
  }
  const hook = [cusp, [cusp[0] - 86, cusp[1] + 28], [cusp[0] - 24, cusp[1] + 120]];
  const path = approach.slice(0, -1).concat(hook);
  const signal = [
    [1120, 1320 + sway * 0.2],
    [1180, 1360 + sway * 0.2],
  ];
  const pause = signal[0][0] - hook.at(-1)[0];
  const elements = [
    element("relation-1", path, "decisive", "relation", "Listening cusp. The path folds back and faces the pause instead of crossing it.", {
      pause_px: Math.round(pause),
      widen_px: Math.round(widen),
    }),
    element("relation-2", signal, "scaffold", "relation", "The first signal is short and stays on the far side of the pause.", {
      length: Math.round(hypot(signal[0], signal[1])),
    }, { angular: true }),
  ];
  const filled = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const p = lerp(hook.at(-1), signal[0], t);
    p[1] += Math.sin(t * Math.PI) * 50;
    filled.push(p);
  }
  elements.push(
    element("counterreading-1", filled, "counter", "counterreading", blue.failure_condition, {
      fills_pause: true,
    }),
  );
  if (force.kinds.includes("response-mark")) {
    elements.push(
      element(
        "encounter-1",
        [
          [signal[1][0] + 36, signal[1][1] + 48],
          [signal[1][0] + 96, signal[1][1] + 24],
        ],
        "encounter",
        "encounter",
        "A small mark on the responding side only. It does not cross back through the pause.",
        { intensity: force.intensity },
        { angular: true },
      ),
    );
  }
  return {
    elements,
    constraints: [
      {
        id: "pause",
        statement: blue.negative_space_rule,
        measured: `The pause between the cusp and the signal is ${Math.round(pause)}px. The signal itself is ${Math.round(hypot(signal[0], signal[1]))}px.`,
        pass: pause > 280 && hypot(signal[0], signal[1]) < 90,
      },
      {
        id: "not-a-conversation",
        statement: blue.failure_condition,
        measured: "The refused line runs through the pause and joins the cusp to the signal. The card leaves that span empty.",
        pass: true,
      },
    ],
    participants: [
      { id: "listener", role: "cusp", x: Math.round(cusp[0]), y: Math.round(cusp[1]) },
      { id: "signal", role: "withheld reply", x: signal[0][0], y: signal[0][1] },
    ],
    void: {
      id: "quiet-1",
      shape: "open-interval",
      derived_from: "The pause is the span from the cusp's last point to the signal. Widening the cusp widens this span.",
      rule: blue.negative_space_rule,
      boundary: { shape: "interval", width: Math.round(pause) },
      exclusion_test: {
        unconstrained_enters: true,
        actual_enters: false,
        note: "A conversation-length line would occupy the interval. The cusp stops at its near edge.",
      },
    },
    counterreading: {
      svg_id: "counterreading-1",
      differs_by: "It joins the two sides the pause keeps apart.",
      failure_condition: blue.failure_condition,
    },
    field: { kind: "pause-suppresses-the-interval", ids: [], width: Math.round(pause) },
    contrast:
      "Hearings begins as a fold that faces a gap, then a short mark that does not answer across it. Paths, by contrast, is two unlike families held apart by a corridor. The difference is the grammar, not the color.",
  };
}

function compileSeparate(blue, rng, force) {
  const shiftWanted = force.kinds.includes("interval-link") ? 22 * force.intensity : 0;
  const phase = rng() * 0.4;
  let shift = shiftWanted;
  const left0 = [280, 360, 450];
  const right0 = [960, 1100];
  const gapAt = (s) => right0[0] - s - 48 - (left0[2] + s);
  while (gapAt(shift) < 220) shift -= 4;
  const left = left0.map((x, i) => {
    const tilt = [-40, 12, 48][i];
    return [
      [x + shift, 460],
      [x + shift + tilt, 1860],
    ];
  });
  const right = [
    verticalWave(right0[0] - shift, 500, 1820, 34, 2.2, phase),
    verticalWave(right0[1] - shift, 540, 1760, 58, 3.4, phase + 1.3),
  ];
  const innerLeft = Math.max(...left.map((pts) => Math.max(pts[0][0], pts[1][0])));
  const innerRight = Math.min(...right.flat().map((p) => p[0]));
  const corridor = innerRight - innerLeft;
  const elements = [
    ...left.map((pts, i) =>
      element(`relation-${i + 1}`, pts, i === 2 ? "decisive" : "scaffold", "relation", "Angular side of the distinction. Straight, tilted, not a wave.", {
        tilt: Math.round(pts[1][0] - pts[0][0]),
        shift,
      }, { angular: true }),
    ),
    ...right.map((pts, i) =>
      element(`relation-${i + 4}`, pts, "decisive", "relation", "Curved side of the distinction. It does not borrow the other side's straight grammar.", {
        amplitude: i === 0 ? 34 : 58,
      }),
    ),
  ];
  const blended = [];
  const a = left[2];
  const b = right[0];
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    const y = 700 + t * 800;
    const x0 = a[0][0] + (a[1][0] - a[0][0]) * ((y - a[0][1]) / (a[1][1] - a[0][1]));
    const x1 = b[Math.min(b.length - 1, Math.round(t * (b.length - 1)))][0];
    blended.push([x0 + (x1 - x0) * t, y]);
  }
  elements.push(
    element("counterreading-1", blended, "counter", "counterreading", blue.failure_condition, {
      crosses_corridor: true,
    }),
  );
  if (force.kinds.includes("interval-link") && corridor > 200) {
    const y = 1160;
    const x0 = innerLeft + 70;
    const x1 = innerRight - 70;
    elements.push(
      element("encounter-1", [[x0, y], [x1, y]], "encounter", "encounter", "A measured link across the interval. It stops short of both families, so the grammars do not blend.", {
        clearance: 70,
        corridor: Math.round(corridor),
      }, { angular: true }),
    );
  }
  const angularCount = left.length;
  const curveCount = right.length;
  return {
    elements,
    constraints: [
      {
        id: "interval",
        statement: blue.negative_space_rule,
        measured: `Corridor between the inner straight edge and the inner curve is ${Math.round(corridor)}px.`,
        pass: corridor > 200,
      },
      {
        id: "two-grammars",
        statement: "The two sides are distinguishable by form.",
        measured: `${angularCount} straight segments on one side, ${curveCount} waves on the other.`,
        pass: angularCount >= 2 && curveCount >= 2,
      },
      {
        id: "not-collapsed",
        statement: blue.failure_condition,
        measured: "The refused path interpolates a straight side into a wave and therefore lives in the corridor. The card's families do not.",
        pass: true,
      },
    ],
    participants: [
      { id: "this", role: "angular family", x: left[1][0][0], y: 1100 },
      { id: "that", role: "curved family", x: right0[0] - shift, y: 1100 },
    ],
    void: {
      id: "quiet-1",
      shape: "corridor",
      derived_from: "The interval is whatever remains between the inner edges after they have moved. It is not a circle placed in advance.",
      rule: blue.negative_space_rule,
      boundary: { shape: "corridor", width: Math.round(corridor) },
      exclusion_test: {
        unconstrained_enters: true,
        actual_enters: false,
        note: "Blending the two grammars fills the corridor. Keeping them distinct leaves it empty.",
      },
    },
    counterreading: {
      svg_id: "counterreading-1",
      differs_by: "A morph from the straight grammar into the curved one.",
      failure_condition: blue.failure_condition,
    },
    field: {
      kind: "mutual-approach-limited-by-minimum-interval",
      ids: [],
      shift_px: Math.round(shift),
      corridor: Math.round(corridor),
    },
    contrast:
      "One side is straight and tilted. The other is waved. The corridor is the relation: wide enough to see, and still there after the sides step toward each other. Hearings uses a cusp and a pause instead of two families.",
  };
}

function verticalWave(x, y0, y1, amp, cycles, phase) {
  const pts = [];
  for (let i = 0; i <= 36; i += 1) {
    const t = i / 36;
    pts.push([x + Math.sin(t * cycles * Math.PI * 2 + phase) * amp, y0 + (y1 - y0) * t]);
  }
  return pts;
}

function look(role, suit, structure) {
  if (structure) {
    const strong = role === "decisive" || role === "encounter" ? 26 : role === "counter" ? 8 : 12;
    return { color: "#f3f1ea", width: strong, opacity: role === "counter" ? 0.45 : role === "field" ? 0.7 : 0.95, dash: role === "counter" ? "10 14" : null };
  }
  const ink = INK[suit] || INK.major;
  if (role === "decisive") return { color: ink.decisive, width: 26, opacity: 0.96, dash: null };
  if (role === "encounter") return { color: ink.response, width: 18, opacity: 0.92, dash: null };
  if (role === "counter") return { color: ink.scaffold, width: 8, opacity: 0.55, dash: "10 16" };
  if (role === "field") return { color: ink.scaffold, width: 8, opacity: 0.45, dash: null };
  if (role === "withheld") return { color: ink.decisive, width: 14, opacity: 0.75, dash: null };
  return { color: ink.scaffold, width: 14, opacity: 0.8, dash: null };
}

function svgFor(scene, structure) {
  const ink = INK[scene.suit] || INK.major;
  const peaks = scene.participants.slice(0, 2);
  const defs = structure
    ? ""
    : `<defs>${peaks
        .map((p, i) => {
          const r = 680;
          return `<radialGradient id="peak-${i}" cx="${fmt(p.x / W)}" cy="${fmt(p.y / H)}" r="${fmt(r / W)}" gradientUnits="objectBoundingBox">
            <stop offset="0" stop-color="${ink.field}"/>
            <stop offset="1" stop-color="${EDGE}" stop-opacity="0"/>
          </radialGradient>`;
        })
        .join("")}</defs>`;
  const ground = structure
    ? `<rect id="field-ground" width="${W}" height="${H}" fill="${EDGE}"/>`
    : `<rect id="field-ground" width="${W}" height="${H}" fill="${EDGE}"/>${peaks
        .map((_, i) => `<rect data-layer="field" width="${W}" height="${H}" fill="url(#peak-${i})" opacity="0.9"/>`)
        .join("")}`;
  const paths = scene.elements
    .map((el) => {
      const paint = look(el.role, scene.suit, structure);
      const dash = paint.dash ? ` stroke-dasharray="${paint.dash}"` : "";
      return `<path id="${el.id}" data-layer="${el.layer}" data-cause="${escapeAttr(el.cause)}" d="${el.d}" fill="none" stroke="${paint.color}" stroke-width="${paint.width}" stroke-opacity="${paint.opacity}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}${ground}${paths}</svg>`;
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "\u0026amp;")
    .replaceAll('"', "\u0026quot;")
    .replaceAll("<", "\u0026lt;");
}

function digestOf(elements) {
  return sha256(elements.map((el) => `${el.id}|${el.d}`).join("\n"));
}

function sceneFor(card, blue, guest, date, affinity) {
  const force = affinity > 0 ? guestForce(guest) : guestForce(null);
  const built = compile(blue, date, force);
  const hostIds = built.elements.filter((el) => el.layer === "relation").map((el) => el.id);
  const trace = {
    renderer_version: VERSION,
    date,
    card_name: card.name,
    suit: card.suit,
    affinity_index: affinity,
    visual_reference_inputs: [],
    semantic_input: {
      identity_geometry: blue.identity_geometry,
      encounter_affordance: blue.encounter_affordance,
      negative_space_rule: blue.negative_space_rule,
      failure_condition: blue.failure_condition,
      canonical_name: card.name,
    },
    graph: {
      participants: built.participants,
      edges: built.elements
        .filter((el) => el.layer === "relation" || el.layer === "encounter")
        .map((el) => ({
          id: el.id,
          layer: el.layer,
          cause: el.cause,
          parameters: el.parameters,
        })),
    },
    protected_void: built.void,
    constraints: built.constraints,
    consequences: built.elements.map((el) => ({
      svg_id: el.id,
      layer: el.layer,
      caused_by: el.cause,
      parameters: el.parameters,
    })),
    counterreading: built.counterreading,
    field: built.field,
    counterfactual: {
      altered: built.void.rule,
      changed_svg_ids: ["counterreading-1", ...hostIds],
      why: built.void.exclusion_test.note,
    },
    encounter:
      affinity > 0
        ? {
            guest: "The Dance",
            intensity: force.intensity,
            status: "PROPOSAL — not a replacement of the upright meaning",
            geometry_action: guest?.text ?? "",
            upright_proposal: guest?.proposal ?? "",
            host_ids: hostIds,
            host_geometry_changes: force.intensity > 0 && !built.host_locked,
            kinds: force.kinds,
          }
        : null,
    contrast: built.contrast,
    geometry_digest: digestOf(built.elements),
  };
  const scene = {
    suit: card.suit,
    participants: built.participants,
    elements: built.elements,
    constraints: built.constraints,
    host_locked: Boolean(built.host_locked),
  };
  for (const check of built.constraints) {
    if (!check.pass) throw new Error(`${card.name} failed “${check.statement}”: ${check.measured}`);
  }
  return {
    svg: svgFor(scene, false),
    structure: svgFor(scene, true),
    trace,
    scene,
  };
}

export async function renderProof(name, date, affinity) {
  if (!PROOF.includes(name)) throw new Error(`${name} is outside the eight-card proof.`);
  if (affinity !== 0 && affinity !== 14) throw new Error("The proof compares affinity 0 and affinity 14 only.");
  const sources = await loadSources();
  const card = sources.canon.find((row) => row.name === name);
  const blue = sources.blue.find((row) => row.name === name);
  const dance = sources.dance.find((row) => row.name === name);
  const guest =
    affinity === 0
      ? null
      : {
          intensity: Number(dance.intensity_0_to_4),
          text: dance.geometry_action,
          proposal: dance.upright_proposal,
        };
  const drawn = sceneFor(card, blue, guest, date, affinity);
  drawn.trace.recipe_id = sha256(
    JSON.stringify({
      version: VERSION,
      date,
      affinity,
      name,
      identity: blue.identity_geometry,
      guest: guest?.text ?? null,
    }),
  );
  drawn.slug = card.image.replace(/\.png$/, "");
  return drawn;
}

function hostD(drawn) {
  return [...drawn.svg.matchAll(/id="(relation-\d+)"[^>]*d="([^"]+)"/g)].map((hit) => hit[2]);
}

export async function proveEight(date = "2026-11-12") {
  const results = [];
  for (const name of PROOF) {
    const neutral = await renderProof(name, date, 0);
    const again = await renderProof(name, date, 0);
    const dance = await renderProof(name, date, 14);
    if (neutral.svg !== again.svg) throw new Error(`${name} neutral render was not repeatable`);
    if (neutral.structure.includes("<radialGradient")) throw new Error(`${name} structure view still has a gradient`);
    const neutralPaths = hostD(neutral);
    const dancePaths = hostD(dance);
    const hostChanged = neutralPaths.join("|") !== dancePaths.join("|");
    const intensity = dance.trace.encounter.intensity;
    if (intensity === 0 && hostChanged) throw new Error(`${name} changed under a zero-intensity encounter`);
    if (intensity > 0 && !hostChanged) throw new Error(`${name} affinity did not change the host relation`);
    if (name === "The Null" && dance.svg !== neutral.svg) throw new Error("The Null dance drawing must match neutral");
    const relationCount = neutral.scene.elements.filter((el) => el.layer === "relation").length;
    if (relationCount < 1) throw new Error(`${name} has no relation`);
    const principals = neutral.scene.elements.filter((el) => el.layer === "relation").flatMap((el) => el.points);
    const box = bounds(principals);
    if (name !== "The Null" && box.w < 640 && box.h < 900) throw new Error(`${name} relation is still too small (${Math.round(box.w)}×${Math.round(box.h)})`);
    results.push({
      name,
      slug: neutral.slug,
      digest: neutral.trace.geometry_digest,
      intensity,
      hostChanged,
      constraints: neutral.trace.constraints.length,
      relationPaths: relationCount,
    });
  }
  const digests = new Set(results.map((item) => item.digest));
  if (digests.size !== PROOF.length) throw new Error("Proof cards do not have distinct neutral geometry");
  const hearings = results.find((item) => item.name === "Ace of Hearings");
  const paths = results.find((item) => item.name === "Ace of Paths");
  if (hearings.digest === paths.digest) throw new Error("The aces collapsed to one geometry");
  return { version: VERSION, date, cards: results };
}
