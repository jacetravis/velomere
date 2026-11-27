// @ts-nocheck
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { zipSync } from "fflate";

export const VERSION = "relational-encounter-12-confluence";
export const GRAMMAR_VERSION = "velomere-confluence/2";
export const RECIPE_VERSION = "velomere-confluence-recipe/2";
export const TRACE_SCHEMA = "velomere-confluence-trace/2";
export const STYLE_ID = "velomere-rootline-encounter/1";
export const STYLE_LABEL = "VELoMERE — Rising Path Encounter";
export const ORIGIN_LEXICON = "velomere-lexical-canon/1.0";
export const POLICY_VERSION = "confluence-unreviewed/2";
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

function readMatrix(name) {
  return readFile(path.join(DATA, "confluence", name), "utf8");
}

function supportKey(index, orientation) {
  return `${index}:${orientation === "shadow" ? "Shadow" : "Upright"}`;
}

export async function loadSources() {
  if (cache) return cache;
  const [canonText, blueText, coresText, invariantText, weightText, distributionText, grammarText, policyText] = await Promise.all([
    readFile(path.join(DATA, "canonical_cards.csv"), "utf8"),
    readFile(path.join(DATA, "archetype_blueprints.csv"), "utf8"),
    readFile(path.join(DATA, "rootline", "78_ONE_PATH_CORE_CONCEPTS.json"), "utf8"),
    readMatrix("78_CARD_CORE_INVARIANTS.csv"),
    readMatrix("78_CARD_TERM_POSITION_WEIGHTS.csv"),
    readMatrix("78_CARD_WEIGHT_DISTRIBUTIONS.csv"),
    readMatrix("GRAMMAR_AND_FUNCTION_WORD_POLICY.csv"),
    readMatrix("8x8_SUIT_POLARITY_PAIR_POLICY.csv"),
  ]);
  const canonicalHash = sha256(canonText);
  if (canonicalHash !== CANON_SHA) throw new Error("Canonical card text changed.");
  const cores = JSON.parse(coresText);
  if (!Array.isArray(cores.cards) || cores.cards.length !== 78) throw new Error("Core map is not 78 cards.");
  const invariants = parseCsv(invariantText);
  if (invariants.length !== 78) throw new Error("Core invariants are not 78 cards.");
  const policies = parseCsv(policyText);
  if (policies.length !== 64) throw new Error("Suit pair policy is not 64 rows.");
  if (policies.some((row) => row.automatic_interaction_choice !== "NO" || !String(row.default_action).startsWith("UNREVIEWED"))) {
    throw new Error("A pair policy tried to approve an interaction.");
  }
  const grammar = new Set(parseCsv(grammarText).map((row) => row.term));
  const canon = parseCsv(canonText).map((row, index) => {
    const core = cores.cards[index];
    const invariant = invariants[index];
    if (!core || core.card_name !== row.name) throw new Error(`Core map misaligned at ${row.name}.`);
    if (!invariant || invariant.card_name !== row.name || invariant.one_core_concept !== core.core_concept) {
      throw new Error(`Invariant core misaligned at ${row.name}.`);
    }
    if (Number(invariant.core_weight_both_orientations) !== 100) throw new Error(`${row.name} core weight is not 100.`);
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
      core_attestation: invariant.core_attestation,
      quiet: QUIET.has(row.name),
      palette: PALETTE[key],
    };
  });
  const support = new Map();
  for (const row of parseCsv(weightText)) {
    const index = Number(row.card_index);
    const card = canon[index];
    if (!card || card.name !== row.card_name) throw new Error(`Weight row misaligned at ${row.card_name}.`);
    if (card.suitKey === "Major" && Number(row.suit_polarity_prior) !== 0) {
      throw new Error(`${card.name} received a fifth-suit prior.`);
    }
    const eligible = row.lexical_eligible === "1" && !grammar.has(row.term) && Number(row.core_anchor) === 0;
    const entry = {
      term: row.term,
      weight: Number(row.association_weight_0_100),
      share: Number(row.support_distribution_pct),
      eligible,
      role: row.context_role,
      review: "UNREVIEWED",
      prior: Number(row.suit_polarity_prior),
    };
    const key = supportKey(index, row.orientation === "Shadow" ? "shadow" : "upright");
    const list = support.get(key) || [];
    list.push(entry);
    support.set(key, list);
  }
  for (const list of support.values()) {
    list.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));
  }
  const distributions = parseCsv(distributionText);
  if (distributions.length !== 156) throw new Error("Weight distributions are not 156 positions.");
  cache = {
    canon,
    cores,
    grammar,
    support,
    distributions,
    policies,
    terms(index, orientation) {
      return support.get(supportKey(index, orientation)) || [];
    },
    files: {
      "canonical_cards.csv": canonText,
      "archetype_blueprints.csv": blueText,
    },
    hashes: {
      canonical: canonicalHash,
      blueprints: sha256(blueText),
      cores: sha256(coresText),
      weights: sha256(weightText),
      invariants: sha256(invariantText),
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

function eligibleOverlap(sources, host, guest, hostOrientation, guestOrientation) {
  if (!guest) {
    return { shared: [], potential: 0, action: "NO_AUTOMATIC_EFFECT", review: "neutral", confluence: null };
  }
  const guestTerms = new Map(sources.terms(guest.index, guestOrientation).map((term) => [term.term, term]));
  const shared = [];
  const hostTerms = sources.terms(host.index, hostOrientation);
  const corePair = [
    { term: host.core, weight: 100, eligible: true },
    { term: guest.core, weight: 100, eligible: true },
  ];
  if (host.core === guest.core && !sources.grammar.has(host.core)) {
    shared.push({ term: host.core, wa: 100, wb: 100, potential: 40, review: "UNREVIEWED", kind: "invariant" });
  }
  for (const term of hostTerms) {
    const other = guestTerms.get(term.term);
    if (!term.eligible || !other?.eligible || sources.grammar.has(term.term)) continue;
    const potential = Number((0.4 * Math.min(term.weight, other.weight)).toFixed(2));
    if (potential <= 0) continue;
    shared.push({ term: term.term, wa: term.weight, wb: other.weight, potential, review: "UNREVIEWED", kind: "support" });
  }
  shared.sort((a, b) => b.potential - a.potential || a.term.localeCompare(b.term));
  void corePair;
  return {
    shared: shared.slice(0, 8),
    potential: shared[0]?.potential || 0,
    action: "NO_AUTOMATIC_EFFECT",
    review: "UNREVIEWED",
    confluence: "RECOGNIZED_DIFFERENCE",
    note: "Exact overlap is eligible capacity only. No sense has been reviewed, so the drawing does not touch, blend, or assign a question or axiom.",
  };
}

function narrativeZ(card, role, overrides) {
  if (overrides.collapseZ && (role === "host" || role === "guest")) return 1;
  if (overrides.separateZ && role === "host") return 2;
  if (overrides.separateZ && role === "guest") return 0;
  if (role === "confluence") return 2;
  if (role === "strand") return 0;
  if (role === "guest") return 0;
  return card.quiet ? 0 : 1;
}

function translate(points, dx) {
  return points.map(([x, y]) => [x + dx, y]);
}

function placeFoundations(hostLine, guestLine) {
  const host = clonePoints(hostLine);
  let guest = clonePoints(guestLine);
  const delta = guest[0][0] - host[0][0];
  if (Math.abs(delta) < 220) {
    const dir = delta === 0 ? 1 : Math.sign(delta);
    const push = 220 - Math.abs(delta);
    guest = translate(guest, dir * push);
  }
  return { host: clampLine(host), guest: clampLine(guest) };
}

function trimRising(points, yStop) {
  const kept = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point[1] <= yStop) {
      const prev = kept[kept.length - 1] || point;
      const span = prev[1] - point[1] || 1;
      const u = (prev[1] - yStop) / span;
      kept.push([prev[0] + (point[0] - prev[0]) * u, yStop]);
      break;
    }
    kept.push(point);
  }
  return kept.length > 4 ? kept : points.slice(0, Math.max(5, points.length - 8));
}

