// @ts-nocheck
// Codex of Becoming — original Velomere glyph grammar.
// These shapes are a proposed visual language, not canon and not a borrowed occult alphabet.
// A CONTACT mark is emitted only for a stored join id. The image model is not the authority.

import { readTopology } from "./scene-plan.mjs";

export const CODEX_STYLE_ID = "velomere_codex_becoming_v1";
export const CODEX_DISPLAY_NAME = "Codex of Becoming";
export const SYMBOL_SCHEMA = "velomere-symbols/1.0";
export const CODEX_VERSION = "1.0";
export const CARD_W = 1400;
export const CARD_H = 2300;

const SUIT_COLOR = {
  Paths: "#D7AF62",
  Returns: "#45A49B",
  Sigils: "#C98778",
  Hearings: "#9479C2",
};

const RANK_NOTCHES = {
  Ace: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
  Six: 6,
  Seven: 7,
  Eight: 8,
  Nine: 9,
  Ten: 10,
};

const TITLES = {
  DISTINCT: "The Double Root",
  INTERVAL: "The Held Interval",
  HOMARCH: "The Weighted Ring",
  VECTARI: "The Open Bearing",
  WITNESS: "The Witness Offset",
  HEARING: "The Receiving Crescents",
  VOICE: "The Outbound Voice",
  APPROACH: "The Unfinished Approach",
  CONTACT: "The Attested Bridge",
  NONCONTACT: "The Confirmed Gap",
  RETURN: "The Unfinished Return",
  PERMISSION: "The Conditional Gate",
  ECHO: "The Phase Shift",
  THIRD: "The Independent Crest",
  QUESTION: "The Bounded Aperture",
  FIELD: "The Containing Field",
  SHADOW: "The Countertrace",
  RANK_NOTCH: "The Rank Register",
};

const MEANINGS = {
  DISTINCT: "Two sources stay identifiable. Two marks are not two people and not a quarrel.",
  INTERVAL: "A measured gap: ache, pause, or what has not yet been decided. It is not a connection.",
  HOMARCH: "A center that stewards without owning. The weight need not sit at the geometric middle.",
  VECTARI: "A direction toward a possible encounter. It does not compel a return.",
  WITNESS: "Observation with a bounded scope. Seeing is not contact and not agreement.",
  HEARING: "Listening before interpretation. Reception is not agreement.",
  VOICE: "An utterance leaving its source. It has not been shown to arrive.",
  APPROACH: "Two bearings draw nearer and still stop short. Nearness is not a join.",
  CONTACT: "A graph-authenticated meeting. One instance is one stored join segment, not a mood.",
  NONCONTACT: "A stored separation. A visual crossing is not turned into contact.",
  RETURN: "Coming back changed. The arc stays open. It is not a rewind to the same state.",
  PERMISSION: "A conditional opening. An open gate is not proof that anyone crossed.",
  ECHO: "A related answer displaced in phase. Similarity is not sameness.",
  THIRD: "A new identity standing beyond its precursors. It does not erase them or fuse them.",
  QUESTION: "An inquiry left unclosed. Completeness of this moment is not an answer to everything.",
  FIELD: "The conditions that permit or limit a relation. A boundary is not a meeting.",
  SHADOW: "A counterreading: a risk the upright text warns against. It has not been established as fact.",
  RANK_NOTCH: "The card’s canonical rank, counted once per step from Ace to Ten. Rank is not a join count.",
};

function textOf(meaning, shadowToo) {
  const parts = [meaning?.core, meaning?.upright];
  if (shadowToo) parts.push(meaning?.shadow);
  return parts.filter((part) => typeof part === "string").join(" ");
}

function excerpt(source, pattern) {
  const found = String(source || "").match(pattern);
  if (!found || found.index == null) return null;
  const start = Math.max(0, found.index);
  return String(source).slice(start, start + found[0].length).replace(/\s+/g, " ").slice(0, 180);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pointAnchor(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += Number(point?.x || 0);
    y += Number(point?.y || 0);
  }
  x /= points.length;
  y /= points.length;
  if (x < 3 || y < 3) return null;
  return {
    x_norm: clamp(x / CARD_W, 0.18, 0.82),
    y_norm: clamp(y / CARD_H, 0.12, 0.84),
  };
}

