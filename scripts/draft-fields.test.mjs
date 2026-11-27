import assert from "node:assert/strict";
import test from "node:test";
import { draftDefaults, manualEdit, prepareDraft } from "../src/lib/encounters/draft-fields.mjs";

const source = {
  name: "Unjoined Doubt",
  core: "Two claims remain distinct and no meeting is invented.",
  upright: "Let each claim stay revisable.",
  shadow: "Do not promote one claim into the whole story.",
  keywords: ["doubt", "revision", "difference", "attention"],
};

test("no reader turns copies the whole source card", () => {
  const draft = prepareDraft(source, []);
  assert.equal(draft.name.value, source.name);
  assert.equal(draft.core.value, source.core);
  assert.equal(draft.upright.value, source.upright);
  assert.equal(draft.shadow.value, source.shadow);
  assert.deepEqual(draft.keywords.value, source.keywords);
  for (const field of Object.values(draft)) assert.equal(field.origin, "velomere_default");
});

test("a named reader statement changes only that field", () => {
  const draft = prepareDraft(source, [
    { id: "m1", role: "user", content: "Call it: Kept Watch" },
    { id: "m2", role: "assistant", content: "Name: Assistant Title" },
  ]);
  assert.equal(draft.name.value, "Kept Watch");
  assert.equal(draft.name.origin, "reader_interpretation");
  assert.deepEqual(draft.name.evidenceMessageIds, ["m1"]);
  assert.equal(draft.core.origin, "velomere_default");
  assert.equal(draft.core.value, source.core);
});

test("disagreement without a replacement does not invent a belief", () => {
  const draft = prepareDraft(source, [{ id: "m1", role: "user", content: "I disagree." }]);
  assert.equal(draft.core.origin, "velomere_default");
  assert.equal(draft.core.value, source.core);
});

test("a stated disagreement becomes the personal core and leaves the source object alone", () => {
  const frozen = { ...source, keywords: [...source.keywords] };
  const draft = prepareDraft(source, [{ id: "m9", role: "user", content: "I disagree. This is perseverance when neither claim will leave." }]);
  assert.equal(draft.core.origin, "reader_interpretation");
  assert.match(draft.core.value, /perseverance/);
  assert.equal(source.core, frozen.core);
});

test("manual edits survive a second prepare", () => {
  const first = prepareDraft(source, []);
  const edited = manualEdit(first, "upright", "I wrote this myself.");
  const second = prepareDraft(source, [{ id: "m1", role: "user", content: "Upright: ignore my typing" }], edited);
  assert.equal(second.upright.value, "I wrote this myself.");
  assert.equal(second.upright.origin, "manual_edit");
  assert.equal(second.name.origin, "velomere_default");
});

test("defaults reject a source that is missing a field", () => {
  assert.throws(() => draftDefaults({ ...source, shadow: "  " }), /shadow/);
});
