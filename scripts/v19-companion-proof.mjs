// Three staged companions. Does not approve them and does not write the app database.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compileDraw, compileEncounterPair, openCanon, renderGeometry } from "../velomere-crystal/engine/encounter-v17.mjs";
import { generateCompanion } from "../src/lib/encounters/companion-art.mjs";

const EXPECTED = {
  null: "7866fd4ef16eb488800d09d957fb35f6ee420379ce900971e48ba499cb879beb",
  pair: "8e30afba23fa9d72b0e1bf1fadbb24f2a44d48f24a49ca58e627fff4a747c252",
  mirror: "f8c6cca1bc79433ca6adabfad2da6e44f6406953d2d244c4282f4813735c1cdb",
};

function find(sources, name) {
  const card = sources.canon.find((row) => row.name === name);
  if (!card) throw new Error(`Missing ${name}`);
  return card;
}

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function one(id, label, compiled) {
  if (compiled.geometry.hash !== EXPECTED[id]) {
    throw new Error(`${label} scene hash ${compiled.geometry.hash} != ${EXPECTED[id]}`);
  }
  const paint = await renderGeometry(compiled.geometry, "veiled_luminescence");
  if (paint.sceneHash !== EXPECTED[id]) throw new Error(`${label} paint moved the hash`);
  const meaning = compiled.meaning || compiled.participant?.meaning;
  const companion = await generateCompanion({
    geometryPng: paint.png,
    meaning,
    geometry: compiled.geometry,
    styleId: "veiled_luminescence",
  });
  if (companion.sourcePngSha256 !== paint.sha256) throw new Error(`${label} source hash mismatch`);
  if (!companion.transmitted || companion.inputType !== "image_url") throw new Error(`${label} image was not transmitted`);
  const dir = "/workspace/screenshots/v19";
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/geometry-${id}.png`, paint.png);
  await writeFile(`${dir}/companion-${id}.png`, companion.png);
  const legacyName = id === "null" ? "after-a-null-veiled.png" : id === "pair" ? "after-b-pair-veiled.png" : "after-c-event-veiled.png";
  const legacy = await readFile(`/workspace/screenshots/v18.1/${legacyName}`);
  return {
    id,
    label,
    name: meaning?.name || null,
    sceneHash: compiled.geometry.hash,
    joins: compiled.geometry.joins.length,
    roots: compiled.geometry.roots.length,
    regression: compiled.geometry.regression,
    outcome: compiled.geometry.outcome,
    geometrySha256: paint.sha256,
    geometryBytes: paint.png.length,
    legacyArtworkSha256: sha(legacy),
    legacyMatchesGeometry: sha(legacy) === paint.sha256,
    companionSha256: companion.sha256,
    companionBytes: companion.png.length,
    distinctAssets: companion.sha256 !== paint.sha256,
    provider: companion.provider,
    model: companion.model,
    promptVersion: companion.promptVersion,
    requestId: companion.requestId,
    inputType: companion.inputType,
    sentMime: companion.sentMime,
    sentSha256: companion.sentSha256,
    sourcePngSha256: companion.sourcePngSha256,
    latencyMs: companion.latencyMs,
    aspectRatio: companion.aspectRatio,
    resolution: companion.resolution,
    width: companion.width,
    height: companion.height,
    staged: true,
    approved: false,
  };
}

const sources = await openCanon();
const date = "2026-11-14";
const quiet = find(sources, "The Null");
const vectari = find(sources, "The Vectari");
const witness = find(sources, "Witness of Sigils");
const shuffle = find(sources, "The Shuffle");
const two = find(sources, "Two of Returns");
const draw = (index) => ({ kind: "canonical_draw", canonicalIndex: index, orientation: "upright" });

const cases = [
  ["null", "The Null", await compileDraw(quiet.index, date, 0)],
  ["pair", "Unjoined Direction", await compileEncounterPair(draw(vectari.index), draw(witness.index), date)],
  ["mirror", "Narrow Mirror", await compileEncounterPair(draw(shuffle.index), draw(two.index), date)],
];

const results = [];
for (const [id, label, compiled] of cases) {
  process.stderr.write(`generating ${label}\n`);
  results.push(await one(id, label, compiled));
}
await writeFile("/workspace/screenshots/v19/proof.json", JSON.stringify({ style: "veiled_luminescence", results }, null, 2));
process.stdout.write(JSON.stringify(results.map((row) => ({
  id: row.id,
  name: row.name,
  sceneHash: row.sceneHash,
  joins: row.joins,
  companionSha256: row.companionSha256,
  geometrySha256: row.geometrySha256,
  latencyMs: row.latencyMs,
  distinctAssets: row.distinctAssets,
})), null, 2));