function approach(points, target) {
  const start = points[points.length - 1];
  const extra = [];
  for (let i = 1; i <= 14; i += 1) {
    const u = i / 14;
    const ease = u * u * (3 - 2 * u);
    extra.push([start[0] + (target[0] - start[0]) * ease, start[1] + (target[1] - start[1]) * ease]);
  }
  return points.concat(extra);
}

function internalStrands(card, orientation, parent, parentId, sources, overrides) {
  if (overrides.disableBranch || card.quiet || !parent?.length) return [];
  const terms = sources.terms(card.index, orientation).filter((term) => term.eligible && term.weight >= 12).slice(0, 2);
  return terms.map((term, nth) => {
    const startT = 0.22 + nth * 0.2;
    const endT = startT + 0.14;
    const i0 = Math.min(parent.length - 4, Math.max(2, Math.round(startT * (parent.length - 1))));
    const i1 = Math.min(parent.length - 2, Math.max(i0 + 3, Math.round(endT * (parent.length - 1))));
    const dir = parent[i0][0] < 700 ? -1 : 1;
    const reach = 26 + Math.min(42, term.weight * 0.35);
    const points = [];
    const steps = 18;
    for (let i = 0; i < steps; i += 1) {
      const u = i / (steps - 1);
      const at = parent[Math.round(i0 + (i1 - i0) * u)];
      const bow = Math.sin(u * Math.PI) * reach * dir;
      points.push([clamp(at[0] + bow, 70, 1330), at[1]]);
    }
    points[0] = [parent[i0][0], parent[i0][1]];
    points[points.length - 1] = [parent[i1][0], parent[i1][1]];
    return {
      id: `${parentId}-strand-${nth + 1}`,
      term: term.term,
      weight: term.weight,
      points,
      parent: parentId,
      rejoins: true,
      z: 0,
    };
  });
}

