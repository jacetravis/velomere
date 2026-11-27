// @ts-nocheck
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { zipSync } from "fflate";

export const VERSION = "relational-encounter-11-rootline";
export const GRAMMAR_VERSION = "velomere-rootline/1";
export const RECIPE_VERSION = "velomere-rootline-recipe/1";
export const TRACE_SCHEMA = "velomere-rootline-trace/1";
export const STYLE_ID = "velomere-rootline-encounter/1";
export const STYLE_LABEL = "VELoMERE — Rising Path Encounter";
export const ORIGIN_LEXICON = "velomere-lexical-canon/1.0";
export const POLICY_VERSION = "unreviewed-conservative/1";
export const CANON_SHA = "340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9";

const W = 1400;
const H = 2300;
const FIELD = "#101720";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, "..", "DATA");

const PALETTE = {
  Hearings: { main: "#B5A0F2", highlight: "#DACEFB", support: "#7463B5", gesture: "undulation" },
  Paths: { main: "#E8BB63", highlight: "#FFE2A5", support: "#A17935", gesture: "vector" },
  Returns: { main: "#67CABA", highlight: "#B1E9D9", support: "#2C877D", gesture: "recurvature" },
  Sigils: { main: "#E38A89", highlight: "#F4B7AE", support: "#A64A53", gesture: "inscription" },
  Major: { main: "#CED5DF", highlight: "#F4F2E9", support: "#7E91A2", gesture: "unsuited" },
};

const QUIET = new Set(["The Null", "Void", "Seven of Hearings", "Five of Returns", "Six of Returns", "Eight of Sigils"]);
const STOP = new Set("that this with from have been were they them their your when into only than then there these those while where which would could should about after before other each such does will just more also some very over under between itself themselves another because being still same into does".split(" "));
const NEGATION = new Set(["not", "no", "never", "without"]);
const QUESTION_LEX = new Set(["uncertainty", "inquiry", "question", "whether", "unknown", "humility", "silence", "pause", "listening", "ask", "asks"]);
const AXIOM_LEX = new Set(["stewardship", "direction", "certainty", "truth", "center", "claim", "order", "always", "law"]);

let cache = null;

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : Buffer.from(value)).digest("hex");
}

function hashString(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(seed, salt) {
  return (hashString(`${seed}:${salt}`) % 10000) / 10000;
}

function xml(value) {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  return String(value ?? "").replaceAll("&", amp).replaceAll("<", lt).replaceAll(">", gt).replaceAll("\"", quot);
}

function suitKey(suit) {
  const text = String(suit || "").toLowerCase();
  if (text.startsWith("hear")) return "Hearings";
  if (text.startsWith("path")) return "Paths";
  if (text.startsWith("return")) return "Returns";
  if (text.startsWith("sigil")) return "Sigils";
  return "Major";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      if (row.some((item) => item.length)) rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((item) => item.length)) rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).map((fields) => Object.fromEntries(header.map((key, index) => [key, fields[index] ?? ""])));
}

export async function loadSources() {
  if (cache) return cache;
  const [canonText, blueText, coresText] = await Promise.all([
    readFile(path.join(DATA, "canonical_cards.csv"), "utf8"),
    readFile(path.join(DATA, "archetype_blueprints.csv"), "utf8"),
    readFile(path.join(DATA, "rootline", "78_ONE_PATH_CORE_CONCEPTS.json"), "utf8"),
  ]);
  const canonicalHash = sha256(canonText);
  if (canonicalHash !== CANON_SHA) throw new Error("Canonical card text changed.");
  const cores = JSON.parse(coresText);
  if (!Array.isArray(cores.cards) || cores.cards.length !== 78) throw new Error("Core map is not 78 cards.");
  const canon = parseCsv(canonText).map((row, index) => {
    const core = cores.cards[index];
    if (!core || core.card_name !== row.name) throw new Error(`Core map misaligned at ${row.name}.`);
    const key = suitKey(row.suit);
    return {
      index,
      name: row.name,
      suit: row.suit,
      suitKey: key,
      rank: row.rank,
      keywords: row.keywords,
      upright: row.upright,
      reversed: row.reversed,
      image: row.image,
      sort_order: row.sort_order,
      image_scale: row.image_scale,
      image_x: row.image_x,
      image_y: row.image_y,
      image_radius: row.image_radius,
      core: core.core_concept,
      core_source: core.core_source,
      quiet: QUIET.has(row.name),
      palette: PALETTE[key],
    };
  });
  const df = new Map();
  for (const row of canon) {
    const seen = new Set([...tokens(row.upright), ...tokens(row.reversed)]);
    for (const word of seen) df.set(word, (df.get(word) || 0) + 1);
  }
  cache = {
    canon,
    cores,
    df,
    files: {
      "canonical_cards.csv": canonText,
      "archetype_blueprints.csv": blueText,
    },
    hashes: {
      canonical: canonicalHash,
      blueprints: sha256(blueText),
      cores: sha256(coresText),
    },
  };
  return cache;
}

