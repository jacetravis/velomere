// @ts-nocheck
/**
 * Velomere encounter renderer.
 * Version: relational-encounter-2
 *
 * Geometry is planned from the canonical row, the archetype blueprint,
 * and — only when affinity is not zero — the encounter text.
 * No image, photograph, prior card, or workbench render is read.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import sharp from "sharp";

export const VERSION = "relational-encounter-2";
export const CANON_SHA = "340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9";
const W = 1400;
const H = 2300;
const EDGE = "#07080c";
const INK = {
  major: { field: "#18140f", decisive: "#e6c98a", scaffold: "#8d7452", response: "#7f9aa8" },
  hearings: { field: "#0e1c22", decisive: "#b7ddd8", scaffold: "#4e7276", response: "#d7b57a" },
  paths: { field: "#141a10", decisive: "#d5e0b0", scaffold: "#6d7750", response: "#c9a8c6" },
  returns: { field: "#18111a", decisive: "#e0c0dc", scaffold: "#725c74", response: "#b7c49a" },
  sigils: { field: "#1c1610", decisive: "#efb27a", scaffold: "#8d6546", response: "#8eb4b8" },
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = path.join(ROOT, "velomere-crystal", "DATA");

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...rest] = rows.filter((item) => item.some((value) => value.length));
  return rest.map((item) => Object.fromEntries(head.map((key, index) => [key, item[index] ?? ""])));
}

let cache = null;
export async function loadSources() {
  if (cache) return cache;
  const names = ["canonical_cards.csv", "archetype_blueprints.csv", "dance14_encounter_reference.csv"];
  const files = {};
  for (const name of names) files[name] = await readFile(path.join(DATA, name));
  const canonSha = sha256(files["canonical_cards.csv"]);
  if (canonSha !== CANON_SHA) throw new Error("Canonical source hash does not match.");
  const canon = parseCsv(files["canonical_cards.csv"].toString("utf8"));
  const blue = parseCsv(files["archetype_blueprints.csv"].toString("utf8"));
  const dance = parseCsv(files["dance14_encounter_reference.csv"].toString("utf8"));
  if (canon.length !== 78 || blue.length !== 78 || dance.length !== 78) throw new Error("Source tables must have 78 rows.");
  for (let i = 0; i < 78; i += 1) {
    if (canon[i].name !== blue[i].name || canon[i].name !== dance[i].name) throw new Error(`Name mismatch at ${i + 1}`);
    if (Number(blue[i].affinity_index) !== i + 1) throw new Error(`Affinity index mismatch at ${canon[i].name}`);
  }
  cache = {
    canon,
    blue,
    dance,
    files,
    hashes: {
      canonical: canonSha,
      blueprints: sha256(files["archetype_blueprints.csv"]),
      encounters: sha256(files["dance14_encounter_reference.csv"]),
    },
  };
  return cache;
}

export function rejectAffinity(affinity) {
  if (!Number.isInteger(affinity) || affinity < 0 || affinity > 78) throw new Error("Affinity must be a whole number from 0 to 78.");
}

function recipeId(hashes, date, affinity) {
  return sha256(JSON.stringify({
    recipe_version: "velomere-encounter-renderer/2",
    renderer_version: VERSION,
    date,
    affinity,
    canonical: hashes.canonical,
    blueprints: hashes.blueprints,
    encounters: hashes.encounters,
  }));
}

export function recipeFor(hashes, date, affinity) {
  rejectAffinity(affinity);
  return recipeId(hashes, date, affinity);
}

function boxOf() {
  return { x: 170, y: 230, w: 1060, h: 1840 };
}

function classify(text) {
  const rules = [
    ["revise", /successive frames|evolved direction|revisions remain|revised premise/i],
    ["balance", /counterweight|countervector|asymmetric weight|orienting axis|opposed/i],
    ["nest", /nested/i],
    ["mark", /attentive marks|calibration mark|first mark/i],
    ["holdVoid", /open center|refus|absen|unentered|unowned|vacan|stopped path|null|stillness|non-event|suspended|extraction|blank center/i],
    ["orbit", /orbit|contour|surround|encircl|open structure|roles around/i],
    ["weave", /braid|weave|strand|rhythm|reciproc|speaking|breath|continuity|histories|context|name-shaped|\bcall\b/i],
    ["observe", /observ|sightline|witness|offset arc|testimony|\bcusp\b/i],
    ["interrupt", /interrupt|threshold|discontinu|fracture|crack|broken|gap|timing gate|entrances|incomplete emblem|unhealed|\bcut\b|boundary/i],
    ["returnPath", /return|revisit|spiral|revolution|homecoming|home-directed|\bcycle\b|\breset\b|different depth/i],
    ["radiate", /radiat|ignition|propagat|branch|diverge|unfurl|generating lines|direction cue|\bsignal\b|consequences/i],
    ["cross", /cross|intersect/i],
    ["separate", /separat|apart|unselected|independent path|pulses|scaffold|spoken division/i],
    ["approach", /approach|alongside|encountering a different/i],
    ["translate", /translat|alphabet|medium|criteria|interface|mechanism|stages|public sign/i],
    ["bend", /bend|curve|arc|deform|curvature/i],
  ];
  const hit = rules.filter((rule) => rule[1].test(text));
  return { operator: hit[0]?.[0] ?? "bend", also: hit[1]?.[0] ?? null, cited: hit.length > 0 };
}

function countOf(text) {
  const words = { two: 2, three: 3, four: 4, five: 5, pair: 2, double: 2 };
  for (const [word, count] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return count;
  }
  const digit = text.match(/\b([2-6])\b/);
  return digit ? Number(digit[1]) : 0;
}

function smoothOpen(points) {
  if (points.length < 2) return "";
  const f = (p) => `${fmt(p[0])} ${fmt(p[1])}`;
  if (points.length === 2) return `M ${f(points[0])} L ${f(points[1])}`;
  let d = `M ${f(points[0])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${f(c1)}, ${f(c2)}, ${f(p2)}`;
  }
  return d;
}

function lineD(points) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${fmt(p[0])} ${fmt(p[1])}`).join(" ");
}

function arcPts(cx, cy, rx, ry, a0, a1, steps, rot = 0) {
  const pts = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i <= steps; i += 1) {
    const t = a0 + ((a1 - a0) * i) / steps;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}

function wave(x0, y0, x1, y1, amp, cycles, phase) {
  const pts = [];
  const steps = 32;
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const len = Math.hypot(nx, ny) || 1;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const off = Math.sin(t * cycles * Math.PI * 2 + phase) * amp;
    pts.push([x0 + (x1 - x0) * t + (nx / len) * off, y0 + (y1 - y0) * t + (ny / len) * off]);
  }
  return pts;
}

function bow(points, amount) {
  if (!amount || points.length < 2) return points;
  if (points.length < 3) {
    const [a, b] = points;
    return [a, [b[0] + amount * 0.45, b[1] + amount * 0.16]];
  }
  return points.map((p, i) => {
    const t = i / (points.length - 1);
    const off = Math.sin(t * Math.PI) * amount;
    return [p[0] + off, p[1] + off * 0.28];
  });
}

function clampPoint(p, box) {
  return [
    Math.min(box.x + box.w - 24, Math.max(box.x + 24, p[0])),
    Math.min(box.y + box.h - 24, Math.max(box.y + 24, p[1])),
  ];
}

function pushOut(p, voids) {
  let [x, y] = p;
  for (const zone of voids) {
    const dx = x - zone.x;
    const dy = y - zone.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    if (dist < zone.r + 12) {
      x = zone.x + (dx / dist) * (zone.r + 16);
      y = zone.y + (dy / dist) * (zone.r + 16);
    }
  }
  return [x, y];
}

function stopsAt(zone, angle, extra = 18) {
  return [zone.x + Math.cos(angle) * (zone.r + extra), zone.y + Math.sin(angle) * (zone.r + extra)];
}

function enters(points, zone) {
  return points.some((p) => Math.hypot(p[0] - zone.x, p[1] - zone.y) < zone.r - 2);
}

function layoutCenters(count, rng, box, voids) {
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard < 100) {
    guard += 1;
    const p = [box.x + 160 + rng() * (box.w - 320), box.y + 200 + rng() * (box.h - 400)];
    if (voids.some((zone) => Math.hypot(p[0] - zone.x, p[1] - zone.y) < zone.r + 70)) continue;
    if (pts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 420)) continue;
    pts.push(p);
  }
  while (pts.length < count) {
    const i = pts.length;
    pts.push(pushOut([box.x + box.w * (0.22 + i * 0.22), box.y + box.h * (0.28 + (i % 3) * 0.2)], voids));
  }
  return pts;
}

function voidFor(rule, box, rng) {
  const open = /open center|unentered|unowned|absence|vacan|untouched|unclaimed|crack|unobscured/i.test(rule);
  const x = box.x + box.w * (open ? 0.5 : 0.66) + (rng() - 0.5) * (open ? 30 : 80);
  const y = box.y + box.h * (open ? 0.48 : 0.4) + (rng() - 0.5) * (open ? 30 : 70);
  return {
    id: "quiet-1",
    x,
    y,
    r: open ? 230 : 96,
    rule,
    open,
    boundary: { shape: "circle", cx: Math.round(x), cy: Math.round(y), r: open ? 230 : 96 },
  };
}

function relationStrokes(operator, text, box, zone, rng) {
  const named = countOf(text);
  const count = named || (operator === "radiate" ? 5 : operator === "holdVoid" ? 3 : 2);
  const centers = layoutCenters(Math.min(count, 4), rng, box, [zone]);
  const angular = /alphabet|axis|criteria|mechanism|frame|interface|vector|stage/i.test(text);
  const strokes = [];
  const push = (points, role) => {
    const safe = points.map((p) => clampPoint(pushOut(p, [zone]), box));
    if (zone.open && enters(safe, zone)) return;
    strokes.push({ points: safe, role, angular: role === "decisive" ? angular : false });
  };
  if (operator === "holdVoid") {
    const n = Math.max(2, Math.min(4, count));
    for (let i = 0; i < n; i += 1) {
      const ang = -2.2 + rng() * 4.4;
      const far = [zone.x + Math.cos(ang) * (zone.r + 260 + rng() * 180), zone.y + Math.sin(ang) * (zone.r + 200 + rng() * 160)];
      const mid = [zone.x + Math.cos(ang + 0.5) * (zone.r + 140), zone.y + Math.sin(ang + 0.35) * (zone.r + 120)];
      push([far, mid, stopsAt(zone, ang, 18)], i === 0 ? "decisive" : "scaffold");
    }
  } else if (operator === "orbit") {
    centers.slice(0, 2).forEach((c, i) => {
      const gap = 0.55 + rng() * 0.45;
      const start = rng() * Math.PI * 2;
      push(arcPts(c[0], c[1], 150 + i * 30, 210 - i * 20, start, start + Math.PI * 2 - gap, 40, rng() * 0.6), i === 0 ? "decisive" : "scaffold");
    });
    if (/third|emergent|interval/i.test(text) && centers.length > 1) {
      const a = centers[0];
      const b = centers[1];
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      push(arcPts(mx, my, 70, 46, 0.4, 2.4, 18), "scaffold");
    }
  } else if (operator === "weave") {
    const y1 = box.y + box.h * (0.38 + rng() * 0.08);
    const y2 = y1 + 150 + rng() * 80;
    push(wave(box.x + 80, y1, box.x + box.w - 80, y1 + 40, 36, 2.2, rng() * 2), "decisive");
    push(wave(box.x + 100, y2, box.x + box.w - 120, y2 - 30, 22, 3.4, rng() * 2), "scaffold");
  } else if (operator === "observe") {
    const a = centers[0];
    const b = centers[1] || [a[0] + 220, a[1] + 80];
    push(arcPts(a[0], a[1], 160, 200, 0.6, 3.4, 28, 0.2), "scaffold");
    push(arcPts(b[0], b[1], 120, 150, 2.2, 5.2, 24, -0.3), "scaffold");
    const aim = Math.atan2(zone.y - a[1], zone.x - a[0]);
    const start = [a[0] + Math.cos(aim) * 40, a[1] + Math.sin(aim) * 40];
    const stop = stopsAt(zone, aim + 0.35, zone.open ? 28 : 70);
    push([start, [(start[0] + stop[0]) / 2 + 30, (start[1] + stop[1]) / 2 - 20], stop], "decisive");
  } else if (operator === "interrupt") {
    const a = centers[0];
    const b = centers[1] || [a[0] + 300, a[1] + 160];
    const whole = wave(a[0], a[1], b[0], b[1], 50, 1.4, rng());
    const cut = Math.floor(whole.length * 0.42);
    push(whole.slice(0, cut), "decisive");
    push(whole.slice(cut + 6), "scaffold");
  } else if (operator === "returnPath") {
    const c = centers[0];
    const pts = [];
    const turns = 1.35 + rng() * 0.4;
    for (let i = 0; i <= 42; i += 1) {
      const t = i / 42;
      const ang = t * turns * Math.PI * 2;
      const rad = 40 + t * (180 + rng() * 40);
      pts.push([c[0] + Math.cos(ang) * rad * 0.72, c[1] + Math.sin(ang) * rad]);
    }
    push(pts, "decisive");
  } else if (operator === "radiate") {
    const origin = centers[0];
    const n = Math.max(4, Math.min(6, count));
    for (let i = 0; i < n; i += 1) {
      const ang = -1.1 + i * (2.4 / n) + (rng() - 0.5) * 0.35;
      const len = 320 + rng() * 380 + (i === n - 1 ? -90 : 0);
      const end = [origin[0] + Math.cos(ang) * len, origin[1] + Math.sin(ang) * len * 0.85];
      const mid = [origin[0] + Math.cos(ang + 0.25) * len * 0.5, origin[1] + Math.sin(ang) * len * 0.4];
      push([origin, mid, end], i === 0 ? "decisive" : "scaffold");
    }
  } else if (operator === "cross") {
    const a = centers[0];
    const b = centers[1] || [a[0] + 240, a[1] + 200];
    push(wave(a[0], a[1] - 80, b[0], b[1] + 40, 70, 1.1, 0.4), "decisive");
    push(wave(a[0] - 40, a[1] + 160, b[0] + 20, b[1] - 140, 40, 1.3, 1.2), "scaffold");
  } else if (operator === "separate") {
    centers.slice(0, 2).forEach((c, i) => {
      push(arcPts(c[0], c[1], 200 + i * 40, 280, 0.3 + i, 4.6, 36), i === 0 ? "decisive" : "scaffold");
    });
  } else if (operator === "approach") {
    const a = centers[0];
    const b = centers[1] || [zone.x, zone.y];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const stop = [b[0] - Math.cos(ang) * 120, b[1] - Math.sin(ang) * 120];
    push([a, [(a[0] + stop[0]) / 2 + 40, (a[1] + stop[1]) / 2 - 30], stop], "decisive");
  } else if (operator === "translate") {
    const a = centers[0];
    const b = centers[1] || [a[0] + 280, a[1] + 60];
    push([a, [a[0] + 80, a[1] - 40], [b[0] - 40, b[1] + 20], b], "decisive");
    push(wave(a[0], a[1] + 140, b[0], b[1] + 160, 28, 1.6, 0.6), "scaffold");
    strokes[strokes.length - 2] && (strokes.find((item) => item.role === "decisive").angular = true);
  } else if (operator === "revise") {
    const a = centers[0];
    const b = centers[1] || [a[0] + 280, a[1] + 40];
    for (let i = 0; i < 3; i += 1) {
      const shift = i * 28;
      push(wave(a[0] + shift, a[1] + shift * 1.4, b[0] + shift * 0.4, b[1] + 80 + i * 36, 30 + i * 8, 1.1, i), i === 1 ? "decisive" : "scaffold");
    }
  } else if (operator === "balance") {
    const a = centers[0];
    const b = centers[1] || [a[0] + 520, a[1] - 60];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    push([a, [a[0] + (mid[0] - a[0]) * 0.72, a[1] + (mid[1] - a[1]) * 0.72 + 90]], "decisive");
    push([b, [b[0] + (mid[0] - b[0]) * 0.62, b[1] + (mid[1] - b[1]) * 0.62 - 50]], "scaffold");
    strokes[strokes.length - 2].angular = true;
    strokes[strokes.length - 1].angular = true;
  } else if (operator === "mark") {
    const c = centers[0];
    const span = Math.min(box.w, box.h) * 0.34;
    for (let i = 0; i < 4; i += 1) {
      const ang = -0.9 + i * 1.15 + rng() * 0.2;
      const reach = span * (0.45 + i * 0.16);
      const p = [c[0] + Math.cos(ang) * reach, c[1] + Math.sin(ang) * reach * 1.15];
      const q = [p[0] + Math.cos(ang + 1.1) * reach * 0.42, p[1] + Math.sin(ang + 0.7) * reach * 0.28];
      push([p, q], i === 0 ? "decisive" : "scaffold");
    }
  } else if (operator === "nest") {
    const c = centers[0];
    push(arcPts(c[0], c[1], 150, 190, 0.4, 4.2, 28), "scaffold");
    push(arcPts(c[0] + 24, c[1] + 16, 260, 320, 0.9, 4.8, 36), "decisive");
    push(arcPts(c[0] - 18, c[1] + 12, 390, 460, 1.4, 4.4, 32), "scaffold");
  } else {
    const a = centers[0];
    const b = centers[1] || [a[0] + 260, a[1] + 180];
    push(wave(a[0], a[1], b[0], b[1], 64, 1.15, rng() * 3), "decisive");
    push(wave(a[0] + 30, a[1] + 70, b[0] - 20, b[1] + 40, 24, 2.1, 1), "scaffold");
  }
  if (!strokes.length) {
    const a = centers[0];
    push(wave(a[0], a[1], a[0] + 420, a[1] + 220, 70, 1, 0.2), "decisive");
  }
  present(strokes, centers, operator, box, zone);
  return { strokes, anchors: centers, operator };
}

function present(strokes, anchors, operator, box, zone) {
  const pts = strokes.flatMap((stroke) => stroke.points);
  if (pts.length < 2) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const roomy = operator === "holdVoid" || operator === "orbit";
  const minW = box.w * (operator === "weave" ? 0.78 : roomy ? 0.5 : 0.58);
  const minH = box.h * (operator === "weave" ? 0.18 : roomy ? 0.38 : 0.42);
  const sx = w >= minW ? 1 : Math.min(3, minW / w);
  const sy = h >= minH ? 1 : Math.min(3, minH / h);
  let s = Math.max(sx, sy);
  if (operator === "weave") s = Math.max(sx, Math.min(sy, 1.4));
  if (s <= 1.04) return;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const map = (p) => clampPoint(pushOut([cx + (p[0] - cx) * s, cy + (p[1] - cy) * s], [zone]), box);
  for (const stroke of strokes) stroke.points = stroke.points.map(map);
  for (let i = 0; i < anchors.length; i += 1) anchors[i] = map(anchors[i]);
  let minX2 = Infinity;
  let minY2 = Infinity;
  let maxX2 = -Infinity;
  let maxY2 = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      minX2 = Math.min(minX2, p[0]);
      minY2 = Math.min(minY2, p[1]);
      maxX2 = Math.max(maxX2, p[0]);
      maxY2 = Math.max(maxY2, p[1]);
    }
  }
  const w2 = Math.max(1, maxX2 - minX2);
  const h2 = Math.max(1, maxY2 - minY2);
  const cx2 = (minX2 + maxX2) / 2;
  const cy2 = (minY2 + maxY2) / 2;
  let ax = 1;
  let ay = 1;
  if (w2 < minW * 0.9 && h2 >= minH * 0.8) ax = Math.min(2.6, (minW * 0.9) / w2);
  else if (operator !== "weave" && h2 < minH * 0.9 && w2 >= minW * 0.8) ay = Math.min(1.7, (minH * 0.9) / h2);
  if (ax === 1 && ay === 1) return;
  const stretch = (p) => clampPoint(pushOut([cx2 + (p[0] - cx2) * ax, cy2 + (p[1] - cy2) * ay], [zone]), box);
  for (const stroke of strokes) stroke.points = stroke.points.map(stretch);
  for (let i = 0; i < anchors.length; i += 1) anchors[i] = stretch(anchors[i]);
}

function mirrorDelta(points, axisX) {
  return points.map(([x, y]) => [axisX - (x - axisX) * 0.72, y + 18]);
}

function encounterStrokes(host, guestText, zone, rng) {
  const read = classify(guestText);
  const anchor = host.anchors[host.anchors.length - 1] || host.anchors[0];
  const ang = Math.atan2(anchor[1] - zone.y, anchor[0] - zone.x);
  const leave = [anchor[0] + Math.cos(ang + 1.2) * 36, anchor[1] + Math.sin(ang + 1.2) * 36];
  let end = [leave[0] + Math.cos(ang + 0.8) * (420 + rng() * 280), leave[1] + Math.sin(ang + 0.4) * (360 + rng() * 240)];
  if (zone.open) end = stopsAt(zone, ang, 22);
  const mid = [(leave[0] + end[0]) / 2 + (rng() - 0.5) * 70, (leave[1] + end[1]) / 2 + (rng() - 0.5) * 50];
  const points = [leave, mid, end].map((p) => clampPoint(pushOut(p, zone.open ? [zone] : []), boxOf()));
  const echo = [end, [end[0] + Math.cos(ang + 2) * 110, end[1] + Math.sin(ang + 2) * 84]];
  return {
    operator: zone.open && /cross|radiat|bridge/i.test(guestText) ? "approach" : read.operator,
    points,
    echo,
    cited: read.cited,
  };
}

function paintOf(suit, role) {
  const ink = INK[suit] || INK.major;
  if (role === "decisive") return { color: ink.decisive, width: 9, opacity: 0.95 };
  if (role === "encounter") return { color: ink.response, width: 5.4, opacity: 0.9 };
  if (role === "consequence") return { color: ink.decisive, width: 3.1, opacity: 0.72 };
  if (role === "counter") return { color: ink.scaffold, width: 1.6, opacity: 0.3, dash: "9 16" };
  return { color: ink.scaffold, width: 2.3, opacity: 0.45 };
}

function buildScene(card, blue, guest, date, affinity, index) {
  const box = boxOf();
  const layoutRng = mulberry32(sha256(`layout|${VERSION}|${card.name}|${blue.identity_geometry}`));
  const dateRng = mulberry32(sha256(`date|${VERSION}|${date}|${index}`));
  const zone = voidFor(blue.negative_space_rule, box, layoutRng);
  const read = classify(blue.identity_geometry);
  const relation = relationStrokes(read.operator, blue.identity_geometry, box, zone, layoutRng);
  const dateBow = 6 + dateRng() * 10;
  const elements = [];
  const operations = [];
  const ink = INK[card.suit] || INK.major;
  const checks = [blue.failure_condition, blue.negative_space_rule];
  const add = (points, role, spec) => {
    const look = paintOf(card.suit, role);
    const id = `${spec.layer}-${elements.filter((item) => item.layer === spec.layer).length + 1}`;
    const curved = spec.angular ? lineD(points) : smoothOpen(points);
    elements.push({
      id,
      d: curved,
      layer: spec.layer,
      color: look.color,
      width: look.width,
      opacity: look.opacity,
      dash: look.dash || null,
    });
    operations.push({
      id: `op-${operations.length + 1}`,
      operator: spec.operator,
      source_field: spec.source_field,
      source_text: spec.source_text,
      input_node_ids: spec.inputs,
      output_svg_ids: [id],
      parameters: spec.parameters,
      rationale: spec.rationale,
      constraints_checked: checks,
    });
  };
  operations.push({
    id: "op-field",
    operator: "fieldFromAnchors",
    source_field: "archetype_blueprints.identity_geometry",
    source_text: blue.identity_geometry,
    input_node_ids: ["quiet-1"],
    output_svg_ids: ["field-ground"],
    parameters: { cx: Math.round(relation.anchors[0][0]), cy: Math.round(relation.anchors[0][1]), core: ink.field, edge: EDGE },
    rationale: "The field is lighter near the relation and falls off. It is not a separate picture.",
    constraints_checked: checks,
  });
  relation.strokes.forEach((stroke, strokeIndex) => {
    const amount = stroke.role === "decisive" ? dateBow * 0.35 : dateBow;
    add(bow(stroke.points, amount * (strokeIndex % 2 === 0 ? 1 : -0.6)), stroke.role, {
      layer: "identity",
      operator: read.operator,
      source_field: "archetype_blueprints.identity_geometry",
      source_text: blue.identity_geometry,
      inputs: ["quiet-1"],
      angular: stroke.angular,
      parameters: { role: stroke.role, cited: read.cited },
      rationale: blue.identity_geometry,
    });
  });
  const decisive = relation.strokes.find((stroke) => stroke.role === "decisive") || relation.strokes[0];
  const ghost = mirrorDelta(decisive.points, relation.anchors[0][0] + 36).map((p) => clampPoint(p, box));
  if (!enters(ghost, zone)) {
    add(bow(ghost.slice(Math.floor(ghost.length / 3)), -dateBow * 0.5), "counter", {
      layer: "counterreading",
      operator: "mirrorWithDifference",
      source_field: "archetype_blueprints.failure_condition",
      source_text: blue.failure_condition,
      inputs: [elements.find((item) => item.layer === "identity")?.id || "identity-1"],
      parameters: { delta: 36 },
      rationale: `A quieter route remembers the failure to avoid: ${blue.failure_condition}`,
    });
  }
  let encounter = null;
  if (affinity > 0 && guest?.text && guest.intensity !== 0) {
    const made = encounterStrokes(relation, guest.text, zone, mulberry32(sha256(`meet|${VERSION}|${card.name}|${guest.name}|${affinity}`)));
    encounter = made;
    add(made.points, "encounter", {
      layer: "encounter",
      operator: made.operator,
      source_field: guest.source_field,
      source_text: guest.text,
      inputs: relation.strokes.length ? ["identity-1"] : [],
      parameters: { guest: guest.name, intensity: guest.intensity },
      rationale: guest.text,
    });
    add(made.echo.map((p) => clampPoint(pushOut(p, zone.open ? [zone] : []), box)), "consequence", {
      layer: "consequence",
      operator: "letEmerge",
      source_field: guest.source_field,
      source_text: guest.text,
      inputs: ["encounter-1"],
      parameters: { depends_on: "encounter-1" },
      rationale: "This mark exists only because the encounter moved the relation. It is not part of the card alone.",
    });
  }
  return { elements, operations, zone, relation, encounter, field: { cx: relation.anchors[0][0], cy: relation.anchors[0][1], core: ink.field } };
}

function svgFor(scene) {
  const body = scene.elements.map((item) => {
    const dash = item.dash ? ` stroke-dasharray="${item.dash}"` : "";
    return `<path id="${item.id}" data-layer="${item.layer}" d="${item.d}" fill="none" stroke="${item.color}" stroke-width="${item.width}" stroke-opacity="${item.opacity}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
  }).join("");
  const field = scene.field;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<defs><radialGradient id="field-shade" cx="${fmt(field.cx)}" cy="${fmt(field.cy)}" r="78%" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${field.core}"/><stop offset="100%" stop-color="${EDGE}"/></radialGradient></defs>\n<rect id="field-ground" data-layer="field" width="${W}" height="${H}" fill="url(#field-shade)"/>\n${body}\n</svg>`;
}

function geometryDigest(elements) {
  return sha256(elements.map((item) => item.d).join("|"));
}

function traceFor(card, blue, affinity, date, recipe, scene, guestName) {
  return {
    renderer_version: VERSION,
    recipe_id: recipe,
    date,
    canonical_index: card.index,
    card_name: card.name,
    affinity_index: affinity,
    identity: {
      source_field: "archetype_blueprints.identity_geometry",
      invariants: [blue.identity_geometry, blue.negative_space_rule],
      failure_condition: blue.failure_condition,
    },
    protected_voids: [{ id: scene.zone.id, rule: scene.zone.rule, boundary: scene.zone.boundary }],
    operations: scene.operations,
    counterreading: scene.elements.some((item) => item.layer === "counterreading")
      ? { operator: "mirrorWithDifference", svg_id: scene.elements.find((item) => item.layer === "counterreading").id }
      : null,
    geometry_digest: geometryDigest(scene.elements),
    visual_reference_inputs: [],
    encounter_guest: guestName,
  };
}

function guestFor(sources, index, affinity) {
  if (affinity === 0) return null;
  if (affinity === 14) {
    const row = sources.dance[index];
    return {
      name: "The Dance",
      text: row.geometry_action,
      intensity: Number(row.intensity_0_to_4),
      source_field: "dance14_encounter_reference.geometry_action",
      proposal: row,
    };
  }
  const guest = sources.blue[affinity - 1];
  return {
    name: guest.name,
    text: guest.encounter_affordance,
    intensity: 2,
    source_field: "archetype_blueprints.encounter_affordance",
    proposal: null,
  };
}

export async function renderCard(sources, index, date, affinity, options = {}) {
  rejectAffinity(affinity);
  const canon = sources.canon[index];
  const blue = sources.blue[index];
  const card = {
    index: index + 1,
    name: canon.name,
    suit: canon.suit,
    rank: canon.rank,
    keywords: canon.keywords,
    upright: canon.upright,
    reversed: canon.reversed,
    image: canon.image,
    sort_order: canon.sort_order,
  };
  const guest = guestFor(sources, index, affinity);
  const recipe = recipeId(sources.hashes, date, affinity);
  const scene = buildScene(card, blue, guest, date, affinity, index + 1);
  const svg = svgFor(scene);
  const trace = traceFor(card, blue, affinity, date, recipe, scene, guest?.name ?? null);
  let png = null;
  if (options.raster !== false) {
    png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    const meta = await sharp(png).metadata();
    if (meta.width !== W || meta.height !== H) throw new Error(`Raster size ${meta.width}x${meta.height}`);
  }
  return { card, svg, png, trace, scene, guest };
}

function backScene() {
  const cx = W / 2;
  const cy = H / 2;
  const arm = (a0, a1, rx, ry) => arcPts(cx, cy, rx, ry, a0, a1, 40);
  const one = arm(0.35, 2.15, 300, 460);
  const two = one.map(([x, y]) => [W - x, H - y]);
  const inner = arm(0.9, 2.35, 140, 210);
  const innerTwin = inner.map(([x, y]) => [W - x, H - y]);
  const ring = arcPts(cx, cy, 54, 54, 0, Math.PI * 1.15, 28);
  const ringTwin = ring.map(([x, y]) => [W - x, H - y]);
  const strokes = [
    ["back-arc-a", one],
    ["back-arc-b", two],
    ["back-inner-a", inner],
    ["back-inner-b", innerTwin],
    ["back-ring-a", ring],
    ["back-ring-b", ringTwin],
  ];
  const body = strokes.map(([id, points]) => `<path id="${id}" d="${smoothOpen(points)}" fill="none" stroke="#d9c7a4" stroke-width="4" stroke-opacity="0.8" stroke-linecap="round"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<defs><radialGradient id="back-field" cx="50%" cy="50%" r="68%"><stop offset="0%" stop-color="#16130f"/><stop offset="100%" stop-color="${EDGE}"/></radialGradient></defs>\n<rect id="back-ground" width="${W}" height="${H}" fill="url(#back-field)"/>\n${body}\n</svg>`;
  return svg;
}

async function symmetricJpeg(svg) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const jpeg = await sharp(png).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
  const raw = await sharp(jpeg).ensureAlpha().raw().toBuffer();
  const meta = await sharp(jpeg).metadata();
  const width = meta.width;
  const height = meta.height;
  const ch = 4;
  let total = 0;
  const count = width * height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * ch;
      const j = ((height - 1 - y) * width + (width - 1 - x)) * ch;
      total += Math.abs(raw[i] - raw[j]) + Math.abs(raw[i + 1] - raw[j + 1]) + Math.abs(raw[i + 2] - raw[j + 2]);
    }
  }
  const mean = total / (count * 3);
  if (mean > 0.8) {
    const forced = await sharp(png).png().toBuffer();
    return { bytes: forced, mean, encoded: "png-bytes" };
  }
  return { bytes: jpeg, mean, encoded: "jpeg" };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function deckContext(sources, index, affinity) {
  const canon = sources.canon[index];
  const blue = sources.blue[index];
  if (affinity === 0) return { name: canon.name, canonical_index: index + 1, encounter_layer: null };
  if (affinity === 14) {
    const row = sources.dance[index];
    return {
      name: canon.name,
      canonical_index: index + 1,
      encounter_layer: {
        origin: "dance-authored",
        authored: false,
        editorial_status: row.editorial_status || "PROPOSAL — requires review",
        label: "PROPOSED ENCOUNTER",
        affinity_index: 14,
        affinity_name: "The Dance",
        axis: row.encounter_axis,
        action: row.geometry_action,
        intensity: Number(row.intensity_0_to_4),
        upright_proposal: row.upright_proposal,
        reversed_proposal: row.reversed_proposal,
        counterreading_question: row.counterreading_question,
        notice: "Proposed layer only. It does not replace the canonical meaning.",
      },
    };
  }
  const guest = sources.blue[affinity - 1];
  return {
    name: canon.name,
    canonical_index: index + 1,
    encounter_layer: {
      origin: "blueprint-derived",
      authored: false,
      label: "PROPOSED ENCOUNTER",
      affinity_index: affinity,
      affinity_name: guest.name,
      axis: `${canon.name} meets ${guest.name}`,
      action: guest.encounter_affordance,
      intensity: 2,
      upright_proposal: `With ${guest.name}, the relation offered is: ${guest.encounter_affordance}`,
      reversed_proposal: `The pairing can fail as ${canon.name} already warns: ${blue.failure_condition}`,
      counterreading_question: `What may ${guest.name} change about ${canon.name}, and what must remain?`,
      notice: "Generated from both blueprints. Not a replacement of the canonical meaning.",
    },
  };
}

export async function buildDeck(directory, date, affinity) {
  rejectAffinity(affinity);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date must be YYYY-MM-DD.");
  const sources = await loadSources();
  const recipe = recipeId(sources.hashes, date, affinity);
  await mkdir(path.join(directory, "images"), { recursive: true });
  await mkdir(path.join(directory, "svg"), { recursive: true });
  await mkdir(path.join(directory, "procedural_trace"), { recursive: true });
  await mkdir(path.join(directory, "back"), { recursive: true });
  await mkdir(path.join(directory, "provenance"), { recursive: true });
  const cards = [];
  const contexts = [];
  const files = new Map();
  const put = async (rel, data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await writeFile(path.join(directory, rel), buf);
    files.set(rel, buf);
  };
  for (let index = 0; index < 78; index += 1) {
    const drawn = await renderCard(sources, index, date, affinity);
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
    contexts.push(deckContext(sources, index, affinity));
  }
  const header = ["name", "suit", "rank", "keywords", "upright", "reversed", "image", "sort_order", "image_scale", "image_x", "image_y", "image_radius"];
  const lines = [header.join(",")];
  for (const card of cards) {
    const canon = sources.canon.find((row) => row.name === card.name);
    lines.push([
      card.name, card.suit, card.rank, card.keywords, card.upright, card.reversed,
      card.file.split("/").pop(), canon.sort_order, canon.image_scale, canon.image_x, canon.image_y, canon.image_radius,
    ].map(csvEscape).join(","));
  }
  await put("cards.csv", `${lines.join("\n")}\n`);
  await put("canonical_cards.csv", sources.files["canonical_cards.csv"]);
  await put("archetype_blueprints.csv", sources.files["archetype_blueprints.csv"]);
  await put("dance14_encounter_reference.csv", sources.files["dance14_encounter_reference.csv"]);
  await put("deck_contexts.json", `${JSON.stringify({ schema_version: "velomere-contexts/1", recipe_id: recipe, affinity, cards: contexts }, null, 2)}\n`);
  const affinityName = affinity === 0 ? "Neutral" : sources.canon[affinity - 1].name;
  const back = backScene();
  const raster = await symmetricJpeg(back);
  await put("back/card-back.svg", back);
  await put("back/card-back.jpg", raster.bytes);
  const deck = {
    schema_version: "velomere-encounter-renderer/2",
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
  const recipeDoc = {
    recipe_id: recipe,
    renderer: VERSION,
    recipe_version: "velomere-encounter-renderer/2",
    date,
    affinity,
    affinity_name: affinityName,
    source_hashes: sources.hashes,
    visual_reference_inputs: [],
    note: "Recipe identity is the renderer, the source hashes, the date, and the affinity. Paint is not a separate mode.",
  };
  await put("recipe.json", `${JSON.stringify(recipeDoc, null, 2)}\n`);
  await put("provenance/renderer-and-seed.json", `${JSON.stringify({ renderer: VERSION, recipe_id: recipe, date, affinity, visual_reference_inputs: [] }, null, 2)}\n`);
  const provenance = {
    renderer: VERSION,
    recipe_id: recipe,
    date,
    affinity,
    affinity_name: affinityName,
    source_hashes: sources.hashes,
    visual_reference_inputs: [],
    card_count: 78,
    back_rotation_mean: raster.mean,
    back_encoding: raster.encoded,
  };
  await put("provenance.json", `${JSON.stringify(provenance, null, 2)}\n`);
  const filesSha = {};
  for (const [rel, buf] of files) filesSha[rel] = sha256(buf);
  const manifest = {
    schema_version: "velomere-encounter-renderer/2",
    recipe_id: recipe,
    files_sha256: filesSha,
    files: Object.entries(filesSha).map(([filePath, digest]) => ({ path: filePath, sha256: digest })),
  };
  await put("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  const packed = {};
  for (const [rel, buf] of files) packed[rel] = new Uint8Array(buf);
  const zipped = zipSync(packed, { mtime: new Date(Date.UTC(2000, 5, 8)) });
  await writeFile(path.join(directory, "deck.zip"), zipped);
  return { recipe, cards, backMean: raster.mean };
}

export async function selfTest() {
  const sources = await loadSources();
  rejectAffinity(0);
  let failed = null;
  try {
    rejectAffinity(79);
  } catch (error) {
    failed = error;
  }
  if (!failed) throw new Error("Affinity 79 was accepted.");
  const digests = new Set();
  for (let i = 0; i < 78; i += 1) {
    const drawn = await renderCard(sources, i, "2026-11-12", 0, { raster: false });
    digests.add(drawn.trace.geometry_digest);
    if (drawn.trace.visual_reference_inputs.length) throw new Error("Visual reference recorded.");
    if (!drawn.svg.includes("identity-")) throw new Error(`No identity on ${drawn.card.name}`);
  }
  if (digests.size !== 78) throw new Error(`Expected 78 geometries, got ${digests.size}`);
  const quiet = await renderCard(sources, 7, "2026-11-12", 14, { raster: false });
  if (quiet.scene.elements.some((item) => item.layer === "encounter")) throw new Error("Null gained Dance strokes.");
  const neutral = await renderCard(sources, 0, "2026-11-12", 0, { raster: false });
  const dance = await renderCard(sources, 0, "2026-11-12", 14, { raster: false });
  const again = await renderCard(sources, 0, "2026-11-12", 14, { raster: false });
  const later = await renderCard(sources, 0, "2026-11-13", 14, { raster: false });
  if (neutral.trace.geometry_digest === dance.trace.geometry_digest) throw new Error("Dance did not change Shuffle geometry.");
  if (dance.svg !== again.svg) throw new Error("Repeat was not stable.");
  if (dance.trace.geometry_digest === later.trace.geometry_digest) throw new Error("Date did not change geometry.");
  const back = await symmetricJpeg(backScene());
  if (back.mean > 0.8) throw new Error(`Back rotation mean ${back.mean}`);
  return { digests: digests.size, backMean: back.mean, backEncoding: back.encoded, quiet: quiet.card.name };
}
