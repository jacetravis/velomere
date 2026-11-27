import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileDraw, compileEncounterPair, meaningFromCanon, openCanon } from "../velomere-crystal/engine/encounter-v17.mjs";
import { compileCodexManifest, operatorKey, renderCodexOverlay } from "../src/lib/encounters/codex-glyphs.mjs";
import { DEFAULT_ENCOUNTER_STYLE, ENCOUNTER_STYLES } from "../src/lib/encounters/style-default.mjs";

const DATE = "2026-11-14";

function contacts(svg) {
  return (svg.match(/data-operator="CONTACT"/g) || []).length;
}

test("canon, default style, and the six existing styles stay put", async () => {
  const csv = await readFile(new URL("../velomere-crystal/DATA/canonical_cards.csv", import.meta.url));
  assert.equal(createHash("sha256").update(csv).digest("hex"), "340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9");
  const lines = csv.toString("utf8").trim().split(/\n/).length;
  assert.equal(lines, 79);
  assert.equal(DEFAULT_ENCOUNTER_STYLE, "veiled_luminescence");
  for (const id of ["living_matter", "prismatic_geometry", "forged_relief", "veiled_luminescence", "cyber_matrix", "witnessed_dance"]) {
    assert.ok(ENCOUNTER_STYLES.includes(id));
  }
  assert.ok(ENCOUNTER_STYLES.includes("velomere_codex_becoming_v1"));
});

test("The Velomere, The Null, and Narrow Question keep graph-true glyphs", async () => {
  const sources = await openCanon();
  const at = (name) => sources.canon.findIndex((card) => card.name === name);
  const velomereIndex = at("The Velomere");
  const nullIndex = at("The Null");
  const voidIndex = at("Void");
  const aceIndex = at("Ace of Hearings");
  assert.ok(velomereIndex >= 0 && nullIndex >= 0 && voidIndex >= 0 && aceIndex >= 0);

  const velomereMeaning = meaningFromCanon(sources.canon[velomereIndex]);
  const nullMeaning = meaningFromCanon(sources.canon[nullIndex]);
  const velomereDraw = await compileDraw(velomereIndex, DATE, 0);
  const nullDraw = await compileDraw(nullIndex, DATE, 0);
  const question = await compileEncounterPair(
    { kind: "canonical_draw", canonicalIndex: voidIndex, orientation: "upright" },
    { kind: "canonical_draw", canonicalIndex: aceIndex, orientation: "upright" },
    DATE,
  );
  assert.equal(question.meaning.name, "Narrow Question");

  const velomere = compileCodexManifest({ meaning: velomereMeaning, geometry: velomereDraw.geometry, freedom: 60 });
  const quiet = compileCodexManifest({ meaning: nullMeaning, geometry: nullDraw.geometry, freedom: 60 });
  const narrow = compileCodexManifest({
    meaning: question.meaning,
    geometry: question.geometry,
    freedom: 60,
    parents: question.parents,
  });

  assert.equal(velomereDraw.geometry.joins.length, 0);
  assert.equal(nullDraw.geometry.joins.length, 0);
  assert.equal(velomere.contact_count, 0);
  assert.equal(quiet.contact_count, 0);
  assert.equal(narrow.contact_count, question.geometry.joins.length);
  assert.ok(narrow.contact_count > 0);
  assert.ok(narrow.operator_instances.filter((row) => row.operator === "CONTACT").every((row) => row.scene_event_id));
  assert.ok(velomere.operator_instances.some((row) => row.operator === "DISTINCT"));
  assert.ok(velomere.operator_instances.some((row) => row.operator === "RETURN"));
  assert.equal(velomere.operator_instances.some((row) => row.operator === "THIRD"), false);
  assert.equal(quiet.operator_instances.some((row) => row.operator === "DISTINCT"), false);
  assert.equal(quiet.operator_instances.some((row) => row.operator === "CONTACT"), false);
  assert.ok(quiet.operator_instances.some((row) => row.operator === "INTERVAL"));
  assert.ok(narrow.operator_instances.some((row) => row.operator === "THIRD"));
  assert.ok(narrow.operator_instances.some((row) => row.operator === "QUESTION"));
  assert.deepEqual(narrow.provenance.parents, question.parents);
  assert.equal(narrow.provenance.parent_glyphs_on_face, false);
  assert.notEqual(operatorKey(velomere), operatorKey(quiet));

  for (const manifest of [velomere, quiet, narrow]) {
    const shadow = manifest.operator_instances.find((row) => row.operator === "SHADOW");
    assert.equal(shadow.epistemic_status, "counterreading");
    assert.equal(shadow.role, "shadow");
  }

  const low = compileCodexManifest({ meaning: velomereMeaning, geometry: velomereDraw.geometry, freedom: 20 });
  const high = compileCodexManifest({ meaning: velomereMeaning, geometry: velomereDraw.geometry, freedom: 95 });
  assert.equal(operatorKey(low), operatorKey(high));
  assert.equal(low.contact_count, 0);

  const quietSvg = renderCodexOverlay(quiet);
  const narrowSvg = renderCodexOverlay(narrow);
  assert.equal(contacts(quietSvg), 0);
  assert.equal(contacts(narrowSvg), question.geometry.joins.length);
  assert.equal(quietSvg.includes("<?xml"), true);
  assert.match(narrowSvg, /data-style="velomere_codex_becoming_v1"/);
});

test("court offices and rank notches do not become joins", () => {
  const geometry = { hash: "court", roots: [{ id: "host" }, { id: "guest" }], joins: [], crossings: 0, regression: 0, outcome: "unresolved" };
  const ache = compileCodexManifest({
    meaning: { name: "Ache of Paths", rank: "Ache", suit: "Paths", core: "Pressure in the interval.", upright: "The ache stays unfinished.", shadow: "Do not call the ache a union." },
    geometry,
  });
  const witness = compileCodexManifest({
    meaning: { name: "Witness of Paths", rank: "Witness", suit: "Paths", core: "A witness looks and does not cross.", upright: "Observation stays off the meeting.", shadow: "Do not treat looking as owning." },
    geometry,
  });
  assert.ok(ache.operator_instances.some((row) => row.operator === "INTERVAL" && row.role === "court"));
  assert.ok(witness.operator_instances.some((row) => row.operator === "WITNESS" && row.role === "court"));
  assert.equal(ache.operator_instances.some((row) => row.operator === "WITNESS" && row.role === "court"), false);
  assert.equal(ache.contact_count, 0);
  assert.equal(witness.contact_count, 0);
  const two = compileCodexManifest({
    meaning: { name: "Two of Returns", rank: "Two", suit: "Returns", core: "A changed return.", upright: "What returns is not the same.", shadow: "Do not pretend the cycle closed." },
    geometry: { hash: "two", roots: [{ id: "host" }], joins: [], quiet: false, outcome: "solo" },
  });
  assert.equal(two.operator_instances.filter((row) => row.operator === "RANK_NOTCH").length, 2);
  assert.equal(two.contact_count, 0);
});