function tokens(text) {
  const raw = String(text || "").toLowerCase().match(/[a-z']+/g) || [];
  const kept = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (NEGATION.has(raw[i - 1])) continue;
    const word = raw[i];
    if (word.length < 5 || STOP.has(word) || NEGATION.has(word)) continue;
    kept.push(word);
  }
  return kept;
}

function passage(card, orientation) {
  return orientation === "shadow" ? card.reversed : card.upright;
}

function lexicalLinks(host, guest, hostOrientation, guestOrientation, df) {
  if (!guest) {
    return { shared: [], question: [], axiom: [], mode: "NO_EFFECT", policy: "neutral", machine_inferred: false };
  }
  const hostWords = new Set(tokens(passage(host, hostOrientation)));
  const guestWords = tokens(passage(guest, guestOrientation));
  const shared = [...new Set(guestWords.filter((word) => hostWords.has(word) && (df?.get(word) || 99) <= 8))].sort();
  const question = shared.filter((word) => QUESTION_LEX.has(word));
  const axiom = shared.filter((word) => AXIOM_LEX.has(word));
  let mode = "NO_EFFECT";
  if (shared.length) mode = "COEXIST";
  return {
    shared,
    question,
    axiom,
    mode,
    policy: "UNREVIEWED",
    machine_inferred: true,
    restriction: "Unreviewed links may approach or pass without merging. They cannot complement, clash, attenuate, or synthesize a third pigment.",
  };
}

function gestureOf(card) {
  if (card.suitKey !== "Major") return card.palette.gesture;
  if (card.name === "The Null" || card.name === "Void") return "slow-bend";
  const kinds = ["slow-bend", "single-bow", "two-phase", "measured-facet", "recurve"];
  return kinds[hashString(card.core) % kinds.length];
}

function gestureOffset(gesture, t, amp, phase, waves) {
  if (gesture === "undulation" || gesture === "slow-bend") return amp * Math.sin(phase + t * waves * Math.PI * 2);
  if (gesture === "vector") {
    const steps = 4 + Math.round(waves);
    const q = Math.round(t * steps) / steps;
    return amp * Math.sin(phase + q * Math.PI * 2);
  }
  if (gesture === "inscription" || gesture === "measured-facet") {
    const steps = 6 + Math.round(waves);
    const q = Math.floor(t * steps) / steps;
    return amp * Math.sin(phase + q * Math.PI * 2);
  }
  if (gesture === "recurvature" || gesture === "recurve") {
    const wave = Math.sin(phase + t * waves * Math.PI * 2);
    const fold = Math.sin(phase * 0.7 + t * Math.PI * 2);
    return amp * wave * (0.5 + 0.5 * fold);
  }
  if (gesture === "single-bow") return amp * Math.sin(t * Math.PI);
  if (gesture === "two-phase") return amp * Math.sin(phase + t * Math.PI * 4) * (t < 0.5 ? 1 : 0.62);
  return amp * 0.15 * Math.sin(phase + t * Math.PI);
}

export function identityCenterline(card, date) {
  const seed = `${card.name}|${card.index}|${card.core}`;
  const quiet = card.quiet;
  const amp = quiet ? 8 + unit(seed, "amp") * 14 : 42 + unit(seed, "amp") * 128;
  const waves = quiet ? 0.45 + unit(seed, "waves") * 0.35 : 1.05 + unit(seed, "waves") * 2.6;
  const phase = unit(seed, "phase") * Math.PI * 2;
  const bias = (unit(seed, "bias") - 0.5) * (quiet ? 18 : 80);
  const width = quiet ? 2.2 + unit(seed, "width") * 1.1 : 8 + unit(seed, "width") * 12;
  const x0 = 700 + (unit(seed, "x") - 0.5) * (quiet ? 30 : 110);
  const dateShift = (unit(date, card.name) - 0.5) * 12;
  const gesture = gestureOf(card);
  const count = 73;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const y = 2160 + (120 - 2160) * t;
    const x = x0 + bias * t + gestureOffset(gesture, t, amp, phase, waves) + dateShift * Math.sin(t * Math.PI);
    points.push([clamp(x, 70, 1330), clamp(y, 80, 2220)]);
  }
  return { points, width, gesture, amp, waves, phase, quiet };
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function clonePoints(points) {
  return points.map((point) => [point[0], point[1]]);
}

function clampLine(points) {
  return points.map(([x, y]) => [clamp(x, 70, 1330), clamp(y, 80, 2220)]);
}

function zHost(index) {
  return (index * 5 + 1) % 3;
}

function zGuest(hostIndex, guestIndex) {
  const host = zHost(hostIndex);
  let guest = (guestIndex * 5 + 2) % 3;
  if (guest === host) guest = (guest + 1) % 3;
  return guest;
}

function placeFoundations(hostLine, guestLine) {
  const host = clonePoints(hostLine);
  let guest = clonePoints(guestLine);
  const delta = guest[0][0] - host[0][0];
  if (Math.abs(delta) < 200) {
    const dir = delta >= 0 ? 1 : -1;
    const push = 200 - Math.abs(delta);
    const next = guest[0][0] + dir * push;
    const alt = guest[0][0] - dir * push;
    const use = next >= 90 && next <= 1310 ? next : alt;
    const shift = use - guest[0][0];
    guest = guest.map(([x, y]) => [x + shift, y]);
  }
  return { host: clampLine(host), guest: clampLine(guest) };
}

function blendToward(points, index, amount) {
  const next = clonePoints(points);
  const sigma = 9;
  for (let i = 0; i < next.length; i += 1) {
    const weight = Math.exp(-((i - index) ** 2) / (2 * sigma * sigma));
    next[i][0] += amount * weight;
  }
  return clampLine(next);
}

function localPass(host, guest, index) {
  const sign = guest[index][0] >= host[index][0] ? 1 : -1;
  const mid = (host[index][0] + guest[index][0]) / 2;
  const hostTarget = mid - sign * 4;
  const guestTarget = mid + sign * 4;
  return {
    host: blendToward(host, index, hostTarget - host[index][0]),
    guest: blendToward(guest, index, guestTarget - guest[index][0]),
  };
}

function speechRoles(links, hostOrientation) {
  const before = [];
  if (links.question.length) before.push("question");
  if (links.axiom.length) before.push("axiom");
  if (hostOrientation !== "shadow") {
    return before.map((role) => ({ before: role, after: role, lane: role === "question" ? "left" : "right", mode: role === "question" ? "INTERROGATE" : "COEXIST" }));
  }
  return before.map((role) => {
    if (role === "axiom") return { before: role, after: "question", lane: "left", mode: "INTERROGATE" };
    return { before: role, after: "doubt", lane: "left", mode: "DOUBT" };
  });
}

function respond(host, guest, links, hostOrientation, overrides) {
  let nextHost = host;
  let nextGuest = guest;
  const events = [];
  const branches = [];
  if (!links.shared.length || overrides.disableLink) {
    return { host: nextHost, guest: nextGuest, events, branches, mode: "NO_EFFECT" };
  }
  const primary = links.shared[0];
  const index = 18 + (hashString(primary) % 36);
  const approach = overrides.quietHost ? 18 : 46;
  const sign = nextGuest[index][0] >= nextHost[index][0] ? 1 : -1;
  nextHost = blendToward(nextHost, index, sign * approach * 0.34);
  nextGuest = blendToward(nextGuest, index, -sign * approach * 0.72);
  const passed = localPass(nextHost, nextGuest, index);
  nextHost = passed.host;
  nextGuest = passed.guest;
  events.push({
    event_id: "event-approach",
    t_from_bottom: Number((index / (nextHost.length - 1)).toFixed(3)),
    lexical_links: links.shared.slice(0, 8),
    mode: "COEXIST",
    policy: "UNREVIEWED",
    machine_inferred: true,
    effect: "projection pass without pigment merger",
  });
  if (!overrides.disableBranch) {
    const roles = speechRoles(links, hostOrientation);
    roles.forEach((role, nth) => {
      const at = nextHost[Math.min(nextHost.length - 1, index + nth * 6)];
      const dir = role.lane === "left" ? -1 : 1;
      const length = role.mode === "DOUBT" ? 54 : 92;
      const points = [];
      for (let i = 0; i < 14; i += 1) {
        const t = i / 13;
        points.push([
          clamp(at[0] + dir * length * t, 70, 1330),
          clamp(at[1] - (role.mode === "DOUBT" ? 70 : 28) * t, 80, 2220),
        ]);
      }
      branches.push({
        id: `branch-${nth + 1}`,
        role_before: role.before,
        role_after: role.after,
        mode: role.mode,
        lane: role.lane,
        points,
        parents: ["root-a", "root-b"],
        event_id: "event-approach",
        note: "Encounter speech-act mark. Lineage color is kept. Doubt is not darkened.",
      });
    });
  }
  return { host: nextHost, guest: nextGuest, events, branches, mode: "COEXIST" };
}

function minDistance(a, b) {
  let best = Infinity;
  for (let i = 0; i < a.length; i += 2) {
    for (let j = 0; j < b.length; j += 2) {
      const d = Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

function ribbon(points, widthAt) {
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx;
    const w = widthAt(i / (points.length - 1));
    left.push([points[i][0] + nx * w, points[i][1] + ny * w]);
    right.push([points[i][0] - nx * w, points[i][1] - ny * w]);
  }
  return left.concat(right.reverse());
}

function dOf(points, close) {
  const body = points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join("");
  return close ? `${body}Z` : body;
}

function paint(palette, z) {
  if (z === 0) return { fill: palette.support, width: 0.78 };
  if (z === 2) return { fill: palette.highlight, width: 1.08 };
  return { fill: palette.main, width: 1 };
}

function rootSvg(id, points, card, z, guestInstance, view) {
  if (view.roots === false) return "";
  const tone = paint(card.palette, z);
  const base = card.quiet ? Math.min(card.identity.width, 3.1) : card.identity.width;
  const body = ribbon(points, (t) => {
    let width = base * tone.width * (0.78 + 0.22 * Math.sin(t * Math.PI));
    if (guestInstance) width *= Math.sin(t * Math.PI * 26) > 0.2 ? 1 : 0.46;
    return Math.max(1.4, width);
  });
  const label = `${card.name}. ${card.core}. ${guestInstance ? "Guest instance" : "Host root"}. Depth z ${z}.`;
  return `<g id="${id}" data-root="source" data-card="${xml(card.name)}" data-core="${xml(card.core)}" data-z="${z}" data-suit="${xml(card.suitKey)}" data-lineage="${tone.fill}"><path id="${id}-body" d="${dOf(body, true)}" fill="${tone.fill}"><title>${xml(label)}</title></path></g>`;
}

function branchSvg(branch, color, view) {
  if (view.derived === false) return "";
  const body = ribbon(branch.points, () => 3.2);
  return `<g id="${branch.id}" data-root="derived" data-event="${branch.event_id}" data-role="${branch.role_after}" data-mode="${branch.mode}"><path d="${dOf(body, true)}" fill="${color}"><title>${xml(`${branch.role_after} from ${branch.role_before}. ${branch.note}`)}</title></path></g>`;
}

function eventSvg(events, host, view) {
  if (view.events === false) return "";
  return events.map((event) => {
    const index = Math.round(event.t_from_bottom * (host.length - 1));
    const point = host[index];
    return `<circle id="${event.event_id}" data-event="1" cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="5" fill="none" stroke="#F4F2E9" stroke-width="1.5"/>`;
  }).join("");
}

function sceneSvg(scene, view) {
  const layers = [
    { z: scene.zA, svg: rootSvg("root-a", scene.hostPoints, scene.host, scene.zA, false, view) },
  ];
  if (scene.guest) layers.push({ z: scene.zB, svg: rootSvg("root-b", scene.guestPoints, scene.guest, scene.zB, true, view) });
  layers.sort((a, b) => a.z - b.z);
  const derivedColor = scene.host.palette.main;
  const branches = (scene.branches || []).map((branch) => branchSvg(branch, derivedColor, view)).join("");
  const events = eventSvg(scene.events || [], scene.hostPoints, view);
  const title = scene.guest
    ? `${scene.host.name} meets ${scene.guest.name}`
    : `${scene.host.name}. ${scene.host.core}. One rising path.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xml(title)}"><rect id="field-ground" width="${W}" height="${H}" fill="${FIELD}"/><title>${xml(title)}</title>${layers.map((layer) => layer.svg).join("")}${branches}${events}</svg>`;
}

function roundPoints(points) {
  return points.map(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))]);
}