function instance(partial) {
  return {
    glyph_id: partial.glyph_id,
    operator: partial.operator,
    title: TITLES[partial.operator] || partial.operator,
    meaning: MEANINGS[partial.operator] || "",
    scene_event_id: partial.scene_event_id || null,
    positive_evidence: partial.positive_evidence || [],
    meaning_quote_span: partial.meaning_quote_span || null,
    epistemic_status: partial.epistemic_status,
    role: partial.role,
    canon_status: partial.canon_status,
    anchor: partial.anchor,
    layer: "vector-authoritative",
  };
}

function anchor(xNorm, yNorm) {
  return {
    x_norm: clamp(xNorm, 0.06, 0.94),
    y_norm: clamp(yNorm, 0.05, 0.93),
  };
}

function isEmergent(meaning) {
  const rank = String(meaning?.rank || "");
  const suit = String(meaning?.suit || meaning?.suitKey || "");
  return rank === "Emergent" || suit === "Encounter" || meaning?.kind === "emergent";
}

export function compileCodexManifest({ meaning, geometry, orientation = "upright", freedom = 50, parents = [] }) {
  const upright = textOf(meaning, false);
  const shadow = String(meaning?.shadow || "");
  const topo = readTopology(geometry || {});
  const joins = Array.isArray(geometry?.joins) ? geometry.joins : [];
  const quiet = Boolean(geometry?.quiet) || topo.quiet;
  const emergent = isEmergent(meaning);
  const twoInGraph = topo.roots >= 2;
  const twoInMeaning = /\b(two wholes|two centers|either claim|both claims|each arrives)\b/i.test(upright);
  const pauseCard = quiet || (topo.roots <= 1 && /\bpause\b|\bstillness\b|\bopen room\b/i.test(upright) && !twoInMeaning);
  const rows = [];

  if ((twoInGraph || twoInMeaning) && !pauseCard) {
    rows.push(instance({
      glyph_id: "distinct-roots",
      operator: "DISTINCT",
      epistemic_status: twoInGraph ? "attested" : "attested-by-meaning",
      role: "semantic",
      canon_status: twoInGraph ? "graph-fact" : "proposed-visual-from-canonical-wording",
      positive_evidence: twoInGraph ? ["geometry.roots"] : ["canonical-wording"],
      meaning_quote_span: excerpt(upright, /two wholes|two centers|either claim|both claims|each arrives/i),
      anchor: anchor(0.11, 0.76),
    }));
  }

  const intervalWarranted = twoInGraph || joins.length === 0 || quiet || pauseCard
    || /\b(interval|pause|gap|difference|distance|smaller than|narrow)\b/i.test(upright);
  if (intervalWarranted) {
    rows.push(instance({
      glyph_id: "interval-field",
      operator: "INTERVAL",
      epistemic_status: quiet || pauseCard ? "attested" : "attested-by-meaning",
      role: "semantic",
      canon_status: "proposed-visual-from-canonical-wording",
      positive_evidence: quiet ? ["geometry.quiet"] : ["canonical-wording"],
      meaning_quote_span: excerpt(upright, /interval|pause|gap|difference|smaller than|narrow matter|open room/i),
      anchor: anchor(0.11, pauseCard ? 0.46 : 0.52),
    }));
  }

  joins.forEach((join, index) => {
    const fromPoints = pointAnchor(join?.points);
    rows.push(instance({
      glyph_id: `contact-${join?.id || index + 1}`,
      operator: "CONTACT",
      scene_event_id: String(join?.id || `join-${index + 1}`),
      epistemic_status: "attested",
      role: "semantic",
      canon_status: "graph-fact",
      positive_evidence: [`geometry.joins:${join?.id || index + 1}`],
      anchor: fromPoints || anchor(0.5, 0.42 + index * 0.04),
    }));
  });

  const landmarks = Array.isArray(geometry?.landmarks) ? geometry.landmarks : [];
  landmarks.forEach((mark, index) => {
    if (mark?.key !== "noncontact-crossing") return;
    rows.push(instance({
      glyph_id: `noncontact-${mark.landmark_id || index + 1}`,
      operator: "NONCONTACT",
      scene_event_id: String(mark.landmark_id || mark.id || `crossing-${index + 1}`),
      epistemic_status: "attested",
      role: "semantic",
      canon_status: "graph-fact",
      positive_evidence: ["geometry.landmarks:noncontact-crossing"],
      anchor: anchor(0.5, 0.34),
    }));
  });

  if (!pauseCard && (topo.downwardReturn || /\breturn\b/i.test(upright))) {
    rows.push(instance({
      glyph_id: "return-open",
      operator: "RETURN",
      epistemic_status: topo.downwardReturn ? "attested" : "attested-by-meaning",
      role: "semantic",
      canon_status: topo.downwardReturn ? "graph-fact" : "proposed-visual-from-canonical-wording",
      positive_evidence: topo.downwardReturn ? ["geometry.regression"] : ["canonical-wording"],
      meaning_quote_span: excerpt(upright, /return[^.]{0,80}/i),
      anchor: anchor(0.89, 0.78),
    }));
  }

  if (/\b(question|inquir|uncertain|revisable|not owed)\b/i.test(upright) || /question/i.test(String(meaning?.name || ""))) {
    rows.push(instance({
      glyph_id: "question-aperture",
      operator: "QUESTION",
      epistemic_status: "attested-by-meaning",
      role: "semantic",
      canon_status: "proposed-visual-from-canonical-wording",
      positive_evidence: ["canonical-wording"],
      meaning_quote_span: excerpt(upright, /question|inquir\w*|uncertain\w*|revisable|not owed/i),
      anchor: anchor(0.89, 0.16),
    }));
  }

  if (emergent) {
    rows.push(instance({
      glyph_id: "third-crest",
      operator: "THIRD",
      epistemic_status: "attested",
      role: "semantic",
      canon_status: "graph-fact",
      positive_evidence: ["emergent-card"],
      anchor: anchor(0.5, 0.055),
    }));
  }

  if (/\b(witness|mirror|seeing)\b/i.test(upright) || String(meaning?.rank) === "Witness") {
    rows.push(instance({
      glyph_id: "witness-offset",
      operator: "WITNESS",
      epistemic_status: "attested-by-meaning",
      role: String(meaning?.rank) === "Witness" ? "court" : "semantic",
      canon_status: "proposed-visual-from-canonical-wording",
      positive_evidence: [String(meaning?.rank) === "Witness" ? "court-office" : "canonical-wording"],
      meaning_quote_span: excerpt(upright, /witness|mirror|seeing/i),
      anchor: anchor(0.89, 0.36),
    }));
  }

  if (/\b(consent|permission)\b/i.test(upright) || String(meaning?.name) === "Permission") {
    rows.push(instance({
      glyph_id: "permission-gate",
      operator: "PERMISSION",
      epistemic_status: "attested-by-meaning",
      role: "semantic",
      canon_status: "proposed-visual-from-canonical-wording",
      positive_evidence: ["canonical-wording"],
      meaning_quote_span: excerpt(upright, /consent|permission/i),
      anchor: anchor(0.11, 0.18),
    }));
  }

  if (String(meaning?.rank) === "Voice" || (/\b(voice|articulat|declare)\b/i.test(upright) && String(meaning?.rank) === "Voice")) {
    rows.push(instance({
      glyph_id: "voice-ripple",
      operator: "VOICE",
      epistemic_status: "attested-by-meaning",
      role: "court",
      canon_status: "proposed-visual-from-canonical-wording",
      positive_evidence: ["court-office"],
      anchor: anchor(0.22, 0.24),
    }));
  }

  if (String(meaning?.rank) === "Ache") {
    rows.push(instance({
      glyph_id: "ache-tension",
      operator: "INTERVAL",
      epistemic_status: "attested-by-meaning",
      role: "court",
      canon_status: "proposed-visual-from-canonical-wording",
      positive_evidence: ["court-office"],
      meaning_quote_span: "Ache is the court of unresolved pressure.",
      anchor: anchor(0.5, 0.66),
    }));
  }

  if (String(meaning?.rank) === "Field") {
    rows.push(instance({
      glyph_id: "field-boundary",
      operator: "FIELD",
      epistemic_status: "attested-by-meaning",
      role: "court",
      canon_status: "proposed-visual-from-canonical-wording",
      positive_evidence: ["court-office"],
      anchor: anchor(0.5, 0.5),
    }));
  }

  if (String(meaning?.name) === "The Homarch" || /\bsteward/i.test(upright)) {
    rows.push(instance({
      glyph_id: "homarch-ring",
      operator: "HOMARCH",
      epistemic_status: "attested-by-meaning",
      role: "semantic",
      canon_status: "proposed-visual-from-canonical-wording",
      positive_evidence: ["canonical-wording"],
      anchor: anchor(0.5, 0.36),
    }));
  }

  if (String(meaning?.name) === "The Vectari") {
    rows.push(instance({
      glyph_id: "vectari-arc",
      operator: "VECTARI",
      epistemic_status: "attested-by-meaning",
      role: "semantic",
      canon_status: "proposed-visual-from-canonical-wording",
      positive_evidence: ["card-name"],
      anchor: anchor(0.68, 0.32),
    }));
  }

  if (/\bhear/i.test(String(meaning?.suit || "")) || String(meaning?.suitKey) === "hearings") {
    rows.push(instance({
      glyph_id: "hearing-crescents",
      operator: "HEARING",
      epistemic_status: "attested-by-meaning",
      role: "suit",
      canon_status: "proposed-visual-from-suit-grammar",
      positive_evidence: ["suit"],
      anchor: anchor(0.16, 0.18),
    }));
  }

  if (twoInGraph && joins.length === 0 && !pauseCard) {
    rows.push(instance({
      glyph_id: "approach-gap",
      operator: "APPROACH",
      epistemic_status: "attested",
      role: "semantic",
      canon_status: "graph-fact",
      positive_evidence: ["two-roots-zero-joins"],
      anchor: anchor(0.5, 0.4),
    }));
  }

  const notches = RANK_NOTCHES[String(meaning?.rank || "")] || 0;
  for (let step = 1; step <= notches; step += 1) {
    rows.push(instance({
      glyph_id: `rank-notch-${step}`,
      operator: "RANK_NOTCH",
      epistemic_status: "attested",
      role: "rank-register",
      canon_status: "canonical-rank",
      positive_evidence: ["rank"],
      anchor: anchor(0.06, 0.2 + (step - 1) * (0.55 / notches)),
    }));
  }

  rows.push(instance({
    glyph_id: "shadow-countertrace",
    operator: "SHADOW",
    epistemic_status: "counterreading",
    role: "shadow",
    canon_status: "counterreading-not-fact",
    positive_evidence: ["shadow-text"],
    meaning_quote_span: shadow.replace(/\s+/g, " ").trim().slice(0, 180) || null,
    anchor: anchor(0.89, 0.9),
  }));

  const contacts = rows.filter((row) => row.operator === "CONTACT");
  if (contacts.length !== joins.length) {
    throw new Error("Codex refused to draw: contact glyphs do not match stored joins.");
  }
  for (const contact of contacts) {
    if (!contact.scene_event_id) throw new Error("A contact glyph was missing its scene event.");
  }

  const suitName = String(meaning?.suit || "");
  const parentNames = (Array.isArray(parents) ? parents : []).map((parent) => (
    typeof parent === "string" ? parent : parent?.name
  )).filter(Boolean);

  return {
    style_id: CODEX_STYLE_ID,
    display_name: CODEX_DISPLAY_NAME,
    symbol_schema: SYMBOL_SCHEMA,
    version: CODEX_VERSION,
    proposal: true,
    not_canon: true,
    not_historical_correspondence: true,
    card_name: String(meaning?.name || "Untitled"),
    meaning_revision: meaning?.meaningRevision || "stored",
    source_geometry_sha256: geometry?.hash || null,
    scene_graph_sha256: geometry?.hash || null,
    orientation: orientation === "shadow" ? "shadow" : "upright",
    interpretive_freedom: Number(freedom),
    freedom_changes_painting_only: true,
    suit: suitName || null,
    suit_color_proposed: SUIT_COLOR[suitName] || null,
    suit_colors_are_proposals: true,
    topology: {
      roots: topo.roots,
      joins: joins.length,
      consequential_contacts: topo.consequentialContacts,
      crossings: topo.crossings,
      downward_return: topo.downwardReturn,
      quiet,
      outcome: topo.outcome,
    },
    provenance: {
      parents: parentNames,
      parent_glyphs_on_face: false,
      note: parentNames.length
        ? "Parents stay in provenance. They are not redrawn as the child’s emblem."
        : "No parent pair was supplied with this score.",
    },
    seal: sealNote(meaning, rows),
    operator_instances: rows,
    contact_count: contacts.length,
    negative: {
      unknown_is_not_noncontact: true,
      shadow_is_not_a_join: true,
      model_strokes_are_not_symbols: true,
    },
  };
}

