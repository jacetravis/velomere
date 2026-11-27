// One targeted revision each for pictures that contradicted the graph or stayed two columns.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { compileEncounterPair, openCanon, renderGeometry } from "../velomere-crystal/engine/encounter-v17.mjs";
import { generateCompanion } from "../src/lib/encounters/companion-art.mjs";

const DIR = "/workspace/screenshots/v20.3";
const NOTES = {
  "unjoined:100": "The last picture was two vertical columns. Do not use columns, spirals, tubes, or strokes. Show a lit threshold in one building and a dark closed room in another, with night between them. They must not touch. No people. No bridge. No third actor.",
  "mirror:50": "The last picture joined two figures at their feet. That contact is forbidden. They may share only one narrow light overhead. Their bases stay apart and do not touch. Include one downward return of that same light, not a second meeting. No extra person.",
  "mirror:75": "Do not show two women or hands on glass. That is a broad contact and it drops the return. One narrow shared lamp above two separate closed thresholds. The thresholds do not touch. The light dips and comes back once. No second person.",
  "mirror:100": "Keep exactly one small meeting. The last picture had no return. Add one downward return of the same material without a second joint. Do not fuse the forms along an edge. Their bases stay apart. No extra figure.",
};

function find(sources, name) {
  const card = sources.canon.find((row) => row.name === name);
  if (!card) throw new Error(`Missing ${name}`);
  return card;
}

const sources = await openCanon();
const date = "2026-11-14";
const vectari = find(sources, "The Vectari");
const witness = find(sources, "Witness of Sigils");
const shuffle = find(sources, "The Shuffle");
const returns = find(sources, "Two of Returns");
const cards = {
  unjoined: await compileEncounterPair(
    { kind: "canonical_draw", canonicalIndex: vectari.index, orientation: "upright" },
    { kind: "canonical_draw", canonicalIndex: witness.index, orientation: "upright" },
    date,
  ),
  mirror: await compileEncounterPair(
    { kind: "canonical_draw", canonicalIndex: shuffle.index, orientation: "upright" },
    { kind: "canonical_draw", canonicalIndex: returns.index, orientation: "upright" },
    date,
  ),
};
const proof = JSON.parse(await readFile(`${DIR}/proof.json`, "utf8"));
for (const key of Object.keys(NOTES)) {
  const [id, freedomText] = key.split(":");
  const freedom = Number(freedomText);
  const card = cards[id];
  const paint = await renderGeometry(card.geometry, "veiled_luminescence");
  process.stdout.write(`revise ${key}\n`);
  const companion = await generateCompanion({
    geometryPng: paint.png,
    meaning: card.meaning,
    geometry: card.geometry,
    styleId: "veiled_luminescence",
    freedom,
    revisionNote: NOTES[key],
  });
  const file = `${DIR}/revise-${id}-${freedom}.png`;
  await writeFile(file, companion.png);
  proof.revisions = proof.revisions || [];
  proof.revisions.push({
    fixture: id,
    freedom,
    note: NOTES[key],
    file,
    sha256: companion.sha256,
    generationMode: companion.generationMode,
    latencyMs: companion.latencyMs,
    approved: false,
  });
  await writeFile(`${DIR}/proof.json`, JSON.stringify(proof, null, 2));
}
const tiles = [];
const files = ["revise-unjoined-100.png", "revise-mirror-50.png", "revise-mirror-75.png", "revise-mirror-100.png"];
for (let index = 0; index < files.length; index += 1) {
  const tile = await sharp(`${DIR}/${files[index]}`).resize(280, 460, { fit: "cover" }).png().toBuffer();
  tiles.push({ input: tile, left: index * 280, top: 0 });
}
await sharp({ create: { width: 1120, height: 460, channels: 3, background: { r: 12, g: 10, b: 8 } } })
  .composite(tiles)
  .png()
  .toFile(`${DIR}/sheet-revisions.png`);
console.log("revisions", proof.revisions.length);