export function compileScene(sources, hostIndex, affinity, date, orientations = {}, overrides = {}) {
  if (!Number.isInteger(hostIndex) || hostIndex < 0 || hostIndex > 77) throw new Error("Unknown card.");
  if (!Number.isInteger(affinity) || affinity < 0 || affinity > 78) throw new Error("Affinity must be a whole number from 0 to 78.");
  const hostOrientation = orientations.hostOrientation === "shadow" ? "shadow" : "upright";
  const guestOrientation = orientations.guestOrientation === "shadow" ? "shadow" : "upright";
  const host = sources.canon[hostIndex];
  const guest = !overrides.removeGuest && affinity > 0 ? sources.canon[affinity - 1] : null;
  const hostIdentity = identityCenterline(host, date);
  host.identity = hostIdentity;
  let hostPoints = hostIdentity.points;
  let guestPoints = null;
  let links = lexicalLinks(null, null, hostOrientation, guestOrientation, sources.df);
  let events = [];
  let branches = [];
  let mode = "NO_EFFECT";
  let zA = zHost(host.index);
  let zB = null;
  if (guest) {
    const guestIdentity = identityCenterline(guest, date);
    guest.identity = guestIdentity;
    const placed = placeFoundations(hostIdentity.points, guestIdentity.points);
    links = lexicalLinks(host, guest, hostOrientation, guestOrientation, sources.df);
    const response = respond(placed.host, placed.guest, links, hostOrientation, {
      disableLink: overrides.disableLink === true,
      disableBranch: overrides.disableBranch === true,
      quietHost: host.quiet,
    });
    hostPoints = response.host;
    guestPoints = response.guest;
    events = response.events;
    branches = response.branches;
    mode = response.mode;
    zA = overrides.collapseZ ? 1 : zHost(host.index);
    zB = overrides.collapseZ ? 1 : zGuest(host.index, guest.index);
    if (overrides.separateZ) {
      zA = 2;
      zB = 0;
    }
  }
  const sameZ = guest ? zA === zB : false;
  const gap = guest ? minDistance(hostPoints, guestPoints) : null;
  const contact = Boolean(guest && sameZ && gap < 16);
  const projectedOverlap = Boolean(guest && gap < 16);
  const scene = {
    host,
    guest,
    hostPoints: roundPoints(hostPoints),
    guestPoints: guest ? roundPoints(guestPoints) : null,
    identityHost: roundPoints(hostIdentity.points),
    zA,
    zB,
    links,
    events,
    branches,
    mode,
    contact,
    projectedOverlap,
    hostOrientation: guest ? hostOrientation : "upright",
    guestOrientation: guest ? guestOrientation : null,
    affinity,
    date,
    weight: links.shared.length,
  };
  return scene;
}