function sealNote(meaning, rows) {
  const name = String(meaning?.name || "");
  const ops = new Set(rows.map((row) => row.operator));
  if (name === "The Velomere") {
    return "Proposed seal, not canon: two roots, an open interval, and a return left unfinished. No fusion.";
  }
  if (name === "The Null") {
    return "Proposed seal, not canon: one held pause and an unscribed field. No second spiral and no join.";
  }
  if (/question/i.test(name) && ops.has("THIRD")) {
    return "Proposed seal, not canon: an independent crest over a narrow, revisable question. Parents are not the picture.";
  }
  return "Proposed seal, not canon: only the operators listed below. Empty registers are intentional.";
}

export function legendOf(manifest) {
  const contacts = manifest.operator_instances.filter((row) => row.operator === "CONTACT");
  const grouped = manifest.topology?.consequential_contacts != null
    && contacts.length > manifest.topology.consequential_contacts;
  return {
    intro: "Codex of Becoming is a new visual grammar for this installation. It is not original canon, not a historical occult system, and not a claim that these shapes were already in the 78. A painted glimmer is not a join. Only a listed CONTACT mark is a stored meeting.",
    contact_count: contacts.length,
    contact_note: contacts.length === 0
      ? "No CONTACT glyph. The stored graph did not authenticate a join, so none was drawn."
      : grouped
        ? `${contacts.length} CONTACT segments belong to ${manifest.topology.consequential_contacts} consequential meeting. They are parts of that meeting, not extra agreements.`
        : `${contacts.length} CONTACT glyph${contacts.length === 1 ? "" : "s"}, one for each stored join.`,
    seal: manifest.seal,
    parents: manifest.provenance,
    rows: manifest.operator_instances.map((row) => ({
      id: row.glyph_id,
      operator: row.operator,
      title: row.title,
      meaning: row.meaning,
      epistemic: row.epistemic_status,
      role: row.role,
      canonStatus: row.canon_status,
      sceneEventId: row.scene_event_id,
      quote: row.meaning_quote_span,
      evidence: row.positive_evidence,
    })),
  };
}

