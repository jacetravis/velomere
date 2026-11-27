// Single app-facing default. Must equal DEFAULT_STYLE in
// velomere-crystal/engine/encounter-v17.mjs. The renderer applies that value
// when a new picture is made without an explicit style.
export const DEFAULT_ENCOUNTER_STYLE = "veiled_luminescence";

export const ENCOUNTER_STYLES = Object.freeze([
  "living_matter",
  "prismatic_geometry",
  "forged_relief",
  "veiled_luminescence",
]);