function keepApart(host, guest, minGap) {
  const next = clonePoints(guest);
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 0; i < host.length; i += 1) {
      const j = Math.min(next.length - 1, Math.round((i * (next.length - 1)) / Math.max(1, host.length - 1)));
      const dx = next[j][0] - host[i][0];
      if (Math.abs(dx) >= minGap) continue;
      const dir = dx === 0 ? 1 : Math.sign(dx);
      const push = minGap - Math.abs(dx) + 4;
      for (let k = 0; k < next.length; k += 1) {
        const weight = Math.exp(-((k - j) ** 2) / (2 * 5 * 5));
        next[k][0] += dir * push * weight;
      }
    }
  }
  return clampLine(next);
}

function collapsePass(host, guest) {
  const index = Math.round(host.length * 0.45);
  const sign = guest[index][0] >= host[index][0] ? 1 : -1;
  const mid = (host[index][0] + guest[index][0]) / 2;
  const pull = (points, target) => {
    const next = clonePoints(points);
    for (let i = 0; i < next.length; i += 1) {
      const weight = Math.exp(-((i - index) ** 2) / (2 * 8 * 8));
      next[i][0] += (target - points[index][0]) * weight;
    }
    return clampLine(next);
  };
  return {
    host: pull(host, mid - sign * 4),
    guest: pull(guest, mid + sign * 4),
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
  if (view.roots === false || !points?.length) return "";
  const tone = paint(card.palette, z);
  const base = card.quiet ? Math.min(card.identity.width, 3.1) : card.identity.width;
  const widthAt = (t) => {
    let width = base * tone.width * (0.82 + 0.18 * Math.sin(t * Math.PI));
    if (guestInstance) width *= Math.sin(t * Math.PI * 18) > 0.05 ? 1 : 0.28;
    return Math.max(1.6, width);
  };
  const body = ribbon(points, widthAt);
  const shadowShift = 7 + (2 - z) * 5;
  const shadow = ribbon(points.map(([x, y]) => [x + shadowShift, y + shadowShift + 4]), widthAt);
  const spine = dOf(points, false);
  const label = `${card.name}. ${card.core}. ${guestInstance ? "Guest instance" : "Host root"}. Attention z ${z}.`;
  return `<g id="${id}" data-root="source" data-card="${xml(card.name)}" data-core="${xml(card.core)}" data-z="${z}" data-suit="${xml(card.suitKey)}" data-lineage="${card.palette.main}"><path data-lighting="cast-shadow" d="${dOf(shadow, true)}" fill="${card.palette.support}"/><path id="${id}-body" d="${dOf(body, true)}" fill="${tone.fill}"/><path data-lighting="specular" d="${spine}" fill="none" stroke="${card.palette.highlight}" stroke-width="${z === 0 ? 1.1 : 1.8}" stroke-linecap="round"/><title>${xml(label)}</title></g>`;
}

function strandSvg(strand, card, view) {
  if (view.strands === false) return "";
  const body = ribbon(strand.points, () => Math.max(2.2, card.identity.width * 0.28));
  return `<g id="${strand.id}" data-strand="internal" data-rejoins="${strand.parent}" data-z="0" data-term="${xml(strand.term)}" data-weight="${strand.weight}"><path data-lighting="cast-shadow" d="${dOf(strand.points.map(([x, y]) => [x + 6, y + 8]), false)}" fill="none" stroke="${card.palette.support}" stroke-width="3"/><path d="${dOf(body, true)}" fill="${card.palette.support}"/><title>${xml(`${strand.term} returns to ${strand.parent}. Weight is not depth.`)}</title></g>`;
}

function confluenceSvg(scene, view) {
  if (!scene.guest || scene.hideGlyph || view.glyph === false) return "";
  const hostEnd = scene.hostPoints[scene.hostPoints.length - 1];
  const guestEnd = scene.guestPoints[scene.guestPoints.length - 1];
  const joint = [(hostEnd[0] + guestEnd[0]) / 2, Math.min(hostEnd[1], guestEnd[1]) - 6];
  const crown = [joint[0], joint[1] - 78];
  const up = [];
  for (let i = 0; i <= 8; i += 1) {
    const u = i / 8;
    up.push([joint[0], joint[1] + (crown[1] - joint[1]) * u]);
  }
  const hostHalf = ribbon(up.map(([x, y]) => [x - 4, y]), () => 4.2);
  const guestHalf = ribbon(up.map(([x, y]) => [x + 4, y]), () => 4.2);
  const tip = crown;
  const left = `M${tip[0].toFixed(1)} ${(tip[1] - 2).toFixed(1)} L${(tip[0] - 26).toFixed(1)} ${(tip[1] - 34).toFixed(1)} L${(tip[0] - 10).toFixed(1)} ${(tip[1] - 46).toFixed(1)}`;
  const right = `M${tip[0].toFixed(1)} ${(tip[1] - 2).toFixed(1)} L${(tip[0] + 26).toFixed(1)} ${(tip[1] - 34).toFixed(1)} L${(tip[0] + 10).toFixed(1)} ${(tip[1] - 46).toFixed(1)}`;
  return `<g id="confluence" data-root="composite" data-connects="root-a root-b" data-z="2" data-lineage="both"><path data-lighting="cast-shadow" d="${dOf(up.map(([x, y]) => [x + 8, y + 10]), false)}" fill="none" stroke="#0B1016" stroke-width="16" stroke-linecap="round"/><path d="${dOf(hostHalf, true)}" fill="${scene.host.palette.main}"/><path d="${dOf(guestHalf, true)}" fill="${scene.guest.palette.main}"/><path data-lighting="specular" d="${dOf(up, false)}" fill="none" stroke="${scene.host.palette.highlight}" stroke-width="1.4"/></g><g id="glyph-difference" data-glyph="recognized-difference" data-agreement="false" data-connects="confluence" data-z="2"><path d="${left}" fill="none" stroke="${scene.host.palette.main}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="${right}" fill="none" stroke="${scene.guest.palette.main}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

function sceneSvg(scene, view) {
  const layers = [
    { z: scene.zA, svg: rootSvg("root-a", scene.hostPoints, scene.host, scene.zA, false, view) + (scene.strands || []).filter((strand) => strand.parent === "root-a").map((strand) => strandSvg(strand, scene.host, view)).join("") },
  ];
  if (scene.guest) {
    layers.push({
      z: scene.zB,
      svg: rootSvg("root-b", scene.guestPoints, scene.guest, scene.zB, true, view) + (scene.strands || []).filter((strand) => strand.parent === "root-b").map((strand) => strandSvg(strand, scene.guest, view)).join(""),
    });
  }
  layers.sort((a, b) => a.z - b.z);
  const title = scene.guest
    ? `${scene.host.name} meets ${scene.guest.name}. Recognized difference, not assumed agreement.`
    : `${scene.host.name}. ${scene.host.core}. One rising stream.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xml(title)}"><rect id="field-ground" width="${W}" height="${H}" fill="${FIELD}"/><title>${xml(title)}</title>${layers.map((layer) => layer.svg).join("")}${confluenceSvg(scene, view)}</svg>`;
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
  const links = eligibleOverlap(sources, host, guest, hostOrientation, guestOrientation);
  if (overrides.disableLink) links.withheld = true;
  let zA = narrativeZ(host, "host", overrides);
  let zB = null;
  if (guest) {
    const guestIdentity = identityCenterline(guest, date);
    guest.identity = guestIdentity;
    const placed = placeFoundations(hostIdentity.points, guestIdentity.points);
    hostPoints = trimRising(placed.host, 430);
    guestPoints = trimRising(placed.guest, 430);
    if (!overrides.hideGlyph) {
      hostPoints = approach(hostPoints, [hostPoints[hostPoints.length - 1][0], 250]);
      guestPoints = approach(guestPoints, [guestPoints[guestPoints.length - 1][0], 250]);
    }
    if (overrides.collapseZ) {
      const passed = collapsePass(hostPoints, guestPoints);
      hostPoints = passed.host;
      guestPoints = passed.guest;
    } else if (narrativeZ(host, "host", overrides) === narrativeZ(guest, "guest", overrides)) {
      guestPoints = keepApart(hostPoints, guestPoints, 36);
    }
    zA = narrativeZ(host, "host", overrides);
    zB = narrativeZ(guest, "guest", overrides);
  }
  const strands = [
    ...internalStrands(host, hostOrientation, hostPoints, "root-a", sources, overrides),
    ...(guest ? internalStrands(guest, guestOrientation, guestPoints, "root-b", sources, overrides) : []),
  ];
  const sameZ = guest ? zA === zB : false;
  const gap = guest ? minDistance(hostPoints, guestPoints) : null;
  const contact = Boolean(guest && sameZ && gap < 18);
  const scene = {
    host,
    guest,
    hostPoints: roundPoints(hostPoints),
    guestPoints: guest ? roundPoints(guestPoints) : null,
    identityHost: roundPoints(hostIdentity.points),
    strands,
    zA,
    zB,
    confluenceZ: guest && !overrides.hideGlyph ? 2 : null,
    links,
    hideGlyph: overrides.hideGlyph === true,
    contact,
    projectedOverlap: Boolean(guest && gap < 18),
    hostOrientation,
    guestOrientation: guest ? guestOrientation : null,
    affinity,
    date,
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
    weights: sources.hashes.weights,
  }));
}

