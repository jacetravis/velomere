// @ts-nocheck
// Semantic-to-art contract. The card's meaning and the frozen graph decide the picture.
// Freedom changes resemblance, not what the card is allowed to claim.
import { createHash } from "node:crypto";
import { readTopology } from "./scene-plan.mjs";

export const ART_BRIEF_VERSION = "v20.4";

const STYLE_MATERIAL = {
  veiled_luminescence: "Veiled Luminescence: light, haze, dust, or occlusion, still recognizable as that style at any freedom.",
  living_matter: "Living Matter: growth, weather, or erosion, still recognizable as that style at any freedom.",
  forged_relief: "Forged Relief: a made thing with thickness and cast shadow, still recognizable as that style at any freedom.",
  prismatic_geometry: "Prismatic Geometry: refraction and separated planes of light, still recognizable as that style at any freedom.",
  cyber_matrix: "Cyber Matrix: signal, access, or a failed transmission, still recognizable as that style at any freedom. No readable text.",
  witnessed_dance: "Witnessed Dance: weight and interval. Bodies only as the score allows. No touch the graph did not earn.",
  velomere_codex_becoming_v1: "Codex of Becoming: an original illuminated manuscript of mineral dark, burnished metal, and accountable engraved relation. Not Veiled Luminescence, and not a historical occult deck. The style stays recognizable at every freedom.",
};

