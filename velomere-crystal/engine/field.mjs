// @ts-nocheck
/**
 * Velomere relational-field renderer.
 * Version: velomere-relational-field-1
 *
 * Geometry is compiled from the canonical row, the archetype blueprint,
 * and — only when affinity is 14 — the authored Dance action.
 * No image, photograph, prior card, or workbench render is read.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import sharp from "sharp";

export const VERSION = "velomere-relational-field-1";
export const STYLE = "night-line-locked";
export const CANON_SHA = "340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9";
const W = 1400;
const H = 2300;
const INK = "#241c16";
const PAPER = "#f3efe6";
const NIGHT_INK = "#f3f1ea";
const LOCKED_WIDTH = 4.65;
const QUIET_NAMES = new Set([
  "The Null",
  "Void",
  "Seven of Hearings",
  "Five of Returns",
  "Six of Returns",
  "Eight of Sigils",
]);

const ROLE = {
  major: "#8d3b2a",
  hearings: "#1d4e62",
  paths: "#3c4a22",
  returns: "#5c3a6e",
  sigils: "#8a5314",
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = path.join(ROOT, "velomere-crystal", "DATA");
const BACK_JPG = path.join(ROOT, "public", "card-back-deck.jpg");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function mulberry32(hex) {
  let a = Number.parseInt(hex.slice(0, 8), 16);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
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
  for (const name of names) {
    const bytes = await readFile(path.join(DATA, name));
    files[name] = bytes;
  }
  const canonSha = sha256(files["canonical_cards.csv"]);
  if (canonSha !== CANON_SHA) throw new Error("Canonical source hash does not match.");
  const canon = parseCsv(files["canonical_cards.csv"].toString("utf8"));
  const blue = parseCsv(files["archetype_blueprints.csv"].toString("utf8"));
  const dance = parseCsv(files["dance14_encounter_reference.csv"].toString("utf8"));
  if (canon.length !== 78 || blue.length !== 78 || dance.length !== 78) throw new Error("Source tables must have 78 rows.");
  for (let i = 0; i < 78; i += 1) {
    if (canon[i].name !== blue[i].name || canon[i].name !== dance[i].name) throw new Error(`Name mismatch at ${i + 1}`);
    if (Number(blue[i].affinity_index) !== i + 1) throw new Error(`Affinity index mismatch at ${canon[i].name}`);
    if (Number(dance[i].affinity_index) !== 14 || dance[i].affinity_name !== "The Dance") throw new Error("Dance table is not affinity 14.");
  }
  const quiet = dance.filter((row) => Number(row.intensity_0_to_4) === 0).map((row) => row.name);
  for (const name of quiet) {
    if (!QUIET_NAMES.has(name)) throw new Error(`Unexpected quiet Dance card: ${name}`);
  }
  for (const name of QUIET_NAMES) {
    if (!quiet.includes(name)) throw new Error(`Missing quiet Dance card: ${name}`);
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
  if (!Number.isInteger(affinity) || affinity < 0 || affinity > 78) {
    throw new Error("Affinity must be a whole number from 0 to 78.");
  }
}

function boxOf() {
  return { x: 150, y: 190, w: 1100, h: 1920 };
}

function microFor(date, index) {
  const rng = mulberry32(sha256(`micro|${VERSION}|${date}|${index}`));
  return () => rng() - 0.5;
}

function wordCount(text) {
  const map = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, several: 4, few: 3, many: 5, multiple: 4 };
  const found = [];
  for (const match of text.toLowerCase().matchAll(/\b(one|two|three|four|five|six|seven|eight|several|few|many|multiple)\b/g)) {
    found.push(map[match[1]]);
  }
  return found;
}

function smoothOpen(points) {
  const p = points.map(([x, y]) => [Number(fmt(x)), Number(fmt(y))]);
  let d = `M ${fmt(p[0][0])} ${fmt(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i += 1) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}

function smoothClosed(points) {
  const p = points.map(([x, y]) => [Number(fmt(x)), Number(fmt(y))]);
  const n = p.length;
  let d = `M ${fmt(p[0][0])} ${fmt(p[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = p[(i - 1 + n) % n];
    const p1 = p[i];
    const p2 = p[(i + 1) % n];
    const p3 = p[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return `${d} Z`;
}

function lineD(points) {
  return points.map((pt, i) => `${i ? "L" : "M"} ${fmt(pt[0])} ${fmt(pt[1])}`).join(" ");
}

function wave(x0, y0, x1, y1, amp, cycles, phase, samples = 28) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [];
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const w = Math.sin(u * cycles * Math.PI * 2 + phase) * amp;
    pts.push([x0 + dx * u + nx * w, y0 + dy * u + ny * w]);
  }
  return pts;
}

function orbit(cx, cy, rx, ry, amps, phase, steps = 64) {
  const pts = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    let scale = 1;
    amps.forEach((amp, k) => {
      scale += amp * Math.sin((k + 2) * t + phase * (k + 1));
    });
    pts.push([cx + Math.cos(t) * rx * scale, cy + Math.sin(t) * ry * scale]);
  }
  return pts;
}

function spiral(cx, cy, r0, r1, turns, phase, power = 1.2) {
  const n = Math.max(24, Math.round(turns * 32));
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const a = phase + u * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * u ** power;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.08]);
  }
  return pts;
}

function arcPts(cx, cy, rx, ry, a0, a1, steps = 28) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return pts;
}

function mark(elements, partial) {
  elements.push(partial);
  return `e${elements.length}`;
}

function classifyIdentity(row) {
  const text = `${row.identity_geometry} || ${row.negative_space_rule} || ${row.failure_condition}`;
  const rules = [
    [/branching openings/i, "branch-openings"],
    [/orbital contours/i, "orbital-contours"],
    [/orienting axis/i, "orienting-axis"],
    [/Directional vectors/i, "opposed-vectors"],
    [/discontinuous contour/i, "broken-threshold"],
    [/observational arcs/i, "observational-arcs"],
    [/changes medium/i, "two-media"],
    [/stopped path/i, "stopped-open-center"],
    [/reaching arc/i, "reaching-arc"],
    [/single emergence/i, "emergence"],
    [/deliberate crossing/i, "sheltered-crossing"],
    [/approaches to a gate/i, "porous-gate"],
    [/different physical orientation/i, "reoriented-path"],
    [/independently paced strands/i, "paced-strands"],
    [/situated anchor/i, "situated-anchor"],
    [/returning waveform/i, "returning-wave"],
    [/provisional higher contour/i, "provisional-contour"],
    [/Fragments of a broken/i, "broken-fragments"],
    [/generating lines/i, "generating-lines"],
    [/Successive frames/i, "successive-frames"],
    [/contained ignition/i, "contained-ignition"],
    [/unclasped perimeter/i, "unclasped-perimeter"],
    [/listening cusp/i, "listening-cusp"],
    [/quiet pulses/i, "unequal-pulses"],
    [/nested questions/i, "nested-questions"],
    [/Invitation shaped/i, "open-invitation"],
    [/attentive marks/i, "attentive-detail"],
    [/timing gate/i, "timing-gate"],
    [/quiet line/i, "quiet-line"],
    [/direction cue/i, "direction-cue"],
    [/self-supporting/i, "self-supporting"],
    [/surprising incoming/i, "surprised-arc"],
    [/raw signal/i, "raw-signal"],
    [/speaking line/i, "speaking-line"],
    [/sheltering field/i, "sheltering-field"],
    [/testimony strokes/i, "testimony"],
    [/clean separation/i, "clean-separation"],
    [/independently visible scaffold/i, "scaffold-rise"],
    [/countervector/i, "negotiated-vectors"],
    [/mechanism diagram/i, "mechanism-interval"],
    [/developmental stages/i, "developmental-stages"],
    [/reversible approaches/i, "scope-threshold"],
    [/interface frame/i, "interface-frame"],
    [/recurrence includes a difference/i, "differing-recurrence"],
    [/damaged calibration/i, "damaged-mark"],
    [/prompt-trigger/i, "trigger-upstream"],
    [/genuine refusal/i, "refusal-gap"],
    [/spoken division/i, "spoken-division"],
    [/navigable enclosure/i, "navigable-room"],
    [/different explicit criteria/i, "criteria-lanes"],
    [/home-directed curve/i, "home-curve"],
    [/revised premise/i, "revised-cycle"],
    [/separately chosen speeds/i, "chosen-paces"],
    [/central posture/i, "posture-reset"],
    [/release gesture/i, "release-gesture"],
    [/non-event/i, "held-delay"],
    [/curvature under strain/i, "strain-line"],
    [/geometric alphabet/i, "two-alphabets"],
    [/banks of an interruption/i, "interruption-banks"],
    [/each revolution/i, "measured-spiral"],
    [/fragile trace/i, "fragile-return"],
    [/different depth/i, "renewed-depth"],
    [/surviving histories/i, "layered-habitat"],
    [/homecoming paths/i, "compared-returns"],
    [/first mark/i, "first-mark"],
    [/intentionally displaced/i, "displaced-return"],
    [/relational braid/i, "three-strand-braid"],
    [/public sign/i, "public-sign"],
    [/breathlike motion/i, "breath-sign"],
    [/Several roles/i, "role-field"],
    [/against extraction/i, "protected-mark"],
    [/incomplete emblem/i, "occupied-pause"],
    [/revisions remain recoverable/i, "recoverable-revisions"],
    [/nonuniform consequences/i, "aftermath-paths"],
    [/unhealed cut/i, "cut-profile"],
    [/name-shaped call/i, "address-call"],
    [/breathable context/i, "shared-signs"],
    [/nested reflections/i, "nested-witness"],
  ];
  const hit = rules.filter((rule) => rule[0].test(text));
  if (hit.length !== 1) {
    throw new Error(`Identity for ${row.name} matched ${hit.length} grammars: ${row.identity_geometry}`);
  }
  return hit[0][1];
}

function buildIdentity(family, row, j) {
  const b = boxOf();
  const cx = b.x + b.w * 0.5 + j() * 10;
  const cy = b.y + b.h * 0.48 + j() * 10;
  const elements = [];
  const anchors = [];
  const reserves = [];
  const push = (points, extra = {}) => {
    const id = `identity-${elements.length + 1}`;
    const closed = Boolean(extra.closed);
    elements.push({
      id,
      d: extra.angular ? lineD(points) : closed ? smoothClosed(points) : smoothOpen(points),
      layer: "identity",
      width: extra.width ?? 9,
      opacity: extra.opacity ?? 0.92,
      dash: extra.dash ?? null,
      color: INK,
    });
    anchors.push({ x: points[0][0], y: points[0][1], role: "start" });
    anchors.push({ x: points[points.length - 1][0], y: points[points.length - 1][1], role: "end" });
    return id;
  };
  const reserve = (x, y, r, reason) => reserves.push({ x, y, r, reason });

  if (family === "branch-openings") {
    const origin = [b.x + b.w * 0.34, b.y + b.h * 0.62];
    const specs = [
      [-0.95, 0.72, 80],
      [-0.15, 0.5, -30],
      [0.62, 0.66, 50],
      [1.28, 0.38, -10],
    ];
    specs.forEach((spec, index) => {
      const [ang, len, bow] = spec;
      const end = [origin[0] + Math.cos(ang) * b.w * len, origin[1] + Math.sin(ang) * b.h * len * 0.42];
      const mid = [(origin[0] + end[0]) / 2 - Math.sin(ang) * bow, (origin[1] + end[1]) / 2 + Math.cos(ang) * bow * 0.4];
      push([origin, mid, end], { opacity: index === 3 ? 0.28 : 0.94, width: index === 3 ? 5 : 10 });
    });
    reserve(origin[0] + 40, origin[1] - 220, 70, "unselected corridor stays unexplained");
  } else if (family === "orbital-contours") {
    const c1 = [cx - 190, cy - 40];
    const c2 = [cx + 210, cy + 120];
    push(orbit(c1[0], c1[1], 250, 300, [0.16, -0.07, 0.04], 0.4), { closed: true, width: 8 });
    push(orbit(c2[0], c2[1], 210, 250, [-0.05, 0.14, 0.03], 1.7), { closed: true, width: 8 });
    anchors.push({ x: c1[0], y: c1[1], role: "center" }, { x: c2[0], y: c2[1], role: "center" });
    reserve(c1[0], c1[1], 70, "first center stays independent");
    reserve(c2[0], c2[1], 60, "second center stays independent");
    reserve((c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, 36, "interval between wholes is still open");
  } else if (family === "orienting-axis") {
    push([[cx - 30, b.y + 160], [cx + 10, b.y + b.h - 180]], { width: 11 });
    push([[cx + 20, cy + 80], [cx + 150, cy + 40]], { width: 8 });
    reserve(cx, cy, 120, "uncluttered zone around the axis");
  } else if (family === "opposed-vectors") {
    const start = [b.x + 180, cy + 80];
    const tip = [b.x + b.w - 280, cy - 160];
    push([start, [(start[0] + tip[0]) / 2, (start[1] + tip[1]) / 2 - 20], tip], { width: 11 });
    push([[tip[0] - 70, tip[1] + 36], tip], { angular: true, width: 8 });
    push([[tip[0] - 36, tip[1] + 70], tip], { angular: true, width: 8 });
    push([[b.x + b.w - 220, b.y + b.h - 360], [b.x + 460, b.y + b.h - 280]], { width: 12, opacity: 0.8 });
    reserve(tip[0] + 40, tip[1] - 80, 90, "space ahead of the vector");
  } else if (family === "broken-threshold") {
    const x = b.x + b.w * 0.58;
    push([[x, b.y + 220], [x + 16, cy - 80]], { width: 8, opacity: 0.55 });
    push([[x - 10, cy + 120], [x + 8, b.y + b.h - 240]], { width: 8, opacity: 0.55 });
    push(arcPts(x - 180, cy, 200, 260, 0.4, 2.4), { width: 10 });
    reserve(x + 180, cy, 150, "unentered side of the threshold");
  } else if (family === "observational-arcs") {
    push(arcPts(cx - 40, cy, 280, 340, 2.4, 4.3), { width: 8, opacity: 0.75 });
    push(arcPts(cx + 80, cy + 30, 220, 300, 2.7, 4.6), { width: 7, opacity: 0.7 });
    push([[cx - 360, cy + 300], [cx - 40, cy + 40]], { width: 6 });
    reserve(cx + 20, cy - 10, 80, "sightline stops before the witnessed center");
  } else if (family === "two-media") {
    const seq = [[0, 0], [0.2, -0.3], [0.45, 0.15], [0.7, -0.2], [1, 0.05]];
    const curve = seq.map(([u, v]) => [b.x + 180 + u * 760, b.y + 520 + v * 220]);
    const angular = seq.map(([u, v]) => [b.x + 180 + u * 760, b.y + 1080 + v * 180]);
    push(curve, { width: 9 });
    push(angular, { angular: true, width: 8 });
  } else if (family === "stopped-open-center") {
    reserve(cx, cy, 210, "open center is the principal feature");
    push(arcPts(cx, cy, 280, 320, 0.2, 1.7), { width: 10 });
    push(arcPts(cx, cy, 280, 320, 2.5, 3.6), { width: 10 });
  } else if (family === "reaching-arc") {
    push(arcPts(cx - 40, cy + 80, 340, 260, 2.6, 4.4), { width: 10 });
    reserve(cx + 180, cy - 20, 90, "interval between reach and contact");
  } else if (family === "emergence") {
    const origin = [b.x + 200, cy + 40];
    for (let i = 0; i < 5; i += 1) {
      push([[origin[0] - 10, origin[1] + i * 16 - 32], [origin[0] + 36, origin[1] + i * 12 - 20]], { width: 6, opacity: 0.7 });
    }
    push([origin, [origin[0] + 260, origin[1] - 80], [b.x + b.w - 220, b.y + 420]], { width: 9 });
    reserve(b.x + b.w * 0.72, b.y + 360, 140, "unoccupied outward field");
  } else if (family === "sheltered-crossing") {
    push(arcPts(b.x + 280, cy, 120, 300, -1.2, 1.2), { width: 11 });
    push([[b.x + 180, cy + 40], [b.x + 300, cy], [b.x + b.w - 260, cy - 220]], { width: 10 });
    push([[b.x + b.w - 300, cy - 80], [b.x + 340, cy + 180]], { width: 6, opacity: 0.55 });
  } else if (family === "porous-gate") {
    const x = cx;
    push([[x - 18, cy - 220], [x - 18, cy - 50]], { width: 12 });
    push([[x - 18, cy + 70], [x - 18, cy + 240]], { width: 12 });
    push([[b.x + 180, cy + 160], [x - 70, cy + 20]], { width: 8 });
    push([[b.x + b.w - 180, cy - 140], [x + 80, cy - 10]], { width: 8 });
    reserve(x + 120, cy, 50, "threshold stays open");
  } else if (family === "reoriented-path") {
    push([[b.x + 200, b.y + b.h - 360], [cx - 40, cy + 40], [cx + 180, cy - 260], [b.x + b.w - 200, cy - 300]], { width: 10 });
    push([[cx + 40, cy + 200], [cx + 40, cy - 180]], { width: 8, opacity: 0.7 });
    reserve(b.x + b.w - 180, b.y + 280, 80, "margin for the unexpected remainder");
  } else if (family === "paced-strands") {
    push(wave(b.x + 220, b.y + 280, b.x + 220, b.y + b.h - 280, 70, 3.2, 0.4), { width: 8 });
    push(wave(b.x + 520, b.y + 360, b.x + 560, b.y + b.h - 240, 110, 2.1, 1.3), { width: 8 });
    reserve(b.x + 370, cy, 60, "between-strand space stays alive");
  } else if (family === "situated-anchor") {
    push([[cx - 36, cy], [cx + 36, cy]], { width: 10 });
    push([[cx, cy - 36], [cx, cy + 28]], { width: 10 });
    push([[cx + 70, cy - 80], [cx + 110, cy - 60]], { width: 5, opacity: 0.6 });
    push([[cx - 90, cy + 70], [cx - 50, cy + 96]], { width: 5, opacity: 0.6 });
    reserve(cx, cy - 280, 100, "presence does not flood the field");
  } else if (family === "returning-wave") {
    push(wave(b.x + 180, cy - 80, b.x + b.w - 220, cy - 80, 64, 2.4, 0.2), { width: 9 });
    push(wave(b.x + b.w - 220, cy + 120, b.x + 280, cy + 120, 96, 2.1, 1.4), { width: 8 });
    reserve(cx, cy + 10, 40, "gap between statement and return");
  } else if (family === "provisional-contour") {
    push(arcPts(cx, b.y + 520, 320, 180, 3.4, 6.0), { width: 9 });
    push([[b.x + 240, b.y + b.h - 320], [cx - 80, cy + 80], [cx + 40, b.y + 760]], { width: 8 });
    reserve(cx, b.y + 360, 50, "the higher model stays incomplete");
  } else if (family === "broken-fragments") {
    const y = cy;
    push([[b.x + 180, y - 40], [b.x + 340, y - 10]], { width: 11 });
    push([[b.x + 410, y + 30], [b.x + 560, y - 20]], { width: 11 });
    push([[b.x + 640, y + 50], [b.x + 820, y + 10]], { width: 11 });
    push([[b.x + 900, y - 30], [b.x + 1040, y + 40]], { width: 10 });
    reserve(b.x + 370, y, 24, "former join stays open");
  } else if (family === "generating-lines") {
    const root = [b.x + 260, b.y + b.h - 340];
    [[0.4, 0.7], [-0.2, 0.55], [0.9, 0.48]].forEach(([ang, len]) => {
      const end = [root[0] + Math.cos(ang) * 700 * len, root[1] - Math.sin(ang) * 900 * len];
      push([root, end], { width: 10 });
      push([[end[0] + 20, end[1]], [end[0] + 80, end[1] - 36]], { width: 6, opacity: 0.7 });
    });
  } else if (family === "successive-frames") {
    for (let i = 0; i < 4; i += 1) {
      const y = b.y + 300 + i * 360;
      const drift = i * 28;
      push([[b.x + 200 + drift, y], [b.x + 420, y - 80 - i * 16], [b.x + 700, y + 20], [b.x + 980 - drift, y - 40]], { width: 8, opacity: 0.45 + i * 0.15 });
    }
  } else if (family === "contained-ignition") {
    const origin = [cx - 80, cy + 60];
    const rays = [
      [0.1, 0.9],
      [0.7, 0.45],
      [1.3, 0.75],
      [2.0, 0.35],
      [2.6, 0.8],
      [3.5, 0.4],
      [4.4, 0.62],
      [5.3, 0.28],
    ];
    rays.forEach(([ang, len]) => {
      const end = [origin[0] + Math.cos(ang) * 460 * len, origin[1] + Math.sin(ang) * 460 * len];
      push([origin, end], { width: 7, opacity: 0.75 + len * 0.2 });
    });
    push(arcPts(origin[0] + 40, origin[1] - 20, 300, 240, -0.4, 1.1), { width: 8, opacity: 0.55 });
    reserve(origin[0] - 260, origin[1] + 40, 80, "cooling zone");
  } else if (family === "unclasped-perimeter") {
    push(arcPts(cx, cy, 340, 420, 0.6, 5.3), { width: 8, opacity: 0.75 });
    reserve(cx, cy, 220, "unowned openness");
  } else if (family === "listening-cusp") {
    push(arcPts(b.x + 360, cy, 140, 180, 2.2, 4.2), { width: 9 });
    reserve(cx + 80, cy, 200, "attentive pause");
  } else if (family === "unequal-pulses") {
    for (let i = 0; i < 3; i += 1) push([[b.x + 280, cy - 80 + i * 48], [b.x + 340, cy - 100 + i * 48]], { width: 8 });
    for (let i = 0; i < 3; i += 1) push([[b.x + 620, cy + 40 + i * 70], [b.x + 700, cy + 10 + i * 70]], { width: 8 });
    reserve(b.x + 480, cy, 50, "pause between breaths");
  } else if (family === "nested-questions") {
    push(arcPts(cx, cy, 360, 420, 0.5, 5.2), { width: 8 });
    push(arcPts(cx, cy, 240, 280, 0.9, 4.6), { width: 8 });
    push(arcPts(cx, cy, 120, 140, 1.4, 3.4), { width: 8 });
    reserve(cx, cy, 40, "unanswered center");
  } else if (family === "open-invitation") {
    push(arcPts(cx, cy, 300, 360, 0.8, 5.0), { width: 9 });
    push([[b.x + 200, cy + 200], [cx - 180, cy + 40]], { width: 8 });
    reserve(cx + 40, cy, 90, "unoccupied place inside the invitation");
  } else if (family === "attentive-detail") {
    push([[cx - 20, cy], [cx + 30, cy - 16]], { width: 8 });
    [[-80, -40], [70, -20], [40, 60], [-50, 70], [10, -80]].forEach(([dx, dy], index) => {
      push([[cx + dx, cy + dy], [cx + dx + 16, cy + dy - 10 - index]], { width: 4, opacity: 0.8 });
    });
    reserve(cx, cy - 200, 80, "breathing room around the detail");
  } else if (family === "timing-gate") {
    push([[cx - 8, cy - 180], [cx - 8, cy - 40]], { width: 10 });
    push([[cx - 8, cy + 40], [cx - 8, cy + 180]], { width: 10 });
    push([[b.x + 220, cy + 20], [cx - 50, cy + 10]], { width: 8 });
    reserve(cx + 160, cy, 100, "unspoken interval");
  } else if (family === "quiet-line") {
    push([[b.x + 220, cy], [b.x + b.w - 220, cy + 12]], { width: 7 });
    reserve(cx, cy - 200, 160, "untouched field");
  } else if (family === "direction-cue") {
    push([[b.x + 200, cy + 40], [b.x + b.w - 240, cy - 80]], { width: 10 });
    push([[b.x + 420, cy + 120], [b.x + 480, cy - 20]], { width: 6, opacity: 0.55 });
    push([[b.x + 680, cy + 80], [b.x + 740, cy - 40]], { width: 6, opacity: 0.55 });
    reserve(b.x + b.w - 160, cy - 120, 70, "room ahead of the cue");
  } else if (family === "self-supporting") {
    push([[cx - 180, cy + 160], [cx - 20, cy - 180]], { width: 9 });
    push([[cx + 160, cy + 140], [cx + 10, cy - 160]], { width: 9 });
    push([[cx - 150, cy + 150], [cx + 150, cy + 120]], { width: 8, opacity: 0.8 });
  } else if (family === "surprised-arc") {
    push(arcPts(cx - 40, cy, 300, 220, 2.8, 5.6), { width: 9 });
    push([[b.x + b.w - 180, b.y + 260], [cx + 80, cy - 20], [cx - 20, cy + 160]], { width: 8 });
    reserve(b.x + b.w - 140, cy + 200, 60, "open edge beyond the surprise");
  } else if (family === "raw-signal") {
    push([[b.x + 280, cy + 40], [b.x + 360, cy - 10], [b.x + 470, cy + 30], [b.x + 560, cy]], { width: 4, opacity: 0.75 });
    reserve(cx + 100, cy, 120, "sparse field around a raw signal");
  } else if (family === "speaking-line") {
    push([[b.x + 200, cy + 80], [cx, cy - 40], [b.x + b.w - 340, cy - 160]], { width: 10 });
    push([[b.x + b.w - 220, cy + 80], [b.x + b.w - 180, cy + 40]], { width: 8 });
    reserve(b.x + b.w - 280, cy, 40, "distance between speaker and receiver");
  } else if (family === "sheltering-field") {
    push(arcPts(cx, cy, 380, 460, 0.3, 1.5), { width: 9 });
    push(arcPts(cx, cy, 380, 460, 2.0, 3.2), { width: 9 });
    push(arcPts(cx, cy, 380, 460, 3.8, 5.4), { width: 9 });
    push([[cx - 80, cy + 40], [cx + 60, cy - 20], [cx + 40, cy - 160]], { width: 7, opacity: 0.75 });
  } else if (family === "testimony") {
    [[-0.6, 260], [0.4, 300], [1.5, 240], [2.4, 280]].forEach(([ang, rad]) => {
      const inner = [cx + Math.cos(ang) * 120, cy + Math.sin(ang) * 120];
      const outer = [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
      push([outer, inner], { width: 7 });
    });
    reserve(cx, cy, 100, "center is not occupied");
  } else if (family === "clean-separation") {
    push(wave(b.x + 180, cy - 80, cx - 80, cy + 40, 36, 1.4, 0.2), { width: 9 });
    push([[cx + 120, cy - 160], [cx + 260, cy + 20], [b.x + b.w - 180, cy + 80], [b.x + b.w - 200, cy + 200]], { angular: true, width: 8 });
    reserve(cx, cy, 40, "open interval between the two forms");
  } else if (family === "scaffold-rise") {
    push([[b.x + 240, b.y + b.h - 300], [cx - 40, cy], [b.x + b.w - 240, b.y + 320]], { width: 9 });
    push([[b.x + 200, cy + 80], [b.x + 200, cy - 220], [cx + 40, cy - 220]], { angular: true, width: 7, opacity: 0.6 });
    push([[cx + 40, cy - 80], [cx + 40, cy + 160]], { angular: true, width: 7, opacity: 0.6 });
  } else if (family === "negotiated-vectors") {
    push([[b.x + 200, cy + 80], [b.x + b.w - 260, cy - 200]], { width: 11 });
    push(arcPts(cx + 40, cy + 40, 260, 180, 0.2, 2.4), { width: 9 });
    push([[b.x + 280, b.y + b.h - 280], [cx, cy + 220], [b.x + b.w - 300, cy + 80]], { width: 7, opacity: 0.75 });
  } else if (family === "mechanism-interval") {
    for (let i = 0; i < 4; i += 1) push([[b.x + 220, b.y + 480 + i * 80], [b.x + 720, b.y + 480 + i * 80]], { angular: true, width: 4, opacity: 0.45 });
    for (let i = 0; i < 5; i += 1) push([[b.x + 260 + i * 110, b.y + 460], [b.x + 260 + i * 110, b.y + 760]], { angular: true, width: 4, opacity: 0.45 });
    push([[b.x + 300, b.y + 900], [cx, cy - 40], [b.x + b.w - 180, b.y + 360]], { width: 9 });
    reserve(b.x + b.w - 200, b.y + 300, 70, "space beyond the mechanism");
  } else if (family === "developmental-stages") {
    push([[b.x + 200, b.y + 460], [b.x + b.w - 240, b.y + 420]], { width: 8 });
    push(arcPts(cx, b.y + 860, 340, 80, 0.2, 2.9), { width: 8 });
    push([[b.x + 240, b.y + 1180], [b.x + 400, b.y + 1280], [b.x + 620, b.y + 1160], [b.x + 860, b.y + 1300]], { width: 8 });
    push([[cx, b.y + 500], [cx - 20, b.y + 820]], { width: 5, opacity: 0.6 });
  } else if (family === "scope-threshold") {
    const x = b.x + b.w * 0.62;
    push([[x, b.y + 240], [x, b.y + b.h - 240]], { width: 8, opacity: 0.7 });
    push([[b.x + 200, cy + 40], [x - 30, cy]], { width: 8 });
    push([[x - 10, cy - 16], [x + 70, cy - 10]], { width: 8 });
    reserve(x + 180, cy, 120, "unclimbed side");
  } else if (family === "interface-frame") {
    const x = cx - 40;
    const y = cy - 80;
    push([[x - 160, y - 200], [x + 180, y - 200], [x + 180, y + 220], [x - 160, y + 220], [x - 160, y - 200]], { angular: true, width: 8 });
    push([[b.x + 160, cy + 40], [x - 180, cy - 20]], { width: 7 });
    push([[x + 200, cy + 10], [b.x + b.w - 80, cy - 60]], { width: 7 });
    reserve(x, y, 80, "nothing is filled behind the interface");
  } else if (family === "differing-recurrence") {
    for (let i = 0; i < 3; i += 1) {
      push(arcPts(cx - 20 + i * 18, cy + i * 36, 260 + i * 20, 160, 0.4 + i * 0.18, 2.6 + i * 0.1), { width: 7, opacity: 0.55 + i * 0.15 });
    }
  } else if (family === "damaged-mark") {
    push([[b.x + 240, cy - 20], [b.x + 420, cy + 10]], { width: 10 });
    push([[b.x + 500, cy - 30], [b.x + 640, cy + 20]], { width: 10 });
    push(orbit(b.x + 860, cy + 10, 70, 54, [0.08, 0.04], 0.2, 32), { closed: true, width: 8 });
  } else if (family === "trigger-upstream") {
    push([[cx + 40, cy + 20], [cx + 120, cy - 10]], { width: 10 });
    push([[cx - 80, cy - 80], [b.x + 240, b.y + 420], [b.x + 200, b.y + 700]], { width: 7 });
    push([[cx - 40, cy + 80], [b.x + 300, b.y + b.h - 360]], { width: 7 });
    reserve(cx + 200, cy - 160, 80, "open upstream field");
  } else if (family === "refusal-gap") {
    push(arcPts(cx - 220, cy, 180, 240, 0.6, 2.6), { width: 9 });
    push(arcPts(cx + 220, cy, 180, 220, 3.8, 5.8), { width: 9 });
    reserve(cx, cy, 70, "unbridged gap");
  } else if (family === "spoken-division") {
    push([[cx, b.y + 300], [cx + 16, b.y + b.h - 320]], { width: 8 });
    push(wave(b.x + 200, cy - 40, cx - 40, cy + 20, 30, 1.6, 0.3), { width: 8 });
    reserve(cx + 160, cy, 80, "room for a reply");
  } else if (family === "navigable-room") {
    push([[b.x + 240, b.y + 360], [b.x + b.w - 240, b.y + 340]], { width: 9 });
    push([[b.x + 240, b.y + 360], [b.x + 230, cy - 40]], { width: 9 });
    push([[b.x + 230, cy + 80], [b.x + 240, b.y + b.h - 320], [b.x + b.w - 240, b.y + b.h - 300]], { width: 9 });
    push([[b.x + b.w - 240, b.y + 500], [b.x + b.w - 240, b.y + b.h - 460]], { width: 9 });
    push([[b.x + 360, cy + 40], [cx + 40, cy - 80], [b.x + b.w - 360, cy + 20]], { width: 7 });
  } else if (family === "criteria-lanes") {
    push([[b.x + 240, b.y + 400], [b.x + 240, b.y + b.h - 360]], { width: 7 });
    push([[b.x + 560, b.y + 400], [b.x + 560, b.y + b.h - 360]], { width: 7 });
    for (let i = 0; i < 5; i += 1) push([[b.x + 240, b.y + 480 + i * 200], [b.x + 310, b.y + 480 + i * 200]], { width: 5 });
    for (let i = 0; i < 3; i += 1) push([[b.x + 560, b.y + 560 + i * 340], [b.x + 650, b.y + 560 + i * 340]], { width: 5 });
  } else if (family === "home-curve") {
    push(spiral(cx + 40, cy + 80, 40, 380, 1.35, 0.8, 1.05).slice(0, 40), { width: 9 });
    push(arcPts(cx + 30, cy + 70, 36, 28, 0.4, 2.2), { width: 7 });
  } else if (family === "revised-cycle") {
    push(arcPts(cx - 20, cy, 260, 300, 0.3, 5.4), { width: 8, opacity: 0.55 });
    push(arcPts(cx + 50, cy - 30, 300, 250, 0.8, 5.2), { width: 9 });
  } else if (family === "chosen-paces") {
    const a = [[b.x + 180, b.y + 360], [cx - 40, cy - 20]];
    const c = [[b.x + b.w - 180, b.y + 520], [cx + 30, cy + 10]];
    push([...a, [cx + 80, cy + 40]], { width: 8 });
    push(c, { width: 8 });
    for (let i = 1; i <= 4; i += 1) push([[a[0][0] + i * 70, a[0][1] + i * 80], [a[0][0] + i * 70 + 12, a[0][1] + i * 80]], { width: 4 });
    for (let i = 1; i <= 2; i += 1) push([[c[0][0] - i * 120, c[0][1] + i * 70], [c[0][0] - i * 120 + 12, c[0][1] + i * 70]], { width: 4 });
  } else if (family === "posture-reset") {
    push([[cx, cy - 80], [cx + 8, cy + 80]], { width: 11 });
    push([[b.x + 200, b.y + 400], [b.x + 460, b.y + 460]], { width: 6, opacity: 0.6 });
    push([[b.x + b.w - 420, b.y + b.h - 420], [b.x + b.w - 180, b.y + b.h - 300]], { width: 6, opacity: 0.6 });
  } else if (family === "release-gesture") {
    push([[cx - 40, cy], [b.x + 220, cy - 160]], { width: 9 });
    push([[cx + 20, cy + 10], [cx + 180, cy + 30]], { width: 7, opacity: 0.45 });
    reserve(b.x + b.w - 240, cy, 140, "freed side stays empty");
  } else if (family === "held-delay") {
    push([[b.x + 280, cy], [b.x + 320, cy]], { width: 8 });
    push([[b.x + b.w - 320, cy + 16], [b.x + b.w - 280, cy + 16]], { width: 8 });
    reserve(cx, cy, 180, "the held interval is dominant");
  } else if (family === "strain-line") {
    push([[b.x + 200, cy + 40], [cx - 80, cy - 10], [cx + 20, cy + 70], [cx + 140, cy - 20], [b.x + b.w - 200, cy + 10]], { width: 10 });
  } else if (family === "two-alphabets") {
    const turns = [[0, 0], [0.25, -0.35], [0.5, 0.2], [0.75, -0.15], [1, 0.05]];
    push(turns.map(([u, v]) => [b.x + 180 + u * 780, b.y + 560 + v * 200]), { width: 9 });
    push(turns.map(([u, v]) => [b.x + 180 + u * 780, b.y + 1100 + v * 160]), { angular: true, width: 8 });
  } else if (family === "interruption-banks") {
    push(wave(b.x + 160, cy - 40, cx - 120, cy + 20, 28, 1.5, 0.2), { width: 9 });
    push(wave(cx + 140, cy + 80, b.x + b.w - 160, cy - 20, 36, 1.2, 1), { width: 9 });
    reserve(cx, cy, 50, "the gap persists");
  } else if (family === "measured-spiral") {
    push(spiral(cx, cy + 40, 30, 460, 2.4, 0.5, 1.45), { width: 8 });
  } else if (family === "fragile-return") {
    push(arcPts(cx, cy, 280, 200, 0.5, 2.2), { width: 6, opacity: 0.8 });
    push(arcPts(cx, cy, 280, 200, 3.1, 4.4), { width: 6, opacity: 0.8 });
  } else if (family === "renewed-depth") {
    push(arcPts(cx, b.y + 520, 300, 90, 0.3, 2.8), { width: 6, opacity: 0.35 });
    push(arcPts(cx, b.y + 1100, 320, 110, 0.2, 2.9), { width: 10 });
  } else if (family === "layered-habitat") {
    [[360, 420, 260, 180], [700, 780, 300, 200], [480, 1200, 340, 220]].forEach(([x, y, rw, rh]) => {
      push(arcPts(b.x + x, b.y + y, rw, rh, 0.4, 5.4), { width: 7, opacity: 0.8 });
    });
    push([[b.x + 500, b.y + 560], [b.x + 620, b.y + 860]], { width: 6 });
    push([[b.x + 760, b.y + 980], [b.x + 640, b.y + 1160]], { width: 6 });
  } else if (family === "compared-returns") {
    push(arcPts(cx - 160, cy, 150, 220, 0.5, 2.8), { width: 8 });
    push(arcPts(cx + 170, cy + 16, 156, 210, 0.55, 2.7), { width: 8 });
    push([[cx + 250, cy - 80], [cx + 290, cy - 40]], { width: 6 });
  } else if (family === "first-mark") {
    push(arcPts(cx, cy, 180, 240, 0.7, 4.6), { width: 10 });
  } else if (family === "displaced-return") {
    push(arcPts(cx - 16, cy, 220, 280, 0.4, 5.5), { width: 8, opacity: 0.55 });
    push(arcPts(cx + 36, cy + 24, 230, 270, 0.7, 5.3), { width: 9 });
  } else if (family === "three-strand-braid") {
    for (let s = 0; s < 3; s += 1) {
      push(wave(b.x + 220, b.y + 300, b.x + 220 + s * 10, b.y + b.h - 300, 90, 2.5, s * 2.1), { width: 7 + s, opacity: 0.78 });
    }
  } else if (family === "public-sign") {
    push([[cx - 80, cy + 80], [cx, cy - 120], [cx + 110, cy + 60]], { angular: true, width: 10 });
    push([[b.x + 200, cy + 160], [cx - 100, cy + 70]], { width: 7 });
    push([[b.x + b.w - 200, cy + 40], [cx + 120, cy + 50]], { width: 7 });
  } else if (family === "breath-sign") {
    push([[b.x + 260, cy + 80], [b.x + 260, cy - 160], [b.x + 460, cy - 160]], { angular: true, width: 6, opacity: 0.55 });
    push([[b.x + 300, cy + 40], [cx, cy - 20], [b.x + b.w - 200, b.y + 380]], { width: 9 });
  } else if (family === "role-field") {
    push(arcPts(b.x + 320, cy - 80, 70, 90, 0.4, 4.2), { width: 8 });
    push([[cx + 20, cy + 40], [cx + 80, cy - 80], [cx + 150, cy + 20]], { angular: true, width: 8 });
    push([[b.x + b.w - 360, cy + 120], [b.x + b.w - 280, cy + 40], [b.x + b.w - 220, cy + 150]], { width: 8 });
  } else if (family === "protected-mark") {
    push(arcPts(cx, cy, 80, 110, 0.8, 4.8), { width: 9 });
    push(arcPts(cx, cy, 220, 260, 0.2, 5.6), { width: 7, opacity: 0.7 });
  } else if (family === "occupied-pause") {
    push(arcPts(cx, cy, 300, 360, 0.9, 5.2), { width: 9 });
    reserve(cx, cy, 160, "internal vacancy");
  } else if (family === "recoverable-revisions") {
    push(arcPts(cx - 30, cy + 20, 180, 120, 0.4, 2.8), { width: 6, opacity: 0.4 });
    push(arcPts(cx, cy, 200, 140, 0.5, 2.9), { width: 7, opacity: 0.65 });
    push([[cx - 20, cy + 80], [cx + 80, cy - 20], [cx + 200, cy + 40]], { width: 9 });
  } else if (family === "aftermath-paths") {
    const event = [cx - 40, cy + 20];
    push([event, [event[0] + 24, event[1] - 16]], { width: 10 });
    [[0.3, 0.8], [1.1, 0.45], [2.2, 0.7], [3.4, 0.35]].forEach(([ang, len]) => {
      const end = [event[0] + Math.cos(ang) * 420 * len, event[1] - Math.sin(ang) * 380 * len];
      const mid = [(event[0] + end[0]) / 2 + 20, (event[1] + end[1]) / 2];
      push([ [event[0] + 40, event[1] - 10], mid, end ], { width: 7 });
    });
  } else if (family === "cut-profile") {
    push(arcPts(cx, cy, 240, 180, 0.2, 2.5), { width: 9 });
    push(arcPts(cx, cy, 250, 190, 2.9, 5.6), { width: 9 });
  } else if (family === "address-call") {
    push(arcPts(b.x + 340, cy, 200, 260, -0.8, 0.9), { width: 9 });
    push([[b.x + b.w - 260, cy - 80], [b.x + b.w - 210, cy - 40]], { width: 8 });
    reserve(b.x + b.w - 220, cy + 40, 50, "receiver stays unclaimed");
  } else if (family === "shared-signs") {
    [[260, 480], [620, 700], [900, 460], [480, 1100]].forEach(([x, y], index) => {
      push(arcPts(b.x + x, b.y + y, 50 + index * 8, 70, 0.4 + index, 3.8 + index * 0.2), { width: 7 });
    });
    push(wave(b.x + 180, b.y + 700, b.x + b.w - 180, b.y + 860, 30, 1.2, 0.4), { width: 4, opacity: 0.3 });
  } else if (family === "nested-witness") {
    push(arcPts(cx - 20, cy, 160, 200, 0.5, 5.4), { width: 8 });
    push(arcPts(cx + 30, cy + 16, 300, 360, 0.3, 5.2), { width: 8 });
    push([[cx - 80, cy - 40], [cx - 20, cy - 40]], { angular: true, width: 6 });
  } else {
    throw new Error(`No identity builder for ${family}`);
  }

  if (!elements.length) throw new Error(`Empty identity for ${row.name}`);
  return { family, elements, anchors, reserves, sentence: row.identity_geometry, negative: row.negative_space_rule };
}

function insideReserve(x, y, reserves) {
  return reserves.some((item) => (x - item.x) ** 2 + (y - item.y) ** 2 < item.r ** 2);
}

function nudgeOut(points, reserves) {
  return points.map(([x, y]) => {
    let px = x;
    let py = y;
    for (const item of reserves) {
      const dx = px - item.x;
      const dy = py - item.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      if (dist < item.r) {
        px = item.x + (dx / dist) * (item.r + 8);
        py = item.y + (dy / dist) * (item.r + 8);
      }
    }
    return [px, py];
  });
}

function accentOf(suit) {
  return ROLE[suit] || ROLE.major;
}

function addEncounter(elements, points, accent, extra = {}) {
  const id = `encounter-${elements.filter((item) => item.layer === "encounter").length + 1}`;
  elements.push({
    id,
    d: extra.angular ? lineD(points) : extra.closed ? smoothClosed(points) : smoothOpen(points),
    layer: "encounter",
    width: extra.width ?? 8,
    opacity: extra.opacity ?? 0.9,
    dash: extra.dash ?? null,
    color: accent,
  });
  return id;
}

function buildDance(action, intensity, identity, accent) {
  if (!intensity) {
    return { elements: [], operation: "no-new-stroke", rationale: action };
  }
  const b = boxOf();
  const elements = [];
  const avoid = identity.reserves;
  const place = (points, extra = {}) => addEncounter(elements, nudgeOut(points, avoid), accent, extra);
  const text = action;
  if (/interstitial loop/i.test(text)) {
    const centers = identity.anchors.filter((item) => item.role === "center");
    const a = centers[0] || { x: 560, y: 1000 };
    const c = centers[1] || { x: 860, y: 1200 };
    const mx = (a.x + c.x) / 2;
    const my = (a.y + c.y) / 2;
    place(orbit(mx, my, 150, 110, [0.14, -0.06], 0.8, 48), { closed: true, width: 8 });
    return { elements, operation: "interstitial-loop", rationale: text };
  }
  if (/paths misalign/i.test(text)) {
    const ends = identity.anchors.filter((item) => item.role === "end").slice(0, 2);
    ends.forEach((end, index) => {
      place([
        [end.x, end.y],
        [end.x + 80 + index * 30, end.y - 70],
        [end.x + 150, end.y - 20 - index * 40],
      ], { width: 7 });
    });
    return { elements, operation: "two-reactions", rationale: text };
  }
  if (/counter-rotation/i.test(text)) {
    place(arcPts(b.x + b.w - 280, b.y + 460, 90, 70, 0.2, 3.4), { width: 6, opacity: 0.75 });
    return { elements, operation: "counter-rotation", rationale: text };
  }
  if (/force vectors that bend/i.test(text)) {
    place([[b.x + 220, b.y + 340], [b.x + 520, b.y + 420], [b.x + 760, b.y + 300]], { width: 8 });
    place([[b.x + 780, b.y + 520], [b.x + 560, b.y + 460], [b.x + 300, b.y + 560]], { width: 8 });
    place([[b.x + 240, b.y + 700], [b.x + 520, b.y + 760]], { width: 5, opacity: 0.4 });
    return { elements, operation: "bending-vectors", rationale: text };
  }
  if (/veiled path/i.test(text)) {
    place([[b.x + 200, b.y + 700], [b.x + b.w * 0.58, b.y + 900]], { width: 7, opacity: 0.35, dash: "10 14" });
    place([[b.x + b.w * 0.7, b.y + 640], [b.x + b.w * 0.78, b.y + 820], [b.x + b.w - 180, b.y + 760]], { angular: true, width: 8 });
    return { elements, operation: "veiled-threshold", rationale: text };
  }
  if (/off-axis return/i.test(text)) {
    place([[b.x + 280, b.y + b.h - 420], [b.x + 420, b.y + b.h - 560]], { width: 6 });
    return { elements, operation: "off-axis-correction", rationale: text };
  }
  if (/visible lattice/i.test(text)) {
    for (let i = 0; i < 4; i += 1) place([[b.x + 200, b.y + 980 + i * 70], [b.x + 640, b.y + 980 + i * 70]], { angular: true, width: 3, opacity: 0.45 });
    for (let i = 0; i < 4; i += 1) place([[b.x + 240 + i * 120, b.y + 960], [b.x + 240 + i * 120, b.y + 1220]], { angular: true, width: 3, opacity: 0.45 });
    place([[b.x + 300, b.y + 1100], [b.x + 520, b.y + 700], [b.x + b.w - 220, b.y + 560]], { width: 8 });
    return { elements, operation: "lattice-departure", rationale: text };
  }
  if (/inbound spiral/i.test(text)) {
    place(spiral(b.x + b.w - 360, b.y + 520, 24, 220, 1.6, 2.2).reverse(), { width: 7 });
    place(wave(b.x + 240, b.y + b.h - 500, b.x + 620, b.y + b.h - 360, 24, 1.4, 0.6), { width: 6, opacity: 0.75 });
    return { elements, operation: "hesitant-spiral", rationale: text };
  }
  if (/bifurcate/i.test(text)) {
    const start = identity.anchors.find((item) => item.role === "end") || { x: 900, y: 700 };
    place([[start.x, start.y], [start.x + 160, start.y - 80], [start.x + 280, start.y - 20]], { width: 7 });
    place([[start.x + 80, start.y - 20], [start.x + 40, start.y + 80]], { width: 6, opacity: 0.7 });
    return { elements, operation: "bifurcation", rationale: text };
  }
  if (/redirects its endpoint/i.test(text)) {
    place([[b.x + b.w - 300, b.y + 700], [b.x + b.w - 180, b.y + 860], [b.x + b.w - 260, b.y + 1040]], { width: 8 });
    return { elements, operation: "redirected-endpoint", rationale: text };
  }
  if (/doorway-like/i.test(text)) {
    place([[b.x + 700, b.y + 980], [b.x + 860, b.y + 980]], { width: 4, opacity: 0.35, dash: "8 10" });
    return { elements, operation: "reversible-possibility", rationale: text };
  }
  if (/anticipated line/i.test(text)) {
    place([[b.x + 220, b.y + 480], [b.x + 700, b.y + 560]], { width: 5, opacity: 0.28 });
    place([[b.x + 460, b.y + 700], [b.x + 700, b.y + 980], [b.x + b.w - 200, b.y + 860]], { width: 8 });
    return { elements, operation: "divergent-arrival", rationale: text };
  }
  if (/rhythmic bands/i.test(text)) {
    place(wave(b.x + 760, b.y + 320, b.x + 800, b.y + b.h - 320, 36, 5.5, 0.2), { width: 5, opacity: 0.85 });
    return { elements, operation: "third-rhythm", rationale: text };
  }
  if (/shifted reflection/i.test(text)) {
    place([[b.x + 860, b.y + 900], [b.x + 940, b.y + 860]], { width: 6 });
    return { elements, operation: "small-reflection", rationale: text };
  }
  if (/phase shift/i.test(text)) {
    place(wave(b.x + 180, b.y + 1460, b.x + b.w - 180, b.y + 1500, 48, 2.2, 2.1), { width: 7 });
    return { elements, operation: "phase-deformation", rationale: text };
  }
  if (/reference polygon/i.test(text)) {
    place([[b.x + 200, b.y + 360], [b.x + 420, b.y + 300], [b.x + 460, b.y + 520], [b.x + 240, b.y + 560], [b.x + 200, b.y + 360]], { angular: true, width: 6, opacity: 0.55 });
    place([[b.x + 620, b.y + 400], [b.x + 860, b.y + 340], [b.x + 900, b.y + 600], [b.x + 640, b.y + 560]], { angular: true, width: 8 });
    return { elements, operation: "revised-edge", rationale: text };
  }
  if (/fracture into displaced/i.test(text)) {
    place([[b.x + 360, b.y + 980], [b.x + 520, b.y + 1040]], { width: 4, opacity: 0.55 });
    place([[b.x + 640, b.y + 900], [b.x + 820, b.y + 980]], { width: 4, opacity: 0.55 });
    return { elements, operation: "continuity-threads", rationale: text };
  }
  if (/testing bridge/i.test(text)) {
    place([[b.x + 300, b.y + 1100], [b.x + 520, b.y + 1180], [b.x + 760, b.y + 1040]], { width: 7 });
    return { elements, operation: "bending-test", rationale: text };
  }
  if (/nonconcentric/i.test(text)) {
    place(spiral(b.x + 480, b.y + 700, 40, 260, 1.5, 0.4, 1.1), { width: 7 });
    return { elements, operation: "historic-turn", rationale: text };
  }
  if (/protected boundaries/i.test(text)) {
    const origin = [b.x + 620, b.y + 1100];
    [[0.2, 180], [1.1, 260], [2.4, 140]].forEach(([ang, len]) => {
      place([origin, [origin[0] + Math.cos(ang) * len, origin[1] + Math.sin(ang) * len * 0.6]], { width: 7 });
    });
    return { elements, operation: "stopped-branches", rationale: text };
  }
  if (/responding side/i.test(text)) {
    place([[b.x + 860, b.y + 900], [b.x + 930, b.y + 860]], { width: 6 });
    return { elements, operation: "responding-mark", rationale: text };
  }
  if (/counterpulse/i.test(text)) {
    place([[b.x + 860, b.y + 800], [b.x + 940, b.y + 760]], { width: 8 });
    place([[b.x + 860, b.y + 880], [b.x + 960, b.y + 900]], { width: 8 });
    return { elements, operation: "staggered-counterpulse", rationale: text };
  }
  if (/reciprocal tremor/i.test(text)) {
    place([[b.x + 760, b.y + 1000], [b.x + 790, b.y + 980], [b.x + 770, b.y + 1020]], { width: 4 });
    return { elements, operation: "reciprocal-tremor", rationale: text };
  }
  if (/route out/i.test(text)) {
    place([[b.x + 900, b.y + 1200], [b.x + b.w - 180, b.y + 1080]], { width: 7 });
    return { elements, operation: "clear-exit", rationale: text };
  }
  if (/attentive marks/i.test(text)) {
    [[0, 0], [36, 18], [18, 48]].forEach(([dx, dy], index) => {
      place([[b.x + 860 + dx, b.y + 860 + dy], [b.x + 884 + dx, b.y + 844 + dy - index * 4]], { width: 4 });
    });
    return { elements, operation: "responsive-attention", rationale: text };
  }
  if (/delayed line/i.test(text)) {
    place([[b.x + 520, b.y + 1100], [b.x + 860, b.y + 1040]], { width: 7 });
    return { elements, operation: "delayed-reply", rationale: text };
  }
  if (/gentle corrections/i.test(text)) {
    place([[b.x + b.w - 360, b.y + 640], [b.x + b.w - 280, b.y + 700], [b.x + b.w - 220, b.y + 640]], { width: 7 });
    return { elements, operation: "open-correction", rationale: text };
  }
  if (/optional connecting/i.test(text)) {
    place([[b.x + 460, b.y + 1000], [b.x + 700, b.y + 1040]], { width: 4, opacity: 0.4, dash: "6 8" });
    return { elements, operation: "optional-link", rationale: text };
  }
  if (/previously unused side/i.test(text)) {
    place([[b.x + 160, b.y + 420], [b.x + 420, b.y + 700], [b.x + 640, b.y + 980]], { width: 8 });
    return { elements, operation: "unused-side", rationale: text };
  }
  if (/nonmatching response/i.test(text)) {
    place(wave(b.x + 700, b.y + 900, b.x + 980, b.y + 860, 16, 2, 1), { width: 5, opacity: 0.7 });
    return { elements, operation: "nonmatching-response", rationale: text };
  }
  if (/returning question/i.test(text)) {
    place([[b.x + b.w - 300, b.y + 980], [b.x + 760, b.y + 860], [b.x + 640, b.y + 1100]], { width: 8 });
    return { elements, operation: "returning-question", rationale: text };
  }
  if (/porous enclosure/i.test(text)) {
    place([[b.x + 760, b.y + 700], [b.x + 1040, b.y + 760], [b.x + 1000, b.y + 1100]], { width: 7 });
    place([[b.x + 820, b.y + 900], [b.x + b.w - 160, b.y + 860]], { width: 6 });
    return { elements, operation: "porous-exits", rationale: text };
  }
  if (/witness mark/i.test(text)) {
    place([[b.x + 300, b.y + 1200], [b.x + 348, b.y + 1164]], { width: 6 });
    return { elements, operation: "adjacent-witness", rationale: text };
  }
  if (/measured interval/i.test(text)) {
    place([[b.x + 620, b.y + 900], [b.x + 760, b.y + 900]], { width: 5, opacity: 0.7 });
    return { elements, operation: "measured-interval", rationale: text };
  }
  if (/mechanical scaffold/i.test(text)) {
    place([[b.x + 300, b.y + 980], [b.x + 300, b.y + 1280], [b.x + 560, b.y + 1280]], { angular: true, width: 5, opacity: 0.55 });
    place([[b.x + 260, b.y + 1100], [b.x + 480, b.y + 900], [b.x + 760, b.y + 1040]], { width: 8 });
    return { elements, operation: "departing-current", rationale: text };
  }
  if (/independent refusal/i.test(text)) {
    place(arcPts(b.x + 860, b.y + 900, 160, 120, 0.2, 2.6), { width: 8 });
    place([[b.x + 760, b.y + 980], [b.x + 900, b.y + 1040]], { width: 6, opacity: 0.7 });
    return { elements, operation: "shared-only-where-both-alter", rationale: text };
  }
  if (/interpretive path/i.test(text)) {
    place([[b.x + 260, b.y + 1100], [b.x + 560, b.y + 860], [b.x + 860, b.y + 1100]], { width: 8 });
    return { elements, operation: "interpretive-crossing", rationale: text };
  }
  if (/optional channels/i.test(text)) {
    place([[b.x + 700, b.y + 860], [b.x + 860, b.y + 980], [b.x + 1040, b.y + 900]], { width: 7 });
    return { elements, operation: "unplanned-connection", rationale: text };
  }
  if (/authorized small segment/i.test(text)) {
    place([[b.x + 760, b.y + 1000], [b.x + 860, b.y + 990]], { width: 8 });
    return { elements, operation: "limited-crossing", rationale: text };
  }
  if (/rigid interface/i.test(text)) {
    place([[b.x + 760, b.y + 760], [b.x + 1040, b.y + 760], [b.x + 1040, b.y + 1100], [b.x + 760, b.y + 1100], [b.x + 760, b.y + 760]], { angular: true, width: 7 });
    place([[b.x + 160, b.y + 900], [b.x + 700, b.y + 940]], { width: 6 });
    place([[b.x + 1080, b.y + 920], [b.x + b.w - 40, b.y + 860]], { width: 6 });
    return { elements, operation: "interface-currents", rationale: text };
  }
  if (/reflected arc/i.test(text)) {
    place(arcPts(b.x + 860, b.y + 980, 140, 90, 0.3, 2.5), { width: 7 });
    place(arcPts(b.x + 900, b.y + 1040, 150, 80, 0.5, 2.4), { width: 6, opacity: 0.75 });
    return { elements, operation: "altered-return", rationale: text };
  }
  if (/repair route/i.test(text)) {
    place([[b.x + 700, b.y + 860], [b.x + 860, b.y + 980], [b.x + 1040, b.y + 900]], { width: 6 });
    return { elements, operation: "alternate-repair", rationale: text };
  }
  if (/triggering mark/i.test(text)) {
    place([[b.x + 860, b.y + 860], [b.x + 910, b.y + 830]], { width: 8 });
    place([[b.x + 760, b.y + 980], [b.x + 620, b.y + 1120]], { width: 6 });
    place([[b.x + 780, b.y + 1040], [b.x + 700, b.y + 1280]], { width: 6 });
    return { elements, operation: "separate-roots", rationale: text };
  }
  if (/fading echo/i.test(text)) {
    place([[b.x + 640, b.y + 1000], [b.x + 760, b.y + 1040]], { width: 4, opacity: 0.3 });
    return { elements, operation: "fading-echo", rationale: text };
  }
  if (/line grammars/i.test(text)) {
    place(wave(b.x + 200, b.y + 1100, b.x + 560, b.y + 1160, 24, 1.6, 0.2), { width: 7 });
    place([[b.x + 760, b.y + 1080], [b.x + 900, b.y + 1200], [b.x + 1080, b.y + 1100]], { angular: true, width: 7 });
    place([[b.x + 640, b.y + 980], [b.x + 640, b.y + 1280]], { width: 5 });
    return { elements, operation: "two-grammars", rationale: text };
  }
  if (/perimeter segments/i.test(text)) {
    place([[b.x + 240, b.y + 700], [b.x + 700, b.y + 680]], { width: 8 });
    place([[b.x + 240, b.y + 1100], [b.x + 240, b.y + 820]], { width: 8 });
    place([[b.x + 280, b.y + 900], [b.x + 560, b.y + 860]], { width: 6 });
    return { elements, operation: "doors-and-paths", rationale: text };
  }
  if (/nonmatching segment/i.test(text)) {
    place([[b.x + 700, b.y + 980], [b.x + 820, b.y + 1040]], { width: 8 });
    return { elements, operation: "marked-difference", rationale: text };
  }
  if (/offset its return arc/i.test(text)) {
    place(arcPts(b.x + 860, b.y + 860, 120, 80, 1.2, 3.6), { width: 7 });
    return { elements, operation: "offset-return", rationale: text };
  }
  if (/nested open questions/i.test(text)) {
    place(arcPts(b.x + 860, b.y + 900, 80, 60, 0.4, 2.6), { width: 6 });
    place([[b.x + 960, b.y + 900], [b.x + 1120, b.y + 860]], { width: 7 });
    return { elements, operation: "lateral-revision", rationale: text };
  }
  if (/different step spacing/i.test(text)) {
    place([[b.x + 200, b.y + 1100], [b.x + 460, b.y + 980]], { width: 7 });
    place([[b.x + b.w - 200, b.y + 1200], [b.x + 700, b.y + 1040]], { width: 7 });
    place([[b.x + 500, b.y + 1000], [b.x + 640, b.y + 1020]], { width: 6 });
    return { elements, operation: "consent-segment", rationale: text };
  }
  if (/surrounding motion restarts/i.test(text)) {
    place([[b.x + 200, b.y + 420], [b.x + 380, b.y + 480]], { width: 6, opacity: 0.7 });
    return { elements, operation: "restarted-motion", rationale: text };
  }
  if (/measured reorientations/i.test(text)) {
    place([[b.x + 800, b.y + 800], [b.x + 900, b.y + 880], [b.x + 980, b.y + 820], [b.x + 1080, b.y + 900]], { width: 7 });
    return { elements, operation: "reoriented-persistence", rationale: text };
  }
  if (/angular grammar/i.test(text)) {
    place([[b.x + 220, b.y + 1200], [b.x + 400, b.y + 1040], [b.x + 620, b.y + 1180], [b.x + 860, b.y + 1000]], { angular: true, width: 8 });
    return { elements, operation: "translated-grammar", rationale: text };
  }
  if (/shifted bearing/i.test(text)) {
    place([[b.x + 860, b.y + 860], [b.x + 1040, b.y + 760]], { width: 7 });
    place([[b.x + 800, b.y + 980], [b.x + 860, b.y + 940]], { width: 4, opacity: 0.4 });
    return { elements, operation: "restarted-bearing", rationale: text };
  }
  if (/nonuniform spiral/i.test(text)) {
    place(spiral(b.x + 480, b.y + 1100, 20, 280, 2.1, 1.2, 1.6), { width: 7 });
    return { elements, operation: "open-future-spiral", rationale: text };
  }
  if (/recipient arc/i.test(text)) {
    place(arcPts(b.x + 900, b.y + 900, 90, 60, 2.4, 4.4), { width: 7 });
    place([[b.x + 620, b.y + 1040], [b.x + 800, b.y + 960]], { width: 4, opacity: 0.75 });
    return { elements, operation: "unresolved-approach", rationale: text };
  }
  if (/different depth/i.test(text)) {
    place(arcPts(b.x + 800, b.y + 700, 140, 50, 0.2, 2.6), { width: 4, opacity: 0.35 });
    place(arcPts(b.x + 860, b.y + 1100, 180, 70, 0.3, 2.7), { width: 8 });
    return { elements, operation: "new-depth", rationale: text };
  }
  if (/layered habitat/i.test(text)) {
    place(arcPts(b.x + 860, b.y + 700, 80, 50, 0.4, 5), { width: 5, opacity: 0.45 });
    return { elements, operation: "earlier-configuration", rationale: text };
  }
  if (/consequential difference/i.test(text)) {
    place([[b.x + 980, b.y + 860], [b.x + 1040, b.y + 820]], { width: 7 });
    return { elements, operation: "consequential-difference", rationale: text };
  }
  if (/sigil arch/i.test(text)) {
    place(arcPts(b.x + 700, b.y + 860, 160, 200, 3.5, 5.8), { width: 8 });
    place([[b.x + 220, b.y + 1100], [b.x + 460, b.y + 980]], { width: 6 });
    place([[b.x + b.w - 200, b.y + 1080], [b.x + 900, b.y + 960]], { width: 6 });
    return { elements, operation: "unfinished-arch", rationale: text };
  }
  if (/displaced second traversal/i.test(text)) {
    place(arcPts(b.x + 860, b.y + 980, 100, 80, 0.6, 5.2), { width: 7 });
    return { elements, operation: "displaced-traversal", rationale: text };
  }
  if (/over-under braid/i.test(text)) {
    place(wave(b.x + 760, b.y + 340, b.x + 800, b.y + b.h - 340, 24, 6, 0.5), { width: 5, opacity: 0.9 });
    return { elements, operation: "interval-rhythm", rationale: text };
  }
  if (/no closed central lock/i.test(text)) {
    place([[b.x + 200, b.y + 1200], [b.x + 460, b.y + 1100]], { width: 6 });
    return { elements, operation: "second-approach", rationale: text };
  }
  if (/placement frame/i.test(text)) {
    place([[b.x + 260, b.y + 700], [b.x + 260, b.y + 980], [b.x + 520, b.y + 980]], { angular: true, width: 5, opacity: 0.5 });
    place([[b.x + 340, b.y + 900], [b.x + 700, b.y + 640], [b.x + b.w - 180, b.y + 480]], { width: 8 });
    return { elements, operation: "growth-beyond-frame", rationale: text };
  }
  if (/role symbols/i.test(text)) {
    place(arcPts(b.x + 360, b.y + 860, 40, 56, 0.2, 4), { width: 7 });
    place([[b.x + 760, b.y + 820], [b.x + 820, b.y + 740], [b.x + 880, b.y + 840]], { angular: true, width: 7 });
    place([[b.x + 500, b.y + 980], [b.x + 700, b.y + 900]], { width: 5, opacity: 0.8 });
    return { elements, operation: "nonmatching-roles", rationale: text };
  }
  if (/protection line/i.test(text)) {
    place(arcPts(b.x + 700, b.y + 1000, 180, 140, 0.4, 2.4), { width: 6, opacity: 0.7 });
    return { elements, operation: "outer-protection", rationale: text };
  }
  if (/temporal traces/i.test(text)) {
    place(arcPts(b.x + 640, b.y + 860, 70, 40, 0.3, 2.4), { width: 4, opacity: 0.4 });
    place(arcPts(b.x + 700, b.y + 980, 80, 46, 0.4, 2.5), { width: 6, opacity: 0.65 });
    place([[b.x + 760, b.y + 1120], [b.x + 900, b.y + 1040], [b.x + 1040, b.y + 1100]], { width: 8 });
    return { elements, operation: "temporal-traces", rationale: text };
  }
  if (/secondary paths/i.test(text)) {
    const event = [b.x + 460, b.y + 1100];
    place([event, [event[0] + 20, event[1] - 12]], { width: 8 });
    [[0.4, 220], [1.2, 160], [2.1, 260]].forEach(([ang, len]) => {
      place([[event[0] + 28, event[1]], [event[0] + Math.cos(ang) * len, event[1] - Math.sin(ang) * len]], { width: 6 });
    });
    return { elements, operation: "unresolved-consequences", rationale: text };
  }
  if (/fine fracture/i.test(text)) {
    place([[b.x + 640, b.y + 1040], [b.x + 820, b.y + 1000]], { width: 5, opacity: 0.75 });
    return { elements, operation: "approach-without-cover", rationale: text };
  }
  if (/radiating address/i.test(text)) {
    place(arcPts(b.x + 420, b.y + 1000, 180, 140, -0.6, 0.8), { width: 8 });
    place([[b.x + b.w - 240, b.y + 760], [b.x + b.w - 180, b.y + 720]], { width: 7 });
    return { elements, operation: "untethered-reply", rationale: text };
  }
  if (/ambient field/i.test(text)) {
    place(wave(b.x + 200, b.y + 700, b.x + b.w - 200, b.y + 860, 20, 1.1, 0.4), { width: 3, opacity: 0.35 });
    place([[b.x + 300, b.y + 980], [b.x + 520, b.y + 900]], { width: 7 });
    place([[b.x + 760, b.y + 1100], [b.x + 980, b.y + 980]], { width: 7 });
    return { elements, operation: "bending-atmosphere", rationale: text };
  }
  if (/nested reflection/i.test(text)) {
    place(arcPts(b.x + 640, b.y + 980, 90, 120, 0.4, 5.3), { width: 6 });
    place(arcPts(b.x + 700, b.y + 1020, 180, 210, 0.2, 5.1), { width: 7 });
    return { elements, operation: "open-nested-reflection", rationale: text };
  }
  throw new Error(`Dance action was not interpreted: ${text}`);
}

function effectorOf(affordance) {
  const s = affordance.toLowerCase();
  if (/radiat|unfurl|propagat|diverge/.test(s)) return "radiate-stop";
  if (/translat|medium|recod|alphabet/.test(s)) return "translate";
  if (/redirect|reorient|alter trajectory|bend|revis/.test(s)) return "redirect";
  if (/interval|reciproc/.test(s)) return "interval";
  if (/reopen|opening/.test(s)) return "reopen";
  if (/approach|alongside|never mandate|without owning|without crossing|without sealing/.test(s)) return "approach-stop";
  if (/amplif/.test(s)) return "amplify";
  if (/test |challenge|contradict|expos|conditions/.test(s)) return "test-mark";
  return "alongside";
}

function buildDirectional(host, guest, identity, accent) {
  const limit = `${host.negative_space_rule} ${host.encounter_affordance}`;
  const vetoCross = /open center|unentered|unbridged|never mandate|do not fill|not occupy|vacancy|untouched/i.test(limit);
  let op = effectorOf(guest.encounter_affordance);
  if (vetoCross && (op === "radiate-stop" || op === "interval" || op === "redirect")) op = "approach-stop";
  const guestFamily = classifyIdentity(guest);
  const angular = /vector|axis|mechanism|stage|alphabet|criteria|interface/.test(guestFamily);
  const anchor = identity.anchors.find((item) => item.role === "end") || identity.anchors[0] || { x: 700, y: 1100 };
  const reserve = identity.reserves[0];
  const elements = [];
  const place = (points, extra = {}) => addEncounter(elements, nudgeOut(points, identity.reserves), accent, extra);
  const stopAtRim = () => {
    if (!reserve) return [[anchor.x + 36, anchor.y - 24], [anchor.x + 150, anchor.y - 90]];
    const ang = Math.atan2(anchor.y - reserve.y, anchor.x - reserve.x);
    const rim = [reserve.x + Math.cos(ang) * (reserve.r + 14), reserve.y + Math.sin(ang) * (reserve.r + 14)];
    const out = [reserve.x + Math.cos(ang) * (reserve.r + 150), reserve.y + Math.sin(ang) * (reserve.r + 150)];
    return [out, rim];
  };
  if (op === "approach-stop") {
    place(stopAtRim(), { width: 7, angular });
  } else if (op === "radiate-stop") {
    const origin = [anchor.x, anchor.y];
    const count = Math.min(4, Math.max(2, wordCount(guest.encounter_affordance)[0] || 3));
    for (let i = 0; i < count; i += 1) {
      const ang = -0.4 + i * (2.2 / count);
      const len = 80 + (guestFamily.length % 5) * 18 + i * 24;
      const end = [origin[0] + Math.cos(ang) * len, origin[1] + Math.sin(ang) * len];
      if (reserve && insideReserve(end[0], end[1], [reserve])) continue;
      place([origin, end], { width: 6, angular });
    }
  } else if (op === "translate") {
    place([[anchor.x, anchor.y], [anchor.x + 120, anchor.y - 80], [anchor.x + 260, anchor.y - 20], [anchor.x + 380, anchor.y - 90]], { angular: true, width: 7 });
  } else if (op === "redirect") {
    const bend = angular ? 40 : -70;
    place([[anchor.x, anchor.y], [anchor.x + 70, anchor.y + bend], [anchor.x + 20, anchor.y + bend * 1.6]], { width: 7, angular });
  } else if (op === "interval") {
    place(arcPts(anchor.x + 80, anchor.y - 40, 54, 36, 0.3, 2.5), { width: 6 });
  } else if (op === "reopen") {
    place([[anchor.x - 20, anchor.y - 30], [anchor.x + 24, anchor.y - 70]], { width: 6 });
  } else if (op === "amplify") {
    place(wave(anchor.x - 80, anchor.y - 50, anchor.x + 220, anchor.y - 80, 22, 1.6, guestFamily.length / 7), { width: 6, opacity: 0.75 });
  } else if (op === "test-mark") {
    place([[anchor.x + 30, anchor.y - 20], [anchor.x + 140, anchor.y - 80]], { width: 6, angular });
  } else {
    place(wave(anchor.x, anchor.y, anchor.x + 220, anchor.y - 40, 16, 1.3, guestFamily.length / 5), { width: 6, opacity: 0.8, angular });
  }
  if (!elements.length) {
    place(stopAtRim(), { width: 6 });
    op = "approach-stop";
  }
  return {
    elements,
    operation: op,
    rationale: `${guest.name} (${guestFamily}) affords: ${guest.encounter_affordance} ${host.name} limits the meeting by: ${host.negative_space_rule}`,
  };
}

function svgFor(elements) {
  const body = elements.map((item) => {
    const dash = item.dash ? ` stroke-dasharray="${item.dash}"` : "";
    return `<path id="${item.id}" d="${item.d}" fill="none" stroke="${NIGHT_INK}" stroke-width="${paintedWidth(item)}" stroke-opacity="${item.opacity}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<defs><radialGradient id="ambient-night" cx="50%" cy="42%" r="72%"><stop offset="0%" stop-color="#1a1f26"/><stop offset="100%" stop-color="#0c1014"/></radialGradient></defs>\n<rect id="ambient-ground" width="${W}" height="${H}" fill="url(#ambient-night)"/>\n${body}\n</svg>\n`;
}

function traceFor(card, affinity, date, seed, hashes, identity, encounter, guestName) {
  const operations = [
    {
      svg_element_ids: ["ambient-ground"],
      layer: "ambient",
      operation: "night-ground",
      source_field: "renderer.contrast",
      parameters: { style: STYLE, core: "#1a1f26", edge: "#0c1014", ink: NIGHT_INK, width_scale: LOCKED_WIDTH, glow: 0, strength: 1 },
      rationale: "Locked paint. The night ground and the pale line do not move the drawing.",
    },
    ...identity.elements.map((item) => ({
      svg_element_ids: [item.id],
      layer: "identity",
      operation: identity.family,
      source_field: `archetype_blueprints.identity_geometry:${card.name}`,
      parameters: { width: item.width, opacity: item.opacity, paint_width: paintedWidth(item), paint: NIGHT_INK },
      rationale: card.identity_geometry,
    })),
    ...encounter.elements.map((item) => ({
      svg_element_ids: [item.id],
      layer: item.layer,
      operation: encounter.operation,
      source_field: affinity === 14 ? `dance14_encounter_reference.geometry_action:${card.name}` : `archetype_blueprints.encounter_affordance:${guestName}`,
      parameters: { width: item.width, opacity: item.opacity, paint_width: paintedWidth(item), paint: NIGHT_INK },
      rationale: encounter.rationale,
    })),
  ];
  if (!encounter.elements.length && affinity !== 0) {
    operations.push({
      svg_element_ids: [],
      layer: "encounter",
      operation: encounter.operation || "no-new-stroke",
      source_field: affinity === 14 ? `dance14_encounter_reference.geometry_action:${card.name}` : `archetype_blueprints.encounter_affordance:${guestName}`,
      parameters: {},
      rationale: encounter.rationale,
    });
  }
  return {
    card_name: card.name,
    canonical_index: card.index,
    affinity_index: affinity,
    date,
    seed,
    source_hashes: hashes,
    identity_invariants: [card.identity_geometry, card.negative_space_rule, `Avoid: ${card.failure_condition}`],
    operations,
    visual_reference_inputs: [],
  };
}

function recipeId(hashes, date, affinity) {
  return sha256(JSON.stringify(["Velomere", VERSION, STYLE, hashes.canonical, hashes.blueprints, hashes.encounters, date, affinity]));
}

function paintedWidth(item) {
  const night = Math.max(1.35, Math.round(item.width * 18) / 100);
  return Math.max(0.4, Math.round(night * LOCKED_WIDTH * 100) / 100);
}

export async function renderCard(sources, index, date, affinity) {
  rejectAffinity(affinity);
  const canon = sources.canon[index];
  const blue = sources.blue[index];
  const dance = sources.dance[index];
  const card = {
    index: index + 1,
    name: canon.name,
    suit: canon.suit,
    rank: canon.rank,
    keywords: canon.keywords,
    upright: canon.upright,
    reversed: canon.reversed,
    image: canon.image,
    sort_order: Number(canon.sort_order),
    identity_geometry: blue.identity_geometry,
    encounter_affordance: blue.encounter_affordance,
    negative_space_rule: blue.negative_space_rule,
    failure_condition: blue.failure_condition,
  };
  const family = classifyIdentity(blue);
  const j = microFor(date, index + 1);
  const identity = buildIdentity(family, card, j);
  let encounter = { elements: [], operation: "neutral", rationale: "Affinity 0 adds no encounter strokes." };
  let guestName = null;
  if (affinity === 14) {
    const intensity = Number(dance.intensity_0_to_4);
    guestName = "The Dance";
    encounter = buildDance(dance.geometry_action, intensity, identity, accentOf("major"));
    if (!intensity && encounter.elements.length) throw new Error(`${card.name} gained encounter strokes at intensity 0`);
  } else if (affinity > 0) {
    const guest = sources.blue[affinity - 1];
    guestName = guest.name;
    encounter = buildDirectional(blue, guest, identity, accentOf(guest.suit));
  }
  const elements = [...identity.elements, ...encounter.elements];
  const svg = svgFor(elements);
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.width !== W || meta.height !== H) throw new Error(`Raster size ${meta.width}x${meta.height}`);
  const seed = sha256(`${VERSION}|${date}|${affinity}|${index + 1}|${sources.hashes.canonical}`);
  const trace = traceFor(card, affinity, date, seed, sources.hashes, identity, encounter, guestName);
  return { card, family, svg, png, trace, encounter };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function deckContext(sources, index, affinity) {
  const canon = sources.canon[index];
  const blue = sources.blue[index];
  if (affinity === 0) {
    return { name: canon.name, canonical_index: index + 1, encounter_layer: null };
  }
  if (affinity === 14) {
    const row = sources.dance[index];
    return {
      name: canon.name,
      canonical_index: index + 1,
      encounter_layer: {
        origin: "dance-authored",
        authored: true,
        affinity_index: 14,
        affinity_name: "The Dance",
        axis: row.encounter_axis,
        action: row.geometry_action,
        upright_proposal: row.upright_proposal,
        reversed_proposal: row.reversed_proposal,
        counterreading_question: row.counterreading_question,
        notice: "Authored proposal for this card meeting The Dance. Not a replacement of the canonical meaning.",
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
      affinity_index: affinity,
      affinity_name: guest.name,
      axis: `${canon.name} meets ${guest.name}`,
      action: guest.encounter_affordance,
      upright_proposal: `With ${guest.name}, the relation offered is: ${guest.encounter_affordance} ${canon.name} still meets the world as: ${blue.encounter_affordance} This layer is generated from the two blueprints. It is not a human-authored reading.`,
      reversed_proposal: `The pairing can fail as ${canon.name} already warns: ${blue.failure_condition}`,
      counterreading_question: `What may ${guest.name} change about ${canon.name}, and what must remain?`,
      notice: "Generated from both blueprints. Not one of the 78 authored Dance readings.",
    },
  };
}

function backSvg() {
  const c = 700;
  const d = 1150;
  const arm = (angle) => {
    const pts = arcPts(c + Math.cos(angle) * 180, d + Math.sin(angle) * 180, 70, 70, angle, angle + 1.2, 12);
    return `<path d="${smoothOpen(pts)}" fill="none" stroke="${NIGHT_INK}" stroke-width="6.98" stroke-opacity="0.55" stroke-linecap="round"/>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<defs><radialGradient id="ambient-night" cx="50%" cy="42%" r="72%"><stop offset="0%" stop-color="#1a1f26"/><stop offset="100%" stop-color="#0c1014"/></radialGradient></defs>\n<rect width="${W}" height="${H}" fill="url(#ambient-night)"/>\n${[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map(arm).join("\n")}\n</svg>\n`;
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
      sortOrder: drawn.card.sort_order,
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
  const deck = {
    schema_version: "velomere-relational-field/1",
    name: `Velomere / ${date} / ${affinityName} (${affinity})`,
    recipe_id: recipe,
    date,
    affinity,
    affinity_name: affinityName,
    renderer: VERSION,
    style: STYLE,
    cardTemplate: "long-tarot",
    cardBack: "back/card-back.jpg",
    cards: cards.map((card) => ({ name: card.name, file: card.file, sort_order: card.sortOrder })),
  };
  await put("deck.json", `${JSON.stringify(deck, null, 2)}\n`);
  const recipeDoc = {
    recipe_id: recipe,
    renderer: VERSION,
    style: STYLE,
    date,
    affinity,
    affinity_name: affinityName,
    source_hashes: sources.hashes,
    visual_reference_inputs: [],
    note: "The recipe names the drawing. The night line is paint on that drawing, not a new geometry.",
  };
  await put("recipe.json", `${JSON.stringify(recipeDoc, null, 2)}\n`);
  await put("provenance/renderer-and-seed.json", `${JSON.stringify({ renderer: VERSION, style: STYLE, recipe_id: recipe, date, affinity, visual_reference_inputs: [] }, null, 2)}\n`);
  await copyFile(BACK_JPG, path.join(directory, "back", "card-back.jpg"));
  files.set("back/card-back.jpg", await readFile(path.join(directory, "back", "card-back.jpg")));
  await put("back/card-back.svg", backSvg());
  const provenance = {
    renderer: VERSION,
    style: STYLE,
    recipe_id: recipe,
    date,
    affinity,
    affinity_name: affinityName,
    source_hashes: sources.hashes,
    visual_reference_inputs: [],
    card_count: 78,
  };
  await put("provenance.json", `${JSON.stringify(provenance, null, 2)}\n`);
  const filesSha = {};
  for (const [rel, buf] of files) filesSha[rel] = sha256(buf);
  const manifest = {
    schema_version: "velomere-relational-field/1",
    recipe_id: recipe,
    files_sha256: filesSha,
    files: Object.entries(filesSha).map(([filePath, digest]) => ({ path: filePath, sha256: digest })),
  };
  await put("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  const packed = {};
  for (const [rel, buf] of files) packed[rel] = new Uint8Array(buf);
  const zipped = zipSync(packed, { mtime: new Date(Date.UTC(2000, 5, 8)) });
  await writeFile(path.join(directory, "deck.zip"), zipped);
  return { recipe, cards };
}

export async function selfTest() {
  const sources = await loadSources();
  const families = sources.blue.map((row) => classifyIdentity(row));
  if (new Set(families).size !== 78) throw new Error(`Expected 78 identity grammars, got ${new Set(families).size}`);
  let failed = null;
  try {
    rejectAffinity(79);
  } catch (error) {
    failed = error;
  }
  if (!failed) throw new Error("Affinity 79 was accepted.");
  const quiet = await renderCard(sources, 7, "2000-06-08", 14);
  if (quiet.encounter.elements.length) throw new Error("Null gained Dance strokes.");
  const again = await renderCard(sources, 7, "2000-06-08", 0);
  const id = (svg) => [...svg.matchAll(/id="(identity-[^"]+)" d="([^"]+)"/g)].map((item) => item[2]).join("|");
  if (id(quiet.svg) !== id(again.svg)) throw new Error("Null identity changed between Neutral and Dance.");
  const fireAtNull = await renderCard(sources, 20, "2000-06-08", 8);
  const nullAtFire = await renderCard(sources, 7, "2000-06-08", 21);
  const encounterPaths = (svg) => [...svg.matchAll(/id="encounter-[^"]+" d="([^"]+)"/g)].map((item) => item[1]).join("|");
  if (encounterPaths(fireAtNull.svg) === encounterPaths(nullAtFire.svg)) {
    throw new Error("Directional pair drew the same encounter geometry.");
  }
  const repeat = await renderCard(sources, 1, "2000-06-08", 0);
  const repeat2 = await renderCard(sources, 1, "2000-06-08", 0);
  if (!repeat.png.equals(repeat2.png) || repeat.svg !== repeat2.svg) throw new Error("Determinism failed.");
  if (repeat.trace.visual_reference_inputs.length) throw new Error("Visual references were recorded.");
  return { families: families.length, quiet: quiet.card.name, fireOp: fireAtNull.encounter.operation, nullOp: nullAtFire.encounter.operation };
}
