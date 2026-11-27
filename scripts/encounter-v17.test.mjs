import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  STYLES,
  compileDraw,
  compileEncounterPair,
  openCanon,
  gateStandaloneCard,
  renderGeometry,
  assertStyleIdentity,
  DEFAULT_STYLE,
  deepenStoredMeaning,
} from "../velomere-crystal/engine/encounter-v17.mjs";
import { DEFAULT_ENCOUNTER_STYLE, ENCOUNTER_STYLES } from "../src/lib/encounters/style-default.mjs";
import { resolveEngineFile } from "../src/lib/encounters/store.mjs";
import { buildCompanionPrompt, buildSceneBrief, frameCard, prepareReference } from "../src/lib/encounters/companion-art.mjs";
import { buildArtMeaning } from "../src/lib/encounters/art-meaning.mjs";
import { freedomDescription, referenceConditioning } from "../src/lib/encounters/interpretive-freedom.mjs";
import { buildScenePlan, validateScenePlan } from "../src/lib/encounters/scene-plan.mjs";
import path from "node:path";
import sharp from "sharp";

const CANON = "340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9";

test("canonical csv hash is unchanged", async () => {
  const bytes = await readFile(new URL("../velomere-crystal/DATA/canonical_cards.csv", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), CANON);
  const sources = await openCanon();
  assert.equal(sources.canon.length, 78);
});

function find(sources, name) {
  const card = sources.canon.find((row) => row.name === name);
  assert.ok(card, name);
  return card;
}

test("solo Null stays one root and quiet", async () => {
  const sources = await openCanon();
  const card = find(sources, "The Null");
  const drawn = await compileDraw(card.index, "2026-11-14", 0);
  assert.equal(drawn.geometry.roots.length, 1);
  assert.equal(drawn.geometry.joins.length, 0);
  assert.equal(drawn.geometry.outcome, "solo");
});

test("canonical pair does not invent a join, and recursion is a new card", async () => {
  const sources = await openCanon();
  const vectari = find(sources, "The Vectari");
  const witness = find(sources, "Witness of Sigils");
  const seven = find(sources, "Seven of Returns");
  const left = { kind: "canonical_draw", canonicalIndex: vectari.index, orientation: "upright" };
  const right = { kind: "canonical_draw", canonicalIndex: witness.index, orientation: "upright" };
  const first = await compileEncounterPair(left, right, "2026-11-14");
  const face = (card) => `${card.meaning.name}\n${card.meaning.core}\n${card.meaning.upright}\n${card.meaning.shadow}`;
  assert.equal(/\bvectari\b/i.test(face(first)), false);
  assert.equal(/\bwitness\b/i.test(face(first)), false);
  assert.equal(/\bsigils\b/i.test(face(first)), false);
  assert.ok(first.meaning.core.length > 80);
  assert.ok(first.meaning.name.split(/\s+/).length <= 4);
  assert.ok(["earned_confluence", "unresolved", "understood_difference", "understood_boundary"].includes(first.outcome));
  if (first.outcome !== "earned_confluence") assert.equal(first.geometry.joins.length, 0);
  const remain = await compileEncounterPair(
    { kind: "canonical_draw", canonicalIndex: seven.index, orientation: "upright" },
    right,
    "2026-11-14",
  );
  assert.notEqual(remain.relation, "disagreement");
  const next = {
    kind: "emergent",
    meaning: first.meaning,
    orientation: "upright",
  };
  const dance = find(sources, "The Dance");
  const second = await compileEncounterPair(next, {
    kind: "canonical_draw",
    canonicalIndex: dance.index,
    orientation: "upright",
  }, "2026-11-14");
  assert.notEqual(second.meaning.name, first.meaning.name);
  assert.ok(second.meaning.upright && second.meaning.shadow && second.evidence.length);
  assert.equal(second.provenance.usedConceptState, true);
  const hidden = [vectari.name, witness.name];
  for (const card of [first, second]) {
    const gate = gateStandaloneCard(card.meaning, card.parents);
    assert.equal(gate.ok, true, gate.issues.join(","));
    assert.equal(/^open interval of\b/i.test(card.meaning.name), false);
    for (const parent of hidden) {
      assert.equal(card.meaning.name.toLowerCase().includes(parent.toLowerCase()), false);
    }
    assert.ok(card.meaning.conceptState.claims.length >= 1);
    assert.ok(card.provenance.parents.length === 2);
  }
  assert.equal(/\bvectari\b/i.test(face(second)), false);
  assert.equal(/\bsigils\b/i.test(face(second)), false);
  assert.equal(hidden.every((name) => second.meaning.core.toLowerCase().includes(name.toLowerCase())), false);
});

