// @ts-nocheck
// Image-conditioned companion art. The geometric PNG is an input, not a texture to redraw.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { clampFreedom, fidelityInstruction, freedomBand, freedomDescription, referenceConditioning } from "./interpretive-freedom.mjs";
import { buildScenePlan, planToPrompt } from "./scene-plan.mjs";
import { artMeaningToPrompt, buildArtMeaning } from "./art-meaning.mjs";
import { CODEX_STYLE_ID, codexPromptAddendum, compileCodexManifest, renderCodexOverlay } from "./codex-glyphs.mjs";

export const PROMPT_VERSION = "v20.4";
export const IMAGE_PROVIDER = "xai";
export const IMAGE_MODEL = "grok-imagine-image-2.0";
export const IMAGE_ENDPOINT = "https://api.x.ai/v1/images/edits";
export const IMAGE_GENERATIONS = "https://api.x.ai/v1/images/generations";
export const CARD_W = 1400;
export const CARD_H = 2300;

const STYLE_DIRECTION = {
  veiled_luminescence:
    "Veiled Luminescence. Ask what is visible and what is still inaccessible. Build a place where light, haze, water, dust, glare, or occlusion changes what can be known. Light is a participant, not a glow painted on a diagram. Do not default to a canyon, a luminous river, navy fog, or two glowing strokes. A near-empty field is allowed when the card is quiet.",
  living_matter:
    "Living Matter. Let growth, decay, erosion, flow, or weather carry the relation. Choose a scale this card earns: salt, bark, ice, tide, mycelium, stone, or an open ecological quiet. Do not default to a trench of water, a generic forest, or roots skinned onto the score lines. Matter should show a history.",
  forged_relief:
    "Forged Relief. Record the relation as making, pressure, fracture, repair, or excavation: ceramic, metal, stone, or a built structure with real thickness and cast shadow. Do not default to twin grooves, an embossed copy of the strokes, or a temple plaque. Contemporary fabrication is allowed.",
  prismatic_geometry:
    "Prismatic Geometry. Disclose the relation through refraction, reflection, and separated optical planes: glass, crystal, water, or a light well with plausible caustics. A projected overlap that is not a join must stay unjoined. Do not default to paired crystal rods under one spotlight, rainbow ribbons, or glass tubes.",
  cyber_matrix:
    "Cyber Matrix. Treat the encounter as information under constraint: architectures of signal, memory, access, and failure, at a scale this card earns. Connection is a real link; a gap is a blocked or incomplete transmission. No green code rain, no readable text, no copied film costumes or logos, no glowing pipes, and no cable between systems the score leaves unjoined.",
  witnessed_dance:
    "Witnessed Dance. Embody the encounter as choreography: one mover, a group, an absent partner, or a trace in dust, cloth, or light — only as the score justifies. Weight and gravity must be credible. Do not pose bodies into the score lines. Do not add touch, romance, or a second dancer unless the graph authorizes that contact. Zero joins means a visible interval, not a held hand.",
  velomere_codex_becoming_v1:
    "Codex of Becoming. Paint an original plate of dark enamel, hammered metal, and translucent mineral, full-bleed. Empty dark is allowed. Not Veiled Luminescence: no fog, no stone pier, no arch, no daylight. Not a historical occult deck. Do not draw any letter, word, numeral, question mark, eye, arrow, Hebrew, zodiac, planet, pentagram, or linked rings. Do not paint the authoritative marks; they are added later as engraving. A bridge exists only when a join is authorized. Do not default to a robed figure.",
};

const SCENE_OPTIONS = {
  veiled_luminescence: [
    "a high interior where one opening of glare withholds the far room",
    "a shallow sea shelf whose clarity changes with depth, not a canyon",
    "a dust-lit workshop in daylight, most of the work still covered",
  ],
  living_matter: [
    "a salt crust splitting under one ongoing dry wind",
    "two stands of different growth that share weather but not tissue",
    "an ice margin and open water whose exchanges happen only where contact is earned",
  ],
  forged_relief: [
    "a single cut taken out of a large cast form in a working shop",
    "two structures with separate tool histories and a void between them",
    "a repair history: discrete joins, then a return of the same material downward",
  ],
  prismatic_geometry: [
    "one refractive boundary in a bright, otherwise spare chamber",
    "two glass volumes in different rooms of air, near in the picture, unjoined in fact",
    "three optical alignments and a bent return of the same light, not one twisted rod",
  ],
  cyber_matrix: [
    "one quiet address in a pale machine hall, the rest of the lattice dark and unused",
    "two coherent systems on opposite sides of an unbridged gap, no handshake",
    "three completed exchanges and a signal that comes back lower than it left",
  ],
  witnessed_dance: [
    "one dancer, or only the trace of one gesture, on a bare floor",
    "two movers who approach and stop, the space between them larger than either body",
    "a sequence of three contacts and a descent that repeats, altered, toward the floor",
  ],
  velomere_codex_becoming_v1: [
    "one codex plate: either a single held pause in a wide unscribed dark, or one archetype whose internal centers stay distinct and unfused",
    "two separate structures in a manuscript darkness, with a real interval and no bridge between them",
    "a narrow illuminated meeting inside a larger unresolved manuscript, smaller than either side, with no handshake and no total fusion",
  ],
};

