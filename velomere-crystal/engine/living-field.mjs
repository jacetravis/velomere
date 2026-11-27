// @ts-nocheck
// Living material field. Suit is motion, not a biome. A landscape is drawn only
// when the card's own words name a material. Otherwise the field stays sparse.
import { VERSION } from "./export-identity.mjs";

const W = 1400;
const H = 2300;

function hashString(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed) {
  let a = hashString(seed) || 1;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), 61 | a);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

function xml(value) {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  return String(value ?? "").replaceAll("&", amp).replaceAll("<", lt).replaceAll(">", gt).replaceAll('"', quot);
}

export function projectPoint(point) {
  return [point.x + point.z * 22, point.y - point.z * 14];
}

const PHENOMENA = [
  { id: "rain-on-glass", luma: "mid", ground: ["#1B262C", "#3E555C", "#D5E4EA"], accent: "#E7F2F5", cues: ["rain", "glass", "window", "pane", "droplet"] },
  { id: "oil-film", luma: "dark", ground: ["#141311", "#2A261F", "#3A342C"], accent: "#C9A15A", cues: ["oil", "iridescence", "pavement", "asphalt"] },
  { id: "canopy-light", luma: "dark", ground: ["#141C12", "#243224", "#CDB98A"], accent: "#E7D7A8", cues: ["leaf", "leaves", "forest", "canopy", "tree", "trees", "woodland"] },
  { id: "stars-through-cloud", luma: "dark", ground: ["#0E1218", "#1A2230", "#2C3544"], accent: "#F3F0E6", cues: ["star", "stars", "starlight", "constellation"] },
  { id: "molten-gold", luma: "dark", ground: ["#241910", "#3A2A1C", "#E2B15A"], accent: "#F0D48A", cues: ["gold"] },
  { id: "molten-copper", luma: "dark", ground: ["#241410", "#3A2218", "#D4784F"], accent: "#F0A07A", cues: ["copper"] },
  { id: "molten-steel", luma: "dark", ground: ["#161A1E", "#2A3138", "#C5CED6"], accent: "#E7EEF2", cues: ["steel", "iron"] },
  { id: "lava-basalt", luma: "dark", ground: ["#121416", "#2A2422", "#C4472A"], accent: "#E7C3B4", cues: ["lava", "basalt", "magma"] },
  { id: "ember-hearth", luma: "dark", ground: ["#1A1412", "#3A241C", "#E08A45"], accent: "#F2C9A0", cues: ["fire", "flame", "hearth", "candle", "ember"] },
  { id: "riverbed", luma: "dark", ground: ["#15211F", "#243430", "#8EB0B4"], accent: "#D5E4E2", cues: ["river", "stream", "current", "watercourse"] },
  { id: "tide-shore", luma: "mid", ground: ["#1A2428", "#3A4A48", "#C2B6A2"], accent: "#E7E0D4", cues: ["tide", "ocean", "shore", "wave", "waves"] },
  { id: "ice-over-flow", luma: "light", ground: ["#E4EEF0", "#B7C9CC", "#1E3A40"], accent: "#F7FBFC", cues: ["ice", "frost", "snow", "frozen"] },
  { id: "wind-sand", luma: "light", ground: ["#E6D7BF", "#C2A888", "#8C7352"], accent: "#F4EBDC", cues: ["sand", "dune", "wind", "dust"] },
  { id: "crystal-growth", luma: "dark", ground: ["#161C28", "#2A3548", "#D5DEEA"], accent: "#F4F7FB", cues: ["crystal", "facet", "mineral", "gem"] },
  { id: "textile-weave", luma: "mid", ground: ["#3A3032", "#6A5A54", "#CBBBA6"], accent: "#F0E6D8", cues: ["thread", "cloth", "weave", "textile", "fabric", "silk"] },
  { id: "wood-grain", luma: "mid", ground: ["#3E2C22", "#6A4A34", "#C4A07A"], accent: "#EAD8C0", cues: ["wood", "bark", "grain"] },
  { id: "paper-fiber", luma: "light", ground: ["#EFE8DC", "#D5CBB8", "#2C3338"], accent: "#F7F3EA", cues: ["paper", "ink", "page", "parchment"] },
  { id: "cut-stone", luma: "dark", ground: ["#23272B", "#3C4248", "#9AA3A8"], accent: "#E4E8EA", cues: ["stone", "rock", "cliff", "marble"] },
  { id: "fog-veil", luma: "light", ground: ["#C9D0D4", "#8B969C", "#2A3338"], accent: "#F4F7F8", cues: ["fog", "mist", "haze"] },
  { id: "smoke-rise", luma: "dark", ground: ["#1C1916", "#3A342E", "#B7AEA4"], accent: "#E7E0D8", cues: ["smoke", "ash"] },
  { id: "lightning-threshold", luma: "dark", ground: ["#141820", "#2A3344", "#E7EEF8"], accent: "#F7FBFF", cues: ["lightning", "thunder"] },
  { id: "mirror-glass", luma: "dark", ground: ["#1A2228", "#3A4850", "#D5DEE4"], accent: "#F2F6F8", cues: ["mirror"] },
  { id: "vein-ore", luma: "dark", ground: ["#1C1A18", "#3A342C", "#C4B49A"], accent: "#E8DCC8", cues: ["vein", "ore"] },
  { id: "root-soil", luma: "dark", ground: ["#1C1612", "#3A2C22", "#8A6A48"], accent: "#D8C4A4", cues: ["root", "roots", "soil"] },
  { id: "open-water", luma: "dark", ground: ["#152228", "#2A4048", "#7E9AA4"], accent: "#D5E4EA", cues: ["water"] },
];

