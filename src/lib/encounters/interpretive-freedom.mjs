// @ts-nocheck
// Freedom changes the scene plan, not the sharpness of the source image.
// The image API has no reference-strength field.

export const DEFAULT_INTERPRETIVE_FREEDOM = 50;

export function clampFreedom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INTERPRETIVE_FREEDOM;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function freedomBand(level) {
  const n = clampFreedom(level);
  if (n <= 12) return { id: "structural", label: "Structural", anchor: 0 };
  if (n <= 37) return { id: "guided", label: "Guided", anchor: 25 };
  if (n <= 62) return { id: "balanced", label: "Balanced", anchor: 50 };
  if (n <= 87) return { id: "expressive", label: "Expressive", anchor: 75 };
  return { id: "intuitive", label: "Intuitive", anchor: 100 };
}

const COPY = {
  structural: "Strongly preserve the geometry’s layout, shapes, spatial arrangement, and recognizable contours. Material and light may change. The arrangement may not.",
  guided: "Stay close to the geometry. Major forms should remain findable. The scene may deepen around them without rearranging the event.",
  balanced: "Balance a recognizable arrangement with a scene-based interpretation. The picture is neither a diagram nor a free invention.",
  expressive: "Let the scene lead. Shapes may change if the real joins, separations, order, and any return stay visible.",
  intuitive: "Allow a different composition, metaphor, or embodiment. The event stays the same event. Do not invent a meeting or erase one.",
};

export function freedomDescription(level) {
  const band = freedomBand(level);
  const n = clampFreedom(level);
  return { ...band, level: n, text: COPY[band.id] };
}

/** The source image is not blurred. Freedom is not a fake API strength knob. */
export function referenceConditioning(level) {
  clampFreedom(level);
  return {
    method: "unmodified-geometry",
    apiReferenceStrength: null,
    blur: 0,
    saturation: 1,
    note: "Freedom does not blur or fade the geometric source. The source is sent unmodified when a generation step uses it. Freedom changes the scene plan and whether a scene is proposed before reconciliation. The edits API has no reference-strength parameter.",
  };
}

export function fidelityInstruction(level, topo) {
  const n = clampFreedom(level);
  const band = freedomBand(n);
  const joins = Number(topo?.joins || 0);
  const roots = Number(topo?.roots || 0);
  const invariants = [
    `Keep exactly ${joins} authorized join${joins === 1 ? "" : "s"}.`,
    joins === 0 ? "Do not add a bridge, a touch, a fuse, or any meeting." : "Do not add a contact and do not drop one.",
    `Keep ${roots} distinct root${roots === 1 ? "" : "s"}.`,
    roots <= 1 ? "Do not invent a second presence." : "Do not merge the roots into one body except where a join is authorized.",
    topo?.downwardReturn ? "Keep the downward return inside the same event. It is not a new story and not a stroke drawn for its own sake." : "Do not invent a downward return.",
    `Outcome stays ${topo?.outcome || "unresolved"}. Provenance is not rewritten.`,
  ].join(" ");
  const methods = {
    structural: {
      method: "structural-stencil",
      lead: "STRUCTURAL interpretation. The attached geometry is the composition. Reproduce its layout, silhouette, spacing, and contours in the chosen material. Someone who has seen the geometry should recognize the same arrangement immediately.",
      sceneWeight: "Use the style only as material and light. Do not replace the arrangement with a different scene.",
    },
    guided: {
      method: "guided-layout",
      lead: "GUIDED interpretation. Stay near the attached layout. Each major form should remain recognizable in place. You may enrich material, depth, and setting. Do not move the meeting, the gap, or the ends.",
      sceneWeight: "The scene supports the layout. It does not replace it.",
    },
    balanced: {
      method: "balanced-scene",
      lead: "BALANCED interpretation. The attached image is both a score and a layout. Keep the arrangement readable, and also build a real place in the style. Do not extrude the strokes into tubes, trenches, or rods. Do not abandon the left and right, the join, or the gap.",
      sceneWeight: "The scene and the layout share the picture. Neither one erases the other.",
    },
    expressive: {
      method: "expressive-scene",
      lead: "EXPRESSIVE interpretation. Conceive the place first. The attached geometry is a relational score, not a stencil. Forms may change shape if every authorized join, every separation, the event order, and any return remain visible to someone who did not see the geometry.",
      sceneWeight: "The scene leads. The score constrains the event, not the outline.",
    },
    intuitive: {
      method: "intuitive-metaphor",
      lead: "INTUITIVE interpretation. A different composition is allowed: metaphor, embodiment, architecture, or a place that does not resemble the strokes. Do not copy contours, silhouettes, or stroke-count as object-count.",
      sceneWeight: "The scene may depart from the picture. It may not depart from the event.",
    },
  };
  return { ...methods[band.id], level: n, label: band.label, band: band.id, invariants };
}