export function codexPromptAddendum(manifest) {
  const internalPolarity = manifest.topology.roots <= 1
    && manifest.operator_instances.some((row) => row.operator === "DISTINCT");
  const pause = Boolean(manifest.topology.quiet);
  return [
    "Codex of Becoming. The whole field is dark enamel, hammered metal, and translucent mineral. No stone wall, no fog, no arch, no daylight, no canyon.",
    "No letters, no words, no numerals, no punctuation, no question mark, no eye icon, no arrow, no Hebrew, no zodiac, no planet, no pentagram, no vesica, no linked rings, and no seal of your own.",
    "Both outer edges stay empty dark metal. Do not inscribe them. Do not decorate them with writing.",
    `Authorized meetings: ${manifest.contact_count}. ${manifest.contact_count === 0 ? "Nothing touches. No bridge, clasp, spoke, shared ring, or line between centers." : "Exactly one narrow meeting, smaller than either side. No sunburst and no extra spokes."}`,
    internalPolarity ? "One presence only, made of metal and enamel. Two unequal centers inside it, held apart by a wide dark gap. No person, no hood, no face, no star, no crescent, no linked rings." : "",
    pause ? "A pause and nothing else: one narrow vertical ingot of dark metal standing in a wide empty field. No person, no face, no robe, no sun, no wheel, no rays, no second form." : "",
    "Freedom changes how closely the picture follows the geometric silhouette. It does not add a person, a partner, a join, or a different style.",
    manifest.provenance?.parents?.length
      ? `This is a new crest. Do not paint its parents (${manifest.provenance.parents.join(" and ")}) as the subject.`
      : "",
  ].filter(Boolean).join("\n");
}