const BY_ID = new Map(PHENOMENA.map((row) => [row.id, row]));

function passageText(card, orientation) {
  if (!card) return "";
  const body = orientation === "shadow" ? card.reversed : card.upright;
  return `${card.core || ""} ${card.keywords || ""} ${body || ""}`;
}

function hitsFor(text, cues) {
  const found = [];
  for (const cue of cues) {
    const re = new RegExp(`\\b${cue}\\b`, "i");
    if (re.test(text)) found.push(cue);
  }
  return found;
}

function selectPhenomenon(card, orientation, salt) {
  if (!card) return null;
  const text = passageText(card, orientation);
  if (card.quiet) {
    return {
      id: "open-interval",
      luma: "dark",
      hits: [],
      rejected: ["protected quiet: dramatic weather is not added to a silence card"],
      rationale: `${card.name} is a protected quiet. The field stays an open interval so stillness is not dressed as a storm.`,
    };
  }
  const ranked = [];
  for (const row of PHENOMENA) {
    const hits = hitsFor(text, row.cues);
    if (!hits.length) continue;
    ranked.push({ id: row.id, hits, score: hits.length + (hits.length > 1 ? 0.25 : 0) });
  }
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (!ranked.length) {
    return {
      id: "open-interval",
      luma: hashString(`${card.name}|${card.core}|light`) % 5 === 0 ? "light" : "dark",
      hits: [],
      rejected: ["no material noun in this passage"],
      rationale: `${card.name} does not name a material. The field stays unclaimed air so a landscape is not invented.`,
    };
  }
  const top = ranked[0].score;
  const tied = ranked.filter((row) => row.score === top);
  const pick = tied.length === 1 ? tied[0] : tied[hashString(`${salt}|${card.name}|${orientation}`) % tied.length];
  return {
    id: pick.id,
    luma: BY_ID.get(pick.id).luma,
    hits: pick.hits,
    rejected: ranked.filter((row) => row.id !== pick.id).slice(0, 4).map((row) => row.id),
    rationale: `${card.name} names ${pick.hits.join(", ")}. ${pick.id} is the condition of that wording, not a suit biome.`,
  };
}

export function compileMaterial(scene) {
  const salt = `${scene.date}|${scene.affinity}|${scene.host?.name}|${scene.guest?.name || ""}`;
  const host = selectPhenomenon(scene.host, scene.hostOrientation, salt);
  const guest = scene.guest ? selectPhenomenon(scene.guest, scene.guestOrientation, salt) : null;
  let coupling = "solo";
  if (guest && scene.linked?.earned && (scene.linked.relation === "boundary" || scene.linked.relation === "disagreement")) coupling = "held-interface";
  else if (guest && scene.linked?.earned) coupling = "local-exchange";
  else if (guest) coupling = "no-relation";
  const primary = host.id;
  return {
    recipe_version: "velomere-living-field-recipe/15",
    primary,
    source_refs: [scene.host?.name, scene.guest?.name].filter(Boolean),
    materials: [host.id, guest?.id].filter(Boolean),
    processes: [coupling],
    semantic_dependencies: [
      { participant: "host", phenomenon: host.id, cues: host.hits, rationale: host.rationale },
      ...(guest ? [{ participant: "guest", phenomenon: guest.id, cues: guest.hits, rationale: guest.rationale }] : []),
    ],
    render_seed: String(hashString(salt)),
    ambient_complexity: host.id === "open-interval" && (!guest || guest.id === "open-interval") ? 0.12 : 0.38,
    selected_phenomenon_ids: [host.id, guest?.id].filter(Boolean),
    rejected_candidates: host.rejected,
    host,
    guest,
    coupling,
    earned: Boolean(scene.linked?.earned),
  };
}