function clip(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function meaningFingerprint(meaning) {
  const keywords = Array.isArray(meaning?.keywords)
    ? meaning.keywords
    : String(meaning?.keywords || "").split(",");
  const body = [
    meaning?.name || "",
    meaning?.core || "",
    meaning?.upright || "",
    meaning?.shadow || "",
    ...keywords.map((item) => String(item || "").trim()).filter(Boolean).sort(),
  ].join("\n");
  return createHash("sha256").update(body).digest("hex");
}

export function readingForArt(personal, source) {
  const stored = source && typeof source === "object" ? source : {};
  const ready = personal
    && String(personal.name || "").trim()
    && String(personal.core || "").trim()
    && String(personal.upright || "").trim()
    && String(personal.shadow || "").trim();
  if (!ready) return stored;
  return {
    ...stored,
    name: String(personal.name).trim(),
    core: String(personal.core).trim(),
    upright: String(personal.upright).trim(),
    shadow: String(personal.shadow).trim(),
    keywords: Array.isArray(personal.keywords) ? personal.keywords : stored.keywords,
  };
}

export function buildArtMeaning({ meaning, geometry, styleId, freedom, topology }) {
  const topo = topology || readTopology(geometry || {});
  const name = String(meaning?.name || "Untitled").slice(0, 80);
  const contacts = Number(topo.consequentialContacts || 0);
  const roots = Number(topo.roots || 0);
  const text = `${meaning?.core || ""} ${meaning?.upright || ""} ${meaning?.shadow || ""}`;
  const narrow = /specific, revisable, and smaller/i.test(text) || contacts === 1;
  const limits = [];
  const forbidden = [];
  let governing = `${name} may only depict the event the graph records.`;
  if (roots <= 1 && contacts === 0) {
    governing = `${name} is one withheld event. No second presence was earned.`;
    limits.push("Do not add a partner, a reply, or a second system.");
    forbidden.push("A second consequential presence.");
  } else if (contacts === 0) {
    governing = `${name} affirms two distinct claims and no earned meeting. Nothing may be read as a cause that joins them.`;
    limits.push("Distance is the meaning. It is not a pause before agreement.");
    limits.push("Neither claim is erased by the other's presence.");
    forbidden.push("Any contact, bridge, handshake, cable, shared handle, or causal joining.");
  } else if (contacts === 1 || narrow) {
    governing = `${name} affirms one narrow meeting only. The meeting is specific, revisable, and smaller than either claim. It is not agreement about everything.`;
    limits.push("The meeting does not decide the rest of either claim.");
    limits.push("Neither claim is retired because the other was present.");
    limits.push("The meeting can be revised. It is not a permanent union.");
    forbidden.push("A handshake, embrace, or merger presented as settled total reconciliation.");
    forbidden.push("A second meeting, including contact at the feet, along an edge, or through a bar.");
  } else {
    governing = `${name} affirms exactly ${contacts} consequential contacts. No additional contact is authorized.`;
    limits.push("Do not smear separate contacts into one, and do not add another.");
    forbidden.push("Any contact beyond the authorized count.");
  }
  if (topo.downwardReturn) {
    limits.push("A downward return stays inside this same event. It is not a new story.");
    forbidden.push("Dropping the return, or drawing the return as a second meeting.");
  } else {
    limits.push("No return was recorded. Do not invent one.");
    forbidden.push("An invented return.");
  }
  forbidden.push("Depicting the shadow's failure as an established fact.");
  forbidden.push("Extra consequential participants.");
  forbidden.push("Readable text, letters, numbers, or logos.");
  forbidden.push("Using higher freedom to add actors, joins, or events.");
  if (styleId !== "witnessed_dance") forbidden.push("A human figure posed as a path.");
  const uprightTruths = contacts === 0
    ? ["Both claims remain knowable.", "The interval stays empty.", "Scenery may be shared only if it does not become a bridge."]
    : ["One bounded point of acknowledgement.", "The claims stay larger than the meeting.", "What was not agreed stays visibly unresolved."];
  if (topo.downwardReturn) uprightTruths.push("The same event turns or descends once.");
  const shadow = clip(meaning?.shadow, 900);
  return {
    artBriefVersion: ART_BRIEF_VERSION,
    cardIdentity: {
      name,
      core: clip(meaning?.core, 1400),
      upright: clip(meaning?.upright, 2200),
      shadow,
      keywords: (Array.isArray(meaning?.keywords) ? meaning.keywords : []).slice(0, 8),
      meaningRevision: meaning?.meaningRevision || "stored",
    },
    governingEvent: governing,
    semanticActors: roots <= 1
      ? "One consequential force. Not a pair of people."
      : "Two consequential forces. They are not automatically two people, two tubes, or two pillars.",
    establishedRelationships: {
      roots,
      consequentialContacts: contacts,
      joinSegments: Number(topo.joins || 0),
      downwardReturn: Boolean(topo.downwardReturn),
      outcome: topo.outcome || geometry?.outcome || "unresolved",
    },
    limitsOfClaim: limits,
    uprightVisualTruths: uprightTruths,
    shadowAsCounterreading: `Counterreading only. This has not been established as fact. ${shadow}`,
    permissibleMetaphors: [STYLE_MATERIAL[styleId] || "Use only a registered scene language."],
    forbiddenImplications: forbidden,
    styleIdentity: styleId || null,
    freedom: Number.isFinite(Number(freedom)) ? Number(freedom) : null,
    sourceGeometryHash: geometry?.hash || null,
    sceneGraphHash: geometry?.hash || null,
    meaningFingerprint: meaningFingerprint(meaning),
    depictsShadowAsFact: false,
  };
}

export function artMeaningToPrompt(art, budget = 5200) {
  const required = [
    `Governing event: ${art.governingEvent}`,
    `Semantic actors: ${art.semanticActors}`,
    `Established relationships: ${art.establishedRelationships.roots} roots, ${art.establishedRelationships.consequentialContacts} consequential contacts, ${art.establishedRelationships.joinSegments} join segments, downward return ${art.establishedRelationships.downwardReturn ? "yes" : "no"}, outcome ${art.establishedRelationships.outcome}. Raster overlap is not a join.`,
    `Limits of the claim: ${art.limitsOfClaim.join(" ")}`,
    `Upright visual truths: ${art.uprightVisualTruths.join(" ")}`,
    `Shadow as counterreading, not a fact to illustrate: ${art.shadowAsCounterreading}`,
    `Forbidden implications: ${art.forbiddenImplications.join(" ")}`,
    "Do not illustrate the shadow's negative outcome as having occurred.",
    `Style identity, kept at every freedom including 100: ${art.permissibleMetaphors.join(" ")}`,
    art.freedom == null ? "" : `Interpretive freedom ${art.freedom} of 100 changes resemblance to the score only. It does not change the governing event.`,
  ].filter(Boolean);
  const fields = [
    "card_identity",
    "governing_event",
    "semantic_actors",
    "established_relationships",
    "limits_of_claim",
    "upright_visual_truths",
    "shadow_as_counterreading",
    "permissible_metaphors",
    "forbidden_implications",
    "style_identity",
    "freedom",
    "source_geometry_hash",
  ];
  let condensed = false;
  let upright = art.cardIdentity.upright;
  let core = art.cardIdentity.core;
  let shadow = art.shadowAsCounterreading;
  const assemble = () => [
    ...required.slice(0, 5),
    `Shadow as counterreading, not a fact to illustrate: ${shadow}`,
    ...required.slice(6),
    `Core: ${core}`,
    `Upright: ${upright}`,
    art.cardIdentity.keywords.length ? `Keywords: ${art.cardIdentity.keywords.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  let text = assemble();
  if (text.length > budget) {
    condensed = true;
    upright = clip(art.cardIdentity.upright, 700);
    core = clip(art.cardIdentity.core, 500);
    text = assemble();
  }
  if (text.length > budget) {
    shadow = clip(art.shadowAsCounterreading, 420);
    text = assemble();
  }
  return {
    text,
    condensed,
    fields,
    dropped: condensed ? ["keyword detail may be shortened", "upright body condensed after the limits"] : [],
    kept: ["governing_event", "limits_of_claim", "forbidden_implications", "shadow_warning", "style_identity"],
  };
}