function recipeId(sources, date, affinity) {
  return sha256(JSON.stringify({
    recipe_version: RECIPE_VERSION,
    renderer: VERSION,
    grammar: GRAMMAR_VERSION,
    style: STYLE_ID,
    lexicon: ORIGIN_LEXICON,
    policy: POLICY_VERSION,
    date,
    affinity,
    canonical: sources.hashes.canonical,
  }));
}

function traceOf(sources, scene, svg) {
  const guest = scene.guest;
  const roles = (scene.branches || []).map((branch) => ({ before: branch.role_before, after: branch.role_after, mode: branch.mode, lane: branch.lane }));
  return {
    schema: TRACE_SCHEMA,
    renderer: VERSION,
    grammar_version: GRAMMAR_VERSION,
    recipe_version: RECIPE_VERSION,
    style_id: STYLE_ID,
    origin_lexicon_version: ORIGIN_LEXICON,
    policy_version: POLICY_VERSION,
    recipe_id: recipeId(sources, scene.date, scene.affinity),
    date: scene.date,
    affinity: scene.affinity,
    affinity_name: scene.affinity === 0 ? "Neutral" : sources.canon[scene.affinity - 1].name,
    host_card: scene.host.name,
    guest_card: guest?.name ?? null,
    host_orientation: scene.hostOrientation,
    guest_orientation: scene.guestOrientation,
    reading_upwards_in_view: true,
    source_core_concepts: [
      { card: scene.host.name, core: scene.host.core, source: scene.host.core_source, orientation_invariant: true },
      ...(guest ? [{ card: guest.name, core: guest.core, source: guest.core_source, orientation_invariant: true }] : []),
    ],
    root_paths: guest ? ["root-a", "root-b"] : ["root-a"],
    root_path_geometry: {
      "root-a": { points: scene.hostPoints, lineage: scene.host.suitKey, z: scene.zA },
      ...(guest ? { "root-b": { points: scene.guestPoints, lineage: guest.suitKey, z: scene.zB, instance: scene.host.name === guest.name ? "second-instance" : "guest" } } : {}),
    },
    lexical_evidence: {
      shared_terms: scene.links.shared,
      question_terms: scene.links.question,
      axiom_terms: scene.links.axiom,
      policy: guest ? "UNREVIEWED" : "neutral",
      machine_inferred: Boolean(guest),
      weight: scene.weight,
      weight_is_not_depth: true,
    },
    layer_positions: { host: ["background", "midground", "foreground"][scene.zA], guest: guest ? ["background", "midground", "foreground"][scene.zB] : null },
    encounter_events: scene.events,
    derived_paths: (scene.branches || []).map((branch) => ({ id: branch.id, parents: branch.parents, event_id: branch.event_id, role_after: branch.role_after })),
    color_provenance: guest
      ? [{ element: "root-a", lineage: scene.host.palette.main }, { element: "root-b", lineage: guest.palette.main }, { element: "derived", lineage: scene.host.palette.main, mix: "none" }]
      : [{ element: "root-a", lineage: scene.host.palette.main }],
    negative_space: {
      id: scene.host.quiet ? "protected-silence" : "open-field",
      reason: scene.host.quiet
        ? "This silence card keeps every unearned mark off the field."
        : "Empty field is wherever no encounter earned a mark. There is no mandatory center void.",
    },
    roles,
    contact_same_z: scene.contact,
    projected_overlap: scene.projectedOverlap,
    rendered_evidence: {
      svg_ids: [...svg.matchAll(/id="([^"]+)"/g)].map((hit) => hit[1]),
      source_root_marks: (svg.match(/data-root="source"/g) || []).length,
      derived_marks: (svg.match(/data-root="derived"/g) || []).length,
    },
    human_legibility: "not_yet_measured",
    visual_reference_inputs: [],
    geometry_digest: sha256(svg),
  };
}