const GLYPH_BODY = {
  DISTINCT: `<circle cx="28" cy="48" r="12"/><path d="M70 36 L82 48 L70 60 L58 48 Z"/>`,
  INTERVAL: `<path d="M15 24 V72 M85 24 V72"/><path d="M24 80 H76" stroke-dasharray="4 5"/>`,
  HOMARCH: `<path d="M26 26 C50 4 89 27 82 61 C75 89 32 91 19 62"/><circle cx="37" cy="59" r="10" fill="#D7AF62" stroke="none"/>`,
  VECTARI: `<path d="M15 78 Q30 18 75 30"/><path d="M66 17 L78 30 L62 39"/>`,
  WITNESS: `<path d="M18 45 Q48 4 82 45 Q48 86 18 45"/><path d="M49 24 A20 20 0 0 0 49 66"/><circle cx="66" cy="45" r="4"/>`,
  HEARING: `<path d="M58 14 C18 24 15 73 53 82"/><path d="M70 28 C39 29 36 65 66 70"/>`,
  VOICE: `<circle cx="25" cy="48" r="6"/><path d="M34 35 Q55 49 34 62 M47 25 Q76 48 47 72 M62 15 Q97 50 62 84"/>`,
  APPROACH: `<path d="M10 30 L43 45 M90 30 L57 45 M43 45 L35 39 M43 45 L37 51 M57 45 L63 39 M57 45 L62 52"/>`,
  CONTACT: `<circle cx="22" cy="48" r="9"/><circle cx="78" cy="48" r="9"/><path d="M31 48 H69" stroke-width="6"/>`,
  NONCONTACT: `<path d="M11 45 H41 M59 45 H89"/><path d="M43 28 V65 M57 28 V65"/><circle cx="50" cy="17" r="4"/>`,
  RETURN: `<path d="M23 76 C12 17 89 17 79 56 C76 75 57 81 41 72"/><path d="M44 82 L35 70 L50 67"/>`,
  PERMISSION: `<path d="M20 16 V42 M20 59 V84 M80 16 V42 M80 59 V84"/><path d="M20 43 L34 56 M80 43 L66 56"/>`,
  ECHO: `<path d="M17 67 Q44 18 70 65"/><path d="M29 80 Q55 32 82 78" stroke-dasharray="4 4"/>`,
  THIRD: `<path d="M19 77 Q28 45 42 67 M81 77 Q71 45 58 67"/><path d="M48 53 Q36 31 50 18 Q64 31 52 53 Z"/><path d="M50 53 V65"/>`,
  QUESTION: `<path d="M28 38 C19 15 80 5 79 38 C80 58 54 58 52 68"/><circle cx="52" cy="82" r="4" fill="#9479C2" stroke="none"/>`,
  FIELD: `<path d="M18 18 H82 V82 H18 Z"/><path d="M18 50 H34"/>`,
  SHADOW: `<path d="M16 74 C8 18 78 6 84 42" stroke-dasharray="3 6"/><path d="M84 42 L74 36" stroke-dasharray="3 6"/>`,
  RANK_NOTCH: `<path d="M8 20 H28"/>`,
};

