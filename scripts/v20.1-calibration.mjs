// v20.1 — four staged experiments for one stored card. Not approved. Not written to the database.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { compileEncounterPair, openCanon, renderGeometry } from "../velomere-crystal/engine/encounter-v17.mjs";
import { IMAGE_ENDPOINT, IMAGE_MODEL, IMAGE_PROVIDER } from "../src/lib/encounters/companion-art.mjs";

const DIR = "/workspace/screenshots/v20.1";
const EXPECTED_HASH = "f8c6cca1bc79433ca6adabfad2da6e44f6406953d2d244c4282f4813735c1cdb";
const EXPECTED_PNG = "1995f77e0b37d2476101517b7a7478e078d4571e8e82143e84dd8f37d11dadb4";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function find(sources, name) {
  const card = sources.canon.find((row) => row.name === name);
  if (!card) throw new Error(`Missing ${name}`);
  return card;
}

function span(points) {
  return {
    n: points.length,
    start: points[0],
    end: points[points.length - 1],
    xMin: Math.min(...points.map((p) => p.x)),
    xMax: Math.max(...points.map((p) => p.x)),
    yMin: Math.min(...points.map((p) => p.y)),
    yMax: Math.max(...points.map((p) => p.y)),
  };
}

function downwardRun(points) {
  let best = 0;
  let at = null;
  for (let i = 1; i < points.length; i += 1) {
    const dy = points[i].y - points[i - 1].y;
    if (dy > best) {
      best = dy;
      at = { t: points[i].t, y: points[i].y, dy: Math.round(dy * 100) / 100 };
    }
  }
  return { best: Math.round(best * 100) / 100, at };
}

const SCORE = `
TOPOLOGICAL INVARIANTS — these are facts, not suggestions:
- Two distinct roots. Left is the wider, restless one (The Shuffle). Right is the narrower one (Two of Returns). They are not one body.
- They meet ONLY above, in one earned confluence: the left root and the right root each reach the same upper point, and one short shared stem continues upward from that point. That is three segments of ONE meeting, not three meetings along the length.
- Recorded noncontact crossings: zero. The middle is a void. Paths do not cross. A glow, reflection, caustic, waterline, root, or shadow that reads as a middle touch is a false join. Remove it.
- Four short support excursions leave a parent and rejoin THAT SAME parent. They are not bridges to the other root.
- The two foundations stay apart at the bottom. Separation is not opposition and not a second story.
- A downward return exists on the narrower right root: a local dip while the reading still advances from bottom toward the upper meeting. It is not a fall, and it is not a new path.
- Outcome: earned confluence on one narrow shared term. The meeting is smaller than either source. Do not inflate it into agreement about everything.

SPATIAL TENDENCIES — keep these recognizable without copying contours:
- Left root wanders across a wide horizontal range. Right root stays narrow.
- The only contact is high in the frame. The void between the two bodies is the largest fact in the middle and at the bottom.
- Rounded stroke-caps in the reference are the score painter's line endings, not objects you must copy.

OPTIONAL — material and camera are free inside the style, so long as the invariants survive.
`.trim();

function promptFor(id, meaning) {
  const shared = [
    "Create an original companion artwork for one Velomere card. Portrait, full-bleed, no border.",
    "The attached image is the ORIGINAL GEOMETRIC BASE: a visual score, not a picture of objects.",
    "Do not trace, extrude, emboss, recolor, or sculpt those strokes. Do not return glass rods, ice trenches, crystal sticks, glowing tubes, or a shoreline shaped like the input.",
    "Path count is not a count of objects. Fidelity is relational: what meets, what does not, where the void is, and which side carries the return.",
    SCORE,
    `Card name, never lettered into the image: ${meaning.name}.`,
    `Core: ${meaning.core}`,
    `Upright: ${meaning.upright}`,
    `Shadow: ${meaning.shadow}`,
    "Keep the upper meeting, the two separated lower ends, and the void between them inside the central four-fifths so nothing essential sits on the edge.",
    "No written text, letters, numbers, watermarks, logos, or card frames.",
  ];
  const directions = {
    P1: [
      "STYLE: Prismatic Geometry, SCORE-LEGIBLE.",
      "Build an inhabited optical event-space, not a showroom of two glass tubes.",
      "Let transparent architectural planes, volumes, facets, and caustics carry the score.",
      "Give the left presence a broad, uneasy optical identity and the right a narrower one, with one physically intelligible downward recurve of light.",
      "The only semantic contact is the single overhead confluence: two approaches into one short shared stem of light or glass. Nothing bridges them lower down.",
      "A viewer should still be able to point to the upper meeting, the open middle, and the two separate foundations without the original outlines being copied.",
    ],
    P2: [
      "STYLE: Prismatic Geometry, SCENE-FIRST.",
      "First conceive a complete place: two different chambers of air and glass that are allowed to share only one narrow overhead aperture. Below that aperture they remain separate rooms. The meeting is specific and smaller than either chamber.",
      "Then reconcile that place with the reference relations above. You may depart sharply from the line shapes.",
      "Do not invent a second aperture, a bridge of caustics, or a fused crystal monument. Optical distortions must stay physically intelligible.",
      "This must not be the same picture as a diagram of the strokes, and it must not be a recolor of a score-legible twin.",
    ],
    L1: [
      "STYLE: Living Matter, SCORE-LEGIBLE.",
      "Build a real ecological or geological encounter, not one shoreline and not trenches dug in the shape of the strokes.",
      "Left: a wider, restless material body (weathered stone, braided sediment, or bark) that wanders. Right: a narrower cycle (water, root, or ice) with one downward recurve that continues.",
      "They share matter ONLY at the top: one confluence, such as two streams entering one short fall, or two living bodies entering one short shared trunk. Four minor spurs may leave and return to their own body.",
      "The foundations stay apart. The void between them is open ground, air, or still water that does not touch both as a continuous seam.",
      "A continuous waterline against one wall is a false join. Do not use it.",
    ],
    L2: [
      "STYLE: Living Matter, SCENE-FIRST.",
      "First conceive an independent natural process about a narrow, revisable meeting: doubt kept in play, return kept in play, and everything else left outside the meeting.",
      "Then reconcile it with the topology: two asymmetrical presences, one upper confluence, zero middle crossings, separated foundations, one downward return on the narrower presence.",
      "The picture may radically leave the line shapes. It may not invent a middle union or erase the upper meeting or the separated foundations.",
      "Choose materials this card earns. Do not default to a canyon, a single ice shelf, or a pair of ditches.",
    ],
  };
  return [...shared, ...directions[id]].join("\n");
}