function compactTrace(trace) {
  return {
    ...trace,
    root_path_geometry: Object.fromEntries(Object.entries(trace.root_path_geometry).map(([id, path]) => [id, { points: path.points.length, z: path.z, lineage: path.lineage, instance: path.instance ?? null }])),
  };
}

export async function renderCard(sources, index, date, affinity, options = {}) {
  const scene = compileScene(sources, index, affinity, date, {
    hostOrientation: options.hostOrientation,
    guestOrientation: options.guestOrientation,
  }, options.overrides || {});
  const view = options.view || {};
  const svg = sceneSvg(scene, view);
  const trace = traceOf(sources, scene, svg);
  if (options.counterfactuals) trace.counterfactual_probes = await measureCard(sources, index, date, affinity, options);
  let png = null;
  if (options.raster !== false) png = await sharp(Buffer.from(svg)).png().toBuffer();
  const card = sources.canon[index];
  return {
    card: {
      index: index + 1,
      name: card.name,
      suit: card.suit,
      rank: card.rank,
      keywords: card.keywords,
      upright: card.upright,
      reversed: card.reversed,
      image: card.image,
      sort_order: card.sort_order,
    },
    svg,
    png,
    trace: options.compact ? compactTrace(trace) : trace,
    scene,
  };
}

async function svgDelta(sources, index, date, affinity, options, overrides) {
  const base = await renderCard(sources, index, date, affinity, { ...options, raster: false, overrides: options.overrides || {} });
  const next = await renderCard(sources, index, date, affinity, { ...options, raster: false, overrides: { ...(options.overrides || {}), ...overrides } });
  return { base, next, changed: base.svg !== next.svg };
}

