// VELoMERE — on-demand encounter compiler.
// Stage S uses the existing dialogic relation rules for two canonical cards.
// Stage G freezes a path network and its hash. Stage R only embodies that network.
// The picture is a 2.5D height field. It is not an image model and not a path tracer.
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { compileScene, loadSources } from "./dialogic.mjs";

export const STYLE_VERSION = "18.1.0";
export const BACKEND_ID = "procedural_heightfield/18.1";
export const DEFAULT_STYLE = "veiled_luminescence";
export const BACKEND_LIMITS = [
  "heightfield_2_5d",
  "form_following_normals",
  "separate_distance_fields_per_role",
  "veiled_luminescence_is_the_default",
  "not_an_image_model",
  "not_a_path_traced_3d_renderer",
  "microdetail_does_not_add_semantic_contacts",
  "committed_geometry_is_a_path_network",
];
export const STYLES = Object.freeze([
  "living_matter",
  "prismatic_geometry",
  "forged_relief",
  "veiled_luminescence",
]);
export const STYLE_LABELS = Object.freeze({
  living_matter: "Living Matter",
  prismatic_geometry: "Prismatic Geometry",
  forged_relief: "Forged Relief",
  veiled_luminescence: "Veiled Luminescence",
});

const OUT_W = 1400;
const OUT_H = 2300;
const W = OUT_W;
const H = OUT_H;
const SX = 1;
const SY = 1;

const FUNCTION_WORDS = new Set(
  "a an the its their his her this that these those of on in to for with from by and or as into yet still very own over under about after before than then but if when while who whom whose which what your our my you them him us be been being not no never without nor".split(" "),
);

let sourcesPromise = null;

export function openCanon() {
  if (!sourcesPromise) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    sourcesPromise = loadSources(path.join(here, "..", "DATA"));
  }
  return sourcesPromise;
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : value).digest("hex");
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