async function jpegForModel(png) {
  return sharp(png).resize({ width: 768, height: 1262, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}

async function framePreserve(bytes) {
  const meta = await sharp(bytes).rotate().metadata();
  const fitted = await sharp(bytes).rotate().resize(1400, 2300, { fit: "inside" }).toBuffer();
  const fittedMeta = await sharp(fitted).metadata();
  const padX = 1400 - fittedMeta.width;
  const padY = 2300 - fittedMeta.height;
  const left = Math.floor(padX / 2);
  const right = padX - left;
  const top = Math.floor(padY / 2);
  const bottom = padY - top;
  const blurred = await sharp(bytes).rotate().resize(1400, 2300, { fit: "cover", position: "centre" }).blur(48).modulate({ brightness: 0.85 }).toBuffer();
  const png = await sharp(blurred)
    .composite([{ input: fitted, left, top }])
    .removeAlpha()
    .png({ compressionLevel: 6 })
    .toBuffer();
  return {
    png,
    framing: {
      mode: padX === 0 && padY === 0 ? "exact-resize" : "contain-on-blurred-extension",
      srcW: meta.width,
      srcH: meta.height,
      pad: { top, bottom, left, right },
      stretched: false,
      cropped: false,
    },
  };
}

async function editOnce(prompt, image, key) {
  const attempts = [
    { aspect_ratio: "2:3", resolution: "2k" },
    { aspect_ratio: "2:3", resolution: "1k" },
    { aspect_ratio: "9:16", resolution: "2k" },
  ];
  let last = "Image generation unavailable.";
  for (const extra of attempts) {
    const started = Date.now();
    const response = await fetch(IMAGE_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        image,
        n: 1,
        response_format: "b64_json",
        ...extra,
      }),
      signal: AbortSignal.timeout(90000),
    });
    const latencyMs = Date.now() - started;
    const text = await response.text();
    if (!response.ok) {
      last = `HTTP ${response.status}`;
      process.stdout.write(`attempt ${extra.aspect_ratio} ${extra.resolution} -> ${response.status}\n`);
      if (response.status !== 400 && response.status !== 422) break;
      continue;
    }
    const parsed = JSON.parse(text);
    const first = parsed?.data?.[0] || {};
    if (typeof first.b64_json !== "string") throw new Error("No b64_json");
    const raw = Buffer.from(first.b64_json, "base64");
    return { raw, latencyMs, extra, requestId: String(parsed.id || parsed.request_id || first.id || "") };
  }
  throw new Error(last);
}