function sceneIndex(topo) {
  if (topo.joins > 0 || topo.downwardReturn) return 2;
  if (topo.roots <= 1) return 0;
  return 1;
}

export function buildSceneBrief({ meaning, geometry, styleId, freedom }) {
  const topo = topologyOf(geometry);
  const options = SCENE_OPTIONS[styleId];
  if (!options) throw new Error("Choose a registered style. Custom prompts are not part of this release.");
  const level = clampFreedom(freedom);
  const band = freedomBand(level);
  const fidelity = fidelityInstruction(level, topo);
  const scenePlan = buildScenePlan({ meaning, geometry, styleId, freedom: level });
  const artMeaning = buildArtMeaning({ meaning, geometry, styleId, freedom: level, topology: scenePlan.topology });
  const compiled = artMeaningToPrompt(artMeaning);
  artMeaning.promptText = compiled.text;
  scenePlan.artMeaning = artMeaning;
  const sceneProposal = scenePlan.metaphor;
  const mappings = [
    {
      fact: `${topo.roots} distinct root${topo.roots === 1 ? "" : "s"}`,
      visualEvidence: topo.roots <= 1
        ? "Exactly one presence, process, or exposure. The rest of the picture may be empty. Do not invent a partner, a second monument, or a second system."
        : "Distinct presences or fields that do not become one body. They need not match in shape.",
      avoid: topo.roots <= 1 ? "A second event added to fill the frame." : "Merging both roots into one body.",
    },
    {
      fact: `${topo.joins} authorized join${topo.joins === 1 ? "" : "s"}`,
      visualEvidence: topo.joins === 0
        ? "A real interval: distance, refusal, occlusion, or an unfinished approach. No union."
        : `${topo.joins} separate, legible contacts or exchanges, not one smeared meeting.`,
      avoid: topo.joins === 0 ? "Touch, a bridge, a handshake, a fused form, or bloom that joins them." : "Dropping a contact or adding another.",
    },
  ];
  if (topo.downwardReturn) {
    mappings.push({
      fact: "The score contains a downward return.",
      visualEvidence: "A descent, recurrence, or turn back inside the same event.",
      avoid: "Replacing the return with a new story, or drawing it as a line.",
    });
  }
  return {
    promptVersion: PROMPT_VERSION,
    styleId,
    interpretiveFreedom: level,
    freedomBand: band.id,
    freedomLabel: band.label,
    fidelity,
    scenePlan,
    artMeaning,
    promptAudit: {
      artBriefVersion: artMeaning.artBriefVersion,
      promptVersion: PROMPT_VERSION,
      fields: compiled.fields,
      condensed: compiled.condensed,
      kept: compiled.kept,
      meaningFingerprint: artMeaning.meaningFingerprint,
      sourceGeometryHash: artMeaning.sourceGeometryHash,
      conversationalContent: "redacted",
    },
    sceneProposal,
    alternate: "No second concept. A conflicting scene would invent an event.",
    scoreFacts: topo,
    mappings,
    forbidden: topo.joins === 0
      ? ["any visual or causal union", "readable text"]
      : ["extra contacts beyond the authorized joins", "readable text"],
  };
}

export function topologyOf(geometry) {
  const joins = Array.isArray(geometry?.joins) ? geometry.joins.length : 0;
  const roots = Array.isArray(geometry?.roots) ? geometry.roots.length : 0;
  const regression = Number(geometry?.regression || 0);
  return {
    joins,
    roots,
    crossings: Number(geometry?.crossings || 0),
    regression,
    downwardReturn: regression > 1,
    outcome: geometry?.outcome || "unresolved",
    quiet: Boolean(geometry?.quiet),
  };
}

