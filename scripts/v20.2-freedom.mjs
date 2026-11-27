// Five freedom settings, two frozen encounters, one style. Staged files only. Not approved.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { compileEncounterPair, openCanon, renderGeometry } from "../velomere-crystal/engine/encounter-v17.mjs";
import { generateCompanion } from "../src/lib/encounters/companion-art.mjs";

const DIR = "/workspace/screenshots/v20.2";
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
    label: "Unjoined Direction",
    compiled: await compileEncounterPair(
      { kind: "canonical_draw", canonicalIndex: vectari.index, orientation: "upright" },
      { kind: "canonical_draw", canonicalIndex: witness.index, orientation: "upright" },
      date,
    ),
  },
  {
    id: "mirror",
    label: "Narrow Mirror",
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
  const paint = await renderGeometry(card.compiled.geometry, "veiled_luminescence");
  await writeFile(`${DIR}/geometry-${card.id}.png`, paint.png);
  const meaning = card.compiled.meaning;
  for (const freedom of LEVELS) {
    process.stdout.write(`generating ${card.id} ${freedom}\n`);
    const companion = await generateCompanion({
      geometryPng: paint.png,
      meaning,
      geometry: card.compiled.geometry,
      styleId: STYLE,
      freedom,
    });
    const file = `companion-${card.id}-${freedom}.png`;
    await writeFile(`${DIR}/${file}`, companion.png);
    results.push({
      card: card.label,
      fixture: card.id,
      styleId: STYLE,
      freedom,
      freedomBand: companion.freedomBand,
      freedomLabel: companion.freedomLabel,
      fidelityMethod: companion.fidelityMethod,
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
      conditioning: companion.conditioning,
      sentSha256: companion.sentSha256,
      sourcePngSha256: companion.sourcePngSha256,
      latencyMs: companion.latencyMs,
      aspectRatio: companion.aspectRatio,
      resolution: companion.resolution,
      approved: false,
      file: `${DIR}/${file}`,
    });
    await writeFile(`${DIR}/proof.json`, JSON.stringify({ style: STYLE, results }, null, 2));
  }
  await sheet(`sheet-${card.id}.png`, [ `${DIR}/geometry-${card.id}.png`, ...LEVELS.map((level) => `${DIR}/companion-${card.id}-${level}.png`) ]);
}
const hashes = results.map((row) => row.companionSha256);
console.log(JSON.stringify({
  count: results.length,
  unique: new Set(hashes).size,
  ms: results.reduce((sum, row) => sum + row.latencyMs, 0),
}));