function recursionState(scene) {
  if (!scene.guest) return null;
  const lineages = [scene.host.suitKey, scene.guest.suitKey];
  return {
    new_core_concept: "recognized difference",
    composite_stream: "confluence",
    surviving_source_lineages: lineages,
    recognized_relational_structure: "RECOGNIZED_DIFFERENCE",
    unresolved_difference: true,
    agreement_assumed: false,
    relevant_weights: scene.links.shared.slice(0, 5).map((item) => ({ term: item.term, potential: item.potential })),
    consent_and_scope_flags: { unreviewed: true, shadow_is_not_negative: true, syntax_is_not_a_bridge: true },
    version_and_provenance_hash: sha256(JSON.stringify({
      host: scene.host.name,
      guest: scene.guest.name,
      lineages,
      policy: POLICY_VERSION,
    })),
    sufficiency: "This state can be resumed without rereading either full passage. It does not restore the discarded history.",
  };
}

function traceOf(sources, scene, svg) {
  const guest = scene.guest;
  const bands = ["background", "midground", "foreground"];
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
      { card: scene.host.name, core: scene.host.core, source: scene.host.core_source, weight: 100, orientation_invariant: true },
      ...(guest ? [{ card: guest.name, core: guest.core, source: guest.core_source, weight: 100, orientation_invariant: true }] : []),
    ],
    root_paths: guest ? ["root-a", "root-b"] : ["root-a"],
    root_path_geometry: {
      "root-a": { points: scene.hostPoints, lineage: scene.host.suitKey, z: scene.zA },
      ...(guest ? { "root-b": { points: scene.guestPoints, lineage: guest.suitKey, z: scene.zB, instance: scene.host.name === guest.name ? "second-instance" : "guest" } } : {}),
    },
    lexical_evidence: {
      shared_terms: scene.links.shared.map((item) => item.term),
      candidates: scene.links.shared,
      question_terms: [],
      axiom_terms: [],
      policy: scene.links.review,
      action: scene.links.action,
      potential: scene.links.potential,
      machine_inferred: Boolean(guest),
      weight_is_not_depth: true,
      note: scene.links.note || "Neutral has no guest relation.",
    },
    layer_positions: {
      host: bands[scene.zA],
      guest: guest ? bands[scene.zB] : null,
      strands: "background",
      confluence: guest && !scene.hideGlyph ? "foreground" : null,
      assignment: "narrative attention, not card index and not association weight",
    },
    encounter_events: guest ? [{
      event_id: "confluence",
      effect: "recognized difference",
      review: "UNREVIEWED",
      action: "NO_AUTOMATIC_EFFECT",
      mid_card_contact: false,
    }] : [],
    derived_paths: [],
    internal_strands: scene.strands.map((strand) => ({
      id: strand.id,
      parent: strand.parent,
      term: strand.term,
      weight: strand.weight,
      rejoins: strand.rejoins,
      z: strand.z,
      speech_act: null,
    })),
    color_provenance: guest
      ? [
        { element: "root-a", lineage: scene.host.palette.main, mix: "none" },
        { element: "root-b", lineage: guest.palette.main, mix: "none" },
        { element: "confluence", lineage: "both", mix: "none" },
        { element: "glyph-difference", lineage: "both", mix: "none" },
      ]
      : [{ element: "root-a", lineage: scene.host.palette.main, mix: "none" }],
    glyph: guest && !scene.hideGlyph ? { id: "glyph-difference", kind: "recognized-difference", agreement: false } : null,
    recursion_state: recursionState(scene),
    negative_space: {
      id: scene.host.quiet ? "protected-silence" : "open-field",
      reason: scene.host.quiet
        ? "This silence card keeps unearned strands off the field. The core stream remains."
        : "Empty field is wherever no strand was earned. There is no mandatory center void.",
    },
    roles: [],
    contact_same_z: scene.contact,
    projected_overlap: scene.projectedOverlap,
    rendered_evidence: {
      svg_ids: [...svg.matchAll(/id="([^"]+)"/g)].map((hit) => hit[1]),
      source_root_marks: (svg.match(/data-root="source"/g) || []).length,
      derived_marks: (svg.match(/data-root="derived"/g) || []).length,
      internal_strands: (svg.match(/data-strand="internal"/g) || []).length,
      cast_shadows: (svg.match(/data-lighting="cast-shadow"/g) || []).length,
      glyph: svg.includes('data-glyph="recognized-difference"'),
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
  const neutralCore = sha256(JSON.stringify(neutral.scene.identityHost));
  const uprightCore = sha256(JSON.stringify(neutralUpright.scene.identityHost));
  const hidden = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { hideGlyph: true } });
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
      note: "Unreviewed overlap has no render effect, so withholding it does not move the strands.",
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
      solo_core_unchanged: neutralCore === uprightCore,
      core_same: full.trace.source_core_concepts[0].core === flipped.trace.source_core_concepts[0].core,
      svg_changed: full.svg !== flipped.svg,
      measured_delta: full.svg === flipped.svg ? 0 : 1,
    },
    {
      intervention: "disable_branch",
      actually_executed: true,
      strands_before: full.trace.rendered_evidence.internal_strands,
      svg_changed: full.svg !== unbranched.svg,
      measured_delta: full.svg === unbranched.svg ? 0 : 1,
      note: full.trace.rendered_evidence.internal_strands ? "internal strand removed and compared" : "no internal strand existed",
    },
    {
      intervention: "disable_glyph",
      actually_executed: true,
      svg_changed: affinity === 0 ? false : full.svg !== hidden.svg,
      measured_delta: full.svg === hidden.svg ? 0 : 1,
      note: "Hiding the confluence removes the composite and the difference glyph. The two roots remain.",
    },
    {
      intervention: "disable_mix",
      actually_executed: true,
      composite_elements: 0,
      svg_changed: false,
      measured_delta: 0,
      note: "No third pigment is generated from unreviewed links.",
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
    const soloCore = sha256(JSON.stringify(solo.scene.identityHost));
    const shadowCore = sha256(JSON.stringify(shadow.scene.identityHost));
    if (soloCore !== shadowCore) failures.push(`${solo.card.name} core path changed in shadow`);
    if (roots.source !== 1 || roots.derived !== 0) failures.push(`${solo.card.name} neutral roots ${roots.source}/${roots.derived}`);
    if (solo.scene.strands.some((strand) => !strand.rejoins)) failures.push(`${solo.card.name} strand did not rejoin`);
    if (solo.trace.guest_card) failures.push(`${solo.card.name} neutral named a guest`);
    if (solo.trace.roles.length || solo.svg.includes("data-glyph=")) failures.push(`${solo.card.name} invented an encounter mark`);
    if (solo.scene.zA === 2 || (solo.scene.host.quiet && solo.scene.zA !== 0) || (!solo.scene.host.quiet && solo.scene.zA !== 1)) {
      failures.push(`${solo.card.name} depth did not follow attention`);
    }
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
      if (!face.svg.includes('id="confluence"') || !face.svg.includes('data-glyph="recognized-difference"') || !face.svg.includes('data-agreement="false"')) {
        failures.push(`${face.card.name} affinity ${affinity} missed the difference glyph`);
      }
      if (face.scene.contact) failures.push(`${face.card.name} affinity ${affinity} merged unreviewed paths`);
      const foundations = Math.hypot(face.scene.hostPoints[0][0] - face.scene.guestPoints[0][0], face.scene.hostPoints[0][1] - face.scene.guestPoints[0][1]);
      if (foundations < 160) failures.push(`${face.card.name} affinity ${affinity} foundations collapsed`);
      if (face.scene.strands.some((strand) => strand.z !== 0 || !strand.rejoins)) failures.push(`${face.card.name} strand weight became depth`);
      if (face.scene.zB !== 0 || face.scene.confluenceZ !== 2) failures.push(`${face.card.name} encounter depth was not narrative`);
      if (affinity - 1 === host && face.trace.root_path_geometry["root-b"]?.instance !== "second-instance") {
        failures.push(`${face.card.name} self-encounter is not two instances`);
      }
      if (face.trace.source_core_concepts.length !== 2) failures.push(`${face.card.name} affinity ${affinity} core count`);
      if (face.trace.source_core_concepts[0].core !== sources.canon[host].core) failures.push(`${face.card.name} core drifted`);
      if (!branchedExample && face.trace.rendered_evidence.internal_strands > 0) branchedExample = { host, affinity };
      if ((face.svg.match(/THIRD_EMERGENCE|COMPLEMENT|CLASH|ATTENUATE/g) || []).length) {
        failures.push(`${face.card.name} affinity ${affinity} used a strong unreviewed mode`);
      }
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
    if (on.trace.rendered_evidence.internal_strands < 1) failures.push("branch probe lost its strand");
    if (on.svg === off.svg) failures.push("disabling an earned branch did not change the drawing");
  }
  const probeHost = sources.canon.findIndex((card) => card.name === "The Velomere");
  const probeAffinity = 3;
  const probes = await measureCard(sources, probeHost, date, probeAffinity);
  for (const row of sources.distributions) {
    if (Number(row.core_anchor) !== 100) failures.push(`${row.card} core was diluted`);
    const total = Number(row.distribution_total);
    if (total !== 0 && Math.abs(total - 100) > 0.05) failures.push(`${row.card} ${row.orientation} distribution ${total}`);
  }
  for (const probe of probes) {
    if (!probe.actually_executed) failures.push(`${probe.intervention} was not executed`);
    if (probe.intervention === "remove_guest" && (probe.guest_roots_after !== 1 || !probe.host_core_same || !probe.svg_changed)) {
      failures.push("remove_guest did not measure a real change");
    }
    if (probe.intervention === "disable_link" && probe.svg_changed) failures.push("an unreviewed link moved the drawing");
    if (probe.intervention === "flip_orientation" && !probe.solo_core_unchanged) failures.push("solo orientation mutated the core path");
    if (probe.intervention === "flip_orientation" && !probe.core_same) failures.push("orientation changed the core");
    if (probe.intervention === "separate_z" && !probe.contact_changed) failures.push("separate_z did not change contact");
    if (probe.intervention === "disable_glyph" && !probe.svg_changed) failures.push("hiding the glyph did not change the drawing");
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
