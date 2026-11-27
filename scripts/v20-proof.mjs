// Eighteen staged companions. Not approved. Not written into the app database.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { compileDraw, compileEncounterPair, openCanon, renderGeometry } from "../velomere-crystal/engine/encounter-v17.mjs";
import { ENCOUNTER_STYLES } from "../src/lib/encounters/style-default.mjs";
import { buildSceneBrief, generateCompanion } from "../src/lib/encounters/companion-art.mjs";

const EXPECTED = {
  null: "7866fd4ef16eb488800d09d957fb35f6ee420379ce900971e48ba499cb879beb",
  pair: "8e30afba23fa9d72b0e1bf1fadbb24f2a44d48f24a49ca58e627fff4a747c252",
  mirror: "f8c6cca1bc79433ca6adabfad2da6e44f6406953d2d244c4282f4813735c1cdb",
};

const DIR = "/workspace/screenshots/v20";

function find(sources, name) {
  const card = sources.canon.find((row) => row.name === name);
  if (!card) throw new Error(`Missing ${name}`);
  return card;
}

async function sheet(name, files) {
  const cellW = 360;
  const cellH = 590;
  const tiles = [];
  for (let index = 0; index < files.length; index += 1) {
    const tile = await sharp(files[index]).resize(cellW, cellH, { fit: "cover" }).png().toBuffer();
    tiles.push({ input: tile, left: (index % 3) * cellW, top: Math.floor(index / 3) * (cellH + 8) });
  }
  const height = Math.ceil(files.length / 3) * (cellH + 8);
  await sharp({
    create: { width: cellW * 3, height, channels: 3, background: { r: 12, g: 10, b: 8 } },
  })
    .composite(tiles)
    .png()
    .toFile(`${DIR}/${name}`);
}

const sources = await openCanon();
const date = "2026-11-14";
const quiet = find(sources, "The Null");
const vectari = find(sources, "The Vectari");
const witness = find(sources, "Witness of Sigils");
const shuffle = find(sources, "The Shuffle");
const returns = find(sources, "Two of Returns");
const cards = [
  {
    id: "null",
    compiled: await compileDraw(quiet.index, date, 0),
  },
  {
    id: "pair",
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
const results = [];
for (const card of cards) {
  if (card.compiled.geometry.hash !== EXPECTED[card.id]) {
    throw new Error(`${card.id} hash ${card.compiled.geometry.hash}`);
  }
  const paint = await renderGeometry(card.compiled.geometry, "veiled_luminescence");
  await writeFile(`${DIR}/geometry-${card.id}.png`, paint.png);
  const meaning = card.compiled.meaning || card.compiled.participant?.meaning;
  for (const styleId of ENCOUNTER_STYLES) {
    process.stdout.write(`generating ${card.id} ${styleId}\n`);
    const brief = buildSceneBrief({ meaning, geometry: card.compiled.geometry, styleId });
    const companion = await generateCompanion({
      geometryPng: paint.png,
      meaning,
      geometry: card.compiled.geometry,
      styleId,
    });
    const file = `companion-${card.id}-${styleId}.png`;
    await writeFile(`${DIR}/${file}`, companion.png);
    results.push({
      fixture: card.id,
      name: meaning?.name || null,
      styleId,
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
      sentSha256: companion.sentSha256,
      sourcePngSha256: companion.sourcePngSha256,
      latencyMs: companion.latencyMs,
      aspectRatio: companion.aspectRatio,
      resolution: companion.resolution,
      framing: companion.framing,
      width: companion.width,
      height: companion.height,
      sceneProposal: brief.sceneProposal,
      mode: "A-direct-edit",
      staged: true,
      approved: false,
      file: `${DIR}/${file}`,
    });
    await writeFile(`${DIR}/proof.json`, JSON.stringify({ results }, null, 2));
  }
}

await sheet("sheet-unjoined.png", ENCOUNTER_STYLES.map((style) => `${DIR}/companion-pair-${style}.png`));
await sheet("sheet-null.png", ENCOUNTER_STYLES.map((style) => `${DIR}/companion-null-${style}.png`));
await sheet("sheet-mirror.png", ENCOUNTER_STYLES.map((style) => `${DIR}/companion-mirror-${style}.png`));
console.log(JSON.stringify({ count: results.length, ms: results.reduce((sum, row) => sum + row.latencyMs, 0) }));