export function shufflePool(date, affinity, sessionId) {
  const items = Array.from({ length: 78 }, (_, index) => index);
  let state = hashString(`${date}|${affinity}|${sessionId}|pool`);
  for (let i = items.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
  return items;
}

function canonCard(sources, index) {
  const card = sources.canon[index];
  if (!card) throw new Error("That card is outside the 78.");
  return card;
}

export function meaningFromCanon(card) {
  return {
    name: card.name,
    core: card.core,
    upright: card.upright,
    shadow: card.reversed,
    keywords: String(card.keywords || "").split(/[,;]/).map((part) => part.trim()).filter(Boolean),
    suit: card.suit,
    suitKey: card.suitKey,
    rank: card.rank,
    quiet: Boolean(card.quiet),
  };
}

function sentences(passage) {
  const parts = String(passage || "").split(/(?<=[.!?])\s+/);
  return parts.length ? parts : [String(passage || "")];
}

function negationScope(sentence, index, word) {
  const before = sentence.slice(0, index);
  const after = sentence.slice(index + word.length);
  if (/^\s+(is|are|was|were|becomes?|means?|remains?)\s+not\b/i.test(after)) {
    return { negated: false, scope: "unproven" };
  }
  const matches = [...before.matchAll(/\b(not|no|never|without|nor)\b/gi)];
  if (!matches.length) return { negated: false, scope: "none" };
  const neg = matches[matches.length - 1];
  const between = before.slice(neg.index + neg[0].length);
  const content = (between.toLowerCase().match(/[a-z']+/g) || []).filter((tok) => !FUNCTION_WORDS.has(tok));
  if (!content.length) return { negated: true, scope: "direct" };
  return { negated: false, scope: "unproven" };
}

function termIn(passage, term) {
  const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  for (const sentence of sentences(passage)) {
    const found = re.exec(sentence);
    if (!found) continue;
    const scope = negationScope(sentence, found.index, found[0]);
    return { quote: sentence.trim(), ...scope };
  }
  return null;
}

function contentWords(passage) {
  const words = String(passage || "").toLowerCase().match(/[a-z']{5,}/g) || [];
  return [...new Set(words.filter((word) => !FUNCTION_WORDS.has(word)))];
}

function relateTexts(left, right) {
  const leftPassage = `${left.upright}\n${left.shadow}`;
  const rightPassage = `${right.upright}\n${right.shadow}`;
  const rightSet = new Set(contentWords(rightPassage));
  const found = [];
  for (const term of contentWords(leftPassage)) {
    if (!rightSet.has(term)) continue;
    const hostCtx = termIn(left.upright, term) || termIn(left.shadow, term);
    const guestCtx = termIn(right.upright, term) || termIn(right.shadow, term);
    if (!hostCtx || !guestCtx) continue;
    if (hostCtx.scope === "unproven" || guestCtx.scope === "unproven") continue;
    found.push({ term, hostCtx, guestCtx });
  }
  found.sort((a, b) => a.term.localeCompare(b.term));
  const best = found[0];
  if (!best) {
    return {
      earned: false,
      relation: "unresolved",
      term: null,
      note: "No eligible term is attested in both passages without an unproven negation.",
    };
  }
  let relation = "mutual-term";
  if (best.hostCtx.negated && best.guestCtx.negated) relation = "boundary";
  else if (best.hostCtx.negated || best.guestCtx.negated) relation = "disagreement";
  return {
    earned: true,
    relation,
    term: best.term,
    hostCtx: best.hostCtx,
    guestCtx: best.guestCtx,
    note: `Both passages carry “${best.term}”. That is not whole-card agreement.`,
  };
}

function outcomeOf(linked) {
  if (!linked?.earned) return "unresolved";
  if (linked.relation === "boundary") return "understood_boundary";
  if (linked.relation === "disagreement") return "understood_difference";
  return "earned_confluence";
}

function nameTokens(name) {
  return new Set(String(name || "").toLowerCase().match(/[a-z']{3,}/g) || []);
}

function nameOnlyTokens(meaning) {
  const allowed = new Set();
  for (const keyword of meaning?.keywords || []) {
    for (const token of String(keyword).toLowerCase().match(/[a-z']{3,}/g) || []) allowed.add(token);
  }
  const banned = [];
  for (const token of nameTokens(meaning?.name)) {
    if (token.length < 4 || FUNCTION_WORDS.has(token) || GENERIC.has(token) || allowed.has(token)) continue;
    if (!banned.includes(token)) banned.push(token);
  }
  return banned;
}

function usable(word, banned) {
  const token = String(word || "").toLowerCase().replace(/[^a-z']/g, "");
  if (token.length < 4 || FUNCTION_WORDS.has(token) || GENERIC.has(token) || banned.has(token)) return "";
  return token;
}

function containsBanned(text, banned) {
  const lower = String(text || "").toLowerCase();
  for (const token of banned) {
    if (new RegExp(`\\b${token}\\b`).test(lower)) return true;
  }
  return false;
}

function composedClaim(stance, motifs) {
  const through = motifs.filter((word) => word !== stance).slice(0, 3);
  if (!through.length) return `It keeps ${stance} in play, and it does not need the other side to match it.`;
  return `It keeps ${stance} in play through ${through.join(", ")}, and it does not need the other side to match it.`;
}

const GENERIC = new Set("other another there their these those where while about would could should being every after before something someone anything within through during really simply always never still just only very much more most less into from with that this them they your which what when than then also such same whole each both".split(" "));

function stanceOf(text) {
  const lower = String(text || "").toLowerCase();
  const pairs = [
    ["return", "return"],
    ["refus", "refusal"],
    ["boundary", "limit"],
    ["doubt", "doubt"],
    ["question", "question"],
    ["inquir", "inquiry"],
    ["witness", "witness"],
    ["notice", "attention"],
    ["steward", "care"],
    ["protect", "care"],
    ["desire", "desire"],
    ["attract", "attraction"],
    ["pull", "pull"],
    ["mirror", "mirror"],
    ["differ", "difference"],
    ["correct", "correction"],
    ["truth", "truth"],
    ["center", "center"],
    ["listen", "listening"],
    ["wait", "waiting"],
    ["leave", "departure"],
    ["hold", "keeping"],
  ];
  for (const [needle, label] of pairs) {
    if (lower.includes(needle)) return label;
  }
  return "attention";
}

function titleCaseWord(word) {
  const text = String(word || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function profileOf(meaning, parentMeanings) {
  const banned = new Set();
  for (const parent of parentMeanings) for (const token of nameOnlyTokens(parent)) banned.add(token);
  for (const token of nameOnlyTokens(meaning)) banned.add(token);
  const motifs = [];
  const add = (word) => {
    const token = usable(word, banned);
    if (!token || motifs.some((have) => token === have || token.startsWith(have) || have.startsWith(token))) return;
    motifs.push(token);
  };
  const state = meaning?.conceptState;
  (state?.motifs || []).forEach(add);
  (meaning?.keywords || []).forEach((word) => String(word).split(/[^a-zA-Z']+/).forEach(add));
  contentWords(`${meaning?.core || ""} ${meaning?.upright || ""}`).slice(0, 24).forEach(add);
  const rawStance = state?.cues?.self || stanceOf(`${meaning?.core || ""} ${meaning?.upright || ""} ${meaning?.shadow || ""}`);
  const stance = usable(rawStance, banned) || motifs[0] || "attention";
  const stored = state?.claims?.[0];
  const claim = stored && String(stored).length > 40 && !containsBanned(stored, banned)
    ? String(stored).slice(0, 320)
    : composedClaim(stance, motifs);
  return {
    name: meaning?.name || "",
    claim,
    motifs,
    stance,
    fromState: Boolean(state),
  };
}

function motifOf(left, right, linked, banned) {
  const term = usable(linked?.term, banned);
  if (term) return term;
  const shared = left.motifs.find((word) => right.motifs.includes(word));
  return shared || left.motifs[0] || right.motifs[0] || usable(left.stance, banned) || "difference";
}

function candidateTitles(outcome, motif, left, right, banned) {
  const primary = titleCaseWord(usable(motif, banned) || "difference");
  const other = titleCaseWord(usable(right.motifs.find((word) => word !== motif) || right.stance, banned) || "limit");
  const side = titleCaseWord(usable(left.stance, banned) || "attention");
  if (outcome === "understood_difference") return [`Refused ${primary}`, `Kept ${side}`];
  if (outcome === "understood_boundary") return [`Shared ${primary}`, `Exact ${primary}`];
  if (outcome === "earned_confluence") return [`Narrow ${primary}`, `Attested ${primary}`];
  return [`Unjoined ${primary}`, `${side} Beside ${other}`];
}

function proseFor(title, outcome, left, right) {
  const lead = `${title} is a principle that can be read with its sources covered.`;
  if (outcome === "understood_difference") {
    return {
      core: `${lead} One claim grants a matter that the other claim refuses. The difference is the whole of this card. First claim: ${left.claim} Second claim: ${right.claim}`,
      upright: `Read ${title} by saying which claim grants the matter and which claim refuses it. Decide from that difference. Do not translate the refusal into agreement so the story will close.`,
      shadow: `${title} goes wrong when the refusal is deleted, or when it is widened until it rejects every part of the other claim. The difference was specific. Keep it specific.`,
    };
  }
  if (outcome === "understood_boundary") {
    return {
      core: `${lead} Both claims refuse the same matter, and that shared limit is the card. It is not a fusion and not a judgment of everything either claim holds. First claim: ${left.claim} Second claim: ${right.claim}`,
      upright: `Read ${title} by keeping the refused matter exact. The limit can be honored while each claim remains larger than the thing it refuses.`,
      shadow: `${title} goes wrong when the shared refusal becomes a wall around an entire claim, or when the limit is ignored because a join would feel kinder than the truth.`,
    };
  }
  if (outcome === "earned_confluence") {
    return {
      core: `${lead} Both claims attest one narrow matter. Only that meeting belongs to this card. Everything else in each claim stays outside it. First claim: ${left.claim} Second claim: ${right.claim}`,
      upright: `Read ${title} by staying inside the attested matter. The meeting is specific, revisable, and smaller than either claim that entered it.`,
      shadow: `${title} goes wrong when the narrow meeting is inflated into agreement about everything, or when one claim is retired because the other was also present.`,
    };
  }
  return {
    core: `${lead} Two claims remain distinct, and no meeting is invented to comfort the space between them. First claim: ${left.claim} Second claim: ${right.claim}`,
    upright: `Read ${title} by letting each claim correct the other without requiring them to agree. Act only where both claims can still be revised. The open difference is the meaning.`,
    shadow: `${title} goes wrong when one claim is promoted into the whole story, or when an invented agreement is treated as more honest than the difference that was actually found.`,
  };
}

function keywordList(left, right, motif, outcome, banned) {
  const bag = [];
  const add = (word) => {
    const token = usable(word, banned);
    if (!token || bag.includes(token) || bag.length >= 8) return;
    bag.push(token);
  };
  add(motif);
  add(outcome === "unresolved" ? "unjoined" : outcome.replace(/_/g, " ").split(" ").pop());
  add(left.stance);
  add(right.stance);
  left.motifs.forEach(add);
  right.motifs.forEach(add);
  add("revision");
  add("specificity");
  return bag.slice(0, 8);
}

export function gateStandaloneCard(card, parentNames = [], bannedTokens = []) {
  const issues = [];
  const title = String(card?.name || "").trim().replace(/\s+/g, " ");
  const words = title ? title.split(" ") : [];
  if (words.length < 1 || words.length > 5 || title.length > 48 || /[.!?]$/.test(title)) issues.push("title_length");
  if (/^open interval of\b/i.test(title)) issues.push("stock_template");
  const lower = title.toLowerCase();
  const parents = parentNames.map((name) => String(name || "").trim()).filter(Boolean);
  if (parents.length >= 2 && parents.every((name) => lower.includes(name.toLowerCase()))) issues.push("mechanical_parent_title");
  for (const key of ["core", "upright", "shadow"]) {
    if (!String(card?.[key] || "").trim()) issues.push(`missing_${key}`);
  }
  const core = String(card?.core || "").toLowerCase();
  if (parents.length >= 2 && parents.every((name) => core.includes(name.toLowerCase()))) issues.push("core_needs_parents");
  const visible = `${title}\n${card?.core || ""}\n${card?.upright || ""}\n${card?.shadow || ""}`.toLowerCase();
  for (const token of bannedTokens) {
    if (new RegExp(`\\b${String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(visible)) {
      issues.push("parent_name_in_reading");
      break;
    }
  }
  if (!Array.isArray(card?.keywords) || card.keywords.length < 4 || card.keywords.length > 8) issues.push("keywords_count");
  if (!card?.conceptState || typeof card.conceptState !== "object") issues.push("missing_concept_state");
  if (card?.upright && card.upright === card?.shadow) issues.push("shadow_repeats_upright");
  return { ok: issues.length === 0, issues, title };
}

function emergentMeaning(leftMeaning, rightMeaning, linked, outcome) {
  const parentNames = [leftMeaning.name, rightMeaning.name];
  const parentMeanings = [leftMeaning, rightMeaning];
  const banned = new Set([...nameOnlyTokens(leftMeaning), ...nameOnlyTokens(rightMeaning)]);
  const left = profileOf(leftMeaning, parentMeanings);
  const right = profileOf(rightMeaning, parentMeanings);
  const motif = motifOf(left, right, linked, banned);
  const titles = candidateTitles(outcome, motif, left, right, banned);
  let chosen = null;
  let gate = null;
  for (const title of titles) {
    const prose = proseFor(title, outcome, left, right);
    const keywords = keywordList(left, right, motif, outcome, banned);
    const conceptState = {
      principle: title,
      claims: [left.claim, right.claim].filter(Boolean),
      boundaries: outcome === "earned_confluence"
        ? ["The meeting is narrower than either claim."]
        : ["Do not invent a join that the passages did not earn."],
      affordances: ["This card can be read alone.", "A later encounter must use this principle, not the parent titles."],
      tensions: [linked?.note || "The claims were not fused."],
      cues: { self: left.stance, other: right.stance },
      constraints: [
        "Do not rebuild this card by pasting its parent names together.",
        outcome === "unresolved" ? "Do not paint a shared stem for an unjoined relation." : "Keep the relation narrower than the sources.",
      ],
      motifs: keywords,
      outcome,
      relation: linked?.relation || "unresolved",
      term: linked?.term || null,
    };
    const meaning = {
      name: title,
      ...prose,
      keywords,
      conceptState,
    };
    gate = gateStandaloneCard(meaning, parentNames, [...banned]);
    if (gate.ok) {
      chosen = meaning;
      break;
    }
  }
  if (!chosen) {
    const error = new Error("Needs review. No standalone card was committed. Both cards remain.");
    error.issues = gate?.issues || ["no_candidate"];
    throw error;
  }
  const provenance = {
    parents: parentNames,
    outcome,
    relation: linked?.relation || "unresolved",
    term: linked?.term || null,
    note: linked?.note || "No shared term cleared both passages.",
    usedConceptState: Boolean(left.fromState || right.fromState),
    hypotheses: linked?.earned
      ? [`Both passages were checked for “${linked.term}”. The relation is ${linked.relation}.`]
      : ["No eligible shared term was attested. The card stays unjoined."],
  };
  return { meaning: chosen, provenance };
}

function spineOf(name, core, x0, role) {
  const seed = `${name}|${core}|${role}`;
  const amp = 36 + unit(seed, "amp") * 48;
  const phase = unit(seed, "phase") * Math.PI * 2;
  const points = [];
  for (let i = 0; i < 48; i += 1) {
    const t = i / 47;
    const y = 2060 - t * 1760;
    const envelope = Math.sin(Math.PI * t);
    const x = x0 + Math.sin(t * 5.2 + phase) * amp * envelope;
    points.push({ x, y, z: role === "guest" ? 0.35 : 1.4, t, role });
  }
  return points;
}

function branchOff(points, t0, amount, id) {
  const start = Math.max(1, Math.round(t0 * (points.length - 1)) - 3);
  const end = Math.min(points.length - 2, start + 8);
  const out = [];
  for (let i = start; i <= end; i += 1) {
    const u = (i - start) / Math.max(1, end - start);
    const bell = Math.sin(u * Math.PI);
    out.push({
      x: points[i].x + amount * bell,
      y: points[i].y + 18 * bell,
      z: points[i].z,
      t: points[i].t,
      role: points[i].role,
    });
  }
  return { id, points: out, rejoins: true, parentRole: points[0].role };
}

function downward(points) {
  let best = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dy = points[i].y - points[i - 1].y;
    if (points[i].t > 0.45 && points[i].t < 0.75 && dy > best) best = dy;
  }
  return best;
}

function rounds(points) {
  return points.map((point) => ({
    x: Math.round(point.x * 10) / 10,
    y: Math.round(point.y * 10) / 10,
    z: Math.round(point.z * 100) / 100,
    t: Math.round(point.t * 1000) / 1000,
    role: point.role,
  }));
}

function sceneToGeometry(scene, outcome, linked) {
  const host = scene.hostLine || [];
  const guest = scene.guestLine || [];
  const quiet = Boolean(scene.host?.quiet) && !scene.guest;
  const branches = [];
  if (!quiet) {
    const events = (scene.landmarks || []).filter((mark) => mark.key === "branch-rejoin").length;
    const count = Math.min(4, Math.max(scene.guest ? 2 : 1, events));
    for (let i = 0; i < count; i += 1) {
      const line = i % 2 === 0 || !guest.length ? host : guest;
      if (!line.length) continue;
      const t0 = 0.28 + i * 0.12;
      const amount = (i % 2 === 0 ? -1 : 1) * (36 + i * 8);
      branches.push(branchOff(line, t0, amount, `branch-${i}`));
    }
  }
  const joins = [];
  if (outcome === "earned_confluence" && scene.composite && host.length && guest.length) {
    const join = scene.composite.hostJoin?.[1] || { x: 700, y: 230, z: 2.2 };
    const top = scene.composite.spine?.[1] || { x: join.x, y: 120, z: 2.2 };
    joins.push({
      id: "host-join",
      role: "shared",
      points: rounds([host[host.length - 1], { ...join, role: "shared" }]),
    });
    joins.push({
      id: "guest-join",
      role: "shared",
      points: rounds([guest[guest.length - 1], { ...join, role: "shared" }]),
    });
    joins.push({
      id: "shared-stem",
      role: "shared",
      points: rounds([{ ...join, role: "shared" }, { ...top, role: "shared" }]),
    });
  }
  const geometry = {
    version: "velomere-geometry/17",
    outcome,
    term: linked?.term || null,
    relation: linked?.relation || "unresolved",
    quiet,
    roots: [
      host.length ? { id: "host", name: scene.host?.name || "left", points: rounds(host) } : null,
      guest.length ? { id: "guest", name: scene.guest?.name || "right", points: rounds(guest) } : null,
    ].filter(Boolean),
    branches: branches.map((branch) => ({ ...branch, points: rounds(branch.points) })),
    joins,
    regression: Math.max(downward(host), downward(guest)),
    crossings: (scene.landmarks || []).filter((mark) => mark.key === "noncontact-crossing").length,
    landmarks: (scene.landmarks || []).map((mark) => ({
      key: mark.key,
      participant: mark.participant,
      term: mark.term || null,
      cause: mark.cause,
    })),
  };
  geometry.hash = sha256(JSON.stringify({
    outcome: geometry.outcome,
    roots: geometry.roots,
    branches: geometry.branches,
    joins: geometry.joins,
  }));
  return geometry;
}

function syntheticScene(left, right, linked, outcome, date) {
  const hostX = 430 + unit(`${left.name}|${date}`, "x") * 120;
  const guestX = 860 + unit(`${right.name}|${date}`, "gx") * 120;
  const hostSeed = left.conceptState?.claims?.[0] || left.core;
  const guestSeed = right.conceptState?.claims?.[0] || right.core;
  const hostLine = spineOf(hostSeed, left.core, hostX, "host");
  const guestLine = spineOf(guestSeed, right.core, guestX, "guest");
  if (outcome !== "earned_confluence") {
    for (const point of guestLine) {
      if (point.t > 0.72) point.x += 80;
    }
    for (const point of hostLine) {
      if (point.t > 0.72) point.x -= 80;
    }
  }
  const scene = {
    host: { name: left.name, quiet: Boolean(left.quiet) },
    guest: { name: right.name, quiet: false },
    hostLine,
    guestLine,
    strands: [],
    composite: null,
    landmarks: [{
      key: outcome === "unresolved" ? "open-horizon" : "earned-bridge",
      participant: "both",
      term: linked?.term || null,
      cause: linked?.note || "Open relation.",
    }],
  };
  if (/return|again|back/i.test(`${left.upright} ${right.upright}`)) {
    for (const point of hostLine) {
      if (point.t > 0.5 && point.t < 0.66) point.y += 48 * Math.sin(((point.t - 0.5) / 0.16) * Math.PI);
    }
    scene.landmarks.push({
      key: "regression-dip",
      participant: "host",
      term: linked?.term || null,
      cause: "A downward run while the reading still advances. It is not a fall in worth.",
    });
  }
  if (outcome === "earned_confluence") {
    const hx = hostLine[hostLine.length - 1];
    const gx = guestLine[guestLine.length - 1];
    const join = { x: (hx.x + gx.x) / 2, y: 230, z: 2.2 };
    const top = { x: join.x, y: 140, z: 2.2 };
    scene.composite = { hostJoin: [hx, join], guestJoin: [gx, join], spine: [join, top] };
  }
  return scene;
}

function packParticipant(card, orientation) {
  const meaning = meaningFromCanon(card);
  return {
    kind: "canonical_draw",
    canonicalIndex: card.index,
    name: card.name,
    orientation,
    meaning,
  };
}

export async function compileDraw(index, date, affinity, orientation = "upright") {
  const sources = await openCanon();
  const card = canonCard(sources, index);
  const orient = orientation === "shadow" ? "shadow" : "upright";
  const scene = compileScene(sources, index, affinity, date, {
    hostOrientation: orient,
    guestOrientation: "upright",
  });
  const outcome = scene.guest ? outcomeOf(scene.linked) : "solo";
  const geometry = sceneToGeometry(scene, outcome === "solo" ? "unresolved" : outcome, scene.linked);
  if (!scene.guest) geometry.outcome = "solo";
  geometry.hash = sha256(JSON.stringify({
    outcome: geometry.outcome,
    roots: geometry.roots,
    branches: geometry.branches,
    joins: geometry.joins,
  }));
  return {
    participant: packParticipant(card, orient),
    geometry,
    evidence: scene.linked?.earned ? [scene.linked.hostCtx?.quote, scene.linked.guestCtx?.quote].filter(Boolean) : [],
  };
}

function asMeaning(participant) {
  if (participant.meaning) return participant.meaning;
  throw new Error("A participant is missing its meaning.");
}

export async function compileEncounterPair(left, right, date) {
  const sources = await openCanon();
  let scene;
  let linked;
  let leftMeaning;
  let rightMeaning;
  if (left.kind === "canonical_draw" && right.kind === "canonical_draw") {
    const host = canonCard(sources, left.canonicalIndex);
    const guest = canonCard(sources, right.canonicalIndex);
    leftMeaning = meaningFromCanon(host);
    rightMeaning = meaningFromCanon(guest);
    scene = compileScene(sources, host.index, guest.index + 1, date, {
      hostOrientation: left.orientation === "shadow" ? "shadow" : "upright",
      guestOrientation: right.orientation === "shadow" ? "shadow" : "upright",
    });
    linked = scene.linked;
  } else {
    const lift = (participant) => {
      if (participant.kind === "canonical_draw") return meaningFromCanon(canonCard(sources, participant.canonicalIndex));
      return asMeaning(participant);
    };
    leftMeaning = lift(left);
    rightMeaning = lift(right);
    linked = relateTexts(leftMeaning, rightMeaning);
    const outcome = outcomeOf(linked);
    scene = syntheticScene(leftMeaning, rightMeaning, linked, outcome, date);
  }
  const outcome = outcomeOf(linked);
  if (outcome === "unresolved" && scene.composite) {
    throw new Error("Unresolved geometry tried to join. Refused.");
  }
  const geometry = sceneToGeometry(scene, outcome, linked);
  if (outcome !== "earned_confluence" && geometry.joins.length) {
    throw new Error("A non-meeting painted a shared stem. Refused.");
  }
  if (outcome === "earned_confluence" && geometry.joins.length < 2) {
    throw new Error("An earned meeting has no shared stem. Refused.");
  }
  const { meaning, provenance } = emergentMeaning(leftMeaning, rightMeaning, linked, outcome);
  const evidence = [];
  if (linked?.hostCtx?.quote) evidence.push(linked.hostCtx.quote);
  if (linked?.guestCtx?.quote) evidence.push(linked.guestCtx.quote);
  if (!evidence.length) evidence.push(linked?.note || "No shared term cleared both passages.");
  return {
    outcome,
    meaning: { ...meaning, suit: "Encounter", suitKey: "Encounter", rank: "Emergent", quiet: false, provenance },
    evidence,
    term: linked?.term || null,
    relation: linked?.relation || "unresolved",
    geometry,
    parents: [leftMeaning.name, rightMeaning.name],
    provenance,
  };
}

const REACH = 96;
const ROLE_R2 = 8 * 8;

function rasterChain(dist, zbuf, txa, tya, role, points, zBoost) {
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const prev = i === 0 ? point : points[i - 1];
    const x0 = prev.x * SX;
    const y0 = prev.y * SY;
    const x1 = point.x * SX;
    const y1 = point.y * SY;
    const z1 = (point.z || 1) + zBoost;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    const steps = i === 0 ? 1 : Math.max(1, Math.ceil(len / 2));
    for (let s = i === 0 ? 0 : 1; s <= steps; s += 1) {
      const u = s / steps;
      const x = x0 + dx * u;
      const y = y0 + dy * u;
      const r = REACH;
      const x0i = Math.max(0, Math.floor(x - r));
      const x1i = Math.min(W - 1, Math.ceil(x + r));
      const y0i = Math.max(0, Math.floor(y - r));
      const y1i = Math.min(H - 1, Math.ceil(y + r));
      const r2 = r * r;
      for (let yy = y0i; yy <= y1i; yy += 1) {
        const row = yy * W;
        const dy2 = (yy - y) * (yy - y);
        for (let xx = x0i; xx <= x1i; xx += 1) {
          const d2 = (xx - x) * (xx - x) + dy2;
          if (d2 > r2) continue;
          const at = row + xx;
          const d = Math.sqrt(d2);
          if (d < dist[at]) {
            dist[at] = d;
            zbuf[at] = z1;
            txa[at] = tx;
            tya[at] = ty;
          }
          if (role && d2 <= ROLE_R2) {
            const cover = 1 - d2 / ROLE_R2;
            if (cover > role[at]) role[at] = cover;
          }
        }
      }
    }
  }
}

function rasterGeometry(geometry) {
  const n = W * H;
  const hostDist = new Float32Array(n);
  const guestDist = new Float32Array(n);
  const sharedDist = new Float32Array(n);
  hostDist.fill(1e6);
  guestDist.fill(1e6);
  sharedDist.fill(1e6);
  const hostZ = new Float32Array(n);
  const guestZ = new Float32Array(n);
  const sharedZ = new Float32Array(n);
  const hostTx = new Float32Array(n);
  const hostTy = new Float32Array(n);
  const guestTx = new Float32Array(n);
  const guestTy = new Float32Array(n);
  const host = new Float32Array(n);
  const guest = new Float32Array(n);
  const shared = new Float32Array(n);
  const paintRoot = (root) => {
    const guestRole = root.id === "guest";
    rasterChain(
      guestRole ? guestDist : hostDist,
      guestRole ? guestZ : hostZ,
      guestRole ? guestTx : hostTx,
      guestRole ? guestTy : hostTy,
      guestRole ? guest : host,
      root.points,
      0,
    );
  };
  for (const root of geometry.roots) paintRoot(root);
  for (const branch of geometry.branches) {
    const guestRole = branch.parentRole === "guest";
    rasterChain(
      guestRole ? guestDist : hostDist,
      guestRole ? guestZ : hostZ,
      guestRole ? guestTx : hostTx,
      guestRole ? guestTy : hostTy,
      guestRole ? guest : host,
      branch.points,
      0,
    );
  }
  for (const join of geometry.joins) {
    rasterChain(sharedDist, sharedZ, hostTx, hostTy, shared, join.points, 0.4);
  }
  return { hostDist, guestDist, sharedDist, hostZ, guestZ, sharedZ, hostTx, hostTy, guestTx, guestTy, host, guest, shared };
}

function falseJoin(geometry, shared, host, guest) {
  if (geometry.outcome === "earned_confluence" || geometry.outcome === "solo") return false;
  let bleed = 0;
  for (let i = 0; i < shared.length; i += 1) {
    if (shared[i] > 0.2 && host[i] > 0.2 && guest[i] > 0.2) bleed += 1;
  }
  return bleed > 12;
}

function saltOf(hash) {
  const value = Number.parseInt(String(hash || "0").slice(0, 8), 16);
  return Number.isFinite(value) && value !== 0 ? value : 1;
}

function hash2(x, y, salt) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (salt | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y, salt) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, salt);
  const b = hash2(x0 + 1, y0, salt);
  const c = hash2(x0, y0 + 1, salt);
  const d = hash2(x0 + 1, y0 + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x, y, salt, octaves) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += amplitude * noise(x * frequency, y * frequency, salt + octave * 17);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

function materialHint(geometry) {
  const names = (geometry.roots || []).map((root) => root.name || "").join(" ").toLowerCase();
  return {
    heat: /fire|flame|ember|lava|heat|sun|forge/.test(names),
    water: /water|rain|sea|river|mist|tide|tear|foam/.test(names),
  };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function distAt(field, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return REACH;
  const value = field[y * W + x];
  return value > REACH ? REACH : value;
}

function channelProfile(d, radius) {
  if (d >= radius) return 0;
  const u = d / radius;
  if (u < 0.42) return 1 - u * 0.12;
  const t = (u - 0.42) / 0.58;
  return (1 - 0.05) * (1 - t * t);
}

function ridgeProfile(d, radius) {
  if (d >= radius) return 0;
  const u = d / radius;
  let height;
  if (u > 0.7) {
    const t = (u - 0.7) / 0.3;
    height = (1 - t) * (1 - t) * 0.62;
  } else height = 0.62 + ((0.7 - u) / 0.7) * 0.38;
  if (u < 0.14) height -= (1 - u / 0.14) * 0.46;
  return height;
}

function glassProfile(d, radius) {
  if (d >= radius) return 0;
  const u = d / radius;
  if (u < 0.74) return 1;
  const t = (u - 0.74) / 0.26;
  return Math.cos(t * Math.PI * 0.5);
}

function veilProfile(d, radius) {
  if (d >= radius) return 0;
  const u = d / radius;
  return Math.sin(u * Math.PI) * 0.9;
}

function styleRadius(preset, quiet, salt) {
  const breathe = 0.94 + ((salt >>> 0) % 9) / 80;
  const base = preset === "living_matter" ? 38
    : preset === "prismatic_geometry" ? 44
      : preset === "forged_relief" ? 34
        : 62;
  return base * breathe * (quiet ? 0.78 : 1);
}

function bodyProfile(preset, d, radius) {
  if (preset === "living_matter") return channelProfile(d, radius);
  if (preset === "forged_relief") return ridgeProfile(d, radius);
  if (preset === "prismatic_geometry") return glassProfile(d, radius);
  if (preset === "veiled_luminescence") return veilProfile(d, radius);
  return veilProfile(d, radius);
}

function separateBodies(preset, hd, gd, sd, hz, gz) {
  const overlapCuts = preset !== "prismatic_geometry";
  let host = hd;
  let guest = gd;
  if (overlapCuts && sd > 70 && host < 80 && guest < 80) {
    if (hz >= gz && host < guest) guest = REACH;
    else if (gz > hz && guest < host) host = REACH;
  }
  return [host, guest];
}

function buildHeight(preset, fields, quiet, salt) {
  const height = new Float32Array(W * H);
  const radius = styleRadius(preset, quiet, salt);
  for (let y = 0; y < H; y += 1) {
    const rHere = radius * (0.72 + 0.5 * noise(y / 180, 1.3, salt + 3));
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const [hd, gd] = separateBodies(
        preset,
        fields.hostDist[i],
        fields.guestDist[i],
        fields.sharedDist[i],
        fields.hostZ[i],
        fields.guestZ[i],
      );
      const sd = fields.sharedDist[i];
      let ground = 0;
      if (preset === "living_matter") {
        const swell = (fbm(x / 460, y / 560, salt, 2) - 0.5) * 0.7;
        const grit = (fbm(x / 54, y / 46, salt + 4, 2) - 0.5) * 0.08;
        ground = swell + grit;
      } else if (preset === "forged_relief") {
        const strata = Math.sin(y * 0.04 + fbm(x / 280, y / 50, salt + 2, 2) * 5);
        ground = 0.06 + (fbm(x / 180, y / 120, salt, 3) - 0.5) * 0.28 + (strata > 0.72 ? 0.16 : strata < -0.72 ? -0.05 : 0);
      } else if (preset === "veiled_luminescence") {
        ground = (fbm(x / 420, y / 560, salt, 2) - 0.5) * 0.28;
      }
      const body = Math.max(
        bodyProfile(preset, hd, rHere),
        bodyProfile(preset, gd, rHere),
        bodyProfile(preset, sd, rHere + 2),
      );
      let h = ground;
      if (preset === "living_matter") {
        h -= body * 1.05;
        const bank = Math.max(
          hd < rHere * 1.35 && hd > rHere * 0.78 ? Math.sin(((hd / rHere) - 0.78) / 0.57 * Math.PI) : 0,
          gd < rHere * 1.35 && gd > rHere * 0.78 ? Math.sin(((gd / rHere) - 0.78) / 0.57 * Math.PI) : 0,
        );
        h += bank * 0.28;
      } else if (preset === "forged_relief") {
        h += body * 1.55;
      } else if (preset === "prismatic_geometry") {
        h += body * 1.05;
      } else {
        h += body * 1.25;
      }
      height[i] = h;
    }
  }
  return height;
}

function normalAt(height, i, x, y) {
  const left = height[i - (x > 1 ? 2 : 0)];
  const right = height[i + (x < W - 2 ? 2 : 0)];
  const up = height[y > 1 ? i - W * 2 : i];
  const down = height[y < H - 2 ? i + W * 2 : i];
  const nx = (left - right) * 6.2;
  const ny = (up - down) * 6.2;
  const nz = 1;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function aoAt(height, i, x, y) {
  const h = height[i];
  let occ = 0;
  const taps = [8, -8, 14, -12];
  for (let k = 0; k < taps.length; k += 1) {
    const dx = taps[k];
    const sx = x + dx;
    if (sx >= 0 && sx < W) {
      const diff = height[y * W + sx] - h;
      if (diff > 0) occ += diff;
    }
    const sy = y + dx;
    if (sy >= 0 && sy < H) {
      const diff = height[sy * W + x] - h;
      if (diff > 0) occ += diff;
    }
  }
  return Math.max(0.38, Math.min(1, 1 - occ * 0.72));
}

function castShadow(height, x, y, h0) {
  for (let s = 4; s <= 96; s += 4) {
    const sx = (x - s) | 0;
    const sy = (y - s * 0.42) | 0;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) break;
    if (height[sy * W + sx] > h0 + 0.035 + s * 0.0035) return 0.42;
  }
  return 1;
}

function veilClimate(hint, quiet, salt) {
  if (hint.heat) return { deep: [36, 20, 14], air: [92, 58, 40], mist: [150, 108, 78], skin: [168, 122, 88] };
  if (hint.water) return { deep: [16, 28, 32], air: [46, 74, 76], mist: [120, 150, 148], skin: [150, 176, 170] };
  if (quiet) return { deep: [48, 46, 42], air: [112, 106, 96], mist: [168, 160, 148], skin: [186, 176, 160] };
  const warm = (salt % 7) / 7;
  return {
    deep: [22 + warm * 10, 20, 18],
    air: [64 + warm * 16, 58, 52],
    mist: [132, 124, 112],
    skin: [168, 156, 140],
  };
}

function shadeVeil(x, y, v, fields, height, normal, hint, salt, quiet, rHere, hostBody, guestBody, sharedBody, hostD, guestD, sd) {
  const climate = veilClimate(hint, quiet, salt);
  const macro = fbm(x / 520, y / 680, salt, 2);
  const meso = fbm(x / 78, y / 64, salt + 4, 2);
  let best = 0;
  let dist = REACH;
  if (hostBody >= best) {
    best = hostBody;
    dist = hostD;
  }
  if (guestBody > best) {
    best = guestBody;
    dist = guestD;
  }
  if (sharedBody > best) {
    best = sharedBody;
    dist = sd;
  }
  const u = dist / rHere;
  const lx = Math.cos(((salt % 900) / 900) * Math.PI) * 0.8;
  const ly = -0.66;
  const ndl = Math.max(0, normal[0] * lx + normal[1] * ly + normal[2] * 0.62);
  const fres = (1 - Math.max(0, normal[2])) ** 1.8;
  const horizon = 0.26 + ((salt >>> 8) % 22) / 100;
  const pool = Math.max(0, (v - horizon) / (1 - horizon));
  const nearest = Math.min(hostD, guestD, sd);
  const clear = Math.exp(-nearest / (quiet ? 150 : 110));
  let r = climate.deep[0] + (climate.air[0] - climate.deep[0]) * (0.35 + macro * 0.45) * (1 - pool * 0.35);
  let g = climate.deep[1] + (climate.air[1] - climate.deep[1]) * (0.35 + macro * 0.45) * (1 - pool * 0.35);
  let b = climate.deep[2] + (climate.air[2] - climate.deep[2]) * (0.35 + macro * 0.45) * (1 - pool * 0.35);
  r += (meso - 0.5) * 10;
  g += (meso - 0.5) * 8;
  b += (meso - 0.5) * 6;
  const hLift = (height[y * W + x] - 0.1) * 18;
  r += hLift;
  g += hLift * 0.9;
  b += hLift * 0.7;
  if (best > 0.05) {
    const grain = 0.78 + fbm(y / 46, x / 22, salt + 9, 2) * 0.36;
    const lit = (0.48 + ndl * 0.34) * grain;
    const shell = Math.min(1, best);
    const cavity = u < 0.42 ? (0.42 - u) / 0.42 : 0;
    const hold = shell * (1 - cavity * 0.55) * 0.82;
    const skinR = climate.skin[0] * lit;
    const skinG = climate.skin[1] * lit;
    const skinB = climate.skin[2] * lit;
    r = r * (1 - hold) + skinR * hold;
    g = g * (1 - hold) + skinG * hold;
    b = b * (1 - hold) + skinB * hold;
    r = r * (1 - cavity * 0.35) + climate.deep[0] * cavity * 0.55;
    g = g * (1 - cavity * 0.35) + climate.deep[1] * cavity * 0.55;
    b = b * (1 - cavity * 0.35) + climate.deep[2] * cavity * 0.55;
    const rim = fres * shell * 0.18;
    r += rim * 16;
    g += rim * 14;
    b += rim * 10;
    if (u > 0.55 && u < 0.92 && hash2(x >> 4, y >> 4, salt + 31) > 0.92) {
      const bead = 1 - Math.hypot((x & 15) - 7.5, (y & 15) - 7.5) / 6.5;
      if (bead > 0) {
        r += bead * 14 * lit;
        g += bead * 13 * lit;
        b += bead * 10 * lit;
      }
    }
  }
  if (u > 1 && u < 1.45 && sd > 70) {
    const haze = ((1.45 - u) / 0.45) * 0.22;
    r = r * (1 - haze) + climate.mist[0] * haze;
    g = g * (1 - haze) + climate.mist[1] * haze;
    b = b * (1 - haze) + climate.mist[2] * haze;
  }
  let occ = 1;
  if (nearest < rHere * 2.2) {
    for (let step = 1; step <= 5; step += 1) {
      const sx = x + lx * step * 10;
      const sy = y + ly * step * 10;
      const ahead = Math.min(
        distAt(fields.hostDist, sx, sy),
        distAt(fields.guestDist, sx, sy),
        distAt(fields.sharedDist, sx, sy),
      );
      if (ahead < rHere * 0.72) {
        occ = 0.62;
        break;
      }
    }
  }
  const shaft = (Math.max(0, Math.cos(x / 260 + ((salt >>> 3) % 40) / 8)) ** 2) * (1 - pool * 0.4) * (1 - Math.min(1, best)) * occ;
  r += shaft * climate.mist[0] * 0.22;
  g += shaft * climate.mist[1] * 0.2;
  b += shaft * climate.mist[2] * 0.16;
  let mist = Math.min(0.58, (0.06 + pool * 0.5) * (0.55 + meso * 0.35) * (1 - clear * 0.72));
  if (hint.water) mist = Math.min(0.64, mist + 0.05);
  if (sd > 70 && hostD < rHere * 1.35 && guestD < rHere * 1.35 && Math.abs(hostD - guestD) < rHere * 0.45) {
    mist *= 0.35;
    r *= 0.78;
    g *= 0.78;
    b *= 0.8;
  }
  r = r * (1 - mist) + climate.mist[0] * mist * occ;
  g = g * (1 - mist) + climate.mist[1] * mist * occ;
  b = b * (1 - mist) + climate.mist[2] * mist * occ;
  if (v > 0.78 && hash2(x >> 5, y >> 5, salt + 77) > 0.975) {
    const mote = 1 - Math.hypot((x & 31) - 16, (y & 31) - 16) / 14;
    if (mote > 0 && nearest > rHere) {
      r += mote * 16;
      g += mote * 15;
      b += mote * 12;
    }
  }
  return [r, g, b];
}

function tone(value) {
  const x = Math.max(0, Math.min(255, value)) / 255;
  const c = (x - 0.5) * 1.12 + 0.5;
  return clampByte(c * 255);
}

function shadeAll(preset, fields, height, hint, salt, quiet) {
  const rgb = Buffer.alloc(W * H * 3);
  const radius = styleRadius(preset, quiet, salt);
  for (let y = 0; y < H; y += 1) {
    const v = y / H;
    const rHere = radius * (0.72 + 0.5 * noise(y / 180, 1.3, salt + 3));
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const hd = fields.hostDist[i];
      const gd = fields.guestDist[i];
      const sd = fields.sharedDist[i];
      const [hostD, guestD] = separateBodies(preset, hd, gd, sd, fields.hostZ[i], fields.guestZ[i]);
      const hostBody = bodyProfile(preset, hostD, rHere);
      const guestBody = bodyProfile(preset, guestD, rHere);
      const sharedBody = bodyProfile(preset, sd, rHere + 2);
      const normal = normalAt(height, i, x, y);
      const ao = aoAt(height, i, x, y);
      let r = 0;
      let g = 0;
      let b = 0;
      if (preset === "living_matter") {
        const cover = Math.max(hostBody, guestBody, sharedBody);
        const floor = fbm(x / 180, y / 180, salt + 8, 3);
        const dryA = hint.heat ? [132, 74, 46] : hint.water ? [96, 104, 92] : [126, 86, 54];
        const dryB = hint.heat ? [86, 58, 40] : [78, 70, 48];
        const soilR = dryA[0] * floor + dryB[0] * (1 - floor);
        const soilG = dryA[1] * floor + dryB[1] * (1 - floor);
        const soilB = dryA[2] * floor + dryB[2] * (1 - floor);
        const wet = hint.heat ? [78, 32, 24] : [36, 58, 54];
        const silt = [176, 150, 112];
        const mix = Math.min(1, cover);
        const bank = cover > 0.2 && cover < 0.85 ? (cover - 0.2) / 0.65 : cover >= 0.85 ? 1 - (cover - 0.85) / 0.2 : 0;
        r = soilR * (1 - mix) + wet[0] * mix;
        g = soilG * (1 - mix) + wet[1] * mix;
        b = soilB * (1 - mix) + wet[2] * mix;
        r = r * (1 - bank * 0.45) + silt[0] * bank * 0.45;
        g = g * (1 - bank * 0.45) + silt[1] * bank * 0.45;
        b = b * (1 - bank * 0.45) + silt[2] * bank * 0.45;
        if (cover > 0.5 && hint.heat) {
          const crack = fbm(x / 10, y / 42, salt + 19, 2);
          if (crack > 0.57) {
            const k = (crack - 0.57) * 5;
            r += 170 * k;
            g += 54 * k;
            b += 12 * k;
          }
        }
        const light = Math.max(0, normal[0] * 0.35 + normal[1] * -0.42 + normal[2] * 0.78);
        const along = fields.hostTx[i] || fields.guestTx[i] || 0;
        const across = fields.hostTy[i] || fields.guestTy[i] || 1;
        const fiber = cover > 0.15 ? fbm((x * across + y * along) / 12, (x * along - y * across) / 90, salt + 5, 2) : 0.5;
        const spec = cover > 0.78 ? (light ** 10) * (hint.heat ? 30 : 78) : 0;
        const lit = (0.28 + light * 0.95) * ao;
        r = r * lit * (0.86 + fiber * 0.28) + spec;
        g = g * lit * (0.86 + fiber * 0.22) + spec * 0.92;
        b = b * lit * (0.9 + fiber * 0.1) + spec * (hint.heat ? 0.45 : 0.75);
      } else if (preset === "prismatic_geometry") {
        r = 6 + v * 4;
        g = 8 + v * 5;
        b = 14 + v * 6;
        const slabs = [
          [guestBody, guestD, [176, 214, 226]],
          [hostBody, hostD, [232, 214, 186]],
          [sharedBody, sd, [220, 206, 170]],
        ];
        for (let s = 0; s < slabs.length; s += 1) {
          const thick = slabs[s][0];
          if (thick < 0.04) continue;
          const dist = slabs[s][1];
          const tint = slabs[s][2];
          const fres = (1 - Math.max(0, normal[2])) ** 1.45;
          const core = Math.min(1, thick);
          r = r * (1 - core * 0.55) + tint[0] * core * 0.62 + core * 28;
          g = g * (1 - core * 0.5) + tint[1] * core * 0.58 + core * 26;
          b = b * (1 - core * 0.62) + tint[2] * core * 0.5 + core * 18;
          r += fres * 230 + normal[0] * fres * 70;
          g += fres * 236;
          b += fres * 245 - normal[0] * fres * 70;
          if (dist > rHere * 0.62 && dist < rHere * 0.9) {
            r += 34;
            g += 30;
            b += 18;
          }
        }
        const ox = x - 26;
        const oy = y - 18;
        const shade = glassProfile(distAt(fields.hostDist, ox, oy), rHere) + glassProfile(distAt(fields.guestDist, ox, oy), rHere);
        if (shade > 0.45 && hostBody < 0.15 && guestBody < 0.15 && sharedBody < 0.15) {
          r *= 0.45;
          g *= 0.48;
          b *= 0.55;
        }
      } else if (preset === "forged_relief") {
        const cover = Math.max(hostBody, guestBody, sharedBody);
        const stoneN = fbm(x / 160, y / 90, salt + 3, 3);
        const stoneR = 78 + stoneN * 36;
        const stoneG = 74 + stoneN * 30;
        const stoneB = 68 + stoneN * 22;
        const metal = sharedBody > hostBody && sharedBody > guestBody
          ? [168, 150, 114]
          : guestBody > hostBody
            ? [176, 162, 140]
            : hint.heat ? [120, 86, 68] : [128, 116, 104];
        const groove = cover > 0.15 && height[i] < 0.42 ? 0.35 : 0;
        r = stoneR * (1 - cover) + metal[0] * cover;
        g = stoneG * (1 - cover) + metal[1] * cover;
        b = stoneB * (1 - cover) + metal[2] * cover;
        r *= 1 - groove * 0.45;
        g *= 1 - groove * 0.5;
        b *= 1 - groove * 0.5;
        const shadow = castShadow(height, x, y, height[i]);
        const nd = Math.max(0, normal[0] * 0.78 + normal[1] * 0.18 + normal[2] * 0.5);
        const across = Math.abs((fields.hostTy[i] || 0) * x - (fields.hostTx[i] || 1) * 0);
        const tool = cover > 0.25 ? 0.9 + Math.sin(x * (fields.hostTy[i] || 0.2) + y * (fields.hostTx[i] || 0.8)) * 0.06 : 1;
        const glint = (nd ** 12) * (cover > 0.45 ? 70 : 8);
        const patina = ao < 0.72 && cover > 0.2 ? (0.72 - ao) * 28 : 0;
        const lit = (0.18 + nd * 0.95) * shadow * ao * tool;
        r = r * lit + glint;
        g = g * lit + glint * 0.82 + patina * 0.7;
        b = b * lit + glint * 0.45 + patina * 0.45;
        void across;
      } else {
        [r, g, b] = shadeVeil(
          x, y, v, fields, height, normal, hint, salt, quiet, rHere,
          hostBody, guestBody, sharedBody, hostD, guestD, sd,
        );
      }
      const grain = (hash2(x, y, salt + 21) - 0.5) * 3;
      const edge = Math.min(x / 48, y / 48, (W - 1 - x) / 48, (H - 1 - y) / 48, 1);
      const vig = 0.9 + edge * 0.1;
      rgb[i * 3] = tone((r + grain) * vig);
      rgb[i * 3 + 1] = tone((g + grain) * vig);
      rgb[i * 3 + 2] = tone((b + grain * 0.8) * vig);
    }
  }
  return rgb;
}

function normalFromProfile(preset, field, radius, x, y) {
  const hL = bodyProfile(preset, distAt(field, x - 2, y), radius);
  const hR = bodyProfile(preset, distAt(field, x + 2, y), radius);
  const hU = bodyProfile(preset, distAt(field, x, y - 2), radius);
  const hD = bodyProfile(preset, distAt(field, x, y + 2), radius);
  const nx = (hL - hR) * 3.4;
  const ny = (hU - hD) * 3.4;
  const nz = 1;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export async function renderGeometry(geometry, preset = DEFAULT_STYLE) {
  if (!STYLES.includes(preset)) throw new Error("That style is not one of the four.");
  const fields = rasterGeometry(geometry);
  if (falseJoin(geometry, fields.shared, fields.host, fields.guest)) {
    throw new Error("The picture joined streams the meaning left open. Refused.");
  }
  const salt = saltOf(geometry.hash);
  const hint = materialHint(geometry);
  const quiet = Boolean(geometry.quiet);
  const height = buildHeight(preset, fields, quiet, salt);
  const rgb = shadeAll(preset, fields, height, hint, salt, quiet);
  const png = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
  const hostPixels = fields.host.reduce((sum, value) => sum + (value > 0.2 ? 1 : 0), 0);
  const guestPixels = fields.guest.reduce((sum, value) => sum + (value > 0.2 ? 1 : 0), 0);
  return {
    png,
    width: OUT_W,
    height: OUT_H,
    sha256: sha256(png),
    sceneHash: geometry.hash,
    styleId: preset,
    styleVersion: STYLE_VERSION,
    backend: BACKEND_ID,
    qualityTier: "heightfield-2.5d",
    limits: BACKEND_LIMITS,
    fidelity: {
      passed: true,
      roots: geometry.roots.length,
      joins: geometry.joins.length,
      outcome: geometry.outcome,
      hostPixels,
      guestPixels,
      regression: geometry.regression,
      crossings: geometry.crossings,
      falseJoin: false,
      geometryLimited: true,
    },
  };
}

export function assertStyleIdentity(a, b) {
  if (a.sceneHash !== b.sceneHash) throw new Error("A style changed the geometry hash.");
  if (a.sha256 === b.sha256) throw new Error("Two styles produced the same bytes.");
}