function defsFor(id, colors) {
  return `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${colors[0]}"/><stop offset="0.55" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient>`;
}

function ellipse(x, y, rx, ry, fill, opacity) {
  return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${fill}" fill-opacity="${opacity}"/>`;
}

function phenomenonMarks(id, rng, anchorX, luma) {
  const spec = BY_ID.get(id);
  const accent = spec?.accent || "#D5D0C6";
  const parts = [];
  const x0 = anchorX ?? 700;
  if (id === "open-interval") {
    const y = 420 + rng() * 180;
    parts.push(`<path d="M ${180} ${y.toFixed(1)} L ${1220} ${y.toFixed(1)}" fill="none" stroke="${luma === "light" ? "#2C3338" : "#C9D0D4"}" stroke-opacity="0.18" stroke-width="2"/>`);
    return parts.join("");
  }
  if (id === "rain-on-glass") {
    for (let i = 0; i < 14; i += 1) {
      const x = 120 + rng() * 1160;
      const y = 180 + rng() * 1700;
      const len = 70 + rng() * 160;
      parts.push(`<path d="M ${x.toFixed(1)} ${y.toFixed(1)} L ${(x + (rng() - 0.5) * 18).toFixed(1)} ${(y + len).toFixed(1)}" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="${(1.2 + rng()).toFixed(1)}" stroke-linecap="round"/>`);
    }
    parts.push(ellipse(x0, 640, 220, 16, accent, 0.15));
    return parts.join("");
  }
  if (id === "oil-film") {
    const puddle = 980 + rng() * 700;
    for (let i = 0; i < 4; i += 1) {
      const hue = ["#C9A15A", "#6E8F86", "#A56A62", "#8A7E9A"][i];
      parts.push(ellipse(x0 + (rng() - 0.5) * 180, puddle, 180 - i * 28, 46 - i * 6, hue, 0.28));
    }
    return parts.join("");
  }
  if (id === "canopy-light") {
    for (let i = 0; i < 7; i += 1) {
      parts.push(ellipse(160 + rng() * 1080, 180 + rng() * 520, 120 + rng() * 80, 36 + rng() * 20, "#1A2818", 0.72));
    }
    for (let i = 0; i < 3; i += 1) {
      const x = 300 + rng() * 800;
      parts.push(`<path d="M ${x.toFixed(1)} 80 L ${(x + 70).toFixed(1)} 980 L ${(x - 40).toFixed(1)} 980 Z" fill="${accent}" fill-opacity="0.16"/>`);
    }
    return parts.join("");
  }
  if (id === "stars-through-cloud") {
    for (let i = 0; i < 5; i += 1) parts.push(ellipse(200 + rng() * 1000, 240 + rng() * 700, 160 + rng() * 80, 48 + rng() * 20, "#242C38", 0.8));
    for (let i = 0; i < 18; i += 1) {
      const x = 140 + rng() * 1120;
      const y = 160 + rng() * 900;
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.1 + rng()).toFixed(1)}" fill="${accent}" fill-opacity="0.8"/>`);
    }
    return parts.join("");
  }
  if (id === "molten-gold" || id === "molten-copper" || id === "molten-steel" || id === "ember-hearth" || id === "lava-basalt") {
    const y = id === "ember-hearth" ? 1680 : 1500 + rng() * 280;
    const metal = spec.accent;
    parts.push(ellipse(x0, y, 260 + rng() * 80, 70, "#120E0C", 0.55));
    parts.push(ellipse(x0, y - 8, 190, 36, metal, 0.85));
    parts.push(ellipse(x0 - 40, y - 14, 70, 12, "#FFF6E8", 0.35));
    return parts.join("");
  }
  if (id === "riverbed" || id === "open-water" || id === "tide-shore") {
    for (let i = 0; i < 6; i += 1) {
      const y = 1500 + i * 70 + rng() * 12;
      parts.push(`<path d="M 80 ${y.toFixed(1)} Q 400 ${(y + (rng() - 0.5) * 30).toFixed(1)} 700 ${y.toFixed(1)} T 1320 ${(y + 6).toFixed(1)}" fill="none" stroke="${accent}" stroke-opacity="${(0.18 + i * 0.04).toFixed(2)}" stroke-width="${(8 + i).toFixed(1)}"/>`);
    }
    return parts.join("");
  }
  if (id === "ice-over-flow") {
    parts.push(`<path d="M 60 980 H 1340" fill="none" stroke="#F7FBFC" stroke-width="18" stroke-opacity="0.85"/>`);
    parts.push(`<path d="M 80 1120 Q 700 1240 1320 1100" fill="none" stroke="#1E3A40" stroke-width="22" stroke-opacity="0.35"/>`);
    return parts.join("");
  }
  if (id === "wind-sand") {
    for (let i = 0; i < 7; i += 1) {
      const y = 300 + i * 240;
      parts.push(`<path d="M 40 ${(y).toFixed(1)} Q 500 ${(y + 40).toFixed(1)} 1360 ${(y - 20).toFixed(1)}" fill="none" stroke="#8C7352" stroke-opacity="0.28" stroke-width="28"/>`);
    }
    return parts.join("");
  }
  if (id === "crystal-growth" || id === "mirror-glass") {
    const y = 720 + rng() * 400;
    for (let i = 0; i < 5; i += 1) {
      const x = x0 - 160 + i * 80;
      parts.push(`<path d="M ${x.toFixed(1)} ${(y + 80).toFixed(1)} L ${(x + 28).toFixed(1)} ${y.toFixed(1)} L ${(x + 56).toFixed(1)} ${(y + 80).toFixed(1)} Z" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.45"/>`);
    }
    return parts.join("");
  }
  if (id === "textile-weave") {
    for (let i = 0; i < 8; i += 1) {
      const y = 480 + i * 36;
      parts.push(`<path d="M ${x0 - 220} ${y} H ${x0 + 220}" stroke="${accent}" stroke-opacity="0.35" stroke-width="3"/>`);
    }
    for (let i = 0; i < 10; i += 1) {
      const x = x0 - 200 + i * 44;
      parts.push(`<path d="M ${x} 460 V 780" stroke="#3A3032" stroke-opacity="0.45" stroke-width="2"/>`);
    }
    return parts.join("");
  }
  if (id === "wood-grain" || id === "root-soil" || id === "vein-ore" || id === "cut-stone") {
    for (let i = 0; i < 5; i += 1) {
      const y = 400 + i * 280;
      parts.push(`<path d="M 100 ${y} Q ${x0.toFixed(1)} ${(y + 40).toFixed(1)} 1300 ${y + 10}" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="10"/>`);
    }
    return parts.join("");
  }
  if (id === "paper-fiber") {
    for (let i = 0; i < 9; i += 1) {
      const y = 260 + i * 190;
      parts.push(`<path d="M 90 ${y} H 1310" stroke="#C9BBA4" stroke-opacity="0.45" stroke-width="1"/>`);
    }
    return parts.join("");
  }
  if (id === "fog-veil" || id === "smoke-rise") {
    for (let i = 0; i < 4; i += 1) parts.push(ellipse(300 + rng() * 800, 400 + rng() * 1200, 280, 70, accent, 0.16));
    return parts.join("");
  }
  if (id === "lightning-threshold") {
    const x = x0;
    parts.push(`<path d="M ${x.toFixed(1)} 280 L ${(x - 40).toFixed(1)} 620 L ${(x + 20).toFixed(1)} 640 L ${(x - 20).toFixed(1)} 980" fill="none" stroke="${accent}" stroke-width="4" stroke-opacity="0.75"/>`);
    parts.push(ellipse(x, 420, 200, 50, "#2A3344", 0.55));
    return parts.join("");
  }
  return ellipse(x0, 1200, 200, 40, accent, 0.15);
}

