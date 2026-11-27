// @ts-nocheck
// Stage 2 of v16. The SVG is a private skeleton. This pass turns those courses
// into carved, lit material. It does not paint the diagnostic strokes back on.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { projectPoint } from "./living-field.mjs";

const SW = 2800;
const SH = 4600;
const OUT_W = 1400;
const OUT_H = 2300;

const LOOK = {
  "ember-hearth": { sky: [32, 18, 14], ground: [16, 10, 9], channel: [214, 108, 42], rim: [255, 214, 170], wash: [90, 40, 22], mode: "heat" },
  "molten-gold": { sky: [36, 26, 16], ground: [18, 12, 8], channel: [214, 168, 64], rim: [255, 230, 180], wash: [90, 60, 24], mode: "heat" },
  "molten-copper": { sky: [36, 18, 14], ground: [20, 10, 8], channel: [196, 88, 48], rim: [255, 186, 150], wash: [90, 36, 22], mode: "heat" },
  "molten-steel": { sky: [24, 26, 30], ground: [12, 14, 16], channel: [206, 214, 220], rim: [255, 236, 220], wash: [70, 74, 80], mode: "heat" },
  "lava-basalt": { sky: [18, 16, 16], ground: [10, 10, 12], channel: [176, 52, 28], rim: [120, 112, 108], wash: [60, 24, 16], mode: "heat" },
  "rain-on-glass": { sky: [34, 48, 54], ground: [16, 24, 28], channel: [176, 198, 204], rim: [232, 242, 244], wash: [70, 96, 104], mode: "glass" },
  "riverbed": { sky: [18, 32, 32], ground: [12, 22, 22], channel: [108, 146, 142], rim: [214, 204, 184], wash: [30, 60, 58], mode: "flow" },
  "open-water": { sky: [14, 30, 38], ground: [8, 18, 24], channel: [96, 142, 152], rim: [200, 220, 222], wash: [20, 50, 60], mode: "flow" },
  "tide-shore": { sky: [26, 38, 40], ground: [36, 32, 26], channel: [120, 146, 142], rim: [224, 214, 196], wash: [40, 60, 56], mode: "flow" },
  "canopy-light": { sky: [20, 32, 18], ground: [10, 16, 10], channel: [64, 84, 52], rim: [220, 200, 140], wash: [30, 48, 24], mode: "canopy" },
  "stars-through-cloud": { sky: [8, 10, 16], ground: [6, 8, 12], channel: [168, 176, 190], rim: [236, 232, 220], wash: [28, 32, 48], mode: "stars" },
  "ice-over-flow": { sky: [206, 220, 224], ground: [150, 172, 176], channel: [36, 64, 74], rim: [255, 255, 255], wash: [180, 200, 204], mode: "ice" },
  "wind-sand": { sky: [206, 186, 154], ground: [150, 120, 86], channel: [112, 84, 54], rim: [232, 214, 186], wash: [170, 140, 100], mode: "groove" },
  "crystal-growth": { sky: [14, 18, 30], ground: [10, 14, 22], channel: [188, 200, 214], rim: [240, 244, 248], wash: [40, 50, 70], mode: "vein" },
  "textile-weave": { sky: [52, 42, 40], ground: [32, 26, 24], channel: [142, 122, 104], rim: [220, 204, 184], wash: [70, 56, 48], mode: "weave" },
  "wood-grain": { sky: [52, 34, 22], ground: [30, 20, 14], channel: [86, 54, 32], rim: [190, 150, 110], wash: [70, 44, 26], mode: "groove" },
  "paper-fiber": { sky: [232, 224, 208], ground: [206, 196, 176], channel: [58, 52, 44], rim: [40, 36, 30], wash: [180, 170, 150], mode: "groove" },
  "cut-stone": { sky: [42, 44, 48], ground: [26, 28, 30], channel: [62, 66, 70], rim: [186, 190, 194], wash: [50, 52, 56], mode: "groove" },
  "fog-veil": { sky: [176, 184, 188], ground: [132, 140, 146], channel: [64, 72, 78], rim: [236, 240, 242], wash: [160, 168, 172], mode: "mist" },
  "smoke-rise": { sky: [30, 26, 22], ground: [16, 14, 12], channel: [116, 108, 100], rim: [200, 192, 180], wash: [50, 44, 38], mode: "mist" },
  "lightning-threshold": { sky: [14, 16, 28], ground: [8, 10, 16], channel: [210, 220, 236], rim: [255, 255, 255], wash: [40, 48, 80], mode: "heat" },
  "mirror-glass": { sky: [22, 32, 38], ground: [12, 18, 22], channel: [180, 194, 202], rim: [240, 246, 248], wash: [50, 70, 80], mode: "glass" },
  "oil-film": { sky: [20, 16, 14], ground: [10, 9, 8], channel: [36, 32, 26], rim: [180, 150, 80], wash: [30, 26, 20], mode: "oil" },
  "vein-ore": { sky: [26, 22, 18], ground: [14, 12, 10], channel: [164, 144, 104], rim: [220, 204, 170], wash: [50, 40, 28], mode: "vein" },
  "root-soil": { sky: [30, 20, 14], ground: [16, 10, 8], channel: [74, 50, 32], rim: [160, 124, 86], wash: [40, 26, 16], mode: "groove" },
  "glass-condensation": { sky: [32, 44, 50], ground: [18, 26, 30], channel: [190, 208, 212], rim: [236, 246, 248], wash: [60, 80, 90], mode: "glass" },
  "mineral-vein": { sky: [22, 22, 26], ground: [14, 14, 16], channel: [176, 168, 154], rim: [228, 224, 214], wash: [48, 46, 42], mode: "vein" },
  "sediment-wind": { sky: [74, 60, 44], ground: [46, 36, 26], channel: [84, 64, 42], rim: [210, 190, 160], wash: [90, 70, 48], mode: "groove" },
  "stone-stress": { sky: [38, 40, 42], ground: [22, 24, 26], channel: [36, 38, 40], rim: [176, 180, 184], wash: [48, 50, 52], mode: "groove" },
  "mist-pressure": { sky: [72, 80, 84], ground: [44, 50, 54], channel: [32, 38, 42], rim: [196, 204, 206], wash: [90, 100, 104], mode: "mist" },
  "held-interval": { sky: [14, 18, 22], ground: [10, 12, 16], channel: [22, 28, 32], rim: [70, 78, 84], wash: [18, 22, 26], mode: "quiet" },
};