async function diagnostic(geometry) {
  const W = 700;
  const H = 1150;
  const sx = (x) => (x / 1400) * W;
  const sy = (y) => (y / 2300) * H;
  const poly = (points, color, width) => {
    const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  };
  const dots = geometry.joins.flatMap((join) => join.points.map((p) =>
    `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="5" fill="#e7c27a"/>`));
  const labels = [
    `<text x="24" y="36" fill="#f3ead7" font-size="18" font-family="sans-serif">DIAGNOSTIC — not artwork</text>`,
    `<text x="24" y="62" fill="#c8bba6" font-size="13" font-family="sans-serif">Narrow Mirror · 3 upper joins · 0 crossings · bottoms apart</text>`,
    `<text x="${sx(500)}" y="${sy(1500)}" fill="#9fd0c3" font-size="13" font-family="sans-serif">left root · wide</text>`,
    `<text x="${sx(940)}" y="${sy(1600)}" fill="#e7b089" font-size="13" font-family="sans-serif">right root · narrow</text>`,
    `<text x="${sx(620)}" y="${sy(90)}" fill="#e7c27a" font-size="13" font-family="sans-serif">one upper confluence</text>`,
    `<text x="${sx(620)}" y="${sy(1180)}" fill="#d7d0c4" font-size="13" font-family="sans-serif">void · no join</text>`,
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#14110e"/>
    ${geometry.roots.map((root, i) => poly(root.points, i ? "#e7b089" : "#9fd0c3", 3)).join("")}
    ${geometry.branches.map((branch) => poly(branch.points, "#6e87a8", 1.5)).join("")}
    ${geometry.joins.map((join) => poly(join.points, "#e7c27a", 3)).join("")}
    ${dots.join("")}
    ${labels.join("")}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${DIR}/diagnostic-score.png`);
}

const key = process.env.XAI_API_KEY;
if (!key) throw new Error("No image key");

const sources = await openCanon();
const compiled = await compileEncounterPair(
  { kind: "canonical_draw", canonicalIndex: find(sources, "The Shuffle").index, orientation: "upright" },
  { kind: "canonical_draw", canonicalIndex: find(sources, "Two of Returns").index, orientation: "upright" },
  "2026-11-14",
);
if (compiled.geometry.hash !== EXPECTED_HASH) throw new Error(`hash ${compiled.geometry.hash}`);
const paint = await renderGeometry(compiled.geometry, "veiled_luminescence");
if (paint.sha256 !== EXPECTED_PNG) throw new Error(`png ${paint.sha256}`);
await mkdir(DIR, { recursive: true });
await writeFile(`${DIR}/geometry.png`, paint.png);
await diagnostic(compiled.geometry);

const host = compiled.geometry.roots.find((root) => root.id === "host");
const guest = compiled.geometry.roots.find((root) => root.id === "guest");
const audit = {
  identifiedAs: "Narrow Mirror",
  identification: "Prompt description matched this stored geometry. No separate image file was attached to byte-match. Unjoined Release (b4ea8994846c) does not match.",
  parents: compiled.parents,
  sceneHash: compiled.geometry.hash,
  geometrySha256: paint.sha256,
  outcome: compiled.geometry.outcome,
  term: compiled.geometry.term,
  relation: compiled.geometry.relation,
  joins: compiled.geometry.joins.length,
  roots: compiled.geometry.roots.length,
  branches: compiled.geometry.branches.length,
  crossings: compiled.geometry.crossings,
  regression: compiled.geometry.regression,
  downward: { host: downwardRun(host.points), guest: downwardRun(guest.points) },
  xGap: Math.round((span(guest.points).xMin - span(host.points).xMax) * 10) / 10,
  meaning: {
    name: compiled.meaning.name,
    core: compiled.meaning.core,
    upright: compiled.meaning.upright,
    shadow: compiled.meaning.shadow,
  },
};
await writeFile(`${DIR}/audit.json`, JSON.stringify(audit, null, 2));
console.log(JSON.stringify({ hash: audit.sceneHash, png: audit.geometrySha256, xGap: audit.xGap, downward: audit.downward }));

const sent = await jpegForModel(paint.png);
const image = { url: `data:image/jpeg;base64,${sent.toString("base64")}`, type: "image_url" };
const sentSha = sha256(sent);
const experiments = ["P1", "P2", "L1", "L2"];
const results = [];
for (const id of experiments) {
  const prompt = promptFor(id, compiled.meaning);
  await writeFile(`${DIR}/prompt-${id}.txt`, prompt);
  process.stdout.write(`generating ${id}\n`);
  const edited = await editOnce(prompt, image, key);
  const framed = await framePreserve(edited.raw);
  const file = `${DIR}/candidate-${id}.png`;
  await writeFile(file, framed.png);
  const row = {
    id,
    styleId: id.startsWith("P") ? "prismatic_geometry" : "living_matter",
    mode: id.endsWith("1") ? "score-legible" : "scene-first",
    file,
    sha256: sha256(framed.png),
    distinctFromGeometry: sha256(framed.png) !== paint.sha256,
    provider: IMAGE_PROVIDER,
    model: IMAGE_MODEL,
    endpoint: IMAGE_ENDPOINT,
    promptVersion: "v20.1",
    inputType: "image_url",
    sourcePngSha256: paint.sha256,
    sentSha256: sentSha,
    latencyMs: edited.latencyMs,
    requestId: edited.requestId,
    aspectRatio: edited.extra.aspect_ratio,
    resolution: edited.extra.resolution,
    framing: framed.framing,
    staged: true,
    approved: false,
    writtenToDatabase: false,
  };
  results.push(row);
  await writeFile(`${DIR}/proof.json`, JSON.stringify({ audit, results }, null, 2));
  process.stdout.write(`${id} ${row.sha256.slice(0, 12)} ${row.latencyMs}ms ${row.aspectRatio} ${row.resolution} pad ${JSON.stringify(row.framing.pad)}\n`);
}
console.log("done", results.length);
