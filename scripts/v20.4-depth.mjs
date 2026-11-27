// v20.4 measured check. Staged files only. Not approved. Not written to a deck.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { compileEncounterPair, deepenStoredMeaning, openCanon, renderGeometry } from "../velomere-crystal/engine/encounter-v17.mjs";
import { generateCompanion } from "../src/lib/encounters/companion-art.mjs";
import { buildArtMeaning } from "../src/lib/encounters/art-meaning.mjs";

const DIR = "/workspace/screenshots/v20.4";
const DATE = "2026-11-14";

function find(sources, name) {
  const card = sources.canon.find((row) => row.name === name);
  if (!card) throw new Error(`Missing ${name}`);
  return card;
}

function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function briefOf(card, styleId, freedom) {
  const art = buildArtMeaning({ meaning: card.meaning, geometry: card.geometry, styleId, freedom });
  return {
    card: card.meaning.name,
    outcome: card.outcome,
    sceneHash: card.geometry.hash,
    joins: card.geometry.joins.length,
    roots: card.geometry.roots.length,
    regression: card.geometry.regression,
    words: {
      core: words(card.meaning.core),
      upright: words(card.meaning.upright),
      shadow: words(card.meaning.shadow),
    },
    governingEvent: art.governingEvent,
    forbidden: art.forbiddenImplications,
    contacts: art.establishedRelationships.consequentialContacts,
    downwardReturn: art.establishedRelationships.downwardReturn,
    shadowRole: "counterreading",
    depictsShadowAsFact: art.depictsShadowAsFact,
    freedom,
    styleId,
  };
}

async function sheet(name, files) {
  const cellW = 240;
  const cellH = 400;
  const tiles = [];
  for (let index = 0; index < files.length; index += 1) {
    const tile = await sharp(files[index]).resize(cellW, cellH, { fit: "cover" }).png().toBuffer();
    tiles.push({ input: tile, left: index * cellW, top: 0 });
  }
  await sharp({
    create: { width: cellW * files.length, height: cellH, channels: 3, background: { r: 12, g: 10, b: 8 } },
  }).composite(tiles).png().toFile(`${DIR}/${name}`);
}

const sources = await openCanon();
await mkdir(DIR, { recursive: true });
const questionHits = [];
for (let i = 0; i < sources.canon.length; i += 1) {
  for (let j = 0; j < sources.canon.length; j += 1) {
    if (i === j) continue;
    const card = await compileEncounterPair(
      { kind: "canonical_draw", canonicalIndex: i, orientation: "upright" },
      { kind: "canonical_draw", canonicalIndex: j, orientation: "upright" },
      DATE,
    );
    if (card.meaning.name !== "Narrow Question") continue;
    questionHits.push({
      parents: card.parents,
      sceneHash: card.geometry.hash,
      joins: card.geometry.joins.length,
      roots: card.geometry.roots.length,
      outcome: card.outcome,
    });
  }
}

const vectari = find(sources, "The Vectari");
const witness = find(sources, "Witness of Sigils");
const shuffle = find(sources, "The Shuffle");
const returns = find(sources, "Two of Returns");
const unjoined = await compileEncounterPair(
  { kind: "canonical_draw", canonicalIndex: vectari.index, orientation: "upright" },
  { kind: "canonical_draw", canonicalIndex: witness.index, orientation: "upright" },
  DATE,
);
const mirror = await compileEncounterPair(
  { kind: "canonical_draw", canonicalIndex: shuffle.index, orientation: "upright" },
  { kind: "canonical_draw", canonicalIndex: returns.index, orientation: "upright" },
  DATE,
);
const storedQuestion = {
  name: "Narrow Question",
  core: "Both claims attest one narrow matter.",
  upright: "Read Narrow Question by staying inside the attested matter. The meeting is specific, revisable, and smaller than either claim that entered it.",
  shadow: "Narrow Question goes wrong when the narrow meeting is inflated into agreement about everything, or when one claim is retired because the other was also present.",
  keywords: ["question", "scope", "revision", "specificity"],
};
const proposal = deepenStoredMeaning(storedQuestion);
const jobs = [
  { id: "mirror", card: mirror, styleId: "veiled_luminescence", freedom: 0 },
  { id: "mirror", card: mirror, styleId: "veiled_luminescence", freedom: 25 },
  { id: "mirror", card: mirror, styleId: "veiled_luminescence", freedom: 50 },
  { id: "mirror", card: mirror, styleId: "veiled_luminescence", freedom: 75 },
  { id: "mirror", card: mirror, styleId: "veiled_luminescence", freedom: 100 },
  { id: "mirror", card: mirror, styleId: "living_matter", freedom: 25 },
  { id: "mirror", card: mirror, styleId: "living_matter", freedom: 50 },
  { id: "mirror", card: mirror, styleId: "living_matter", freedom: 75 },
  { id: "mirror", card: mirror, styleId: "living_matter", freedom: 100 },
  { id: "unjoined", card: unjoined, styleId: "veiled_luminescence", freedom: 100 },
];