export function buildCompanionPrompt({ meaning, geometry, styleId, freedom }) {
  const brief = buildSceneBrief({ meaning, geometry, styleId, freedom });
  const direction = STYLE_DIRECTION[styleId];
  const topo = brief.scoreFacts;
  const fidelity = brief.fidelity;
  const name = String(meaning?.name || "Untitled").slice(0, 80);
  const evidence = brief.mappings
    .map((row) => `${row.fact}: show it as ${row.visualEvidence} Avoid: ${row.avoid}`)
    .join(" ");
  const contour = fidelity.level >= 38
    ? "Do not draw more beautiful tubes, cliffs, rods, trenches, code pipes, or dancers posed as lines."
    : "Follow the visible contours. A recognizable silhouette is required at this setting.";
  return [
    "Create an original, fully composed companion artwork for a Velomere card.",
    "The attached image is its ORIGINAL GEOMETRIC BASE and is the image input at every freedom setting.",
    fidelity.lead,
    fidelity.sceneWeight,
    contour,
    "Path count is not a count of people, buildings, or objects. One path may be a movement, a territory, a light, or an absence.",
    fidelity.invariants,
    `Interpretive freedom ${fidelity.level} of 100 (${fidelity.label}). The image API has no reference-strength control. Freedom changes the scene plan, not a blur on the source.`,
    planToPrompt(brief.scenePlan, brief.scenePlan.generationMode === "geometry-edit" ? "geometry" : "scene"),
    `Card name (do not letter it into the image): ${name}.`,
    `Topology: joins ${topo.joins}; distinct roots ${topo.roots}; noncontact crossings ${topo.crossings}; downward return ${topo.downwardReturn ? "yes" : "no"}; outcome ${topo.outcome}; quiet ${topo.quiet ? "yes" : "no"}.`,
    `Scene note: ${brief.sceneProposal}`,
    `Another lawful scene, not used, so this one is not the only option: ${brief.alternate}`,
    `Visual evidence: ${evidence}`,
    `Art direction: ${direction}`,
    styleId === CODEX_STYLE_ID ? codexPromptAddendum(compileCodexManifest({ meaning, geometry, freedom: brief.interpretiveFreedom })) : "",
    "Keep every essential relation inside the central four-fifths of the frame. Portrait, no border, no caption.",
    "Forbidden: written text, letters, numbers, watermarks, logos, card UI, and any extra semantic event.",
  ].filter(Boolean).join("\n");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function prepareReference(png, freedom) {
  const conditioning = referenceConditioning(freedom);
  let pipeline = sharp(png).resize({ width: 768, height: 1262, fit: "inside", withoutEnlargement: true });
  if (conditioning.blur > 0) pipeline = pipeline.blur(conditioning.blur);
  if (conditioning.saturation < 0.999) pipeline = pipeline.modulate({ saturation: conditioning.saturation });
  const jpeg = await pipeline.jpeg({ quality: conditioning.blur === 0 ? 92 : 82 }).toBuffer();
  return { jpeg, conditioning, sha256: sha256(jpeg) };
}

export async function frameCard(bytes) {
  return sharp(bytes)
    .rotate()
    .resize(CARD_W, CARD_H, { fit: "cover", position: "centre" })
    .removeAlpha()
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function postJson(url, body, key) {
  const started = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const latencyMs = Date.now() - started;
  const text = await response.text();
  return { response, latencyMs, text };
}

function dataUri(jpeg) {
  return { url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, type: "image_url" };
}

async function imageBytes(parsed) {
  const first = parsed?.data?.[0] || {};
  if (typeof first.b64_json === "string" && first.b64_json.length > 32) return Buffer.from(first.b64_json, "base64");
  if (typeof first.url === "string") {
    const fetched = await fetch(first.url, { signal: AbortSignal.timeout(30000) });
    if (!fetched.ok) throw new Error("Image generation returned a link that could not be saved. Nothing was approved.");
    return Buffer.from(await fetched.arrayBuffer());
  }
  return null;
}

const ATTEMPTS = [
  { aspect_ratio: "9:16", resolution: "2k" },
  { aspect_ratio: "2:3", resolution: "1k" },
];

async function requestImage(url, body, key) {
  let lastError = "Image generation unavailable.";
  for (const extra of ATTEMPTS) {
    const { response, latencyMs, text } = await postJson(url, { ...body, ...extra }, key);
    if (!response.ok) {
      lastError = `Image generation unavailable (HTTP ${response.status}). The original geometry was left as it is.`;
      if (response.status !== 400 && response.status !== 422) break;
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Image generation returned an unreadable body. Nothing was saved as approved art.");
    }
    const raw = await imageBytes(parsed);
    if (!raw || raw.length < 32) throw new Error("Image generation returned no image bytes. Nothing was approved.");
    return {
      raw,
      latencyMs,
      aspectRatio: extra.aspect_ratio,
      resolution: extra.resolution,
      requestId: String(parsed.id || parsed.request_id || parsed?.data?.[0]?.id || ""),
    };
  }
  throw new Error(lastError);
}

export async function generateCompanion({ geometryPng, meaning, geometry, styleId, freedom, revisionNote }) {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    throw new Error("Image generation unavailable — the server has no image key. The original geometry was left as it is.");
  }
  const level = clampFreedom(freedom);
  const brief = buildSceneBrief({ meaning, geometry, styleId, freedom: level });
  const plan = brief.scenePlan;
  const prepared = await prepareReference(geometryPng, level);
  const sourcePngSha256 = sha256(geometryPng);
  const geometryImage = dataUri(prepared.jpeg);
  let stage = plan.generationMode;
  let latencyMs = 0;
  let requestId = "";
  let aspectRatio = "";
  let resolution = "";
  let raw = null;
  let sentSha256 = prepared.sha256;
  let inputType = "image_url";
  if (plan.generationMode === "geometry-edit") {
    const prompt = `${buildCompanionPrompt({ meaning, geometry, styleId, freedom: level })}${revisionNote ? `\nTargeted revision: ${revisionNote}` : ""}`;
    const shot = await requestImage(IMAGE_ENDPOINT, {
      model: IMAGE_MODEL,
      prompt,
      image: geometryImage,
      n: 1,
      response_format: "b64_json",
    }, key);
    raw = shot.raw;
    latencyMs = shot.latencyMs;
    requestId = shot.requestId;
    aspectRatio = shot.aspectRatio;
    resolution = shot.resolution;
  } else {
    const guard = styleId === CODEX_STYLE_ID
      ? `\n${codexPromptAddendum(compileCodexManifest({ meaning, geometry, freedom: level }))}`
      : "";
    const scenePrompt = `${planToPrompt(plan, "scene")}${guard}${revisionNote ? `\nTargeted revision: ${revisionNote}` : ""}`;
    const proposed = await requestImage(IMAGE_GENERATIONS, {
      model: IMAGE_MODEL,
      prompt: scenePrompt,
      n: 1,
      response_format: "b64_json",
    }, key);
    latencyMs += proposed.latencyMs;
    const sceneJpeg = await sharp(proposed.raw).resize({ width: 768, height: 1262, fit: "inside" }).jpeg({ quality: 86 }).toBuffer();
    const reconcilePrompt = `${planToPrompt(plan, "reconcile")}${guard}\nDo not approve yourself. Keep the event identical to the plan.${revisionNote ? `\nTargeted revision: ${revisionNote}` : ""}`;
    try {
      const shot = await requestImage(IMAGE_ENDPOINT, {
        model: IMAGE_MODEL,
        prompt: reconcilePrompt,
        images: [dataUri(sceneJpeg), geometryImage],
        n: 1,
        response_format: "b64_json",
      }, key);
      raw = shot.raw;
      latencyMs += shot.latencyMs;
      requestId = shot.requestId || proposed.requestId;
      aspectRatio = shot.aspectRatio;
      resolution = shot.resolution;
      inputType = "images";
      sentSha256 = sha256(Buffer.concat([sceneJpeg, prepared.jpeg]));
      stage = "scene-first-then-reconcile";
    } catch (err) {
      raw = proposed.raw;
      requestId = proposed.requestId;
      aspectRatio = proposed.aspectRatio;
      resolution = proposed.resolution;
      inputType = "scene-first-unreconciled";
      stage = "scene-first-unreconciled";
      sentSha256 = sha256(sceneJpeg);
      brief.reconcileError = err instanceof Error ? err.message : "Reconciliation failed.";
    }
  }
  const png = await frameCard(raw);
  let sealed = png;
  let symbolManifest = null;
  let overlaySvg = null;
  if (styleId === CODEX_STYLE_ID) {
    symbolManifest = compileCodexManifest({ meaning, geometry, freedom: level });
    overlaySvg = renderCodexOverlay(symbolManifest);
    const layer = await sharp(Buffer.from(overlaySvg)).png().toBuffer();
    sealed = await sharp(png).composite([{ input: layer, blend: "over" }]).png({ compressionLevel: 6 }).toBuffer();
  }
  return {
    png: sealed,
    sha256: sha256(sealed),
    width: CARD_W,
    height: CARD_H,
    mime: "image/png",
    provider: IMAGE_PROVIDER,
    model: IMAGE_MODEL,
    promptVersion: PROMPT_VERSION,
    requestId,
    sourcePngSha256,
    sentSha256,
    sentMime: "image/jpeg",
    inputType,
    latencyMs,
    aspectRatio,
    resolution,
    framing: "cover-crop-center",
    sceneBrief: brief,
    scenePlan: plan,
    generationMode: stage,
    transmitted: true,
    interpretiveFreedom: level,
    freedomBand: brief.freedomBand,
    freedomLabel: freedomDescription(level).label,
    fidelityMethod: plan.generationMode,
    conditioning: prepared.conditioning,
    symbolManifest,
    overlaySvg,
    codexContactCount: symbolManifest ? symbolManifest.contact_count : null,
  };
}
