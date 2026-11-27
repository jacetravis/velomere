// App-facing style registry. The geometric score still uses the engine default
// (veiled_luminescence). These six ids are image-model scene languages only.
export const DEFAULT_ENCOUNTER_STYLE = "veiled_luminescence";

export const ENCOUNTER_STYLE_CHOICES = Object.freeze([
  Object.freeze({ id: "living_matter", label: "Living Matter" }),
  Object.freeze({ id: "prismatic_geometry", label: "Prismatic Geometry" }),
  Object.freeze({ id: "forged_relief", label: "Forged Relief" }),
  Object.freeze({ id: "veiled_luminescence", label: "Veiled Luminescence" }),
  Object.freeze({ id: "cyber_matrix", label: "Cyber Matrix" }),
  Object.freeze({ id: "witnessed_dance", label: "Witnessed Dance" }),
]);

export const ENCOUNTER_STYLES = Object.freeze(ENCOUNTER_STYLE_CHOICES.map((style) => style.id));