let prior = [];
try {
  prior = JSON.parse(await readFile(`${DIR}/proof.json`, "utf8")).results || [];
} catch {
  prior = [];
}
const geometry = {};
for (const card of [mirror, unjoined]) {
  const key = card.meaning.name === unjoined.meaning.name ? "unjoined" : "mirror";
  if (geometry[key]) continue;
  const paint = await renderGeometry(card.geometry, "veiled_luminescence");
  geometry[key] = paint.png;
  await writeFile(`${DIR}/geometry-${key}.png`, paint.png);
}
const results = [];
for (const job of jobs) {
  const file = `companion-${job.id}-${job.styleId}-${job.freedom}.png`;
  const already = prior.find((row) => row.file?.endsWith(file));
  if (already) {
    results.push(already);
    process.stdout.write(`keep ${file}\n`);
    continue;
  }
  process.stdout.write(`generating ${file}\n`);
  const companion = await generateCompanion({
    geometryPng: geometry[job.id],
    meaning: job.card.meaning,
    geometry: job.card.geometry,
    styleId: job.styleId,
    freedom: job.freedom,
  });
  await writeFile(`${DIR}/${file}`, companion.png);
  const art = companion.sceneBrief?.artMeaning;
  results.push({
    file: `${DIR}/${file}`,
    fixture: job.id,
    card: job.card.meaning.name,
    styleId: job.styleId,
    freedom: job.freedom,
    generationMode: companion.generationMode,
    inputType: companion.inputType,
    promptVersion: companion.promptVersion,
    sha256: companion.sha256,
    sourcePngSha256: companion.sourcePngSha256,
    latencyMs: companion.latencyMs,
    governingEvent: art?.governingEvent || null,
    forbidden: art?.forbiddenImplications || [],
    contacts: art?.establishedRelationships?.consequentialContacts ?? null,
    fields: companion.sceneBrief?.promptAudit?.fields || [],
    condensed: companion.sceneBrief?.promptAudit?.condensed ?? null,
    approved: false,
  });
  await writeFile(`${DIR}/proof.json`, JSON.stringify({ questionHits, proposal, results }, null, 2));
}
await sheet("sheet-mirror-veiled.png", [
  `${DIR}/geometry-mirror.png`,
  ...[0, 25, 50, 75, 100].map((freedom) => `${DIR}/companion-mirror-veiled_luminescence-${freedom}.png`),
]);
await sheet("sheet-mirror-living.png", [
  `${DIR}/geometry-mirror.png`,
  ...[25, 50, 75, 100].map((freedom) => `${DIR}/companion-mirror-living_matter-${freedom}.png`),
]);
await sheet("sheet-unjoined-100.png", [
  `${DIR}/geometry-unjoined.png`,
  `${DIR}/companion-unjoined-veiled_luminescence-100.png`,
]);
const proof = {
  questionHits,
  questionNote: "No stored Narrow Question record was in this sandbox. The proposal uses the immutable short CSV sentences and does not invent a graph. Engine title matches, if any, are listed and are not treated as the user's export.",
  proposal: proposal.applies ? {
    applies: true,
    words: {
      core: words(proposal.proposed.core),
      upright: words(proposal.proposed.upright),
      shadow: words(proposal.proposed.shadow),
    },
    core: proposal.proposed.core,
    upright: proposal.proposed.upright,
    shadow: proposal.proposed.shadow,
  } : proposal,
  readings: {
    unjoined: briefOf(unjoined, "veiled_luminescence", 100),
    mirror: briefOf(mirror, "veiled_luminescence", 100),
  },
  meanings: {
    unjoined: { name: unjoined.meaning.name, core: unjoined.meaning.core, upright: unjoined.meaning.upright, shadow: unjoined.meaning.shadow },
    mirror: { name: mirror.meaning.name, core: mirror.meaning.core, upright: mirror.meaning.upright, shadow: mirror.meaning.shadow },
  },
  results,
};
await writeFile(`${DIR}/proof.json`, JSON.stringify(proof, null, 2));
console.log(JSON.stringify({
  questionHits: questionHits.length,
  images: results.length,
  modes: results.map((row) => `${row.fixture}:${row.styleId}:${row.freedom}:${row.generationMode}`),
}, null, 2));
