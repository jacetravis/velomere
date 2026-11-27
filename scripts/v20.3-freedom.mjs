// v20.3 calibration. Same two frozen cards, Veiled Luminescence, five freedoms.
// Staged files only. Not approved. Not written to the app database.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { compileEncounterPair, openCanon, renderGeometry } from "../velomere-crystal/engine/encounter-v17.mjs";
import { generateCompanion } from "../src/lib/encounters/companion-art.mjs";

const DIR = "/workspace/screenshots/v20.3";
const STYLE = "veiled_luminescence";
const LEVELS = [0, 25, 50, 75, 100];

function find(sources, name) {
  const card = sources.canon.find((row) => row.name === name);
  if (!card) throw new Error(`Missing ${name}`);
  return card;
}

async function sheet(name, files) {
  const cellW = 280;
  const cellH = 460;
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
const date = "2026-11-14";
const vectari = find(sources, "The Vectari");
const witness = find(sources, "Witness of Sigils");
const shuffle = find(sources, "The Shuffle");
const returns = find(sources, "Two of Returns");
const cards = [
  {
    id: "unjoined",
    compiled: await compileEncounterPair(
      { kind: "canonical_draw", canonicalIndex: vectari.index, orientation: "upright" },
      { kind: "canonical_draw", canonicalIndex: witness.index, orientation: "upright" },
      date,
    ),
  },
  {
    id: "mirror",
    compiled: await compileEncounterPair(
      { kind: "canonical_draw", canonicalIndex: shuffle.index, orientation: "upright" },
      { kind: "canonical_draw", canonicalIndex: returns.index, orientation: "upright" },
      date,
    ),
  },
];

await mkdir(DIR, { recursive: true });
let prior = [];
try {
  prior = JSON.parse(await readFile(`${DIR}/proof.json`, "utf8")).results || [];
} catch {
  prior = [];
}
const results = [];
for (const card of cards) {
  const paint = await renderGeometry(card.compiled.geometry, "veiled_luminescence");
  await writeFile(`${DIR}/geometry-${card.id}.png`, paint.png);
  const meaning = card.compiled.meaning;
  for (const freedom of LEVELS) {
    const file = `companion-${card.id}-${freedom}.png`;
    const already = prior.find((row) => row.fixture === card.id && row.freedom === freedom && row.file?.endsWith(file));
    if (already) {
      results.push(already);
      process.stdout.write(`keep ${card.id} ${freedom}\n`);
      continue;
    }
    process.stdout.write(`generating ${card.id} ${freedom}\n`);
    const companion = await generateCompanion({
      geometryPng: paint.png,
      meaning,
      geometry: card.compiled.geometry,
      styleId: STYLE,
      freedom,
    });
    await writeFile(`${DIR}/${file}`, companion.png);
    const plan = companion.scenePlan;
    results.push({
      card: meaning?.name || card.id,
      fixture: card.id,
      styleId: STYLE,
      freedom,
      freedomBand: plan.freedomBand,
      literalResemblance: plan.literalResemblance,
      generationMode: companion.generationMode,
      metaphor: plan.metaphor,
      mandatory: plan.mandatory,
      prohibited: plan.prohibited,
      representations: plan.representations,
      consequentialContacts: plan.consequentialContacts,
      participants: plan.participants.length,
      sceneHash: card.compiled.geometry.hash,
      joins: card.compiled.geometry.joins.length,
      roots: card.compiled.geometry.roots.length,
      regression: card.compiled.geometry.regression,
      geometrySha256: paint.sha256,
      companionSha256: companion.sha256,
      distinct: companion.sha256 !== paint.sha256,
      provider: companion.provider,
      model: companion.model,
      promptVersion: companion.promptVersion,
      inputType: companion.inputType,
      conditioning: companion.conditioning,
      sentSha256: companion.sentSha256,
      sourcePngSha256: companion.sourcePngSha256,
      latencyMs: companion.latencyMs,
      reconcileError: companion.sceneBrief?.reconcileError || null,
      approved: false,
      file: `${DIR}/${file}`,
    });
    await writeFile(`${DIR}/proof.json`, JSON.stringify({ style: STYLE, results }, null, 2));
  }
  await sheet(`sheet-${card.id}.png`, [`${DIR}/geometry-${card.id}.png`, ...LEVELS.map((level) => `${DIR}/companion-${card.id}-${level}.png`)]);
}
console.log(JSON.stringify({
  count: results.length,
  unique: new Set(results.map((row) => row.companionSha256)).size,
  ms: results.reduce((sum, row) => sum + row.latencyMs, 0),
  modes: results.map((row) => `${row.fixture}:${row.freedom}:${row.generationMode}`),
}));