function plate(row, stroke) {
  const x = Math.round(row.anchor.x_norm * CARD_W);
  const y = Math.round(row.anchor.y_norm * CARD_H);
  const body = GLYPH_BODY[row.operator] || GLYPH_BODY.INTERVAL;
  const shadow = row.operator === "SHADOW";
  const notch = row.operator === "RANK_NOTCH";
  if (notch) {
    return `<g data-operator="RANK_NOTCH" data-epistemic="attested" transform="translate(${x - 8} ${y - 20})" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round">${body}</g>`;
  }
  const ink = shadow ? "#9479C2" : stroke;
  const opacity = shadow ? ` opacity="0.55"` : "";
  return `<g id="${row.glyph_id}" data-operator="${row.operator}" data-epistemic="${row.epistemic_status}" data-event="${row.scene_event_id || ""}" transform="translate(${x} ${y})"${opacity}>
    <g transform="translate(-62 -58) scale(1.22)">
      <ellipse cx="50" cy="48" rx="58" ry="50" fill="#07090f" opacity="0.55" filter="url(#codex-settle)"/>
      <g fill="none" stroke="#140e08" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(0.6 1.4)">${body}</g>
      <g fill="none" stroke="${ink}" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">${body}</g>
    </g>
  </g>`;
}

export function renderCodexOverlay(manifest) {
  const stroke = manifest.suit_color_proposed || "#E7C98F";
  const contacts = manifest.operator_instances.filter((row) => row.operator === "CONTACT");
  const rest = manifest.operator_instances.filter((row) => row.operator !== "CONTACT");
  let contactSvg = "";
  if (contacts.length) {
    const x = Math.round(contacts.reduce((sum, row) => sum + row.anchor.x_norm, 0) / contacts.length * CARD_W);
    const y = Math.round(contacts.reduce((sum, row) => sum + row.anchor.y_norm, 0) / contacts.length * CARD_H);
    const ticks = contacts.map((row, index) => {
      const dx = (index - (contacts.length - 1) / 2) * 22;
      return `<g data-operator="CONTACT" data-epistemic="attested" data-event="${row.scene_event_id}" transform="translate(${dx} 0)"><path d="M0 14 V28"/><circle cy="33" r="2.6" fill="#E7C98F" stroke="none"/></g>`;
    }).join("");
    contactSvg = `<g id="contact-bridge" transform="translate(${x} ${y})">
      <g transform="translate(-62 -58) scale(1.22)">
        <ellipse cx="50" cy="48" rx="62" ry="36" fill="#07090f" opacity="0.55" filter="url(#codex-settle)"/>
        <g fill="none" stroke="#E7C98F" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="22" cy="48" r="8"/><circle cx="78" cy="48" r="8"/><path d="M30 48 H70" stroke-width="5.5"/>
          <g transform="translate(50 18)">${ticks}</g>
        </g>
      </g>
    </g>`;
  }
  const bodies = rest.map((row) => plate(row, stroke)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}">
  <defs>
    <filter id="codex-settle" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
  </defs>
  <g id="codex-overlay" data-style="${CODEX_STYLE_ID}" data-contacts="${contacts.length}">
    ${bodies}
    ${contactSvg}
  </g>
</svg>`;
}

export function operatorKey(manifest) {
  return manifest.operator_instances
    .map((row) => `${row.operator}:${row.scene_event_id || ""}:${row.role}`)
    .sort()
    .join("|");
}