test("a pasted parent title is refused before it could be committed", () => {
  const bad = {
    name: "Open interval of The Vectari and Witness of Sigils",
    core: "The Vectari and Witness of Sigils stay together.",
    upright: "Look.",
    shadow: "Look away.",
    keywords: ["a", "b"],
    conceptState: { claims: [] },
  };
  const gate = gateStandaloneCard(bad, ["The Vectari", "Witness of Sigils"]);
  assert.equal(gate.ok, false);
  assert.ok(gate.issues.includes("stock_template"));
  assert.ok(gate.issues.includes("mechanical_parent_title"));
});

test("veiled luminescence is the renderer default", () => {
  assert.equal(DEFAULT_STYLE, "veiled_luminescence");
  assert.equal(DEFAULT_ENCOUNTER_STYLE, DEFAULT_STYLE);
});

test("six scene languages stay registered and the brief refuses a trace", async () => {
  assert.deepEqual([...ENCOUNTER_STYLES], [
    "living_matter",
    "prismatic_geometry",
    "forged_relief",
    "veiled_luminescence",
    "cyber_matrix",
    "witnessed_dance",
  ]);
  assert.equal(DEFAULT_ENCOUNTER_STYLE, "veiled_luminescence");
  const prompt = buildCompanionPrompt({
    meaning: { name: "Unjoined Direction", core: "Two paths stay apart.", upright: "Look.", shadow: "Force them." },
    geometry: { joins: [], roots: [{}, {}], crossings: 0, regression: 0, outcome: "unresolved", quiet: false, landmarks: [] },
    styleId: "witnessed_dance",
  });
  assert.match(prompt, /joins 0/);
  assert.match(prompt, /distinct roots 2/);
  assert.match(prompt, /Do not draw more beautiful tubes/);
  assert.match(prompt, /no bodily contact|Do not add touch|Zero joins/i);
  const brief = buildSceneBrief({
    meaning: { name: "The Null", core: "One quiet field.", upright: "Stay.", shadow: "Fill it." },
    geometry: { joins: [], roots: [{}], crossings: 0, regression: 0, outcome: "solo", quiet: true },
    styleId: "cyber_matrix",
  });
  assert.equal(brief.scoreFacts.joins, 0);
  assert.equal(brief.scoreFacts.roots, 1);
  assert.equal(brief.promptVersion, "v20.4");
  assert.equal(brief.interpretiveFreedom, 50);
  assert.equal(brief.scenePlan.consequentialContacts, 0);
  assert.equal(brief.scenePlan.participants.length, 1);
  assert.equal(/two /i.test(brief.sceneProposal), false);
  const structural = buildCompanionPrompt({
    meaning: { name: "The Null", core: "One quiet field.", upright: "Stay.", shadow: "Fill it." },
    geometry: { joins: [], roots: [{}], crossings: 0, regression: 0, outcome: "solo", quiet: true },
    styleId: "veiled_luminescence",
    freedom: 0,
  });
  const intuitive = buildCompanionPrompt({
    meaning: { name: "The Null", core: "One quiet field.", upright: "Stay.", shadow: "Fill it." },
    geometry: { joins: [], roots: [{}], crossings: 0, regression: 0, outcome: "solo", quiet: true },
    styleId: "veiled_luminescence",
    freedom: 100,
  });
  assert.match(structural, /STRUCTURAL/);
  assert.match(structural, /recognizable silhouette/);
  assert.doesNotMatch(structural, /INTUITIVE/);
  assert.match(intuitive, /INTUITIVE/);
  assert.match(intuitive, /Do not copy contours/);
  assert.match(structural, /joins 0/);
  assert.match(intuitive, /joins 0/);
  assert.notEqual(structural, intuitive);
  assert.equal(freedomDescription(0).label, "Structural");
  assert.equal(freedomDescription(50).label, "Balanced");
  assert.equal(freedomDescription(100).label, "Intuitive");
  assert.equal(referenceConditioning(0).blur, 0);
  assert.equal(referenceConditioning(100).blur, 0);
  assert.equal(referenceConditioning(0).apiReferenceStrength, null);
  assert.equal(referenceConditioning(100).method, "unmodified-geometry");
  const src = await sharp({ create: { width: 900, height: 1600, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
  const crisp = await prepareReference(src, 0);
  const same = await prepareReference(src, 100);
  assert.equal(crisp.sha256, same.sha256);
  const unjoined = buildScenePlan({
    meaning: { name: "Unjoined Direction", core: "Two claims stay apart.", upright: "Leave the gap.", shadow: "Force a meeting." },
    geometry: { joins: [], roots: [{ id: "a" }, { id: "b" }], branches: [], crossings: 0, regression: 0, outcome: "unresolved" },
    styleId: "veiled_luminescence",
    freedom: 100,
  });
  assert.equal(unjoined.consequentialContacts, 0);
  assert.equal(unjoined.literalResemblance, "none");
  assert.equal(unjoined.generationMode, "scene-first-then-reconcile");
  assert.match(unjoined.prohibited.join(" "), /contact/i);
  const low = buildScenePlan({
    meaning: { name: "Unjoined Direction", core: "Two claims stay apart.", upright: "Leave the gap.", shadow: "Force a meeting." },
    geometry: { joins: [], roots: [{}, {}], branches: [], crossings: 0, regression: 0, outcome: "unresolved" },
    styleId: "veiled_luminescence",
    freedom: 0,
  });
  assert.equal(low.literalResemblance, "required");
  assert.equal(low.generationMode, "geometry-edit");
  const forged = {
    ...unjoined,
    consequentialContacts: 1,
    topology: { ...unjoined.topology, consequentialContacts: 0 },
  };
  assert.equal(validateScenePlan(forged, forged.topology).ok, false);
  const framed = await frameCard(src);
  const meta = await sharp(framed).metadata();
  assert.equal(meta.width, 1400);
  assert.equal(meta.height, 2300);
});

test("scene plans keep a real nonjoin and a real confluence", async () => {
  const sources = await openCanon();
  const date = "2026-11-14";
  const vectari = find(sources, "The Vectari");
  const witness = find(sources, "Witness of Sigils");
  const shuffle = find(sources, "The Shuffle");
  const returns = find(sources, "Two of Returns");
  const unjoined = await compileEncounterPair(
    { kind: "canonical_draw", canonicalIndex: vectari.index, orientation: "upright" },
    { kind: "canonical_draw", canonicalIndex: witness.index, orientation: "upright" },
    date,
  );
  const apart = buildScenePlan({
    meaning: unjoined.meaning,
    geometry: unjoined.geometry,
    styleId: "veiled_luminescence",
    freedom: 100,
  });
  assert.equal(apart.topology.consequentialContacts, 0);
  assert.equal(apart.participants.length, 2);
  assert.equal(validateScenePlan(apart, apart.topology).ok, true);
  const mirror = await compileEncounterPair(
    { kind: "canonical_draw", canonicalIndex: shuffle.index, orientation: "upright" },
    { kind: "canonical_draw", canonicalIndex: returns.index, orientation: "upright" },
    date,
  );
  const meeting = buildScenePlan({
    meaning: mirror.meaning,
    geometry: mirror.geometry,
    styleId: "veiled_luminescence",
    freedom: 100,
  });
  assert.equal(meeting.topology.joins > 0, true);
  assert.equal(meeting.consequentialContacts, 1);
  assert.equal(meeting.topology.downwardReturn, true);
  assert.match(meeting.representations.map((row) => row.fact).join(" "), /return/i);
  assert.match(meeting.prohibited.join(" "), /Extra consequential participants/);
  assert.equal(meeting.meaningPreserved, true);
});

function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

test("new cards are authored in full before the art contract", async () => {
  const sources = await openCanon();
  const date = "2026-11-14";
  const vectari = find(sources, "The Vectari");
  const witness = find(sources, "Witness of Sigils");
  const shuffle = find(sources, "The Shuffle");
  const returns = find(sources, "Two of Returns");
  const unjoined = await compileEncounterPair(
    { kind: "canonical_draw", canonicalIndex: vectari.index, orientation: "upright" },
    { kind: "canonical_draw", canonicalIndex: witness.index, orientation: "upright" },
    date,
  );
  const mirror = await compileEncounterPair(
    { kind: "canonical_draw", canonicalIndex: shuffle.index, orientation: "upright" },
    { kind: "canonical_draw", canonicalIndex: returns.index, orientation: "upright" },
    date,
  );
  assert.equal(unjoined.geometry.hash, "8e30afba23fa9d72b0e1bf1fadbb24f2a44d48f24a49ca58e627fff4a747c252");
  assert.equal(mirror.geometry.hash, "f8c6cca1bc79433ca6adabfad2da6e44f6406953d2d244c4282f4813735c1cdb");
  assert.equal(unjoined.geometry.joins.length, 0);
  assert.equal(mirror.geometry.joins.length, 3);
  assert.equal(mirror.geometry.regression, 132.55319148936178);
  for (const card of [unjoined, mirror]) {
    assert.equal(card.meaning.meaningRevision, "v20.4");
    assert.ok(words(card.meaning.core) >= 20, card.meaning.core);
    assert.ok(words(card.meaning.upright) >= 90, `${card.meaning.name} upright ${words(card.meaning.upright)}`);
    assert.ok(words(card.meaning.shadow) >= 90, `${card.meaning.name} shadow ${words(card.meaning.shadow)}`);
    assert.equal(/^Read /i.test(card.meaning.upright), false);
    const gate = gateStandaloneCard(card.meaning, card.parents);
    assert.equal(gate.ok, true, gate.issues.join(","));
    assert.equal(deepenStoredMeaning(card.meaning).applies, false);
  }
  assert.match(unjoined.meaning.shadow, /invented agreement/);
  assert.match(unjoined.meaning.upright, /no meeting|without requiring them to agree|space between them/i);
  assert.match(mirror.meaning.upright, /specific, revisable, and smaller than either claim/);
  assert.match(mirror.meaning.shadow, /inflated into agreement about everything/);
  assert.match(mirror.meaning.shadow, /one claim is retired because the other was also present/);
  const stored = {
    name: "Narrow Question",
    core: "Both claims attest one narrow matter.",
    upright: "Read Narrow Question by staying inside the attested matter. The meeting is specific, revisable, and smaller than either claim that entered it.",
    shadow: "Narrow Question goes wrong when the narrow meeting is inflated into agreement about everything, or when one claim is retired because the other was also present.",
    keywords: ["question", "scope", "revision", "specificity"],
    conceptState: { outcome: "earned_confluence", claims: [] },
  };
  const before = stored.upright;
  const proposal = deepenStoredMeaning(stored);
  assert.equal(stored.upright, before);
  assert.equal(proposal.applies, true);
  assert.match(proposal.proposed.upright, /specific, revisable, and smaller than either claim/);
  assert.match(proposal.proposed.shadow, /inflated into agreement about everything/);
  assert.match(proposal.proposed.shadow, /retired because the other was also present/);
  assert.equal(/^Read /i.test(proposal.proposed.upright), false);
  assert.ok(words(proposal.proposed.upright) >= 90);
  const apart = buildArtMeaning({
    meaning: unjoined.meaning,
    geometry: unjoined.geometry,
    styleId: "veiled_luminescence",
    freedom: 100,
  });
  const meeting = buildArtMeaning({
    meaning: mirror.meaning,
    geometry: mirror.geometry,
    styleId: "living_matter",
    freedom: 0,
  });
  const meetingFree = buildArtMeaning({
    meaning: mirror.meaning,
    geometry: mirror.geometry,
    styleId: "living_matter",
    freedom: 100,
  });
  assert.equal(apart.establishedRelationships.consequentialContacts, 0);
  assert.match(apart.forbiddenImplications.join(" "), /causal joining/);
  assert.equal(meeting.governingEvent, meetingFree.governingEvent);
  assert.equal(meeting.establishedRelationships.consequentialContacts, 1);
  assert.equal(meeting.establishedRelationships.downwardReturn, true);
  assert.equal(meeting.depictsShadowAsFact, false);
  assert.match(meeting.forbiddenImplications.join(" "), /total reconciliation/);
  const prompt = buildCompanionPrompt({
    meaning: mirror.meaning,
    geometry: mirror.geometry,
    styleId: "veiled_luminescence",
    freedom: 100,
  });
  assert.match(prompt, /Governing event:/);
  assert.match(prompt, /not a fact to illustrate/);
  assert.match(prompt, /total reconciliation/);
  assert.match(prompt, /ORIGINAL GEOMETRIC BASE/);
  assert.match(prompt, /Veiled Luminescence/);
  assert.match(prompt, /freedom 100/);
  const low = buildCompanionPrompt({
    meaning: unjoined.meaning,
    geometry: unjoined.geometry,
    styleId: "forged_relief",
    freedom: 25,
  });
  assert.match(low, /no earned meeting|causal/);
  assert.match(low, /Forged Relief/);
  assert.notEqual(low, prompt);
});

test("the published function can still find the encounter engine", () => {
  const found = resolveEngineFile();
  assert.equal(found?.endsWith(`${path.sep}encounter-v17.mjs`), true);
  const fromBundle = path.resolve("/var/task/_ssr", "../velomere-crystal/engine/encounter-v17.mjs");
  assert.equal(fromBundle, path.resolve("/var/task/velomere-crystal/engine/encounter-v17.mjs"));
});

test("four styles keep one geometry hash and differ as pictures", async () => {
  const sources = await openCanon();
  const fire = find(sources, "Fire");
  const drawn = await compileDraw(fire.index, "2026-11-14", 0);
  const paints = [];
  for (const style of STYLES) {
    const paint = await renderGeometry(drawn.geometry, style);
    assert.equal(paint.width, 1400);
    assert.equal(paint.height, 2300);
    assert.equal(paint.backend, "procedural_heightfield/18.1");
    assert.equal(paint.sceneHash, drawn.geometry.hash);
    paints.push(paint);
  }
  for (let i = 1; i < paints.length; i += 1) assertStyleIdentity(paints[0], paints[i]);
  await assert.rejects(() => renderGeometry(drawn.geometry, "custom prompt"), /four/);
});
