export type DeckStyle = {
  id: string;
  name: string;
  note: string;
  core: string;
  edge: string;
  identity: string;
  encounter: string;
  separate: boolean;
  widthScale: number;
  glow: number;
  strength: number;
};

export const STYLES: DeckStyle[] = [
  {
    id: "night-line",
    name: "Night line",
    note: "Locked finish. Pale line on a near-black field, at the weight you set.",
    core: "#1a1f26",
    edge: "#0c1014",
    identity: "#f3f1ea",
    encounter: "#f3f1ea",
    separate: false,
    widthScale: 1,
    glow: 0,
    strength: 1,
  },
  {
    id: "manuscript",
    name: "Manuscript",
    note: "Dark ink on warm paper. Reads as a drawn plate.",
    core: "#f7f1e6",
    edge: "#e7dcc8",
    identity: "#241c16",
    encounter: "#241c16",
    separate: false,
    widthScale: 4.6,
    glow: 0,
    strength: 1,
  },
  {
    id: "gold-indigo",
    name: "Gold on indigo",
    note: "A metal line on a deep night blue. Suits a ceremonial deck.",
    core: "#1a2744",
    edge: "#0b1020",
    identity: "#e4c07a",
    encounter: "#e4c07a",
    separate: false,
    widthScale: 1.15,
    glow: 1.2,
    strength: 1,
  },
  {
    id: "bone-soot",
    name: "Bone and soot",
    note: "Charcoal on bone. Quiet, and readable in the hand.",
    core: "#efe4d2",
    edge: "#d9cbb6",
    identity: "#2a241c",
    encounter: "#2a241c",
    separate: false,
    widthScale: 3.2,
    glow: 0,
    strength: 1,
  },
  {
    id: "tide-glass",
    name: "Tide glass",
    note: "A pale water line on deep tide. Cool, and open.",
    core: "#12343c",
    edge: "#071c22",
    identity: "#d5ece8",
    encounter: "#d5ece8",
    separate: false,
    widthScale: 1.05,
    glow: 0.6,
    strength: 1,
  },
  {
    id: "ember",
    name: "Ember",
    note: "Copper on a black-brown ground. The line carries the heat.",
    core: "#2a1410",
    edge: "#120a08",
    identity: "#e2a06a",
    encounter: "#e2a06a",
    separate: false,
    widthScale: 1.2,
    glow: 1.6,
    strength: 1,
  },
  {
    id: "moon-silver",
    name: "Moon silver",
    note: "Silver on charcoal, with a soft halo. A night oracle.",
    core: "#1c2430",
    edge: "#10141a",
    identity: "#e8eef2",
    encounter: "#e8eef2",
    separate: false,
    widthScale: 1,
    glow: 2,
    strength: 1,
  },
  {
    id: "vellum-oxblood",
    name: "Vellum and oxblood",
    note: "Oxblood ink on vellum. Older, and heavier.",
    core: "#f3e6d2",
    edge: "#e4d3b8",
    identity: "#6e2430",
    encounter: "#6e2430",
    separate: false,
    widthScale: 3.4,
    glow: 0,
    strength: 1,
  },
  {
    id: "eclipse",
    name: "Eclipse",
    note: "A white identity. The encounter, when there is one, is a warm second line.",
    core: "#101114",
    edge: "#050506",
    identity: "#f7f7f5",
    encounter: "#e2b07a",
    separate: true,
    widthScale: 0.95,
    glow: 0.4,
    strength: 1,
  },
  {
    id: "chalk-slate",
    name: "Chalk on slate",
    note: "A dry chalk line on slate. Slightly softer than ink.",
    core: "#3a4254",
    edge: "#1c2230",
    identity: "#f4f1ea",
    encounter: "#f4f1ea",
    separate: false,
    widthScale: 2.1,
    glow: 0,
    strength: 0.84,
  },
];

export type StylePaint = {
  core: string;
  edge: string;
  identity: string;
  encounter: string;
  separate: boolean;
  widthScale: number;
  glow: number;
  strength: number;
};

type DrawnPath = {
  id: string;
  d: string;
  width: number;
  opacity: number;
  dash: string;
};

function attr(source: string, name: string) {
  const hit = source.match(new RegExp(`\\b${name}="([^"]*)"`));
  return hit?.[1] ?? "";
}

export function readPaths(svg: string): DrawnPath[] {
  return [...svg.matchAll(/<path\b([^>]*)\/?>/g)].map((match) => {
    const source = match[1] ?? "";
    return {
      id: attr(source, "id"),
      d: attr(source, "d"),
      width: Number(attr(source, "stroke-width") || "1.5"),
      opacity: Number(attr(source, "stroke-opacity") || "1"),
      dash: attr(source, "stroke-dasharray"),
    };
  }).filter((path) => path.d.length > 0);
}

function esc(value: string) {
  return value.replaceAll("&", "\u0026amp;").replaceAll('"', "\u0026quot;").replaceAll("<", "\u0026lt;");
}

export function paintSvg(svg: string, paint: StylePaint) {
  const paths = readPaths(svg);
  const glow = paint.glow > 0;
  const defs = [
    `<radialGradient id="style-ground" cx="50%" cy="42%" r="72%">`,
    `<stop offset="0%" stop-color="${paint.core}"/>`,
    `<stop offset="100%" stop-color="${paint.edge}"/>`,
    `</radialGradient>`,
    glow
      ? `<filter id="style-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${paint.glow}"/></filter>`
      : "",
  ].join("");
  const body = paths.map((path) => {
    const encounter = path.id.startsWith("encounter-");
    const color = encounter && paint.separate ? paint.encounter : paint.identity;
    const width = Math.max(0.4, Math.round(path.width * paint.widthScale * 100) / 100);
    const opacity = Math.max(0.05, Math.min(1, Math.round(path.opacity * paint.strength * 1000) / 1000));
    const dash = path.dash ? ` stroke-dasharray="${esc(path.dash)}"` : "";
    const soft = glow ? ` filter="url(#style-glow)"` : "";
    return `<path id="${esc(path.id)}" d="${esc(path.d)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"${dash}${soft}/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="2300" viewBox="0 0 1400 2300">\n<defs>${defs}</defs>\n<rect id="ambient-ground" width="1400" height="2300" fill="url(#style-ground)"/>\n${body}\n</svg>`;
}

export function styleRecord(paint: StylePaint, basedOn: string, cardId: string, cardName: string, layer: "neutral" | "dance") {
  return {
    schema_version: "velomere-style/1",
    based_on: basedOn,
    applies_to: "paint only",
    do_not_change: "path d",
    width_scale_against: "the stroke width in the locked drawing",
    preview_card: { id: cardId, name: cardName, layer },
    ground: { type: "radial", cx: "50%", cy: "42%", r: "72%", core: paint.core, edge: paint.edge },
    identity: { color: paint.identity },
    encounter: { color: paint.separate ? paint.encounter : paint.identity, separate: paint.separate },
    width_scale: paint.widthScale,
    glow: paint.glow,
    strength: paint.strength,
  };
}