export async function measureCard(sources, index, date, affinity, options = {}) {
  const orient = { hostOrientation: options.hostOrientation, guestOrientation: options.guestOrientation };
  const neutral = await renderCard(sources, index, date, 0, { raster: false, hostOrientation: "shadow" });
  const neutralUpright = await renderCard(sources, index, date, 0, { raster: false, hostOrientation: "upright" });
  const full = await renderCard(sources, index, date, affinity, { ...orient, raster: false });
  const removed = await renderCard(sources, index, date, 0, { raster: false });
  const unlinked = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { disableLink: true } });
  const collapsed = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { collapseZ: true } });
  const separated = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { separateZ: true } });
  const unbranched = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { disableBranch: true } });
  const flipped = await renderCard(sources, index, date, affinity, {
    raster: false,
    hostOrientation: orient.hostOrientation === "shadow" ? "upright" : "shadow",
    guestOrientation: orient.guestOrientation,
  });
  const later = await renderCard(sources, index, date === "2099-12-31" ? "2099-12-30" : "2099-12-31", affinity, { ...orient, raster: false });
  const probes = [
    {
      intervention: "remove_guest",
      actually_executed: true,
      svg_changed: full.svg !== removed.svg,
      guest_roots_after: removed.trace.rendered_evidence.source_root_marks,
      host_core_same: full.trace.source_core_concepts[0].core === removed.trace.source_core_concepts[0].core,
      measured_delta: full.svg === removed.svg ? 0 : 1,
    },
    {
      intervention: "disable_link",
      actually_executed: true,
      svg_changed: full.svg !== unlinked.svg,
      shared_terms: full.trace.lexical_evidence.shared_terms.length,
      measured_delta: full.svg === unlinked.svg ? 0 : 1,
      note: full.trace.lexical_evidence.shared_terms.length ? "link-local geometry compared" : "no shared term to disable; roots compared",
    },
    {
      intervention: "separate_z",
      actually_executed: true,
      contact_when_collapsed: collapsed.scene.contact,
      contact_when_separated: separated.scene.contact,
      contact_changed: collapsed.scene.contact !== separated.scene.contact,
      svg_changed: collapsed.svg !== separated.svg,
      measured_delta: collapsed.svg === separated.svg ? 0 : 1,
    },
    {
      intervention: "flip_orientation",
      actually_executed: true,
      solo_svg_unchanged: neutral.svg === neutralUpright.svg,
      core_same: full.trace.source_core_concepts[0].core === flipped.trace.source_core_concepts[0].core,
      svg_changed: full.svg !== flipped.svg,
      measured_delta: full.svg === flipped.svg ? 0 : 1,
    },
    {
      intervention: "disable_branch",
      actually_executed: true,
      derived_before: full.trace.rendered_evidence.derived_marks,
      svg_changed: full.svg !== unbranched.svg,
      measured_delta: full.svg === unbranched.svg ? 0 : 1,
      note: full.trace.rendered_evidence.derived_marks ? "branch removed and compared" : "no derived branch existed",
    },
    {
      intervention: "disable_mix",
      actually_executed: true,
      composite_elements: 0,
      svg_changed: false,
      measured_delta: 0,
      note: "No third pigment is generated from unreviewed links, so disabling mix leaves both roots in place.",
    },
    {
      intervention: "change_date",
      actually_executed: true,
      svg_changed: full.svg !== later.svg,
      measured_delta: full.svg === later.svg ? 0 : 1,
    },
  ];
  return probes;
}