function fieldLayer(material) {
  const hostSpec = material.host.id === "open-interval"
    ? { ground: material.host.luma === "light" ? ["#E7E1D4", "#D5CFC2", "#F4F0E6"] : ["#10161C", "#1A242C", "#243038"], accent: "#C9D0D4", luma: material.host.luma }
    : BY_ID.get(material.host.id);
  const rng = mulberry(`field|${material.render_seed}|${material.host.id}`);
  const parts = [defsFor("fieldgrad", hostSpec.ground)];
  parts.push(`<rect width="${W}" height="${H}" fill="url(#fieldgrad)"/>`);
  const vignette = hostSpec.luma === "light" ? "rgba(40,32,24,0.18)" : "rgba(0,0,0,0.38)";
  parts.push(`<defs><radialGradient id="vignette" cx="50%" cy="42%" r="75%"><stop offset="0.55" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="${vignette}"/></radialGradient></defs>`);
  parts.push(`<g data-field="host" data-phenomenon="${xml(material.host.id)}">`);
  parts.push(phenomenonMarks(material.host.id, rng, 640, hostSpec.luma));
  parts.push(`</g>`);
  if (material.guest) {
    const guestRng = mulberry(`field|${material.render_seed}|${material.guest.id}|guest`);
    parts.push(`<g data-field="guest" data-phenomenon="${xml(material.guest.id)}" opacity="0.9">`);
    parts.push(phenomenonMarks(material.guest.id, guestRng, 980, material.guest.luma));
    parts.push(`</g>`);
  }
  if (material.coupling === "local-exchange" || material.coupling === "held-interface") {
    parts.push(`<ellipse data-field-interface="${xml(material.coupling)}" cx="700" cy="260" rx="160" ry="42" fill="#F4F1E8" fill-opacity="0.14"/>`);
  }
  parts.push(`<rect width="${W}" height="${H}" fill="url(#vignette)"/>`);
  return parts.join("");
}

