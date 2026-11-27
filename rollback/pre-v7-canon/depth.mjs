// @ts-nocheck
/**
 * Relational depth renderer.
 * Version: relational-encounter-3-depth
 *
 * Primary geometry, derived families, and the field all come from one graph.
 * No image, prior card, or workbench render is read.
 * This module is the deck generator. The eight hand-built graphs stay exact.
 * Every other card is compiled from its own blueprint into the same pipeline:
 * a relation, a derived family, a field sampled from those charges, and a
 * counterreading that is a different event. Affinity edits the host graph.
 * No image, prior card, or workbench render is read.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import sharp from "sharp";
import { loadSources } from "./encounter2.mjs";

export const VERSION = "relational-encounter-3-depth";
const W = 1400;
const H = 2300;
const EDGE = "#07080c";

const PROOF = [
  "The Shuffle",
  "The Velomere",
  "The Witness",
  "The Stranger",
  "The Ache",
  "The Dance",
  "The Movement",
  "The Null",
];

const TINT = {
  branch: ["#e4c27a", "#7f9cb0"],
  orbit: ["#e4c27a", "#d7c4de"],
  witness: ["#d5e2ea", "#e4c27a"],
  stranger: ["#cbb892", "#6e9098"],
  ache: ["#e7b0a0", "#8d7452"],
  dance: ["#e4c27a", "#9eb89a"],
  frames: ["#d9c4a4", "#e4c27a"],
  withhold: ["#8a8178"],
  relation: ["#e6c98a", "#7f9aa8"],
};

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : Buffer.from(value)).digest("hex");
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
  if (angular || points.length < 4) return `M ${points.map(f).join(" L ")}${close ? " Z" : ""}`;
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

function arcPts(cx, cy, rx, ry, a0, a1, n = 36) {
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

function inside(p, zone) {
  if (!zone || zone.shape === "none") return false;
  if (zone.shape === "circle") return Math.hypot(p[0] - zone.cx, p[1] - zone.cy) < zone.r - 1;
  if (zone.shape === "interval") return p[0] > zone.x0 && p[0] < zone.x1 && Math.abs(p[1] - zone.y) < zone.half;
  if (zone.shape === "corridor") return p[1] > zone.y0 && p[1] < zone.y1 && p[0] > zone.x0 && p[0] < zone.x1;
  return false;
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
  if (/orbital contours/i.test(identity)) return "orbit";
  if (/observational arcs/i.test(identity)) return "witness";
  if (/discontinuous contour/i.test(identity)) return "stranger";
  if (/reaching arc/i.test(identity)) return "ache";
  if (/independently paced strands/i.test(identity)) return "dance";
  if (/Successive frames/i.test(identity)) return "frames";
  if (/stopped path bordering/i.test(identity)) return "withhold";
  return "relation";
}

function guestForce(guest) {
  if (!guest || Number(guest.intensity) === 0) {
    return { intensity: 0, kinds: [], text: guest?.text ?? "", proposal: guest?.proposal ?? "", name: guest?.name ?? null, anchor: null };
  }
  const text = guest.text || "";
  const kinds = [];
  if (/only two react|misalign/i.test(text)) kinds.push("partial-reaction");
  if (/interstitial|reciprocally deform|no fusion/i.test(text)) kinds.push("third-interval");
  if (/off-axis return|correction rather than possession/i.test(text)) kinds.push("correction-stroke");
  if (/autonomous orientation|partly veiled/i.test(text)) kinds.push("far-autonomy");
  if (/slower response|forced closure|inbound/i.test(text)) kinds.push("unclosed-response");
  if (/third rhythm|between beats/i.test(text)) kinds.push("emergent-beat");
  if (/next radius|nonconcentric/i.test(text)) kinds.push("radius-change");
  if (!kinds.length) {
    if (/separat|apart|refus|void|unentered|withhold/i.test(text)) kinds.push("host-repel");
    else if (/orbit|around|phase|cycle|rhythm/i.test(text)) kinds.push("host-phase");
    else kinds.push("host-bend");
  }
  const rng = mulberry32(sha256(`guest|${guest.name || ""}|${text}`));
  const anchor = [260 + rng() * 880, 420 + rng() * 1400];
  return { intensity: Number(guest.intensity), kinds: [...new Set(kinds)], text, proposal: guest.proposal || "", name: guest.name || null, anchor };
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
    parent: flags.parent ?? null,
    echo: Boolean(flags.echo),
    curvature: Boolean(flags.curvature),
    angular: Boolean(flags.angular),
  };
}

function meanShift(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += hypot(a[i], b[i]);
  return sum / n;
}

function compile(blue, date, force, mask) {
  const kind = structureOf(blue.identity_geometry);
  const rng = mulberry32(sha256(`depth|${VERSION}|${date}|${blue.identity_geometry}`));
  const built = {
    branch: compileBranch,
    orbit: compileOrbit,
    witness: compileWitness,
    stranger: compileStranger,
    ache: compileAche,
    dance: compileDance,
    frames: compileFrames,
    withhold: compileWithhold,
    relation: compileRelation,
  }[kind](blue, rng, force, mask);
  const special = ["partial-reaction", "third-interval", "correction-stroke", "far-autonomy", "unclosed-response", "emergent-beat", "radius-change"];
  const consumed = force.kinds.some((item) => special.includes(item));
  if (force.intensity > 0 && (kind === "relation" || kind === "withhold" || !consumed)) bendHost(built, force);
  built.kind = kind;
  return built;
}

function compileBranch(blue, rng, force, mask) {
  const origin = [700, 520];
  const angles = [1.02, 1.46, 2.08, 2.58].map((angle, i) => angle + (rng() - 0.5) * 0.05 + i * 0.01);
  const privileged = angles.map((angle, index) => ({ index, delta: Math.abs(angle - Math.PI / 2) })).sort((a, b) => a.delta - b.delta)[0].index;
  const selectedLengths = [840, 980, 700];
  let cursor = 0;
  const branches = angles.map((angle, index) => {
    const unselected = index === privileged;
    const len = unselected && mask ? 340 : unselected ? selectedLengths[0] : selectedLengths[cursor++];
    const pts = [];
    const steps = 18;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const used = unselected && mask ? t * (len / (selectedLengths[1] || 980)) : t;
      pts.push([origin[0] + Math.cos(angle) * (unselected && mask ? len : len) * (unselected && mask ? t : t), origin[1] + Math.sin(angle) * len * t]);
      void used;
    }
    return { index, angle, len, pts, unselected: unselected && mask };
  });
  const selected = branches.filter((branch) => !branch.unselected);
  for (const branch of selected) {
    const end = branch.pts.at(-1);
    let px = 0;
    let py = 0;
    for (const other of selected) {
      if (other === branch) continue;
      const o = other.pts.at(-1);
      const dx = end[0] - o[0];
      const dy = end[1] - o[1];
      const dist = Math.hypot(dx, dy) || 1;
      const mag = 120 * Math.min(1, 340 / dist);
      px += (dx / dist) * mag;
      py += (dy / dist) * mag;
    }
    branch.pts.forEach((p, k) => {
      const w = (k / (branch.pts.length - 1)) ** 2;
      p[0] += px * w;
      p[1] += py * w;
    });
  }
  const reacted = new Set();
  if (force.kinds.includes("partial-reaction")) {
    const guest = [1140, 1620];
    const ranked = [...selected].sort((a, b) => hypot(a.pts.at(-1), guest) - hypot(b.pts.at(-1), guest));
    ranked.slice(0, 2).forEach((branch) => {
      reacted.add(branch.index);
      const end = branch.pts.at(-1);
      const dx = guest[0] - end[0];
      const dy = guest[1] - end[1];
      const dist = Math.hypot(dx, dy) || 1;
      const mag = 40 * force.intensity;
      branch.pts.forEach((p, k) => {
        const w = (k / (branch.pts.length - 1)) ** 1.3;
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
      branch.unselected ? "This opening is stopped early because it is the nearest to a straight descent." : "This opening is bent by the other selected endings.",
      { unselected: branch.unselected, length: Math.round(branch.len), reacted: reacted.has(branch.index) },
      { curvature: true, echo: !branch.unselected },
    ),
  );
  const tree = [];
  for (const branch of branches) tree.push(origin, branch.pts.at(-1), [700, 1900]);
  elements.push(element("counterreading-1", tree, "counter", "counterreading", blue.failure_condition, { joins: true }, { angular: true }));
  const short = branches.find((branch) => branch.index === privileged);
  const longest = Math.max(...branches.filter((branch) => branch.index !== privileged || !mask).map((branch) => branch.len));
  return {
    elements,
    participants: [{ id: "origin", role: "departure", x: origin[0], y: origin[1], charge: 1 }, ...branches.map((b) => ({ id: `end-${b.index + 1}`, role: b.unselected ? "unselected" : "selected", x: b.pts.at(-1)[0], y: b.pts.at(-1)[1], charge: b.unselected ? 0.25 : 1 }))],
    zone: { shape: "none" },
    constraints: [
      { id: "unselected", statement: blue.negative_space_rule, measured: mask ? `Short opening is ${Math.round((short.len / longest) * 100)}% of a full opening.` : "Mask off: the obvious opening is allowed to finish.", pass: mask ? short.len / longest < 0.55 : short.len / longest > 0.8 },
    ],
    counterreading: { svg_id: "counterreading-1", differs_by: "Every opening, including the short one, is finished at one terminal.", failure_condition: blue.failure_condition },
    contrast: "One decision leaves intervals. The obvious route stays short, and only the routes that were not chosen push each other aside. Weaker lines appear where those endings actually bend.",
  };
}

function compileOrbit(blue, rng, force, mask) {
  const phase = (rng() - 0.5) * 0.4 + (force.kinds.includes("third-interval") ? 0.05 * force.intensity : 0);
  const bow = 64 + (force.kinds.includes("third-interval") ? 18 * force.intensity : 0);
  const a = { x: 460, y: 1000 };
  const b = { x: 980, y: 1320 };
  if (!mask) {
    const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    a.x = mid[0] - 40;
    a.y = mid[1];
    b.x = mid[0] + 40;
    b.y = mid[1];
  }
  const orbitA = arcPts(a.x, a.y, 250, 190, 0.2 + phase, 4.4 + phase);
  const orbitB = arcPts(b.x, b.y, 210, 280, 2.2 - phase * 0.5, 5.6 - phase * 0.5);
  const lens = lensCurve(a, b, mask ? bow : 0);
  const elements = [
    element("relation-1", orbitA, "decisive", "relation", "First orbital contour. Its center is not the other center.", { center: [a.x, a.y] }, { curvature: true }),
    element("relation-2", orbitB, "decisive", "relation", "Second orbital contour, different radius and phase.", { center: [b.x, b.y] }, { curvature: true }),
    element("relation-3", lens, mask ? "scaffold" : "decisive", "relation", mask ? "Third interval: where the two fields are both present, and neither core." : "Without the separation rule the interval collapses through both centers.", { bow: Math.round(bow), mask }, { echo: true, curvature: true }),
  ];
  elements.push(element("counterreading-1", arcPts((a.x + b.x) / 2, (a.y + b.y) / 2, 160, 160, 0, Math.PI * 2, 28), "counter", "counterreading", blue.failure_condition, { merged: true }, { close: true }));
  const separation = Math.hypot(a.x - b.x, a.y - b.y);
  return {
    elements,
    participants: [
      { id: "center-a", role: "first whole", x: a.x, y: a.y, charge: 1.1 },
      { id: "center-b", role: "second whole", x: b.x, y: b.y, charge: 0.9 },
    ],
    zone: { shape: "none", keepCenters: true },
    constraints: [
      { id: "two-centers", statement: blue.negative_space_rule, measured: `Centers are ${Math.round(separation)}px apart.`, pass: mask ? separation > 400 : separation < 120 },
    ],
    counterreading: { svg_id: "counterreading-1", differs_by: "A single circle replaces the two orbits.", failure_condition: blue.failure_condition },
    contrast: "Two contours keep their own centers. The curve between them exists only where both fields reach, and it does not become a third orbit around a blended middle.",
  };
}

function lensCurve(a, b, bow) {
  const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const pts = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const along = (t - 0.5) * Math.min(len * 0.62, 280);
    const side = Math.sin(t * Math.PI) * bow;
    pts.push([mid[0] + (dx / len) * along + px * side, mid[1] + (dy / len) * along + py * side]);
  }
  return pts;
}

function compileWitness(blue, rng, force, mask) {
  const jitter = (rng() - 0.5) * 20;
  const a = { x: 440, y: 860 + jitter };
  const b = { x: 1000, y: 1420 - jitter * 0.3 };
  const arcA = arcPts(a.x, a.y, 240, 180, -0.4, 2.2);
  const arcB = arcPts(b.x, b.y, 200, 270, 2.6, 5.5);
  const zone = { shape: "circle", cx: b.x, cy: b.y, r: 150 };
  let start = arcA[0];
  for (const p of arcA) if (hypot(p, [b.x, b.y]) < hypot(start, [b.x, b.y])) start = p;
  const separation = Math.hypot(b.x - a.x, b.y - a.y);
  const correction = 0.36 + separation / 2400 + (force.kinds.includes("correction-stroke") ? 0.14 * force.intensity : 0);
  const aim = Math.atan2(b.y - start[1], b.x - start[0]) + (mask ? correction : 0);
  const far = [start[0] + Math.cos(aim) * 1800, start[1] + Math.sin(aim) * 1800];
  const stop = mask ? stopAtCircle(start, far, zone, 26) : [b.x, b.y];
  const sight = [];
  for (let i = 0; i <= 12; i += 1) sight.push(lerp(start, stop, i / 12));
  const occupy = Math.hypot(stop[0] - zone.cx, stop[1] - zone.cy);
  const elements = [
    element("relation-1", arcA, "scaffold", "relation", "Observer arc.", { center: [a.x, a.y] }, { curvature: true }),
    element("relation-2", arcB, "scaffold", "relation", "Observed arc, offset from the first.", { center: [b.x, b.y] }, { curvature: true }),
    element("relation-3", sight, "decisive", "relation", mask ? "Sightline corrected by the distance between the arcs, stopped outside the center." : "Mask off: the sightline is allowed to occupy the center.", { correction: Number(correction.toFixed(3)), end: Math.round(occupy) }, { echo: true, curvature: true }),
  ];
  elements.push(element("counterreading-1", [start, [b.x, b.y]], "counter", "counterreading", blue.failure_condition, { occupies: true }, { angular: true }));
  if (force.kinds.includes("correction-stroke")) {
    const px = -Math.sin(aim);
    const py = Math.cos(aim);
    elements.push(element("encounter-1", [stop, [stop[0] + px * 80, stop[1] + py * 80], [stop[0] + px * 150 - Math.cos(aim) * 30, stop[1] + py * 150 - Math.sin(aim) * 30]], "encounter", "encounter", "Off-axis return. It does not enter the witnessed center.", { intensity: force.intensity }));
  }
  return {
    elements,
    participants: [
      { id: "observer", role: "observer", x: a.x, y: a.y, charge: 1 },
      { id: "observed", role: "observed", x: b.x, y: b.y, charge: 1.15 },
    ],
    zone,
    constraints: [
      { id: "exclusion", statement: blue.negative_space_rule, measured: `Sightline ends ${Math.round(occupy)}px from the observed center (radius ${zone.r}).`, pass: mask ? occupy > zone.r : occupy < 8 },
    ],
    counterreading: { svg_id: "counterreading-1", differs_by: "The same start is carried into the center.", failure_condition: blue.failure_condition },
    contrast: "The sightline turns aside by the distance between the two arcs and stops before the center. Faint marks gather around that center without entering it.",
  };
}

function compileStranger(blue, rng, force, mask) {
  const sway = (rng() - 0.5) * 24;
  const thresholdX = 780 + sway;
  const threshold = [];
  for (let i = 0; i <= 26; i += 1) {
    const t = i / 26;
    threshold.push([thresholdX + Math.sin(t * Math.PI) * 28, 380 + t * 1560]);
  }
  const upper = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    upper.push([230 + t * (thresholdX - 300), 780 + Math.sin(t * Math.PI) * -70 + t * 80]);
  }
  if (!mask) {
    const last = upper.at(-1);
    const prev = upper.at(-2);
    const dx = last[0] - prev[0];
    const dy = last[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    for (let s = 1; s <= 6; s += 1) upper.push([last[0] + (dx / len) * s * 46, last[1] + (dy / len) * s * 46]);
  }
  const lower = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    lower.push([300 + t * 260, 1500 + t * 160]);
  }
  let far = null;
  if (force.kinds.includes("far-autonomy")) {
    const mag = 18 * force.intensity;
    for (let i = upper.length - 5; i < upper.length; i += 1) upper[i][0] -= mag * ((i - (upper.length - 5)) / 4);
    far = [];
    for (let i = 0; i <= 16; i += 1) {
      const t = i / 16;
      far.push([thresholdX + 340, 820 + t * 620]);
    }
  }
  const zone = { shape: "interval", x0: thresholdX + 36, x1: thresholdX + (far ? 300 : 420), y: 1180, half: 520 };
  const gap = hypot(upper.at(-1), lower[0]);
  const insideCount = [...upper, ...lower].filter((p) => p[0] > zone.x0 && p[0] < zone.x1).length;
  const elements = [
    element("relation-1", threshold, "scaffold", "relation", "Threshold the contour does not cross.", { x: Math.round(thresholdX) }, { curvature: true }),
    element("relation-2", upper, "decisive", "relation", "Approach that fails at the threshold.", { gap: Math.round(gap) }, { curvature: true, echo: true }),
    element("relation-3", lower, "decisive", "relation", "The contour resumed elsewhere, not joined across the gap.", { gap: Math.round(gap) }),
  ];
  if (far) elements.push(element("encounter-1", far, "encounter", "encounter", "The other side keeps an orientation of its own and does not fill the gap.", { intensity: force.intensity }));
  elements.push(element("counterreading-1", arcPts(zone.x0 + 80, zone.y, 50, 50, 0, Math.PI * 2, 12), "counter", "counterreading", blue.failure_condition, { ornament: true }, { close: true }));
  return {
    elements,
    participants: [
      { id: "approach", role: "approach", x: upper[0][0], y: upper[0][1], charge: 1.2 },
      { id: "threshold", role: "threshold", x: thresholdX, y: 1100, charge: 0.4 },
    ],
    zone,
    constraints: [
      { id: "gap", statement: blue.negative_space_rule, measured: `Pieces are ${Math.round(gap)}px apart. Samples past the threshold: ${insideCount}.`, pass: mask ? gap > 80 && insideCount === 0 : insideCount > 0 },
    ],
    counterreading: { svg_id: "counterreading-1", differs_by: "A small closed ornament is placed in the unnamed side.", failure_condition: blue.failure_condition },
    contrast: "The contour approaches, stops, and resumes out of line. The field crowds before the break and falls off past it. Nothing in the gap is a door.",
  };
}

function compileAche(blue, rng, force, mask) {
  const sway = (rng() - 0.5) * 20;
  const target = [1040, 1280 + sway];
  const pts = [];
  for (let i = 0; i <= 30; i += 1) {
    const t = i / 30;
    const ang = -0.6 + t * 2.8;
    const rad = 460 * (1 - t * 0.62);
    pts.push([560 + Math.cos(ang) * rad * 0.72, 1080 + Math.sin(ang) * rad]);
  }
  const extra = force.kinds.includes("unclosed-response") ? 36 * force.intensity : 0;
  const hold = mask ? 170 + extra : 0;
  const end = pts.at(-1);
  const dx = end[0] - target[0];
  const dy = end[1] - target[1];
  const dist = Math.hypot(dx, dy) || 1;
  const stop = [target[0] + (dx / dist) * hold, target[1] + (dy / dist) * hold];
  if (!mask) pts.push(target);
  else {
    const n = pts.length;
    for (let i = n - 6; i < n; i += 1) {
      const w = (i - (n - 6)) / 5;
      pts[i] = lerp(pts[i], stop, w);
    }
  }
  const gap = hypot(pts.at(-1), target);
  const elements = [
    element("relation-1", pts, "decisive", "relation", "The reach. It tightens toward the other point and stops before contact.", { gap: Math.round(gap) }, { curvature: true, echo: true }),
  ];
  const bands = [];
  for (let i = 0; i < 4; i += 1) {
    const end = lerp(pts.at(-1), target, mask ? 0.22 + i * 0.12 : 1);
    const side = (i - 1.5) * 28;
    bands.push([
      [pts.at(-1)[0], pts.at(-1)[1] + side],
      end,
    ]);
  }
  bands.forEach((band, i) => {
    elements.push(element(`relation-${i + 2}`, band, "scaffold", "relation", "Tension across the interval. Each band dies before the ungrasped point.", { reach: Number((mask ? 0.22 + i * 0.12 : 1).toFixed(2)) }, { angular: true, parent: "relation-1" }));
  });
  if (force.kinds.includes("unclosed-response")) {
    const response = arcPts(target[0] + 80, target[1] + 40, 120, 80, 2.2, 4.4, 16);
    elements.push(element("encounter-1", response, "encounter", "encounter", "A slower response on the far side of the interval. It does not close the reach.", { intensity: force.intensity }, { curvature: true }));
  }
  const grasp = pts.concat([target, [target[0] - 40, target[1] + 30]]);
  elements.push(element("counterreading-1", grasp, "counter", "counterreading", blue.failure_condition, { closes: true }));
  const zone = { shape: "interval", x0: Math.min(pts.at(-1)[0], target[0]) + 10, x1: Math.max(pts.at(-1)[0], target[0]) - 10, y: (pts.at(-1)[1] + target[1]) / 2, half: 90 };
  return {
    elements,
    participants: [
      { id: "reach", role: "reaching", x: pts[0][0], y: pts[0][1], charge: 1.3 },
      { id: "ungrasped", role: "ungrasped", x: target[0], y: target[1], charge: 0.35 },
    ],
    zone,
    constraints: [
      { id: "interval", statement: blue.negative_space_rule, measured: `The reach stops ${Math.round(gap)}px short of the other point.`, pass: mask ? gap > 140 : gap < 8 },
    ],
    counterreading: { svg_id: "counterreading-1", differs_by: "The reach is completed into contact.", failure_condition: blue.failure_condition },
    contrast: "The arc builds and then stops. The bands in the interval get shorter as they near the other point, so the longing is the unfinished distance, not a grasp.",
  };
}

function wave(cycles, phase, amp) {
  return (t) => Math.sin(t * cycles * Math.PI * 2 + phase) * amp;
}

function compileDance(blue, rng, force, mask) {
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  const couple = (mask ? 0.26 : 0.95) + (force.kinds.includes("emergent-beat") ? 0.05 * force.intensity : 0);
  const ownA = wave(1.65, phaseA, 72);
  const ownB = wave(3.2, phaseB, 116);
  const yA = mask ? 960 : 1160;
  const yB = mask ? 1460 : 1220;
  const strand = (y, own, other, k) => {
    const pts = [];
    for (let i = 0; i <= 48; i += 1) {
      const t = i / 48;
      pts.push([190 + t * 1020, y + own(t) + k * other(t)]);
    }
    return pts;
  };
  const aPts = strand(yA, ownA, ownB, couple);
  const bPts = strand(yB, ownB, ownA, couple * 0.7);
  const bare = strand(yA, ownA, ownB, 0);
  const shift = meanShift(aPts, bare);
  let minGap = Infinity;
  for (let i = 0; i < aPts.length; i += 1) minGap = Math.min(minGap, bPts[i][1] - aPts[i][1]);
  const elements = [
    element("relation-1", aPts, "decisive", "relation", "Slower strand. Its shape includes the faster pace.", { coupling: Number(couple.toFixed(3)), shift: Math.round(shift) }, { echo: true, curvature: true }),
    element("relation-2", bPts, "decisive", "relation", "Faster strand. It carries a slower swell from the first.", { cycles: 3.2 }, { echo: true, curvature: true }),
  ];
  if (force.kinds.includes("emergent-beat")) {
    let beats = 0;
    for (let i = 2; i < aPts.length - 2 && beats < 4; i += 1) {
      const gap = bPts[i][1] - aPts[i][1];
      const prev = bPts[i - 1][1] - aPts[i - 1][1];
      const next = bPts[i + 1][1] - aPts[i + 1][1];
      if (gap > prev && gap > next && gap > 160) {
        beats += 1;
        const mid = (aPts[i][1] + bPts[i][1]) / 2;
        elements.push(element(`encounter-${beats}`, [[aPts[i][0], mid - 24], [aPts[i][0], mid + 24]], "encounter", "encounter", "A beat at a local widening. It does not touch either strand.", { gap: Math.round(gap) }, { angular: true, parent: "relation-1" }));
      }
    }
  }
  const mid = (yA + yB) / 2;
  elements.push(element("counterreading-1", aPts.map(([x, y]) => [x, mid + (mid - y)]), "counter", "counterreading", blue.failure_condition, { mirrored: true }));
  return {
    elements,
    participants: [
      { id: "slow", role: "slower pace", x: 700, y: yA, charge: 1 },
      { id: "fast", role: "faster pace", x: 700, y: yB, charge: 1 },
    ],
    zone: { shape: "corridor", x0: 190, x1: 1210, y0: yA + 80, y1: yB - 80 },
    constraints: [
      { id: "gap", statement: blue.negative_space_rule, measured: `Minimum gap ${Math.round(minGap)}px. Coupling moves the slower strand ${Math.round(shift)}px.`, pass: mask ? minGap > 80 && shift > 8 : minGap < 40 },
    ],
    counterreading: { svg_id: "counterreading-1", differs_by: "The slower strand is reflected into the other's lane.", failure_condition: blue.failure_condition },
    contrast: "The two paces are not mirrors. Each line is bent by the other's timing, and the field follows those bends instead of filling the space between them.",
  };
}

function compileFrames(blue, rng, force, mask) {
  const extra = force.kinds.includes("radius-change") ? force.intensity : 0;
  let x = 240;
  let y = 440 + (rng() - 0.5) * 16;
  let ang = 0.2;
  const frames = [];
  const gaps = [];
  for (let i = 0; i < 4; i += 1) {
    const turn = 0.56 + i * 0.07 + extra * 0.04 * i;
    const len = 400 * (1 + extra * 0.045 * i);
    const pts = [];
    for (let s = 0; s <= 16; s += 1) {
      const t = s / 16;
      const a = ang + turn * t * t;
      pts.push([x + Math.cos(a) * len * t, y + Math.sin(a) * len * t]);
    }
    frames.push(pts);
    const end = pts.at(-1);
    const aEnd = ang + turn;
    const gap = mask ? 84 : 0;
    gaps.push(gap);
    x = end[0] + Math.cos(aEnd) * gap;
    y = end[1] + Math.sin(aEnd) * gap;
    ang = aEnd;
  }
  const elements = frames.map((pts, i) =>
    element(`relation-${i + 1}`, pts, i === 3 ? "decisive" : "scaffold", "relation", i === 0 ? "First moment of the line." : "Later moment. Its turn is inherited, then increased.", { index: i + 1, gap_before: gaps[i] ? gaps[i - 1] || gaps[i] : 0 }, { echo: true, curvature: true }),
  );
  const streaks = [];
  let sx = 320;
  let sy = 760;
  for (let i = 0; i < 5; i += 1) {
    const a = rng() * Math.PI * 2;
    streaks.push([sx, sy], [sx + Math.cos(a) * 80, sy + Math.sin(a) * 70]);
    sx += 130;
    sy += 70;
  }
  elements.push(element("counterreading-1", streaks, "counter", "counterreading", blue.failure_condition, { random: true }, { angular: true }));
  return {
    elements,
    participants: frames.map((pts, i) => ({ id: `frame-${i + 1}`, role: "moment", x: pts[0][0], y: pts[0][1], charge: 0.6 + i * 0.25 })),
    zone: { shape: "none" },
    constraints: [
      { id: "intervals", statement: blue.negative_space_rule, measured: mask ? `Gaps of ${gaps.slice(0, 3).join(", ")}px sit between the four moments.` : "Mask off: the moments are joined without a gap.", pass: mask ? gaps.every((g) => g >= 70) : gaps.every((g) => g === 0) },
    ],
    counterreading: { svg_id: "counterreading-1", differs_by: "Five streaks with no inherited direction.", failure_condition: blue.failure_condition },
    contrast: "One line is revised four times. Later moments are longer and more charged, and the gaps between them stay empty. The field brightens toward the latest moment.",
  };
}

function compileWithhold(blue, rng, force, mask) {
  void force;
  const sway = (rng() - 0.5) * 12;
  const zone = { shape: "circle", cx: 700 + sway, cy: 1180, r: 420 };
  const from = [260, 500];
  const stop = stopAtCircle(from, [zone.cx, zone.cy], zone, 16);
  const pts = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const p = lerp(from, mask ? stop : [zone.cx, zone.cy], t);
    pts.push([p[0] + Math.sin(t * Math.PI) * 40 * (1 - t), p[1]]);
  }
  if (mask) pts[pts.length - 1] = stop;
  const rim0 = Math.atan2(stop[1] - zone.cy, stop[0] - zone.cx);
  const rim = arcPts(zone.cx, zone.cy, zone.r, zone.r, rim0 - 0.55, rim0 + 0.55, 14);
  const elements = [
    element("relation-1", pts, "decisive", "relation", "A path that stops at the rim of the open room.", { sparse: true }),
    element("relation-2", rim, "scaffold", "relation", "Only the touched part of the rim is drawn.", { radius: zone.r }),
    element("counterreading-1", [stop, [zone.cx + (zone.cx - stop[0]), zone.cy + (zone.cy - stop[1])]], "counter", "counterreading", blue.failure_condition, { crosses: true }, { angular: true }),
  ];
  const insideCount = pts.filter((p) => inside(p, zone)).length;
  return {
    elements,
    participants: [{ id: "approach", role: "stopped path", x: from[0], y: from[1], charge: 0.5 }],
    zone,
    sparse: true,
    constraints: [
      { id: "open", statement: blue.negative_space_rule, measured: `Room radius ${zone.r}. Samples inside: ${insideCount}.`, pass: mask ? insideCount === 0 : insideCount > 0 },
    ],
    counterreading: { svg_id: "counterreading-1", differs_by: "A line continues through the room.", failure_condition: blue.failure_condition },
    contrast: "The room is the card. One path stops on a short rim. No secondary family and no field are added inside it. The dash is the filling that was refused.",
  };
}

function curvatureFamily(points) {
  const out = [];
  for (let i = 2; i < points.length - 2; i += 1) {
    const a = Math.atan2(points[i][1] - points[i - 2][1], points[i][0] - points[i - 2][0]);
    const b = Math.atan2(points[i + 2][1] - points[i][1], points[i + 2][0] - points[i][0]);
    let turn = b - a;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const mag = Math.min(48, Math.abs(turn) * 160);
    if (mag < 5) continue;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const sign = turn < 0 ? -1 : 1;
    out.push([points[i][0] + nx * mag * sign, points[i][1] + ny * mag * sign]);
  }
  return out.length >= 4 ? out : [];
}

function delayEcho(points) {
  if (points.length < 12) return [];
  const start = Math.floor(points.length * 0.4);
  const origin = points[0];
  return points.slice(start).map((p) => lerp(origin, p, 0.78));
}

function derive(built) {
  if (built.sparse) return [];
  const extra = [];
  let n = 0;
  for (const el of built.elements) {
    if (el.layer !== "relation" || el.role === "withheld") continue;
    if (el.curvature) {
      const pts = curvatureFamily(el.points);
      if (pts.length >= 4) {
        n += 1;
        extra.push(element(`secondary-${n}`, pts, "secondary", "secondary", "Offset where this path actually turns. Straight portions leave no companion.", { parent: el.id, transform: "curvature-normal", max_offset: 42 }, { parent: el.id }));
      }
    }
    if (el.echo) {
      const pts = delayEcho(el.points);
      if (pts.length >= 4) {
        n += 1;
        extra.push(element(`secondary-${n}`, pts, "secondary", "secondary", "A shorter recall of the later part of this path, pulled toward its start.", { parent: el.id, transform: "delay-0.40-scale-0.78" }, { parent: el.id }));
      }
    }
  }
  return extra;
}

function fieldOf(built, elements) {
  if (built.sparse) {
    return { peaks: [], isolines: [], samples: [], kind: "suppressed", note: "The open room keeps the field from being filled." };
  }
  const sources = elements.filter((el) => el.layer === "relation" && el.role !== "withheld");
  const samples = [];
  for (const el of sources) {
    for (let i = 0; i < el.points.length; i += 2) samples.push({ p: el.points[i], charge: el.role === "decisive" ? 1 : 0.55 });
  }
  for (const node of built.participants) samples.push({ p: [node.x, node.y], charge: node.charge ?? 1 });
  const origin = { x: 160, y: 220 };
  const step = 32;
  const cols = 34;
  const rows = 58;
  const grid = [];
  let max = 0.0001;
  for (let j = 0; j < rows; j += 1) {
    const row = [];
    for (let i = 0; i < cols; i += 1) {
      const x = origin.x + i * step;
      const y = origin.y + j * step;
      let v = 0;
      for (const sample of samples) {
        const d = Math.hypot(x - sample.p[0], y - sample.p[1]) + 28;
        v += sample.charge * Math.exp(-d / 220);
      }
      if (built.participants.length >= 2) {
        const a = built.participants[0];
        const b = built.participants[1];
        const da = Math.exp(-(Math.hypot(x - a.x, y - a.y) + 28) / 260);
        const db = Math.exp(-(Math.hypot(x - b.x, y - b.y) + 28) / 260);
        v += 0.85 * Math.sqrt(da * db);
      }
      if (inside([x, y], built.zone)) v *= 0.04;
      row.push(v);
      if (v > max) max = v;
    }
    grid.push(row);
  }
  const peaks = [];
  for (let j = 1; j < rows - 1; j += 1) {
    for (let i = 1; i < cols - 1; i += 1) {
      const v = grid[j][i];
      if (v < max * 0.72) continue;
      const local = v >= grid[j][i - 1] && v >= grid[j][i + 1] && v >= grid[j - 1][i] && v >= grid[j + 1][i];
      if (!local) continue;
      const x = origin.x + i * step;
      const y = origin.y + j * step;
      if (inside([x, y], built.zone)) continue;
      peaks.push({ x, y, v: v / max });
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const kept = peaks.slice(0, 3);
  const isolines = stitch(march(grid, cols, rows, origin, step, max * 0.48))
    .filter((line) => line.length > 8)
    .slice(0, 3)
    .map((line) => line.filter((p) => !inside(p, built.zone)));
  const dots = [];
  for (let j = 0; j < rows && dots.length < 64; j += 3) {
    for (let i = (j % 2) * 2; i < cols && dots.length < 64; i += 4) {
      const v = grid[j][i] / max;
      if (v < 0.33 || v > 0.7) continue;
      const x = origin.x + i * step;
      const y = origin.y + j * step;
      if (inside([x, y], built.zone)) continue;
      dots.push([x, y]);
    }
  }
  return { peaks: kept, isolines, samples: dots, kind: "anchors-plus-interference", max };
}

function march(grid, cols, rows, origin, step, level) {
  const segs = [];
  const at = (i, j) => [origin.x + i * step, origin.y + j * step];
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const v = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
      let idx = 0;
      for (let k = 0; k < 4; k += 1) if (v[k] >= level) idx |= 1 << k;
      if (idx === 0 || idx === 15) continue;
      const interp = (va, vb, a, b) => {
        const t = (level - va) / ((vb - va) || 1e-6);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      };
      const e = [
        interp(v[0], v[1], at(i, j), at(i + 1, j)),
        interp(v[1], v[2], at(i + 1, j), at(i + 1, j + 1)),
        interp(v[2], v[3], at(i + 1, j + 1), at(i, j + 1)),
        interp(v[3], v[0], at(i, j + 1), at(i, j)),
      ];
      const table = { 1: [3, 0], 2: [0, 1], 3: [3, 1], 4: [1, 2], 6: [0, 2], 7: [3, 2], 8: [2, 3], 9: [2, 0], 11: [2, 1], 12: [1, 3], 13: [1, 0], 14: [0, 3] };
      const pairs = table[idx];
      if (!pairs) continue;
      segs.push([e[pairs[0]], e[pairs[1]]]);
    }
  }
  return segs;
}

function stitch(segs) {
  const unused = segs.map((seg) => [seg[0], seg[1]]);
  const lines = [];
  while (unused.length) {
    let line = unused.pop();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = unused.length - 1; i >= 0; i -= 1) {
        const [a, b] = unused[i];
        if (hypot(line.at(-1), a) < 8) {
          line.push(b);
          unused.splice(i, 1);
          grew = true;
        } else if (hypot(line.at(-1), b) < 8) {
          line.push(a);
          unused.splice(i, 1);
          grew = true;
        }
      }
    }
    if (line.length > 4) lines.push(line);
  }
  lines.sort((a, b) => b.length - a.length);
  return lines;
}

function look(role, tint, structure) {
  if (structure) {
    const width = role === "decisive" || role === "encounter" ? 24 : role === "secondary" ? 8 : role === "counter" ? 7 : role === "field" ? 4 : 12;
    return { color: "#f3f1ea", width, opacity: role === "counter" ? 0.4 : role === "field" ? 0.55 : role === "secondary" ? 0.7 : 0.95, dash: role === "counter" ? "8 12" : null };
  }
  const color = role === "encounter" ? tint[1] || tint[0] : role === "secondary" || role === "field" ? tint[1] || tint[0] : tint[0];
  if (role === "decisive") return { color, width: 24, opacity: 0.96, dash: null };
  if (role === "encounter") return { color: tint[1] || tint[0], width: 16, opacity: 0.9, dash: null };
  if (role === "secondary") return { color, width: 8, opacity: 0.62, dash: null };
  if (role === "field") return { color, width: 4, opacity: 0.45, dash: null };
  if (role === "counter") return { color: tint[1] || tint[0], width: 7, opacity: 0.42, dash: "9 14" };
  if (role === "withheld") return { color, width: 12, opacity: 0.7, dash: null };
  return { color, width: 12, opacity: 0.78, dash: null };
}

function escapeAttr(value) {
  return String(value).replaceAll("&", "\u0026amp;").replaceAll('"', "\u0026quot;").replaceAll("<", "\u0026lt;");
}

function sceneSvg(built, elements, field, structure, layers) {
  const tint = built.ink || TINT[built.kind] || TINT.relation;
  const showSecondary = layers.secondary !== false;
  const showField = layers.field !== false;
  const showCounter = layers.counter !== false;
  const drawn = elements.filter((el) => {
    if (el.layer === "secondary" && !showSecondary) return false;
    if (el.layer === "counterreading" && !showCounter) return false;
    if (el.layer === "field" && !showField) return false;
    return true;
  });
  const peaks = showField && !structure ? field.peaks : [];
  const defs = peaks.length
    ? `<defs>${peaks
        .map((peak, i) => `<radialGradient id="peak-${i}" cx="${fmt(peak.x / W)}" cy="${fmt(peak.y / H)}" r="${fmt((180 + peak.v * 420) / W)}" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="${tint[i % tint.length]}" stop-opacity="0.55"/><stop offset="1" stop-color="${EDGE}" stop-opacity="0"/></radialGradient>`)
        .join("")}</defs>`
    : "";
  const ground = `<rect id="field-ground" width="${W}" height="${H}" fill="${EDGE}"/>${peaks.map((_, i) => `<rect data-layer="field" width="${W}" height="${H}" fill="url(#peak-${i})"/>`).join("")}`;
  const paths = drawn
    .map((el) => {
      const paint = look(el.role, tint, structure);
      const dash = paint.dash ? ` stroke-dasharray="${paint.dash}"` : "";
      return `<path id="${el.id}" data-layer="${el.layer}" data-cause="${escapeAttr(el.cause)}" d="${el.d}" fill="none" stroke="${paint.color}" stroke-width="${paint.width}" stroke-opacity="${paint.opacity}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    })
    .join("");
  const dots = showField
    ? field.samples
        .map((p, i) => `<circle id="field-sample-${i + 1}" data-layer="field" cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="3.2" fill="${tint[1] || tint[0]}" fill-opacity="0.45"/>`)
        .join("")
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}${ground}${paths}${dots}</svg>`;
}

function digest(elements) {
  return sha256(elements.map((el) => `${el.id}|${el.d}`).join("\n"));
}

function assemble(card, blue, guest, date, affinity, layers, mask) {
  const force = affinity > 0 ? guestForce(guest) : guestForce(null);
  const built = compile(blue, date, force, mask);
  const secondary = derive(built);
  const elements = built.elements.concat(secondary);
  const field = fieldOf(built, elements);
  field.isolines.forEach((line, i) => {
    if (line.length < 6) return;
    elements.push(element(`field-${i + 1}`, line, "field", "field", "Isoline of the field sampled from the relation and from where two charges overlap.", { level: "0.48", sources: built.participants.map((p) => p.id) }, { parent: "relation-1" }));
  });
  for (const check of built.constraints) {
    if (!check.pass) throw new Error(`${card.name} failed “${check.statement}”: ${check.measured}`);
  }
  const primary = elements.filter((el) => el.layer === "relation");
  const trace = {
    renderer_version: VERSION,
    date,
    card_name: card.name,
    affinity_index: affinity,
    visual_reference_inputs: [],
    semantic_input: {
      identity_geometry: blue.identity_geometry,
      encounter_affordance: blue.encounter_affordance,
      negative_space_rule: blue.negative_space_rule,
      failure_condition: blue.failure_condition,
    },
    graph: {
      participants: built.participants.map((p) => ({ id: p.id, role: p.role, x: Math.round(p.x), y: Math.round(p.y), charge: p.charge })),
      edges: elements.filter((el) => el.layer !== "field").map((el) => ({ id: el.id, layer: el.layer, cause: el.cause, parameters: el.parameters, parent: el.parent })),
    },
    protected_void: { shape: built.zone.shape, rule: blue.negative_space_rule },
    constraints: built.constraints,
    field: { kind: field.kind, note: field.note || "", peaks: field.peaks.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), weight: Number(p.v.toFixed(3)) })), samples: field.samples.length, isolines: field.isolines.length },
    counterreading: built.counterreading,
    contrast: built.contrast,
    layers: {
      primary: digest(primary),
      secondary: digest(elements.filter((el) => el.layer === "secondary")),
      field: digest(elements.filter((el) => el.layer === "field")),
    },
    encounter: affinity > 0 ? { guest: guest?.name || "Encounter", intensity: force.intensity, status: "PROPOSAL — not a replacement of the upright meaning", geometry_action: guest?.text ?? "", upright_proposal: guest?.proposal ?? "", kinds: force.kinds } : null,
    geometry_digest: digest(elements),
  };
  return { built, elements, field, trace, primary };
}

export async function renderDepth(name, date, affinity, options = {}) {
  if (!PROOF.includes(name)) throw new Error(`${name} is outside this proof.`);
  if (affinity !== 0 && affinity !== 14) throw new Error("This proof compares affinity 0 and 14.");
  const layers = { secondary: true, field: true, counter: true, ...options.layers };
  const sources = await loadSources();
  const card = sources.canon.find((row) => row.name === name);
  const blue = sources.blue.find((row) => row.name === name);
  const dance = sources.dance.find((row) => row.name === name);
  const guest = affinity === 0 ? null : { name: "The Dance", intensity: Number(dance.intensity_0_to_4), text: dance.geometry_action, proposal: dance.upright_proposal };
  const full = assemble(card, blue, guest, date, affinity, layers, true);
  const unmasked = assemble(card, blue, guest, date, affinity, layers, false);
  const changed = full.primary.filter((el, i) => el.d !== unmasked.primary[i]?.d).map((el) => el.id);
  if (!changed.length) throw new Error(`${name}: removing the protected relation changed no primary geometry`);
  full.trace.mask_ablation = { changed_ids: changed, why: full.built.constraints[0]?.measured ?? "The mask alters a primary path." };
  full.trace.recipe_id = sha256(JSON.stringify({ version: VERSION, date, affinity, name, identity: blue.identity_geometry, guest: guest?.text ?? null }));
  const svg = sceneSvg(full.built, full.elements, full.field, false, layers);
  const structure = sceneSvg(full.built, full.elements, full.field, true, layers);
  const ablated = sceneSvg(full.built, full.elements, full.field, false, { secondary: false, field: false, counter: true });
  full.trace.ablation = { primary_unchanged: true, full_differs_from_primary_only: ablated !== svg };
  return { svg, structure, ablated, trace: full.trace, slug: card.image.replace(/\.png$/, ""), field: full.field, elements: full.elements };
}

function pathsOf(svg, layer) {
  const hits = [...svg.matchAll(/data-layer="([^"]+)"[^>]*d="([^"]+)"/g)];
  return hits.filter((hit) => (layer ? hit[1] === layer : true)).map((hit) => hit[2]);
}

export async function proveDepth(date = "2026-11-12") {
  const results = [];
  for (const name of PROOF) {
    const neutral = await renderDepth(name, date, 0);
    const again = await renderDepth(name, date, 0);
    const dance = await renderDepth(name, date, 14);
    if (neutral.svg !== again.svg) throw new Error(`${name} was not repeatable`);
    const pngA = await sharp(Buffer.from(neutral.svg)).png().toBuffer();
    const pngB = await sharp(Buffer.from(again.svg)).png().toBuffer();
    if (!pngA.equals(pngB)) throw new Error(`${name} PNG was not repeatable`);
    if (pngA.length < 5000) throw new Error(`${name} PNG is empty`);
    const hostChanged = pathsOf(neutral.svg, "relation").join("|") !== pathsOf(dance.svg, "relation").join("|");
    const secondaryChanged = pathsOf(neutral.svg, "secondary").join("|") !== pathsOf(dance.svg, "secondary").join("|");
    const fieldChanged = pathsOf(neutral.svg, "field").join("|") !== pathsOf(dance.svg, "field").join("|") || neutral.trace.field.samples !== dance.trace.field.samples;
    const intensity = dance.trace.encounter?.intensity ?? 0;
    if (intensity === 0 && (hostChanged || neutral.svg !== dance.svg)) throw new Error(`${name} changed at intensity 0`);
    if (intensity > 0 && !hostChanged) throw new Error(`${name} affinity did not move the host`);
    if (intensity > 0 && !secondaryChanged) throw new Error(`${name} affinity did not move a derived path`);
    if (intensity > 0 && !fieldChanged) throw new Error(`${name} affinity did not move the field`);
    if (!neutral.trace.ablation.full_differs_from_primary_only && name !== "The Null") throw new Error(`${name} ablation did not change the picture`);
    if (name === "The Null") {
      const secondary = neutral.elements.filter((el) => el.layer === "secondary").length;
      if (secondary !== 0 || neutral.trace.field.isolines !== 0) throw new Error("The Null was not kept sparse");
    }
    results.push({
      name,
      slug: neutral.slug,
      intensity,
      hostChanged,
      secondaryChanged,
      fieldChanged,
      png: sha256(pngA),
      digest: neutral.trace.geometry_digest,
      mask: neutral.trace.mask_ablation.changed_ids,
    });
  }
  const witness = results.find((item) => item.name === "The Witness");
  const ache = results.find((item) => item.name === "The Ache");
  if (witness.digest === ache.digest) throw new Error("Witness and Ache collapsed");
  return { version: VERSION, date, cards: results };
}

const SPECIAL_KINDS = ["partial-reaction", "third-interval", "correction-stroke", "far-autonomy", "unclosed-response", "emergent-beat", "radius-change"];

function countWords(text) {
  const words = { two: 2, three: 3, four: 4, five: 5, pair: 2, double: 2, several: 4, many: 4 };
  for (const [word, count] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return count;
  }
  const digit = text.match(/\b([2-6])\b/);
  return digit ? Number(digit[1]) : 0;
}

function classifyRelation(text) {
  const rules = [
    ["observe", /observ|sightline|witness|testimony|cusp|listening/i],
    ["orbit", /orbit|surround|encircl|perimeter|enclosure|roles around|open structure/i],
    ["weave", /braid|weave|strand|rhythm|reciproc|speaking|breath|continuity|histories|context|name-shaped/i],
    ["interrupt", /interrupt|threshold|discontinu|fracture|broken|gap|timing gate|\bcut\b|pause|boundary/i],
    ["returnPath", /return|revisit|spiral|revolution|homecoming|home-directed|\bcycle\b|\breset\b/i],
    ["radiate", /radiat|ignition|propagat|branch|generating|signal|consequence|emergence/i],
    ["cross", /cross|intersect|meeting|met by/i],
    ["separate", /separat|apart|independent|refusal|division|distinguish/i],
    ["approach", /approach|alongside|encountering a different/i],
    ["translate", /translat|alphabet|medium|criteria|interface|mechanism|stages|public sign/i],
    ["revise", /successive|revised|revision|evolved direction|frames/i],
    ["balance", /counterweight|countervector|asymmetric|opposed|orienting axis/i],
    ["nest", /nested/i],
    ["mark", /attentive mark|calibration|first mark|emblem|\bmark\b/i],
    ["bend", /bend|curve|arc|curvature|reaching/i],
  ];
  return rules.find((rule) => rule[1].test(text))?.[0] ?? "bend";
}

function wavePts(x0, y0, x1, y1, amp, cycles, phase) {
  const pts = [];
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const len = Math.hypot(nx, ny) || 1;
  const steps = 22;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const off = Math.sin(t * cycles * Math.PI * 2 + phase) * amp;
    pts.push([x0 + (x1 - x0) * t + (nx / len) * off, y0 + (y1 - y0) * t + (ny / len) * off]);
  }
  return pts;
}

function bendHost(built, force) {
  if (!force?.anchor || !(force.intensity > 0)) return;
  const sign = force.kinds.includes("host-repel") ? -1 : 1;
  const phase = force.kinds.includes("host-phase") ? 0.1 * force.intensity : 0.04 * force.intensity;
  const mag = 34 * force.intensity * sign;
  const guest = force.anchor;
  const zone = built.zone;
  for (const el of built.elements) {
    if (el.layer !== "relation" || !el.points?.length) continue;
    const moved = el.points.map((p, index) => {
      const w = el.points.length === 1 ? 1 : index / (el.points.length - 1);
      const dx = guest[0] - p[0];
      const dy = guest[1] - p[1];
      const dist = Math.hypot(dx, dy) || 1;
      let x = p[0] + (dx / dist) * mag * (0.25 + w);
      let y = p[1] + (dy / dist) * mag * (0.25 + w);
      if (phase) {
        const cx = built.participants[0]?.x ?? 700;
        const cy = built.participants[0]?.y ?? 1100;
        const ox = x - cx;
        const oy = y - cy;
        const c = Math.cos(phase);
        const s = Math.sin(phase);
        x = cx + ox * c - oy * s;
        y = cy + ox * s + oy * c;
      }
      if (zone?.shape === "circle" && built.sparse) {
        const d = Math.hypot(x - zone.cx, y - zone.cy);
        if (d < zone.r + 16) {
          const k = (zone.r + 18) / (d || 1);
          x = zone.cx + (x - zone.cx) * k;
          y = zone.cy + (y - zone.cy) * k;
        }
      }
      return [x, y];
    });
    el.points = moved;
    el.d = dOf(moved, { angular: el.angular });
  }
}

function compileRelation(blue, rng, force, mask) {
  void force;
  const text = `${blue.identity_geometry} ${blue.negative_space_rule || ""}`;
  const op = classifyRelation(blue.identity_geometry);
  const open = /open center|unentered|unowned|absence|vacan|untouched|blank center|unclaimed|open room/i.test(text);
  const zone = open
    ? { shape: "circle", cx: 700 + (rng() - 0.5) * 36, cy: 1160 + (rng() - 0.5) * 36, r: mask ? 250 : 70 }
    : { shape: "none" };
  const named = countWords(blue.identity_geometry);
  const n = Math.min(4, Math.max(2, named || (op === "radiate" ? 4 : 2)));
  const span = mask ? 380 : 80;
  const participants = [];
  for (let i = 0; i < n; i += 1) {
    const ang = -1.15 + (i / Math.max(1, n - 1)) * 2.5 + (rng() - 0.5) * 0.15;
    participants.push({
      id: `p-${i + 1}`,
      role: i === 0 ? "host" : "counterpart",
      x: 700 + Math.cos(ang) * span,
      y: 1080 + Math.sin(ang) * span * 0.92,
      charge: i === 0 ? 1 : 0.72,
    });
  }
  const a = participants[0];
  const b = participants[1];
  const stop = (from, toward) => {
    if (!open || !mask || zone.shape !== "circle") return toward;
    return stopAtCircle(from, toward, zone, 20);
  };
  let primary;
  let secondary = null;
  const phase = rng() * 0.6;
  if (op === "weave") {
    primary = wavePts(220, 780, 1180, 860, 48, 2.2, phase);
    secondary = wavePts(240, 1180, 1160, 1080, 32, 3.1, phase + 1);
  } else if (op === "orbit") {
    primary = arcPts(a.x, a.y, mask ? 230 : 90, mask ? 180 : 70, 0.4 + phase, 5.2 + phase, 28);
    secondary = arcPts(b.x, b.y, mask ? 180 : 70, mask ? 240 : 80, 2.1, 5.4, 28);
  } else if (op === "observe") {
    primary = arcPts(a.x, a.y, 200, 240, 0.7, 3.6, 24);
    const aim = [b.x, b.y];
    const end = stop(aim, open ? [zone.cx, zone.cy] : [b.x + 180, b.y + 40]);
    secondary = [aim, lerp(aim, end, 0.5), end];
    for (let i = 0; i < 6; i += 1) secondary.splice(1, 0, lerp(secondary[0], secondary.at(-1), (i + 1) / 8));
  } else if (op === "interrupt") {
    const whole = wavePts(a.x, a.y, b.x, b.y, 56, 1.3, phase);
    const cut = Math.floor(whole.length * 0.42);
    primary = whole.slice(0, cut);
    secondary = whole.slice(cut + (mask ? 5 : 0));
  } else if (op === "returnPath") {
    primary = [];
    const turns = 1.4 + rng() * 0.35;
    for (let i = 0; i <= 28; i += 1) {
      const t = i / 28;
      const ang = t * turns * Math.PI * 2;
      const rad = 50 + t * (mask ? 260 : 90);
      primary.push([a.x + Math.cos(ang) * rad * 0.7, a.y + Math.sin(ang) * rad]);
    }
  } else if (op === "radiate") {
    primary = null;
  } else if (op === "separate") {
    primary = arcPts(a.x, a.y, mask ? 210 : 80, mask ? 280 : 90, 0.2, 4.2, 26);
    secondary = arcPts(b.x, b.y, mask ? 240 : 70, mask ? 180 : 60, 1.4, 5.1, 26);
  } else if (op === "approach") {
    const end = stop([a.x, a.y], [b.x, b.y]);
    const held = mask ? lerp(end, [a.x, a.y], 0.22) : end;
    primary = wavePts(a.x, a.y, held[0], held[1], 36, 1.1, phase);
  } else if (op === "translate") {
    primary = [[a.x, a.y], [a.x + 160, a.y - 80], [b.x - 80, b.y + 40], [b.x, b.y]];
    for (let i = 0; i < 12; i += 1) {
      const t = (i + 1) / 13;
      primary.splice(i + 1, 0, lerp(primary[0], primary.at(-1), t));
    }
    secondary = wavePts(a.x, a.y + 160, b.x, b.y + 180, 24, 1.6, 0.4);
  } else if (op === "revise") {
    primary = wavePts(a.x, a.y, b.x, b.y, 34, 1.2, phase);
    secondary = wavePts(a.x + 36, a.y + 70, b.x + 20, b.y + 90, 28, 1.4, phase + 0.8);
  } else if (op === "balance") {
    const mid = lerp([a.x, a.y], [b.x, b.y], mask ? 0.62 : 0.5);
    primary = [[a.x, a.y], [mid[0], mid[1] + (mask ? 120 : 20)], lerp([a.x, a.y], mid, 0.7)];
    while (primary.length < 16) {
      const next = [];
      for (let i = 0; i < primary.length - 1; i += 1) {
        next.push(primary[i], lerp(primary[i], primary[i + 1], 0.5));
      }
      next.push(primary.at(-1));
      primary = next;
    }
    secondary = [[b.x, b.y], [mid[0], mid[1] - (mask ? 90 : 16)]];
    while (secondary.length < 16) {
      const next = [];
      for (let i = 0; i < secondary.length - 1; i += 1) {
        next.push(secondary[i], lerp(secondary[i], secondary[i + 1], 0.5));
      }
      next.push(secondary.at(-1));
      secondary = next;
    }
  } else if (op === "nest") {
    primary = arcPts(a.x, a.y, mask ? 160 : 60, mask ? 200 : 70, 0.5, 4.4, 24);
    secondary = arcPts(a.x + 20, a.y + 16, mask ? 300 : 100, mask ? 360 : 120, 1.1, 4.8, 28);
  } else if (op === "mark") {
    primary = [];
    for (let i = 0; i < 4; i += 1) {
      const ang = -0.8 + i * 1.1 + rng() * 0.1;
      const reach = (mask ? 180 : 70) * (0.55 + i * 0.18);
      primary.push([a.x + Math.cos(ang) * 30, a.y + Math.sin(ang) * 30]);
      primary.push([a.x + Math.cos(ang) * reach, a.y + Math.sin(ang) * reach]);
    }
  } else if (op === "cross") {
    primary = wavePts(a.x, a.y - 80, b.x, b.y + 60, 70, 1.1, 0.4);
    secondary = wavePts(a.x - 40, a.y + 180, b.x + 30, b.y - 140, 40, 1.2, 1.1);
  } else {
    primary = wavePts(a.x, a.y, stop([a.x, a.y], [b.x, b.y])[0], stop([a.x, a.y], [b.x, b.y])[1], mask ? 64 : 20, 1.2, phase);
    secondary = wavePts(a.x + 40, a.y + 90, b.x - 20, b.y + 70, 28, 2, phase + 0.7);
  }
  const elements = [];
  if (op === "radiate") {
    const origin = [a.x, a.y];
    for (let i = 0; i < n; i += 1) {
      const ang = -1.05 + i * (2.3 / n) + (rng() - 0.5) * 0.12;
      const len = (mask ? 420 : 160) + i * 30;
      const end = stop(origin, [origin[0] + Math.cos(ang) * len, origin[1] + Math.sin(ang) * len * 0.9]);
      const pts = [];
      for (let s = 0; s <= 16; s += 1) pts.push(lerp(origin, end, s / 16));
      elements.push(element(`relation-${i + 1}`, pts, i === 0 ? "decisive" : "scaffold", "relation", i === 0 ? "The generating line this sentence names." : "A consequence that leaves the same origin and does not copy the first.", { operator: op, index: i }, { curvature: true, echo: i === 0 }));
    }
  } else {
    elements.push(element("relation-1", primary, "decisive", "relation", blue.identity_geometry, { operator: op }, { curvature: true, echo: true, angular: op === "translate" || op === "balance" || op === "mark" }));
    if (secondary) {
      elements.push(element("relation-2", secondary, "scaffold", "relation", "The second term of the same relation. It is not a copy of the first.", { operator: op }, { curvature: true, echo: false }));
    }
  }
  const hostEnd = elements[0].points.at(-1);
  if (open && zone.shape === "circle") {
    for (const el of elements) {
      if (el.layer !== "relation") continue;
      if (!mask) {
        const mid = Math.floor(el.points.length / 2);
        el.points[mid] = [zone.cx, zone.cy];
      } else {
        el.points = el.points.map((p) => {
          const dist = Math.hypot(p[0] - zone.cx, p[1] - zone.cy);
          if (dist >= zone.r + 10) return p;
          const scale = (zone.r + 18) / (dist || 1);
          return [zone.cx + (p[0] - zone.cx) * scale, zone.cy + (p[1] - zone.cy) * scale];
        });
      }
      el.d = dOf(el.points, { angular: el.angular });
    }
  }
  const failure = open
    ? [hostEnd, [zone.cx, zone.cy], [zone.cx + (zone.cx - hostEnd[0]) * 0.4, zone.cy + (zone.cy - hostEnd[1]) * 0.4]]
    : [participants.at(-1) ? [participants.at(-1).x, participants.at(-1).y] : hostEnd, lerp(hostEnd, [a.x, a.y], 0.5), [a.x, a.y]];
  elements.push(element("counterreading-1", failure, "counter", "counterreading", blue.failure_condition, { operator: "failed-relation" }, { angular: true }));
  const insideCount = elements.filter((el) => el.layer === "relation").flatMap((el) => el.points).filter((p) => inside(p, zone)).length;
  const gap = hypot([a.x, a.y], [b.x, b.y]);
  return {
    elements,
    participants,
    zone,
    sparse: false,
    ink: {
      major: ["#e6c98a", "#7f9aa8"],
      hearings: ["#b7ddd8", "#d7b57a"],
      paths: ["#d5e0b0", "#c9a8c6"],
      returns: ["#e0c0dc", "#b7c49a"],
      sigils: ["#efb27a", "#8eb4b8"],
    }[blue.suit] || ["#e6c98a", "#7f9aa8"],
    constraints: [
      {
        id: open ? "void" : "separation",
        statement: blue.negative_space_rule || blue.identity_geometry,
        measured: open ? `Inside the protected room: ${insideCount}.` : `The two charges sit ${Math.round(gap)}px apart.`,
        pass: open ? (mask ? insideCount === 0 : insideCount > 0) : (mask ? gap > 240 : gap < 220),
      },
    ],
    counterreading: { svg_id: "counterreading-1", differs_by: open ? "The failed relation crosses the room the card refuses to fill." : "The failed relation joins what the card keeps apart.", failure_condition: blue.failure_condition },
    contrast: `${op} is read from the blueprint sentence. The second structure is derived from how that path actually turns, and the field is sampled from those charges.`,
  };
}

function guestFor(sources, index, affinity) {
  if (affinity === 0) return null;
  if (affinity === 14) {
    const row = sources.dance[index];
    return { name: "The Dance", text: row.geometry_action, intensity: Number(row.intensity_0_to_4), proposal: row.upright_proposal };
  }
  const guest = sources.blue[affinity - 1];
  return { name: guest.name, text: guest.encounter_affordance, intensity: 2, proposal: "" };
}

export async function renderCard(sources, index, date, affinity, options = {}) {
  if (!Number.isInteger(affinity) || affinity < 0 || affinity > 78) throw new Error("Affinity must be a whole number from 0 to 78.");
  const canon = sources.canon[index];
  const blue = sources.blue[index];
  const guest = guestFor(sources, index, affinity);
  const layers = { secondary: true, field: true, counter: true, ...(options.layers || {}) };
  const full = assemble(canon, blue, guest, date, affinity, layers, options.mask !== false);
  const recipe = sha256(JSON.stringify({
    recipe_version: "velomere-encounter-renderer/3",
    renderer_version: VERSION,
    date,
    affinity,
    canonical: sources.hashes.canonical,
    blueprints: sources.hashes.blueprints,
    encounters: sources.hashes.encounters,
  }));
  full.trace.recipe_id = recipe;
  full.trace.canonical_index = index + 1;
  full.trace.visual_reference_inputs = [];
  const svg = sceneSvg(full.built, full.elements, full.field, false, layers);
  let png = null;
  if (options.raster !== false) png = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    card: {
      index: index + 1,
      name: canon.name,
      suit: canon.suit,
      rank: canon.rank,
      keywords: canon.keywords,
      upright: canon.upright,
      reversed: canon.reversed,
      image: canon.image,
      sort_order: canon.sort_order,
    },
    svg,
    png,
    trace: full.trace,
    guest,
  };
}

function backSvg() {
  const arm = (a0, a1, rx, ry) => arcPts(700, 1150, rx, ry, a0, a1, 40);
  const pair = (pts) => [pts, pts.map(([x, y]) => [1400 - x, 2300 - y])];
  const strokes = [...pair(arm(0.35, 2.15, 300, 460)), ...pair(arm(0.9, 2.35, 140, 210)), ...pair(arcPts(700, 1150, 54, 54, 0, Math.PI * 1.15, 28))];
  const body = strokes.map((pts, i) => `<path id="back-${i + 1}" d="${dOf(pts)}" fill="none" stroke="#d9c7a4" stroke-width="4" stroke-opacity="0.8" stroke-linecap="round"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${EDGE}"/>${body}</svg>`;
}

export async function buildDeck(directory, date, affinity) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date must be YYYY-MM-DD.");
  const sources = await loadSources();
  const first = await renderCard(sources, 0, date, affinity, { raster: false });
  const recipe = first.trace.recipe_id;
  await mkdir(`${directory}/images`, { recursive: true });
  await mkdir(`${directory}/svg`, { recursive: true });
  await mkdir(`${directory}/procedural_trace`, { recursive: true });
  await mkdir(`${directory}/back`, { recursive: true });
  await mkdir(`${directory}/provenance`, { recursive: true });
  const cards = [];
  const contexts = [];
  const files = new Map();
  const put = async (rel, data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await writeFile(`${directory}/${rel}`, buf);
    files.set(rel, buf);
  };
  for (let index = 0; index < 78; index += 1) {
    const drawn = index === 0 ? { ...first, png: await sharp(Buffer.from(first.svg)).png().toBuffer() } : await renderCard(sources, index, date, affinity);
    const slug = drawn.card.image.replace(/\.(png|jpg|jpeg)$/i, "");
    await put(`images/${slug}.png`, drawn.png);
    await put(`svg/${slug}.svg`, drawn.svg);
    await put(`procedural_trace/${String(index + 1).padStart(2, "0")}.json`, `${JSON.stringify(drawn.trace, null, 2)}\n`);
    cards.push({
      name: drawn.card.name,
      suit: drawn.card.suit,
      rank: drawn.card.rank,
      keywords: drawn.card.keywords,
      upright: drawn.card.upright,
      reversed: drawn.card.reversed,
      sortOrder: Number(drawn.card.sort_order),
      file: `images/${slug}.png`,
    });
    contexts.push({
      name: drawn.card.name,
      canonical_index: index + 1,
      encounter_layer: affinity === 0 ? null : {
        origin: affinity === 14 ? "dance-authored" : "blueprint-derived",
        authored: false,
        label: "PROPOSED ENCOUNTER",
        affinity_index: affinity,
        affinity_name: drawn.guest?.name ?? null,
        action: drawn.guest?.text ?? "",
        intensity: drawn.guest?.intensity ?? 0,
        notice: "Proposed layer only. It does not replace the canonical meaning.",
      },
    });
  }
  const header = ["name", "suit", "rank", "keywords", "upright", "reversed", "image", "sort_order", "image_scale", "image_x", "image_y", "image_radius"];
  const lines = [header.join(",")];
  const csvEscape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  for (const card of cards) {
    const canon = sources.canon.find((row) => row.name === card.name);
    lines.push([card.name, card.suit, card.rank, card.keywords, card.upright, card.reversed, card.file.split("/").pop(), canon.sort_order, canon.image_scale, canon.image_x, canon.image_y, canon.image_radius].map(csvEscape).join(","));
  }
  await put("cards.csv", `${lines.join("\n")}\n`);
  await put("canonical_cards.csv", sources.files["canonical_cards.csv"]);
  await put("archetype_blueprints.csv", sources.files["archetype_blueprints.csv"]);
  await put("dance14_encounter_reference.csv", sources.files["dance14_encounter_reference.csv"]);
  await put("deck_contexts.json", `${JSON.stringify({ schema_version: "velomere-contexts/1", recipe_id: recipe, affinity, cards: contexts }, null, 2)}\n`);
  const affinityName = affinity === 0 ? "Neutral" : sources.canon[affinity - 1].name;
  const back = backSvg();
  const png = await sharp(Buffer.from(back)).png().toBuffer();
  const jpeg = await sharp(png).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
  const raw = await sharp(jpeg).ensureAlpha().raw().toBuffer();
  const meta = await sharp(jpeg).metadata();
  let total = 0;
  const count = meta.width * meta.height;
  for (let y = 0; y < meta.height; y += 1) {
    for (let x = 0; x < meta.width; x += 1) {
      const i = (y * meta.width + x) * 4;
      const j = ((meta.height - 1 - y) * meta.width + (meta.width - 1 - x)) * 4;
      total += Math.abs(raw[i] - raw[j]) + Math.abs(raw[i + 1] - raw[j + 1]) + Math.abs(raw[i + 2] - raw[j + 2]);
    }
  }
  const mean = total / (count * 3);
  const backBytes = mean > 0.8 ? png : jpeg;
  await put("back/card-back.svg", back);
  await put("back/card-back.jpg", backBytes);
  const deck = {
    schema_version: "velomere-encounter-renderer/3",
    name: `Velomere / ${date} / ${affinityName} (${affinity})`,
    recipe_id: recipe,
    date,
    affinity,
    affinity_name: affinityName,
    renderer: VERSION,
    cardTemplate: "long-tarot",
    cardBack: "back/card-back.jpg",
    visual_reference_inputs: [],
    cards: cards.map((card) => ({ name: card.name, file: card.file, sort_order: card.sortOrder })),
  };
  await put("deck.json", `${JSON.stringify(deck, null, 2)}\n`);
  await put("recipe.json", `${JSON.stringify({ recipe_id: recipe, renderer: VERSION, recipe_version: "velomere-encounter-renderer/3", date, affinity, affinity_name: affinityName, source_hashes: sources.hashes, visual_reference_inputs: [] }, null, 2)}\n`);
  await put("provenance/renderer-and-seed.json", `${JSON.stringify({ renderer: VERSION, recipe_id: recipe, date, affinity, visual_reference_inputs: [] }, null, 2)}\n`);
  await put("provenance.json", `${JSON.stringify({ renderer: VERSION, recipe_id: recipe, date, affinity, affinity_name: affinityName, source_hashes: sources.hashes, visual_reference_inputs: [], card_count: 78, back_rotation_mean: mean }, null, 2)}\n`);
  const filesSha = {};
  for (const [rel, buf] of files) filesSha[rel] = sha256(buf);
  await put("manifest.json", `${JSON.stringify({ schema_version: "velomere-encounter-renderer/3", recipe_id: recipe, files_sha256: filesSha }, null, 2)}\n`);
  const packed = {};
  for (const [rel, buf] of files) packed[rel] = new Uint8Array(buf);
  await writeFile(`${directory}/deck.zip`, zipSync(packed, { mtime: new Date(Date.UTC(2000, 5, 8)) }));
  return { recipe, cards, backMean: mean };
}

export async function proveAll(date = "2026-11-12") {
  const sources = await loadSources();
  const digests = new Set();
  const failures = [];
  for (let i = 0; i < 78; i += 1) {
    const name = sources.canon[i].name;
    const neutral = await renderCard(sources, i, date, 0, { raster: false });
    const again = await renderCard(sources, i, date, 0, { raster: false });
    const dance = await renderCard(sources, i, date, 14, { raster: false });
    const later = await renderCard(sources, i, date === "2026-11-12" ? "2026-11-13" : date, 0, { raster: false });
    const otherAffinity = i + 1 === 14 ? 1 : i + 1;
    const other = await renderCard(sources, i, date, otherAffinity, { raster: false });
    if (neutral.svg !== again.svg) failures.push(`${name} not repeatable`);
    if (neutral.trace.visual_reference_inputs.length) failures.push(`${name} recorded a visual reference`);
    if (!neutral.svg.includes("relation-")) failures.push(`${name} has no relation`);
    digests.add(neutral.trace.geometry_digest);
    const host = (svg) => [...svg.matchAll(/data-layer="relation"[^>]*d="([^"]+)"/g)].map((hit) => hit[1]).join("|");
    const secondary = (svg) => [...svg.matchAll(/data-layer="secondary"[^>]*d="([^"]+)"/g)].map((hit) => hit[1]).join("|");
    const intensity = dance.trace.encounter?.intensity ?? 0;
    if (intensity === 0 && neutral.svg !== dance.svg) failures.push(`${name} changed at Dance intensity 0`);
    if (intensity > 0 && host(neutral.svg) === host(dance.svg)) failures.push(`${name} Dance did not move the host`);
    if (intensity > 0 && name !== "The Null" && secondary(neutral.svg) === secondary(dance.svg)) failures.push(`${name} Dance did not move a derived path`);
    if (neutral.trace.geometry_digest === later.trace.geometry_digest) failures.push(`${name} date did not change geometry`);
    const otherIntensity = other.trace.encounter?.intensity ?? 0;
    if (otherIntensity > 0 && host(neutral.svg) === host(other.svg)) failures.push(`${name} affinity ${otherAffinity} did not move the host`);
    if (name === "The Null") {
      const quiet = await renderCard(sources, i, date, 14, { raster: false });
      if ((quiet.trace.field.isolines ?? 0) !== 0) failures.push("The Null grew a field");
    }
    const png = await sharp(Buffer.from(neutral.svg)).png().toBuffer();
    const check = await sharp(png).metadata();
    if (check.width !== 1400 || check.height !== 2300) failures.push(`${name} raster ${check.width}x${check.height}`);
    const roundTrip = await sharp(Buffer.from(neutral.svg)).png().toBuffer();
    if (!png.equals(roundTrip)) failures.push(`${name} PNG does not match its SVG`);
  }
  if (digests.size !== 78) failures.push(`unique digests ${digests.size}`);
  const seen = new Set();
  for (let affinity = 0; affinity <= 78; affinity += 1) {
    const drawn = await renderCard(sources, 0, date, affinity, { raster: false });
    const digest = drawn.trace.geometry_digest;
    if (affinity > 0 && (drawn.trace.encounter?.intensity ?? 0) > 0 && seen.has(digest)) failures.push(`Shuffle affinity ${affinity} repeated an earlier digest`);
    seen.add(digest);
  }
  if (failures.length) throw new Error(failures.slice(0, 12).join("\n"));
  return { version: VERSION, cards: 78, digests: digests.size, shuffleAffinities: seen.size };
}
