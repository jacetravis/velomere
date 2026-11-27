import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { compileDraw, openCanon, renderGeometry } from "../velomere-crystal/engine/encounter-v17.mjs";
import { ENCOUNTER_STYLES } from "../src/lib/encounters/style-default.mjs";
import { buildSceneBrief, generateCompanion } from "../src/lib/encounters/companion-art.mjs";

const DIR = "/workspace/screenshots/v20";
const sources = await openCanon();
const card = sources.canon.find((row) => row.name === "The Null");
const compiled = await compileDraw(card.index, "2026-11-14", 0);
if (compiled.geometry.hash !== "7866fd4ef16eb488800d09d957fb35f6ee420379ce900971e48ba499cb879beb") {
  throw new Error(compiled.geometry.hash);
}
const paint = await renderGeometry(compiled.geometry, "veiled_luminescence");
const meaning = compiled.participant.meaning;
const proof = JSON.parse(await readFile(`${DIR}/proof.json`, "utf8"));
const fresh = [];
for (const styleId of ENCOUNTER_STYLES) {
  process.stdout.write(`redo null ${styleId}\n`);
  const brief = buildSceneBrief({ meaning, geometry: compiled.geometry, styleId });
  if (/two /i.test(brief.sceneProposal)) throw new Error(brief.sceneProposal);
  const companion = await generateCompanion({
    geometryPng: paint.png,
    meaning,
    geometry: compiled.geometry,
    styleId,
  });
  const file = `companion-null-${styleId}.png`;
  await writeFile(`${DIR}/${file}`, companion.png);
  fresh.push({
    fixture: "null",
    name: meaning.name,
    styleId,
    sceneHash: compiled.geometry.hash,
    joins: 0,
    roots: 1,
    regression: compiled.geometry.regression,
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
    redo: "brief-locked-to-one-root",
  });
}
proof.results = [...fresh, ...proof.results.filter((row) => row.fixture !== "null")];
await writeFile(`${DIR}/proof.json`, JSON.stringify(proof, null, 2));
const cellW = 360;
const cellH = 590;
const tiles = [];
for (let index = 0; index < ENCOUNTER_STYLES.length; index += 1) {
  const tile = await sharp(`${DIR}/companion-null-${ENCOUNTER_STYLES[index]}.png`).resize(cellW, cellH, { fit: "cover" }).png().toBuffer();
  tiles.push({ input: tile, left: (index % 3) * cellW, top: Math.floor(index / 3) * (cellH + 8) });
}
await sharp({ create: { width: cellW * 3, height: 2 * (cellH + 8), channels: 3, background: { r: 12, g: 10, b: 8 } } })
  .composite(tiles)
  .png()
  .toFile(`${DIR}/sheet-null.png`);
console.log("null redo done");