function ribbonPath(points, widthFn) {
  if (!points?.length) return "";
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = projectPoint(points[i]);
    const a = projectPoint(points[Math.max(0, i - 1)]);
    const b = projectPoint(points[Math.min(points.length - 1, i + 1)]);
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const w = widthFn(points[i], i);
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  }
  let d = `M ${left[0][0].toFixed(1)} ${left[0][1].toFixed(1)}`;
  for (let i = 1; i < left.length; i += 1) d += ` L ${left[i][0].toFixed(1)} ${left[i][1].toFixed(1)}`;
  for (let i = right.length - 1; i >= 0; i -= 1) d += ` L ${right[i][0].toFixed(1)} ${right[i][1].toFixed(1)}`;
  return `${d} Z`;
}

function strokeD(points) {
  const p0 = projectPoint(points[0]);
  let d = `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const p = projectPoint(points[i]);
    d += ` L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  }
  return d;
}

function widthAt(point, scale) {
  const depth = 0.78 + Math.min(2.2, point.z || 0) * 0.2;
  const pulse = 0.86 + 0.18 * Math.sin((point.t || 0) * Math.PI);
  return scale * depth * pulse * (point.radius || 1);
}

function ribbonSvg(points, id, color, width, attrs) {
  const d = strokeD(points);
  const shadow = strokeD(points.map((point) => ({ ...point, x: point.x + 16, y: point.y + 28, z: 0.02 })));
  const rim = strokeD(points.map((point) => ({ ...point, x: point.x - 5, y: point.y - 6 })));
  const body = Math.max(8, width * (points[0]?.radius || 1));
  return [
    `<path data-lighting="cast-shadow" d="${shadow}" fill="none" stroke="#05070A" stroke-width="${(body + 10).toFixed(1)}" stroke-opacity="0.33" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path id="${id}" d="${d}" fill="none" stroke="${color.support}" stroke-width="${body.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`,
    `<path d="${d}" fill="none" stroke="${color.main}" stroke-width="${(body * 0.68).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path data-lighting="specular" d="${rim}" fill="none" stroke="${color.highlight}" stroke-width="${Math.max(3, body * 0.16).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.9"/>`,
  ].join("");
}

