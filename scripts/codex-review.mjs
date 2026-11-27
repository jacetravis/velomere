// Staged Codex of Becoming plates. Not approved. Not written to a deck.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compileDraw, compileEncounterPair, meaningFromCanon, openCanon, renderGeometry } from "../velomere-crystal/engine/encounter-v17.mjs";
import { generateCompanion } from "../src/lib/encounters/companion-art.mjs";
import { compileCodexManifest, legendOf, renderCodexOverlay } from "../src/lib/encounters/codex-glyphs.mjs";

const DATE = "2026-11-14";
const OUT = "/workspace/public/codex-review";

const sources = await openCanon();
const at = (name) => sources.canon.findIndex((card) => card.name === name);
const velomereDraw = await compileDraw(at("The Velomere"), DATE, 0);
const nullDraw = await compileDraw(at("The Null"), DATE, 0);
const question = await compileEncounterPair(
  { kind: "canonical_draw", canonicalIndex: at("Void"), orientation: "upright" },
  { kind: "canonical_draw", canonicalIndex: at("Ace of Hearings"), orientation: "upright" },
  DATE,
);
if (question.meaning.name !== "Narrow Question") {
  throw new Error(`Expected Narrow Question, got ${question.meaning.name}`);
}

const cards = {
  velomere: { meaning: meaningFromCanon(sources.canon[at("The Velomere")]), geometry: velomereDraw.geometry, parents: [] },
  null: { meaning: meaningFromCanon(sources.canon[at("The Null")]), geometry: nullDraw.geometry, parents: [] },
  question: { meaning: question.meaning, geometry: question.geometry, parents: question.parents },
};

await mkdir(OUT, { recursive: true });
const geometryPng = {};
for (const [id, card] of Object.entries(cards)) {
  const paint = await renderGeometry(card.geometry);
  geometryPng[id] = paint.png;
  await writeFile(`${OUT}/${id === "null" ? "null" : id}-geometry.png`, paint.png);
  const manifest = compileCodexManifest({ ...card, freedom: 60 });
  await writeFile(`${OUT}/${id}-manifest.json`, JSON.stringify({ manifest, legend: legendOf(manifest) }, null, 2));
  await writeFile(`${OUT}/${id}-overlay.svg`, renderCodexOverlay(manifest));
  process.stdout.write(`geometry ${id} joins=${card.geometry.joins.length} contacts=${manifest.contact_count} hash=${card.geometry.hash}\n`);
}

const jobs = [
  ["velomere", "velomere_codex_becoming_v1", 20, "velomere-codex-20.png"],
  ["velomere", "velomere_codex_becoming_v1", 60, "velomere-codex-60.png"],
  ["velomere", "velomere_codex_becoming_v1", 95, "velomere-codex-95.png"],
  ["velomere", "veiled_luminescence", 60, "velomere-veiled-60.png"],
  ["null", "velomere_codex_becoming_v1", 60, "null-codex-60.png"],
  ["question", "velomere_codex_becoming_v1", 60, "question-codex-60.png"],
];

const wanted = new Set(process.argv.slice(2));
const selected = wanted.size ? jobs.filter((job) => wanted.has(job[3])) : jobs;

let prior = [];
try {
  prior = JSON.parse(await readFile(`${OUT}/proof.json`, "utf8")).results || [];
} catch {
  prior = [];
}
const results = prior.filter((row) => !selected.some((job) => job[3] === row.file));
for (const [id, styleId, freedom, file] of selected) {
  process.stdout.write(`generating ${file}\n`);
  const card = cards[id];
  try {
    const companion = await generateCompanion({
      geometryPng: geometryPng[id],
      meaning: card.meaning,
      geometry: card.geometry,
      styleId,
      freedom,
    });
    await writeFile(`${OUT}/${file}`, companion.png);
    results.push({
      file,
      styleId,
      freedom,
      sha256: companion.sha256,
      width: companion.width,
      height: companion.height,
      model: companion.model,
      generationMode: companion.generationMode,
      contacts: companion.codexContactCount ?? null,
      approved: false,
    });
    process.stdout.write(`saved ${file} ${companion.width}x${companion.height} ${companion.sha256.slice(0, 12)}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ file, styleId, freedom, error: message, approved: false });
    process.stdout.write(`failed ${file}: ${message}\n`);
  }
}
await writeFile(`${OUT}/proof.json`, JSON.stringify({
  approved: false,
  locked: false,
  deckWrite: false,
  date: DATE,
  questionParents: question.parents,
  questionJoins: question.geometry.joins.map((join) => join.id),
  results,
}, null, 2));
console.log(JSON.stringify(results, null, 2));