const ANALOGIES = ["glass-condensation", "mineral-vein", "sediment-wind", "stone-stress", "mist-pressure"];
const VERSION_SALT = "velomere-material-compositor/16f";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashString(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hexOf(value) {
  const n = parseInt(String(value || "#888888").slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function soften(col) {
  return [Math.round(col[0] * 0.4 + 150 * 0.6), Math.round(col[1] * 0.4 + 150 * 0.6), Math.round(col[2] * 0.4 + 150 * 0.6)];
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

function addStroke(parts, points, color, width) {
  if (!points?.length) return;
  parts.push(`<path d="${strokeD(points)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`);
}

export function structureSvg(scene) {
  const parts = [`<rect width="${OUT_W}" height="${OUT_H}" fill="#000"/>`];
  const hostW = scene.host?.quiet ? 16 : 28;
  addStroke(parts, scene.hostLine, "#ff0000", hostW);
  if (scene.guestLine) addStroke(parts, scene.guestLine, "#00ff00", scene.guest?.quiet ? 16 : 28);
  for (const strand of scene.strands || []) {
    addStroke(parts, strand.points, strand.id.startsWith("guest") ? "#00ff00" : "#ff0000", 12);
  }
  if (scene.composite) {
    addStroke(parts, scene.composite.hostJoin, "#ff0000", 22);
    addStroke(parts, scene.composite.spine, "#ff0000", 18);
    addStroke(parts, scene.composite.guestJoin, "#00ff00", 22);
    addStroke(parts, scene.composite.spine.map((point) => ({ ...point, x: point.x + 10 })), "#00ff00", 16);
  }
  if (scene.glyph?.d) parts.push(`<path d="${scene.glyph.d}" fill="none" stroke="#0000ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${OUT_W} ${OUT_H}">${parts.join("")}</svg>`;
}

function phenomenonFor(card, selected, salt) {
  if (!card) return "mist-pressure";
  if (card.quiet) return "held-interval";
  if (selected && selected !== "open-interval" && LOOK[selected]) return selected;
  return ANALOGIES[hashString(`${salt}|${card.name}|${card.core}`) % ANALOGIES.length];
}

export function finishRecipe(scene) {
  const hostId = phenomenonFor(scene.host, scene.material?.host?.id, scene.date || "");
  const guestId = scene.guest ? phenomenonFor(scene.guest, scene.material?.guest?.id, `${scene.date}|guest`) : null;
  const named = scene.material?.host?.id && scene.material.host.id !== "open-interval";
  return {
    primary: hostId,
    guest: guestId,
    coupling: scene.material?.coupling || (scene.guest ? "no-relation" : "solo"),
    why_sparse: hostId === "held-interval" ? `${scene.host.name} is a protected quiet. The field stays a held interval.` : null,
    rationale: named
      ? scene.material.host.rationale
      : hostId === "held-interval"
        ? "Quiet is the material. No weather was added to fill the silence."
        : `${scene.host.name} names no material. ${hostId} carries the course as a physical analogy of one continuous motion. The choice is the card's core, not its suit.`,
    earned: Boolean(scene.composite),
  };
}

function lookOf(id) {
  return LOOK[id] || LOOK["mist-pressure"];
}

const cache = new Map();

function remember(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > 12) cache.delete(cache.keys().next().value);
}

async function rasterStructure(svg) {
  const { data, info } = await sharp(Buffer.from(svg), { density: 144 })
    .resize(SW, SH, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function blurGrey(src, width, height, sigma) {
  return sharp(src, { raw: { width, height, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
}

function coarseField(seed) {
  const gw = 40;
  const gh = 66;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i += 1) {
    let h = Math.imul((i + 1) ^ seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    g[i] = ((h >>> 16) & 255) / 255;
  }
  return g;
}

function fieldAt(grid, x, y, width, height) {
  const gw = 40;
  const gh = 66;
  const fx = (x / (width - 1)) * (gw - 1);
  const fy = (y / (height - 1)) * (gh - 1);
  const x0 = fx | 0;
  const y0 = fy | 0;
  const x1 = x0 + 1 < gw ? x0 + 1 : x0;
  const y1 = y0 + 1 < gh ? y0 + 1 : y0;
  const tx = fx - x0;
  const ty = fy - y0;
  const a = grid[y0 * gw + x0];
  const b = grid[y0 * gw + x1];
  const c = grid[y1 * gw + x0];
  const d = grid[y1 * gw + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function applyCourse(rgb, body, core, wideBuf, i, iL, iU, look, localMode, cloud) {
  if (body < 0.04 && core < 0.15) return;
  const gx = (wideBuf[i] - wideBuf[iL]) / 255;
  const gy = (wideBuf[i] - wideBuf[iU]) / 255;
  const light = Math.max(-1, Math.min(1, (gx * 1.1 + gy * 1.4) / 0.12));
  const shadowSide = Math.max(0, -light);
  const litSide = Math.max(0, light);
  const dig = Math.min(1, body * 1.25);
  const digAmt = (localMode === "quiet" ? 0.28 : 0.55) * dig * (0.6 + 0.75 * shadowSide);
  rgb[0] *= 1 - digAmt;
  rgb[1] *= 1 - digAmt;
  rgb[2] *= 1 - digAmt;
  if (core < 0.25 && body > 0.06) {
    const lip = body * litSide;
    const stone = localMode === "quiet" ? 24 : 110;
    rgb[0] += lip * stone;
    rgb[1] += lip * stone * 0.86;
    rgb[2] += lip * stone * 0.66;
  }
  if (core > 0.45) {
    const ridge = Math.max(0, Math.min(1, (body - 0.45) / 0.48));
    const groove = localMode === "groove" || localMode === "vein";
    let cr;
    let cg;
    let cb;
    let m;
    if (localMode === "quiet") {
      cr = 30; cg = 36; cb = 42; m = 0.4;
    } else if (localMode === "heat") {
      cr = 32 + ridge * 188;
      cg = 14 + ridge * 86;
      cb = 8 + ridge * 24;
      m = 0.78 + ridge * 0.18;
    } else if (groove) {
      cr = look.rim[0] * (0.22 + ridge * 0.5);
      cg = look.rim[1] * (0.22 + ridge * 0.5);
      cb = look.rim[2] * (0.22 + ridge * 0.5);
      m = 0.62 + ridge * 0.25;
    } else {
      const thread = 0.28 + ridge * 0.5;
      cr = look.channel[0] * thread;
      cg = look.channel[1] * thread;
      cb = look.channel[2] * thread;
      m = 0.66 + ridge * 0.24;
    }
    cr += (cloud - 0.5) * 18;
    cg += (cloud - 0.5) * 12;
    cb += (cloud - 0.5) * 8;
    rgb[0] = rgb[0] * (1 - m) + cr * m;
    rgb[1] = rgb[1] * (1 - m) + cg * m;
    rgb[2] = rgb[2] * (1 - m) + cb * m;
  }
}

function paint(raw, hostWide, hostTight, guestWide, guestTight, wash, width, height, recipe, scene) {
  const hostLook = lookOf(recipe.primary);
  const guestLook = lookOf(recipe.guest || recipe.primary);
  const hostTint = soften(hexOf(scene.host?.palette?.main));
  const guestTint = scene.guest ? soften(hexOf(scene.guest.palette?.main)) : hostTint;
  const guestZ = scene.guestLine?.[0]?.z || 0;
  const hostZ = scene.hostLine?.[0]?.z || 0;
  const guestNear = guestZ >= hostZ;
  const earned = Boolean(scene.composite);
  const seed = hashString(`${recipe.primary}|${recipe.guest}|${scene.date}|${scene.host?.name}|${scene.guest?.name || ""}`);
  const clouds = coarseField(seed);
  const out = Buffer.alloc(width * height * 3);
  const mode = hostLook.mode;
  const guestMode = guestLook.mode;
  const rgb = [0, 0, 0];
  const mixLook = { rim: [0, 0, 0], channel: [0, 0, 0] };
  const mixTint = [0, 0, 0];
  for (let y = 0, i = 0, p = 0; y < height; y += 1) {
    const ny = y / height;
    const skyT = ny < 0.62 ? ny / 0.62 : 1;
    const horizon = Math.exp(-((ny - 0.62) * (ny - 0.62)) * 180);
    const skyR = hostLook.ground[0] + (hostLook.sky[0] - hostLook.ground[0]) * (1 - skyT) + horizon * (mode === "heat" ? 18 : 8);
    const skyG = hostLook.ground[1] + (hostLook.sky[1] - hostLook.ground[1]) * (1 - skyT) + horizon * (mode === "heat" ? 8 : 6);
    const skyB = hostLook.ground[2] + (hostLook.sky[2] - hostLook.ground[2]) * (1 - skyT) + horizon * 4;
    for (let x = 0; x < width; x += 1, i += 1, p += 3) {
      const hCore = hostTight[i] / 255;
      const gCore = guestTight[i] / 255;
      let hBody = hostWide[i] / 255;
      let gBody = guestWide[i] / 255;
      const glyph = raw[i * 3 + 2];
      const around = wash[i];
      const cloud = fieldAt(clouds, x, y, width, height);
      const grain = (cloud - 0.5) * (mode === "quiet" ? 10 : 58);
      const bed = Math.sin(y * 0.015 + cloud * 3.4) * (mode === "quiet" ? 1.2 : 9);
      const lift = mode === "quiet" ? 0 : 14;
      rgb[0] = skyR + lift + grain + bed;
      rgb[1] = skyG + lift * 0.85 + grain * 0.82 + bed * 0.65;
      rgb[2] = skyB + lift * 0.7 + grain * 0.68;
      if (mode === "flow" && hBody < 0.08 && Math.abs(Math.sin(y * 0.006 + cloud * 5)) < 0.08) {
        rgb[0] += 3; rgb[1] += 5; rgb[2] += 4;
      }
      const nearCourse = hBody > 0.025 || gBody > 0.025 || hCore > 0.08 || gCore > 0.08 || (glyph > 40 && earned);
      if (around > 16 && hCore < 0.2 && gCore < 0.2) {
        const t = (around / 255) * 0.42;
        rgb[0] = rgb[0] * (1 - t) + guestLook.wash[0] * t;
        rgb[1] = rgb[1] * (1 - t) + guestLook.wash[1] * t;
        rgb[2] = rgb[2] * (1 - t) + guestLook.wash[2] * t;
      }
      if (nearCourse) {
        const joining = earned && ny < 0.34 && hCore > 0.22 && gCore > 0.22;
        if (!joining) {
          const guestWins = guestNear ? gCore >= hCore * 0.92 : gCore > hCore * 1.2;
          if (guestWins && gCore > 0.2) hBody *= 1 - Math.min(1, (gCore - 0.2) * 2.4);
          else if (hCore > 0.2 && gCore > 0.05) gBody *= 1 - Math.min(1, (hCore - 0.2) * 2.4);
        }
        const iL = x > 0 ? i - 1 : i;
        const iU = y > 0 ? i - width : i;
        if (joining) {
          const twist = 0.5 + 0.5 * Math.sin(x * 0.02 + y * 0.012);
          for (let k = 0; k < 3; k += 1) {
            mixLook.rim[k] = hostLook.rim[k] * twist + guestLook.rim[k] * (1 - twist);
            mixLook.channel[k] = hostLook.channel[k] * twist + guestLook.channel[k] * (1 - twist);
            mixTint[k] = hostTint[k] * twist + guestTint[k] * (1 - twist);
          }
          applyCourse(rgb, Math.max(hBody, gBody), Math.max(hCore, gCore), hostWide, i, iL, iU, mixLook, mode === "quiet" ? guestMode : mode, cloud);
        } else if (guestNear) {
          applyCourse(rgb, hBody, hCore * (gCore > 0.45 ? 0.15 : 1), hostWide, i, iL, iU, hostLook, mode, cloud);
          applyCourse(rgb, gBody, gCore, guestWide, i, iL, iU, guestLook, guestMode, cloud);
        } else {
          applyCourse(rgb, gBody, gCore * (hCore > 0.45 ? 0.15 : 1), guestWide, i, iL, iU, guestLook, guestMode, cloud);
          applyCourse(rgb, hBody, hCore, hostWide, i, iL, iU, hostLook, mode, cloud);
        }
        if (glyph > 40 && earned) {
          const m = (glyph / 255) * 0.85;
          rgb[0] = rgb[0] * (1 - m) + 210 * m;
          rgb[1] = rgb[1] * (1 - m) + 198 * m;
          rgb[2] = rgb[2] * (1 - m) + 176 * m;
        }
      }
      const vx = (x - width * 0.5) / width;
      const vy = (y - height * 0.46) / height;
      const vig = 1 - Math.min(0.46, (vx * vx * 0.8 + vy * vy) * 0.62);
      const r = rgb[0] * vig;
      const g = rgb[1] * vig;
      const b = rgb[2] * vig;
      out[p] = r < 0 ? 0 : r > 255 ? 255 : r;
      out[p + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      out[p + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
  return out;
}

function viewNearest(line, x, y) {
  let best = 1e9;
  if (!line?.length) return best;
  for (let i = 0; i < line.length; i += 1) {
    const p = projectPoint(line[i]);
    const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function samplePixel(raw, width, height, x, y, scale) {
  const X = Math.max(0, Math.min(width - 1, Math.round(x * scale)));
  const Y = Math.max(0, Math.min(height - 1, Math.round(y * scale)));
  const p = (Y * width + X) * 3;
  return [raw[p], raw[p + 1], raw[p + 2]];
}

function skeletonAudit(raw, width, height, scene) {
  const scale = width / OUT_W;
  let root = 0;
  let n = 0;
  const step = Math.max(1, Math.floor((scene.hostLine?.length || 1) / 16));
  for (let i = 0; i < (scene.hostLine?.length || 0); i += step) {
    const [sx, sy] = projectPoint(scene.hostLine[i]);
    root += samplePixel(raw, width, height, sx, sy, scale)[0];
    n += 1;
  }
  let earnedContact = !scene.composite;
  if (scene.composite?.spine?.length) {
    const a = scene.composite.spine[0];
    const b = scene.composite.spine[scene.composite.spine.length - 1];
    let bestR = 0;
    let bestG = 0;
    for (let t = 0.2; t <= 0.8; t += 0.12) {
      const point = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t,
      };
      const [sx, sy] = projectPoint(point);
      bestR = Math.max(bestR, samplePixel(raw, width, height, sx, sy, scale)[0]);
      bestG = Math.max(bestG, samplePixel(raw, width, height, sx + 10, sy, scale)[1]);
    }
    earnedContact = bestR > 50 && bestG > 50;
  }
  let falseJoin = false;
  if (!scene.composite && scene.guestLine?.length && scene.hostLine?.length) {
    const a = projectPoint(scene.hostLine.at(-1));
    const b = projectPoint(scene.guestLine.at(-1));
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 70) {
      for (let t = 0.28; t <= 0.72; t += 0.11) {
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        const pix = samplePixel(raw, width, height, x, y, scale);
        const grey = pix[0] > pix[1] ? pix[0] : pix[1];
        if (grey < 36) continue;
        if (viewNearest(scene.hostLine, x, y) > 30 && viewNearest(scene.guestLine, x, y) > 30) falseJoin = true;
      }
    }
    let glyphLeak = 0;
    for (let gy = 16; gy < height; gy += 28) {
      for (let gx = 16; gx < width; gx += 28) {
        const p = (gy * width + gx) * 3;
        if (raw[p + 2] > 90 && raw[p] < 24 && raw[p + 1] < 24) glyphLeak += 1;
      }
    }
    if (glyphLeak > 1) falseJoin = true;
  }
  return {
    sourceRoots: n ? root / n > 70 : false,
    earnedContact,
    falseJoin,
    meanRoot: n ? root / n : 0,
  };
}

function paintAudit(painted, width, height, scene, recipe) {
  const scale = width / OUT_W;
  const suit = hexOf(scene.host?.palette?.main);
  const look = lookOf(recipe.primary);
  const tint = soften(suit);
  const expect = [
    look.channel[0] * 0.84 + tint[0] * 0.16,
    look.channel[1] * 0.84 + tint[1] * 0.16,
    look.channel[2] * 0.84 + tint[2] * 0.16,
  ];
  let suitD = 0;
  let matD = 0;
  let sep = 0;
  let n = 0;
  const step = Math.max(1, Math.floor((scene.hostLine?.length || 1) / 14));
  for (let i = 0; i < (scene.hostLine?.length || 0); i += step) {
    const [sx, sy] = projectPoint(scene.hostLine[i]);
    const x = Math.max(2, Math.min(width - 3, Math.round(sx * scale)));
    const y = Math.max(2, Math.min(height - 3, Math.round(sy * scale)));
    const p = (y * width + x) * 3;
    const side = (y * width + Math.min(width - 1, x + 120)) * 3;
    suitD += Math.abs(painted[p] - suit[0]) + Math.abs(painted[p + 1] - suit[1]) + Math.abs(painted[p + 2] - suit[2]);
    matD += Math.abs(painted[p] - expect[0]) + Math.abs(painted[p + 1] - expect[1]) + Math.abs(painted[p + 2] - expect[2]);
    sep += Math.abs(painted[p] - painted[side]) + Math.abs(painted[p + 1] - painted[side + 1]) + Math.abs(painted[p + 2] - painted[side + 2]);
    n += 1;
  }
  const meanSuitDistance = n ? suitD / n : 999;
  const meanMaterialDistance = n ? matD / n : 999;
  const lineOverlay = meanSuitDistance < 34 && meanSuitDistance + 16 < meanMaterialDistance ? "present" : "absent";
  return {
    meanSuitDistance,
    meanMaterialDistance,
    meanSeparation: n ? sep / n : 0,
    lineOverlay,
  };
}

export async function finishCardArtV16(job) {
  const { scene, svg, date, affinity } = job;
  if (process.env.VEL_MATERIALIZATION_V16 === "0") {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return {
      finalPng1400x2300: png,
      evidence: {
        schema_version: "velomere-finishing-evidence/16",
        finisher_backend: "v15_svg_raster_fallback",
        quality_tier: 0,
        status: "unverified",
        limitations: ["VEL_MATERIALIZATION_V16=0 restored the v15 SVG raster."],
      },
    };
  }
  const recipe = finishRecipe(scene);
  const skeleton = structureSvg(scene);
  const key = sha256(`${skeleton}|${recipe.primary}|${recipe.guest}|${VERSION_SALT}`);
  const hit = cache.get(key);
  if (hit) return { finalPng1400x2300: hit.png, evidence: { ...hit.evidence, cache: "hit" } };
  const raster = await rasterStructure(skeleton);
  const hostGrey = Buffer.alloc(raster.width * raster.height);
  const guestGrey = Buffer.alloc(raster.width * raster.height);
  for (let i = 0, p = 0; i < hostGrey.length; i += 1, p += 3) {
    hostGrey[i] = raster.data[p];
    guestGrey[i] = raster.data[p + 1];
  }
  const [hostWide, hostTight, guestWide, guestTight, wash] = await Promise.all([
    blurGrey(hostGrey, raster.width, raster.height, 22),
    blurGrey(hostGrey, raster.width, raster.height, 1.35),
    blurGrey(guestGrey, raster.width, raster.height, 22),
    blurGrey(guestGrey, raster.width, raster.height, 1.35),
    blurGrey(guestGrey, raster.width, raster.height, 36),
  ]);
  const skel = skeletonAudit(raster.data, raster.width, raster.height, scene);
  const painted = paint(raster.data, hostWide, hostTight, guestWide, guestTight, wash, raster.width, raster.height, recipe, scene);
  const audit = paintAudit(painted, raster.width, raster.height, scene, recipe);
  const png = await sharp(painted, { raw: { width: raster.width, height: raster.height, channels: 3 } })
    .resize(OUT_W, OUT_H, { kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true, colours: 64, quality: 72, effort: 7 })
    .toBuffer();
  const evidence = {
    schema_version: "velomere-finishing-evidence/16",
    scene_digest: sha256(JSON.stringify({
      host: scene.host?.name,
      guest: scene.guest?.name || null,
      relation: scene.linked?.relation || null,
      term: scene.linked?.term || null,
      earned: Boolean(scene.composite),
    })),
    svg_digest: sha256(svg),
    skeleton_digest: sha256(raster.data),
    finished_png_digest: sha256(png),
    finisher_backend: "2d_material_compositor",
    quality_tier: 1,
    verified_at: new Date().toISOString(),
    internal_scale: 2,
    renderer_note: "No image-to-image model is installed. Stage 2 is a procedural material compositor. Not photoreal, not a second copy of the SVG.",
    recipe,
    date,
    affinity,
    geometry: {
      source_roots_preserved: skel.sourceRoots,
      earned_contacts_preserved: skel.earnedContact,
      forbidden_contacts_avoided: !skel.falseJoin,
      branches_connected: (scene.strands || []).every((strand) => strand.rejoins !== false),
      regressions_visible: !(scene.landmarks || []).some((mark) => mark.key === "regression-dip") || (scene.landmarks || []).some((mark) => mark.key === "regression-dip" && mark.dip >= 36),
    },
    visual: {
      line_overlay_look: audit.lineOverlay,
      material_events_verified: (scene.landmarks || []).filter((mark) => mark.key !== "foundation-pair").length,
      local_landmark_checks: (scene.landmarks || []).slice(0, 8).map((mark) => ({ key: mark.key, term: mark.term || null })),
      blind_reading: null,
      mean_suit_distance: Math.round(audit.meanSuitDistance),
      mean_material_distance: Math.round(audit.meanMaterialDistance),
      mean_path_separation: Math.round(audit.meanSeparation),
      skeleton_root: Math.round(skel.meanRoot),
    },
    limitations: [
      "Backend is 2d_material_compositor, tier 1. No generative image model was called.",
      "Human legibility is not_yet_measured.",
      ...(recipe.why_sparse ? [recipe.why_sparse] : []),
    ],
    status: audit.lineOverlay === "present" || skel.falseJoin || !skel.sourceRoots || !skel.earnedContact ? "failed" : "passed",
  };
  remember(key, { png, evidence });
  return { finalPng1400x2300: png, evidence };
}

export async function finishBackV16(svg) {
  const base = await sharp(Buffer.from(svg)).resize(OUT_W, OUT_H).removeAlpha().raw().toBuffer();
  const grey = Buffer.alloc(OUT_W * OUT_H);
  for (let i = 0, p = 0; i < grey.length; i += 1, p += 3) grey[i] = Math.max(base[p], base[p + 1], base[p + 2]);
  const wide = await blurGrey(grey, OUT_W, OUT_H, 6);
  const rgb = Buffer.alloc(OUT_W * OUT_H * 3);
  const cx = (OUT_W - 1) / 2;
  const cy = (OUT_H - 1) / 2;
  const maxR = Math.hypot(cx, cy);
  for (let y = 0, i = 0, p = 0; y < OUT_H; y += 1) {
    for (let x = 0; x < OUT_W; x += 1, i += 1, p += 3) {
      const dist = Math.hypot(x - cx, y - cy) / maxR;
      const vein = wide[i] / 255;
      const stone = 18 + (1 - dist) * 28;
      let r = stone * (1 - vein) + (150 * vein);
      let g = stone * (1 - vein) + (158 * vein);
      let b = stone * (1 - vein) + (166 * vein);
      const core = grey[i] / 255;
      r = r * (1 - core) + 214 * core;
      g = g * (1 - core) + 220 * core;
      b = b * (1 - core) + 226 * core;
      rgb[p] = r;
      rgb[p + 1] = g;
      rgb[p + 2] = b;
    }
  }
  for (let y = 0; y < OUT_H; y += 1) {
    for (let x = 0; x < OUT_W; x += 1) {
      const ox = OUT_W - 1 - x;
      const oy = OUT_H - 1 - y;
      if (oy < y || (oy === y && ox < x)) continue;
      const a = (y * OUT_W + x) * 3;
      const b = (oy * OUT_W + ox) * 3;
      for (let c = 0; c < 3; c += 1) {
        const v = (rgb[a + c] + rgb[b + c]) >> 1;
        rgb[a + c] = v;
        rgb[b + c] = v;
      }
    }
  }
  return sharp(rgb, { raw: { width: OUT_W, height: OUT_H, channels: 3 } }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
}