export function glyphPath(term, relation, cx, cy) {
  const h = (i) => hashString(`${term}|${relation}|${i}`);
  const roll = h(0) % 5;
  const ops = relation === "boundary"
    ? ["threshold", "offset_counterface"]
    : relation === "disagreement"
      ? ["offset_counterface", "open_gap"]
      : ["joined_stem", ["alternate_weave", "inscribed_seam", "flow_channel", "foldback", "strata_return"][roll]];
  const parts = [];
  const tilt = ((h(2) % 50) - 25) * Math.PI / 180;
  const rot = (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  };
  const seg = (x1, y1, x2, y2) => {
    const a = rot(x1, y1);
    const b = rot(x2, y2);
    parts.push(`M ${a[0].toFixed(1)} ${a[1].toFixed(1)} L ${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
  };
  const spread = 16 + (h(3) % 28);
  for (const op of ops) {
    if (op === "joined_stem") {
      seg(cx, cy + 34, cx, cy - 30);
      seg(cx - spread, cy + 16, cx, cy - 30);
      seg(cx + spread * 0.85, cy + 10, cx, cy - 30);
    } else if (op === "alternate_weave") {
      seg(cx - spread, cy + 20, cx + 8, cy - 8);
      seg(cx + spread, cy + 16, cx - 6, cy - 22);
    } else if (op === "inscribed_seam") {
      seg(cx - 8, cy + 30, cx - 8, cy - 28);
      seg(cx + 10, cy + 24, cx + 10, cy - 20);
      seg(cx - 22, cy, cx + 24, cy + (h(4) % 12) - 6);
    } else if (op === "flow_channel") {
      seg(cx - spread, cy + 24, cx - 4, cy);
      seg(cx - 4, cy, cx + spread * 0.4, cy - 26);
    } else if (op === "foldback") {
      seg(cx + spread, cy + 22, cx - 6, cy - 4);
      seg(cx - 6, cy - 4, cx + 8, cy - 28);
    } else if (op === "strata_return") {
      seg(cx - spread, cy + 8, cx + spread, cy + 8);
      seg(cx - spread * 0.7, cy - 8, cx + spread * 0.5, cy - 8);
      seg(cx, cy + 28, cx, cy - 24);
    } else if (op === "threshold") {
      seg(cx - 30, cy, cx - 8, cy);
      seg(cx - 8, cy, cx - 8, cy + 14);
      seg(cx - 8, cy, cx + 26, cy);
    } else if (op === "offset_counterface") {
      seg(cx - spread, cy + 18, cx - 4, cy - 22);
      seg(cx + 6, cy + 22, cx + spread, cy - 12);
    } else if (op === "open_gap") {
      seg(cx - spread, cy - 4, cx - 8, cy - 4);
      seg(cx + 10, cy + 6, cx + spread, cy + 6);
    }
  }
  return { d: parts.join(" "), operators: ops };
}

function rootKnot(point, color, id) {
  const p = projectPoint(point);
  return `<circle id="${id}" data-root="foundation" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="11" fill="${color.support}" stroke="${color.highlight}" stroke-width="2"/>`;
}

export function renderLivingSvg(scene, view = {}) {
  const showStrand = view.strands !== false;
  const showField = view.field !== false;
  const material = scene.material || compileMaterial(scene);
  const parts = [];
  if (showField) parts.push(fieldLayer(material));
  else parts.push(`<rect id="field-ground" width="${W}" height="${H}" fill="#101720"/>`);
  const colorOf = (card) => card?.palette || { main: "#CED5DF", highlight: "#F4F2E9", support: "#7E91A2" };
  const drawRoot = (points, id, card, extra) => {
    const color = colorOf(card);
    const scale = card?.quiet ? 34 : 78;
    parts.push(ribbonSvg(points, id, color, scale, `data-root="source" data-card="${xml(card?.name)}" data-suit="${xml(card?.suitKey)}" ${extra}`));
    parts.push(rootKnot(points[0], color, `${id}-knot`));
    if (card && scene.guest && card.suitKey && card.suitKey === scene.host.suitKey) {
      parts.push(`<path data-provenance="same-lineage-ticks" d="${strokeD(points)}" fill="none" stroke="${color.highlight}" stroke-width="2" stroke-dasharray="3 18" stroke-linecap="round"/>`);
    }
  };
  const order = [{ points: scene.hostLine, id: "host-root", card: scene.host, extra: `data-orientation="${scene.hostOrientation}"` }];
  if (scene.guestLine && scene.guest) {
    order.push({
      points: scene.guestLine,
      id: "guest-root",
      card: scene.guest,
      extra: `data-orientation="${scene.guestOrientation}"${scene.host.name === scene.guest.name ? ' data-instance="second-instance"' : ""}`,
    });
  }
  order.sort((a, b) => (a.points[0].z || 0) - (b.points[0].z || 0));
  for (const root of order) drawRoot(root.points, root.id, root.card, root.extra);
  if (showStrand) {
    for (const strand of scene.strands || []) {
      const card = strand.id.startsWith("guest") ? scene.guest : scene.host;
      parts.push(ribbonSvg(strand.points, strand.id, colorOf(card), 28, `data-strand="internal" data-term="${xml(strand.term)}" data-landmark="branch-rejoin"`));
    }
  }
  if (scene.composite && view.glyph !== false) {
    parts.push(ribbonSvg(scene.composite.hostJoin, "join-host", colorOf(scene.host), 56, `data-root="composite" data-landmark="earned-bridge"`));
    parts.push(ribbonSvg(scene.composite.guestJoin, "join-guest", colorOf(scene.guest), 56, `data-root="composite" data-landmark="earned-bridge"`));
    parts.push(ribbonSvg(scene.composite.spine, "confluence", colorOf(scene.host), 50, `data-root="composite" data-landmark="shared-confluence"`));
    const shifted = scene.composite.spine.map((point) => ({ ...point, x: point.x + 9 }));
    parts.push(ribbonSvg(shifted, "confluence-guest", colorOf(scene.guest), 36, `data-root="composite" data-mix="none"`));
    if (scene.glyph) {
      parts.push(`<path id="glyph" data-glyph="${xml(scene.glyph.kind)}" data-landmark="top-glyph" data-term="${xml(scene.glyph.term)}" data-agreement="false" data-operators="${xml((scene.glyph.operators || []).join(","))}" d="${scene.glyph.d}" fill="none" stroke="#F4F2E9" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  } else if (scene.guestLine) {
    const hy = projectPoint(scene.hostLine.at(-1));
    const gy = projectPoint(scene.guestLine.at(-1));
    parts.push(`<path data-landmark="open-horizon" d="M ${hy[0].toFixed(1)} ${hy[1].toFixed(1)} L ${(hy[0] - 54).toFixed(1)} ${(hy[1] - 36).toFixed(1)}" fill="none" stroke="#E7E1D4" stroke-width="3" stroke-linecap="round" stroke-opacity="0.8"/>`);
    parts.push(`<path data-landmark="open-horizon" d="M ${gy[0].toFixed(1)} ${gy[1].toFixed(1)} L ${(gy[0] + 48).toFixed(1)} ${(gy[1] - 28).toFixed(1)}" fill="none" stroke="#E7E1D4" stroke-width="3" stroke-linecap="round" stroke-opacity="0.8"/>`);
  }
  for (const hit of (scene.landmarks || []).filter((item) => item.key === "noncontact-crossing" && item.at)) {
    parts.push(`<circle data-landmark="noncontact-crossing" cx="${hit.at.x.toFixed(1)}" cy="${hit.at.y.toFixed(1)}" r="7" fill="none" stroke="#F4F2E9" stroke-width="1.6"/>`);
  }
  const frame = material.host?.luma === "light" ? "#2C3338" : "#D5D0C6";
  parts.push(`<rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${frame}" stroke-opacity="0.45" stroke-width="1.4"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-renderer="${VERSION}" data-material="${xml(material.primary)}" data-coupling="${xml(material.coupling)}"><title>${xml(scene.host?.name)}</title>${parts.join("")}</svg>`;
}

export function livingBackSvg() {
  const rot = (points) => points.map(([x, y]) => [W - x, H - y]);
  const strokes = [];
  const add = (points) => strokes.push(points, rot(points));
  add([[520, 820], [610, 980], [560, 1160], [660, 1360], [600, 1540]]);
  add([[700, 760], [760, 940], [710, 1120], [790, 1320]]);
  add([[430, 980], [500, 1160], [450, 1340]]);
  add([[360, 900], [390, 1040], [350, 1180]]);
  add([[640, 700], [640, 860]]);
  const body = strokes.map((points, index) => {
    const pair = Math.floor(index / 2);
    const d = points.map((point, i) => `${i ? "L" : "M"} ${point[0]} ${point[1]}`).join(" ");
    const width = pair % 2 === 0 ? 11 : 7;
    const stroke = pair % 2 ? "#B7C0C8" : "#D5DCE3";
    return `<path id="back-${index + 1}" d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect id="back-ground" width="${W}" height="${H}" fill="#101720"/>${body}<title>Dendrite</title></svg>`;
}