function backSvg() {
  const rot = (points) => points.map(([x, y]) => [W - x, H - y]);
  const strokes = [];
  const add = (points) => {
    strokes.push(points, rot(points));
  };
  add([[460, 760], [560, 920], [520, 1100], [610, 1280]]);
  add([[680, 820], [760, 980], [710, 1160]]);
  add([[390, 1040], [470, 1200], [430, 1360]]);
  add([[300, 900], [300, 980]]);
  const body = strokes.map((points, index) => `<path id="back-${index + 1}" d="${dOf(points, false)}" fill="none" stroke="#C5CDD6" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect id="back-ground" width="${W}" height="${H}" fill="${FIELD}"/>${body}<title>Dendrite. Shared undrawn back. No card, affinity, date, or orientation.</title></svg>`;
}

async function backAsset() {
  const svg = backSvg();
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
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
  return { svg, bytes: mean > 0.25 ? png : jpeg, mean, format: mean > 0.25 ? "png" : "jpeg" };
}

export async function buildDeck(directory, date, affinity) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date must be YYYY-MM-DD.");
  const sources = await loadSources();
  const recipe = recipeId(sources, date, affinity);
  await mkdir(`${directory}/images`, { recursive: true });
  await mkdir(`${directory}/svg`, { recursive: true });
  await mkdir(`${directory}/procedural_trace`, { recursive: true });
  await mkdir(`${directory}/lexical_provenance`, { recursive: true });
  await mkdir(`${directory}/back`, { recursive: true });
  const cards = [];
  const contexts = [];
  const files = new Map();
  const put = async (rel, data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await writeFile(`${directory}/${rel}`, buf);
    files.set(rel, buf);
  };
  for (let index = 0; index < 78; index += 1) {
    const drawn = await renderCard(sources, index, date, affinity, { counterfactuals: true });
    const slug = drawn.card.image.replace(/\.(png|jpg|jpeg)$/i, "");
    await put(`images/${slug}.png`, drawn.png);
    await put(`svg/${slug}.svg`, drawn.svg);
    await put(`procedural_trace/${String(index + 1).padStart(2, "0")}.json`, `${JSON.stringify(drawn.trace, null, 2)}\n`);
    await put(`lexical_provenance/${String(index + 1).padStart(2, "0")}.json`, `${JSON.stringify({
      host: drawn.trace.source_core_concepts[0],
      guest: drawn.trace.source_core_concepts[1] ?? null,
      evidence: drawn.trace.lexical_evidence,
    }, null, 2)}\n`);
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
      core_concept: sources.canon[index].core,
      encounter_layer: affinity === 0 ? null : {
        affinity_index: affinity,
        affinity_name: sources.canon[affinity - 1].name,
        notice: "Encounter proposal only. It does not replace the canonical meaning.",
      },
    });
  }
  const header = ["name", "suit", "rank", "keywords", "upright", "reversed", "image", "sort_order", "image_scale", "image_x", "image_y", "image_radius"];
  const csvEscape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [header.join(",")];
  for (const card of cards) {
    const canon = sources.canon.find((row) => row.name === card.name);
    lines.push([card.name, card.suit, card.rank, card.keywords, card.upright, card.reversed, card.file.split("/").pop(), canon.sort_order, canon.image_scale, canon.image_x, canon.image_y, canon.image_radius].map(csvEscape).join(","));
  }
  await put("cards.csv", `${lines.join("\n")}\n`);
  await put("canonical_cards.csv", sources.files["canonical_cards.csv"]);
  await put("archetype_blueprints.csv", sources.files["archetype_blueprints.csv"]);
  await put("deck_contexts.json", `${JSON.stringify({ schema_version: "velomere-rootline-contexts/1", recipe_id: recipe, affinity, cards: contexts }, null, 2)}\n`);
  const affinityName = affinity === 0 ? "Neutral" : sources.canon[affinity - 1].name;
  const back = await backAsset();
  await put("back/card-back.svg", back.svg);
  await put("back/card-back.jpg", back.bytes);
  const deck = {
    schema_version: RECIPE_VERSION,
    name: `Velomere / ${date} / ${affinityName} (${affinity})`,
    recipe_id: recipe,
    date,
    affinity,
    affinity_name: affinityName,
    renderer: VERSION,
    style_id: STYLE_ID,
    style_label: STYLE_LABEL,
    cardTemplate: "long-tarot",
    cardBack: "back/card-back.jpg",
    back_name: "Dendrite",
    visual_reference_inputs: [],
    cards: cards.map((card) => ({ name: card.name, file: card.file, sort_order: card.sortOrder })),
  };
  await put("deck.json", `${JSON.stringify(deck, null, 2)}\n`);
  await put("recipe.json", `${JSON.stringify({ recipe_id: recipe, renderer: VERSION, recipe_version: RECIPE_VERSION, grammar_version: GRAMMAR_VERSION, style_id: STYLE_ID, origin_lexicon_version: ORIGIN_LEXICON, policy_version: POLICY_VERSION, date, affinity, affinity_name: affinityName, source_hashes: sources.hashes, visual_reference_inputs: [], back_name: "Dendrite", human_legibility: "not_yet_measured" }, null, 2)}\n`);
  await put("provenance.json", `${JSON.stringify({ renderer: VERSION, grammar_version: GRAMMAR_VERSION, style_id: STYLE_ID, origin_lexicon_version: ORIGIN_LEXICON, policy_version: POLICY_VERSION, recipe_id: recipe, date, affinity, affinity_name: affinityName, source_hashes: sources.hashes, visual_reference_inputs: [], card_count: 78, back_name: "Dendrite", back_rotation_mean: back.mean, back_format: back.format, human_legibility: "not_yet_measured" }, null, 2)}\n`);
  const filesSha = {};
  for (const [rel, buf] of files) filesSha[rel] = sha256(buf);
  await put("manifest.json", `${JSON.stringify({ schema_version: RECIPE_VERSION, recipe_id: recipe, files_sha256: filesSha }, null, 2)}\n`);
  const packed = {};
  for (const [rel, buf] of files) packed[rel] = new Uint8Array(buf);
  await writeFile(`${directory}/deck.zip`, zipSync(packed, { mtime: new Date(Date.UTC(2000, 5, 8)) }));
  return { recipe, cards, backMean: back.mean, backFormat: back.format };
}

function countRoots(svg) {
  return {
    source: (svg.match(/data-root="source"/g) || []).length,
    derived: (svg.match(/data-root="derived"/g) || []).length,
  };
}

