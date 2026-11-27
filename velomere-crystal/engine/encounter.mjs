import { readFileSync } from "node:fs";
import path from "node:path";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...rest] = rows.filter((item) => item.some((value) => value.length));
  return rest.map((item) => Object.fromEntries(head.map((key, index) => [key, item[index] ?? ""])));
}

function load(dataDir) {
  const canon = parseCsv(readFileSync(path.join(dataDir, "canonical_cards.csv"), "utf8"));
  const blue = parseCsv(readFileSync(path.join(dataDir, "archetype_blueprints.csv"), "utf8"));
  const dance = parseCsv(readFileSync(path.join(dataDir, "dance14_encounter_reference.csv"), "utf8"));
  return { canon, blue, dance };
}

function mix(first, second) {
  let h = (first * 131 + second * 977) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return h;
}

export function readEncounter(dataDir, first, second) {
  const { canon, blue, dance } = load(dataDir);
  const card = canon[first - 1];
  const other = canon[second - 1];
  const blueprint = blue.find((row) => row.name === card.name);
  if (!card || !other || !blueprint) throw new Error("That pair is outside the canon.");
  if (second === 14) {
    const row = dance.find((item) => item.name === card.name);
    const intensity = Number(row.intensity_0_to_4);
    return {
      firstName: card.name,
      secondName: "The Dance",
      origin: "golden-authored",
      operators: intensity ? [row.geometry_action] : [],
      intensity,
      cause: row.encounter_axis,
      question: row.counterreading_question,
      consequence: row.upright_proposal,
      counter: row.reversed_proposal,
      noNewStrokeReason: intensity ? null : row.geometry_action,
      reference: row.geometry_action,
      upright: card.upright,
    };
  }
  const intensity = mix(first, second) % 5;
  return {
    firstName: card.name,
    secondName: other.name,
    origin: "generated",
    operators: intensity ? [blueprint.encounter_affordance] : [],
    intensity,
    cause: `${card.name} approaches ${other.name}. ${blueprint.encounter_affordance}`,
    question: `What does ${other.name} change for ${card.name} that the reverse pair would not?`,
    consequence: blueprint.negative_space_rule,
    counter: `The reverse meeting, ${other.name} with ${card.name}, is a different question.`,
    noNewStrokeReason: intensity ? null : `${card.name} keeps its own figure. This pair adds no new stroke.`,
    reference: null,
    upright: card.upright,
  };
}
