// @ts-nocheck
// Image-conditioned companion art. The geometric PNG is an input, not a texture to redraw.
import { createHash } from "node:crypto";
import sharp from "sharp";

export const PROMPT_VERSION = "v19";
export const IMAGE_PROVIDER = "xai";
export const IMAGE_MODEL = "grok-imagine-image-2.0";
export const IMAGE_ENDPOINT = "https://api.x.ai/v1/images/edits";
export const CARD_W = 1400;
export const CARD_H = 2300;

const STYLE_DIRECTION = {
  veiled_luminescence:
    "Veiled Luminescence. Visibility itself is a physical relation. Make one complete scene with tangible forms, layered depth, localized light, and real shadow. Atmosphere may conceal and reveal, but it must not erase a separation or invent a meeting. Not neon strokes, not tubes, not a diagram in fog, not a nebula.",
  living_matter:
    "Living Matter. A physical natural world — mineral, water, fiber, weather, or geology — whose forms enact this card alone. Matter should hold a history. Not a generic forest, not glowing lines, not a diagram pasted on a landscape.",
  prismatic_geometry:
    "Prismatic Geometry. Optical volumes with real thickness: glass, crystal, or water, refraction, and separated depths. A noncontact stays a gap even if shapes overlap in projection. No rainbow ribbons and no traced glass tubes.",
  forged_relief:
    "Forged Relief. A sculptural place or object: stone, metal, ceramic, or bone, with tool marks, relief, and raking light. Not a foil filter and not an engraving copied from the diagram.",
};

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

export function buildCompanionPrompt({ meaning, geometry, styleId }) {
  const topo = topologyOf(geometry);
  const direction = STYLE_DIRECTION[styleId];
  if (!direction) throw new Error("Choose one of the four styles. Custom prompts are not part of this release.");
  const name = String(meaning?.name || "Untitled").slice(0, 80);
  const core = String(meaning?.core || "").slice(0, 900);
  const upright = String(meaning?.upright || "").slice(0, 500);
  const shadow = String(meaning?.shadow || "").slice(0, 500);
  const events = (geometry?.landmarks || [])
    .map((mark) => mark?.cause)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
  return [
    "Create a completely realized companion illustration for this Velomere card.",
    "The attached image is the immutable ORIGINAL GEOMETRIC SCORE, a blueprint of spatial and causal relations.",
    "It is NOT a texture, stencil, or silhouette to trace. Do not draw more beautiful tubes, filaments, or glowing paths.",
    "Replace the strokes with a physically convincing scene: materials, landscape, architecture, or light, justified by this card.",
    "Preserve connectedness and nonconnectedness. Do not add a join. Do not erase a return. Do not invent another encounter.",
    `Card name (do not letter it into the image): ${name}.`,
    `Core: ${core}`,
    `Upright: ${upright}`,
    `Shadow: ${shadow}`,
    events ? `Events already in the score: ${events.slice(0, 500)}` : "",
    `Topology: joins ${topo.joins}; distinct roots ${topo.roots}; noncontact crossings ${topo.crossings}; downward return ${topo.downwardReturn ? "yes" : "no"}; outcome ${topo.outcome}; quiet ${topo.quiet ? "yes" : "no"}.`,
    `Art direction: ${direction}`,
    "Portrait composition, print-safe, no border, no caption.",
    "Forbidden: written text, letters, numbers, watermarks, logos, card UI, frames, tracing the reference strokes, a generic starfield, an extra meeting between separate forms.",
  ].filter(Boolean).join("\n");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function jpegForModel(png) {
  return sharp(png)
    .resize({ width: 768, height: 1262, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

export async function frameCard(bytes) {
  const meta = await sharp(bytes).metadata();
  const width = meta.width || CARD_W;
  const height = meta.height || CARD_H;
  const scale = Math.min(CARD_W / width, CARD_H / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const resized = await sharp(bytes).resize(w, h, { fit: "fill" }).removeAlpha().toBuffer();
  const pixel = await sharp(bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  const r = pixel[0] ?? 12;
  const g = pixel[1] ?? 10;
  const b = pixel[2] ?? 8;
  return sharp({
    create: { width: CARD_W, height: CARD_H, channels: 3, background: { r, g, b } },
  })
    .composite([{ input: resized, gravity: "centre" }])
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function postEdit(body, key) {
  const started = Date.now();
  const response = await fetch(IMAGE_ENDPOINT, {
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

export async function generateCompanion({ geometryPng, meaning, geometry, styleId }) {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    throw new Error("Image generation unavailable — the server has no image key. The original geometry was left as it is.");
  }
  const prompt = buildCompanionPrompt({ meaning, geometry, styleId });
  const sent = await jpegForModel(geometryPng);
  const sourcePngSha256 = sha256(geometryPng);
  const sentSha256 = sha256(sent);
  const image = { url: `data:image/jpeg;base64,${sent.toString("base64")}`, type: "image_url" };
  const attempts = [
    { aspect_ratio: "9:16", resolution: "2k" },
    { aspect_ratio: "2:3", resolution: "1k" },
  ];
  let lastError = "Image generation unavailable.";
  for (const extra of attempts) {
    const { response, latencyMs, text } = await postEdit({
      model: IMAGE_MODEL,
      prompt,
      image,
      n: 1,
      response_format: "b64_json",
      ...extra,
    }, key);
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
    const first = parsed?.data?.[0] || {};
    let raw = null;
    if (typeof first.b64_json === "string" && first.b64_json.length > 32) raw = Buffer.from(first.b64_json, "base64");
    else if (typeof first.url === "string") {
      const fetched = await fetch(first.url, { signal: AbortSignal.timeout(30000) });
      if (!fetched.ok) throw new Error("Image generation returned a link that could not be saved. Nothing was approved.");
      raw = Buffer.from(await fetched.arrayBuffer());
    }
    if (!raw || raw.length < 32) throw new Error("Image generation returned no image bytes. Nothing was approved.");
    const png = await frameCard(raw);
    return {
      png,
      sha256: sha256(png),
      width: CARD_W,
      height: CARD_H,
      mime: "image/png",
      provider: IMAGE_PROVIDER,
      model: IMAGE_MODEL,
      promptVersion: PROMPT_VERSION,
      requestId: String(parsed.id || parsed.request_id || first.id || ""),
      sourcePngSha256,
      sentSha256,
      sentMime: "image/jpeg",
      inputType: "image_url",
      latencyMs,
      aspectRatio: extra.aspect_ratio,
      resolution: extra.resolution,
      transmitted: true,
    };
  }
  throw new Error(lastError);
}