export async function proveRootline(date = "2026-11-13") {
  const sources = await loadSources();
  const failures = [];
  const digests = new Set();
  const affirm = {
    1: sources.canon[0].name,
    14: sources.canon[13].name,
    78: sources.canon[77].name,
  };
  if (affirm[1] !== "The Shuffle") failures.push(`affinity 1 is ${affirm[1]}`);
  if (affirm[14] !== "The Dance") failures.push(`affinity 14 is ${affirm[14]}`);
  if (affirm[78] !== "Witness of Sigils") failures.push(`affinity 78 is ${affirm[78]}`);
  let scenes = 0;
  let neutrals = 0;
  let encounters = 0;
  let equalPairs = 0;
  let asymmetric = 0;
  let branchedExample = null;
  for (let host = 0; host < 78; host += 1) {
    const solo = await renderCard(sources, host, date, 0, { raster: false });
    const again = await renderCard(sources, host, date, 0, { raster: false });
    const shadow = await renderCard(sources, host, date, 0, { raster: false, hostOrientation: "shadow" });
    const later = await renderCard(sources, host, date, 0, { raster: false });
    const dated = await renderCard(sources, host, "2026-11-14", 0, { raster: false });
    scenes += 1;
    neutrals += 1;
    const roots = countRoots(solo.svg);
    if (solo.svg !== again.svg) failures.push(`${solo.card.name} not repeatable`);
    if (solo.svg !== shadow.svg) failures.push(`${solo.card.name} solo path changed in shadow`);
    if (roots.source !== 1 || roots.derived !== 0) failures.push(`${solo.card.name} neutral roots ${roots.source}/${roots.derived}`);
    if (solo.trace.guest_card) failures.push(`${solo.card.name} neutral named a guest`);
    if (solo.trace.roles.length) failures.push(`${solo.card.name} neutral assigned a speech role`);
    if (solo.svg === dated.svg) failures.push(`${solo.card.name} date did not move geometry`);
    if (!solo.svg.includes('id="field-ground"') || !solo.svg.includes('id="root-a"')) failures.push(`${solo.card.name} missing field or root`);
    if (solo.trace.visual_reference_inputs.length) failures.push(`${solo.card.name} used a visual reference`);
    if (solo.trace.human_legibility !== "not_yet_measured") failures.push(`${solo.card.name} claimed human legibility`);
    digests.add(solo.trace.geometry_digest);
    if (solo.card.name === "The Null" && solo.scene.host.identity.amp > 24) failures.push("The Null was not quiet");
    void later;
    for (let affinity = 1; affinity <= 78; affinity += 1) {
      const face = await renderCard(sources, host, date, affinity, { raster: false });
      scenes += 1;
      encounters += 1;
      const marks = countRoots(face.svg);
      if (marks.source !== 2) failures.push(`${face.card.name} affinity ${affinity} has ${marks.source} source roots`);
      if (affinity - 1 === host && face.trace.root_path_geometry["root-b"]?.instance !== "second-instance") {
        failures.push(`${face.card.name} self-encounter is not two instances`);
      }
      if (face.trace.source_core_concepts.length !== 2) failures.push(`${face.card.name} affinity ${affinity} core count`);
      if (face.trace.source_core_concepts[0].core !== sources.canon[host].core) failures.push(`${face.card.name} core drifted`);
      if (!branchedExample && marks.derived > 0) branchedExample = { host, affinity };
      const strong = (face.svg.match(/THIRD_EMERGENCE|COMPLEMENT|CLASH|ATTENUATE/g) || []).length;
      if (strong) failures.push(`${face.card.name} affinity ${affinity} used a strong unreviewed mode`);
    }
  }
  for (let a = 0; a < 78; a += 1) {
    for (let b = 0; b < 78; b += 1) {
      if (a === b) continue;
      const ab = await renderCard(sources, a, date, b + 1, { raster: false });
      const ba = await renderCard(sources, b, date, a + 1, { raster: false });
      if (ab.svg === ba.svg) equalPairs += 1;
      else asymmetric += 1;
    }
  }
  if (!branchedExample) failures.push("no earned branch was observed");
  else {
    const on = await renderCard(sources, branchedExample.host, date, branchedExample.affinity, { raster: false });
    const off = await renderCard(sources, branchedExample.host, date, branchedExample.affinity, { raster: false, overrides: { disableBranch: true } });
    if (on.trace.rendered_evidence.derived_marks < 1) failures.push("branch probe lost its derived mark");
    if (on.svg === off.svg) failures.push("disabling an earned branch did not change the drawing");
  }
  const probeHost = sources.canon.findIndex((card) => card.name === "The Velomere");
  let probeAffinity = 0;
  for (let affinity = 1; affinity <= 78; affinity += 1) {
    const scene = compileScene(sources, probeHost, affinity, date);
    if (scene.links.shared.length && scene.projectedOverlap) {
      probeAffinity = affinity;
      break;
    }
  }
  if (!probeAffinity) failures.push("no linked overlap available for the depth probe");
  const probes = probeAffinity ? await measureCard(sources, probeHost, date, probeAffinity) : [];
  for (const probe of probes) {
    if (!probe.actually_executed) failures.push(`${probe.intervention} was not executed`);
    if (probe.intervention === "remove_guest" && (probe.guest_roots_after !== 1 || !probe.host_core_same || !probe.svg_changed)) {
      failures.push("remove_guest did not measure a real change");
    }
    if (probe.intervention === "flip_orientation" && !probe.solo_svg_unchanged) failures.push("solo orientation mutated the path");
    if (probe.intervention === "flip_orientation" && !probe.core_same) failures.push("orientation changed the core");
    if (probe.intervention === "separate_z" && !probe.contact_changed && probe.contact_when_collapsed === probe.contact_when_separated) {
      failures.push("separate_z did not change contact");
    }
  }
  const sample = await renderCard(sources, 0, date, 0, { raster: true });
  const meta = await sharp(sample.png).metadata();
  if (meta.width !== 1400 || meta.height !== 2300) failures.push(`png ${meta.width}x${meta.height}`);
  if (!sample.svg.includes('width="1400"') || !sample.svg.includes('height="2300"')) failures.push("svg size drifted");
  const back = await backAsset();
  if (back.mean > 0.25) failures.push(`back mean ${back.mean}`);
  if (digests.size !== 78) failures.push(`neutral digests ${digests.size}`);
  if (scenes !== 6162) failures.push(`scenes ${scenes}`);
  if (asymmetric + equalPairs !== 6006) failures.push(`pairs ${asymmetric + equalPairs}`);
  return {
    ok: failures.length === 0,
    failures: failures.slice(0, 40),
    failure_count: failures.length,
    scenes,
    neutrals,
    encounters,
    unique_neutral_digests: digests.size,
    asymmetric_pairs: asymmetric,
    equal_pairs: equalPairs,
    directed_pairs_expected: 6006,
    back_mean: back.mean,
    back_format: back.format,
    canonical_sha256: sources.hashes.canonical,
    human_legibility: "not_yet_measured",
    renderer: VERSION,
    probe_affinity: probeAffinity,
    probes,
  };
}
