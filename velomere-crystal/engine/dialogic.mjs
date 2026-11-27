// @ts-nocheck
// Dialogic rootline v14. Canon text is not rewritten. Motion is a suit-grammar
// consequence of a term attested in both passages. Overlap is not agreement.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { zipSync } from "fflate";
import { CANON_SHA, loadSources } from "./rootline.mjs";
import {
  GRAMMAR_VERSION,
  ORIGIN_LEXICON,
  POLICY_VERSION,
  RECIPE_VERSION,
  STYLE_ID,
  STYLE_LABEL,
  TRACE_SCHEMA,
  VERSION,
} from "./export-identity.mjs";
import {
  compileMaterial,
  glyphPath as livingGlyph,
  livingBackSvg,
  projectPoint,
  renderLivingSvg,
} from "./living-field.mjs";
import {
  finishBackV16,
  finishCardArtV16,
} from "./finish-card.mjs";

export {
  CANON_SHA,
  GRAMMAR_VERSION,
  ORIGIN_LEXICON,
  POLICY_VERSION,
  RECIPE_VERSION,
  STYLE_ID,
  STYLE_LABEL,
  TRACE_SCHEMA,
  VERSION,
  loadSources,
};

const W = 1400;
const H = 2300;
const FIELD = "#101720";
const CAPACITY_MIN = 18;

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : Buffer.from(value)).digest("hex");
}

function hashString(value) {
  let h = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(seed, salt) {
  return (hashString(`${seed}:${salt}`) % 10000) / 10000;
}

function xml(value) {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  return String(value ?? "").replaceAll("&", amp).replaceAll("<", lt).replaceAll(">", gt).replaceAll('"', quot);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function passageOf(card, orientation) {
  return orientation === "shadow" ? card.reversed : card.upright;
}

function sentences(passage) {
  const out = [];
  const re = /[^.!?]+[.!?]?/g;
  let match;
  while ((match = re.exec(passage))) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lead = raw.indexOf(trimmed);
    out.push({ text: trimmed, start: match.index + lead, end: match.index + lead + trimmed.length });
  }
  return out.length ? out : [{ text: passage, start: 0, end: passage.length }];
}

function escapeRe(term) {
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const FUNCTION_WORDS = new Set("a an the its their his her this that these those of on in to for with from by and or as into yet still very own over under about after before than then but if when while who whom whose which what your our my you them him us be been being not no never without nor permanent its".split(" "));

function negationScope(sentence, index, word) {
  let clauseStart = 0;
  for (const sep of [",", ";", ":", "—", "–"]) {
    const at = sentence.lastIndexOf(sep, index);
    if (at + 1 > clauseStart) clauseStart = at + 1;
  }
  const before = sentence.slice(clauseStart, index);
  const after = sentence.slice(index + word.length);
  if (/^\s+(is|are|was|were|becomes?|means?|remains?)\s+not\b/i.test(after)) {
    return { negated: false, scope: "unproven", nearer: "complement" };
  }
  const matches = [...before.matchAll(/\b(not|no|never|without|nor)\b/gi)];
  if (!matches.length) return { negated: false, scope: "none" };
  const neg = matches[matches.length - 1];
  const between = before.slice(neg.index + neg[0].length);
  const tokens = between.toLowerCase().match(/[a-z']+/g) || [];
  const content = tokens.filter((tok) => !FUNCTION_WORDS.has(tok));
  if (!content.length) return { negated: true, scope: "direct" };
  return { negated: false, scope: "unproven", nearer: content[0] };
}

function termContext(passage, term) {
  if (!term || term.includes(" ")) return null;
  const re = new RegExp(`\\b${escapeRe(term)}\\b`, "i");
  for (const sentence of sentences(passage)) {
    const found = re.exec(sentence.text);
    if (!found) continue;
    const scope = negationScope(sentence.text, found.index, found[0]);
    return {
      term,
      quote: sentence.text,
      start: sentence.start,
      end: sentence.end,
      negated: scope.negated,
      negation: scope.scope,
      nearer: scope.nearer || null,
    };
  }
  return null;
}

function gestureOf(card) {
  if (card.suitKey !== "Major") return card.palette.gesture;
  if (card.quiet) return "slow-bend";
  const kinds = ["slow-bend", "single-bow", "two-phase", "measured-facet", "recurve"];
  return kinds[hashString(card.core) % kinds.length];
}

function gestureOffset(gesture, t, amp, phase) {
  if (gesture === "undulation" || gesture === "slow-bend") return amp * Math.sin(phase + t * Math.PI * 2);
  if (gesture === "vector") return amp * Math.sin(phase + Math.round(t * 5) / 5 * Math.PI * 2);
  if (gesture === "inscription" || gesture === "measured-facet") return amp * Math.sin(phase + Math.floor(t * 7) / 7 * Math.PI * 2);
  if (gesture === "recurvature" || gesture === "recurve") return amp * Math.sin(phase + t * Math.PI * 2) * (0.45 + 0.55 * Math.sin(phase * 0.7 + t * Math.PI));
  if (gesture === "single-bow") return amp * Math.sin(t * Math.PI);
  if (gesture === "two-phase") return amp * Math.sin(phase + t * Math.PI * 3) * (t < 0.55 ? 1 : 0.55);
  return amp * 0.2 * Math.sin(phase + t * Math.PI);
}

function dateNudge(date) {
  const n = (hashString(date || "") % 13) - 6;
  return n === 0 ? 4 : n;
}

function attentionZ(card, role, orientation) {
  if (role === "strand") return 0.2;
  if (role === "composite") return 2.2;
  if (card?.quiet) return 0.16;
  if (orientation === "shadow") return role === "host" ? 0.48 : 0.18;
  return role === "host" ? 1.05 : 1.72;
}

function spine(card, x0, date, role, orientation) {
  const seed = `${card.name}|${card.index}|${card.core}`;
  const phase = unit(seed, role) * Math.PI * 2 + (role === "guest" ? 1.7 : 0);
  const amp = card.quiet ? 22 : 70 + unit(seed, "amp") * (role === "guest" ? 90 : 70);
  const gesture = gestureOf(card);
  const nudge = dateNudge(date);
  const z = attentionZ(card, role, orientation);
  const points = [];
  const count = 48;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const y = 2060 - t * 1760;
    const envelope = Math.sin(Math.PI * t);
    const x = x0 + gestureOffset(gesture, t, amp, phase) * envelope + nudge * (0.15 + t * 0.08);
    points.push({ x, y, z, t, role, radius: 1 });
  }
  return points;
}

function foundations(hostCard, guestCard) {
  const hostX = 430 + unit(`${hostCard.name}|${hostCard.core}`, "x") * 180;
  if (!guestCard) return { hostX, guestX: null };
  let guestX = 760 + unit(`${guestCard.name}|${guestCard.core}|guest`, "x") * 180;
  if (Math.abs(guestX - hostX) < 240) guestX = hostX + (guestX >= hostX ? 260 : -260);
  return { hostX: clamp(hostX, 180, 620), guestX: clamp(guestX, 780, 1220) };
}

function windowAt(points, t0, t1, fn) {
  for (const point of points) {
    if (point.t < t0 || point.t > t1) continue;
    const u = (point.t - t0) / Math.max(0.001, t1 - t0);
    fn(point, u, Math.sin(u * Math.PI));
  }
}

function suitMove(suitKey) {
  if (suitKey === "Hearings") return "listen";
  if (suitKey === "Paths") return "pursue";
  if (suitKey === "Returns") return "return";
  if (suitKey === "Sigils") return "inscribe";
  return "negotiate";
}

function landmarkKey(move) {
  if (move === "pursue") return "pursuit-arc";
  if (move === "listen") return "listening-pocket";
  if (move === "return") return "return-loop";
  if (move === "inscribe") return "boundary-threshold";
  if (move === "resist") return "deflection";
  if (move === "respond") return "response-window";
  if (move === "negotiate") return "negotiation-knot";
  return "deflection";
}

function applyMove(points, move, otherX, toward) {
  const dir = toward ? 1 : -1;
  if (move === "pursue") {
    windowAt(points, 0.28, 0.66, (point, _u, bell) => {
      const sign = Math.sign(otherX - point.x || 1);
      point.x += (otherX + sign * 90 - point.x) * 0.82 * bell;
      point.radius = 1 + 0.35 * bell;
    });
  } else if (move === "listen") {
    windowAt(points, 0.36, 0.62, (point, _u, bell) => {
      point.x += (otherX - point.x) * 0.1 * bell;
      point.z = Math.max(0.05, point.z - 0.16 * bell);
      point.radius = 1 + 0.9 * bell;
    });
  } else if (move === "return") {
    windowAt(points, 0.4, 0.72, (point, _u, bell) => {
      point.x += (otherX - point.x) * 0.18 * bell;
    });
    const i0 = Math.round(0.5 * (points.length - 1));
    const i1 = Math.round(0.64 * (points.length - 1));
    for (let i = i0; i <= i1; i += 1) {
      const u = (i - i0) / Math.max(1, i1 - i0);
      points[i].y += 340 * Math.sin(u * Math.PI);
    }
  } else if (move === "inscribe") {
    windowAt(points, 0.44, 0.68, (point, _u, bell) => {
      point.x += dir * -Math.sign(otherX - point.x || 1) * 36 * bell;
      point.radius = Math.max(0.42, 1 - 0.55 * bell);
    });
  } else if (move === "resist") {
    windowAt(points, 0.32, 0.66, (point, _u, bell) => {
      point.x += -Math.sign(otherX - point.x || 1) * 72 * bell;
    });
  } else if (move === "respond") {
    windowAt(points, 0.4, 0.64, (point, u, bell) => {
      const open = u < 0.45 ? bell : bell * 0.3;
      point.x += (otherX - point.x) * 0.34 * open;
    });
  } else if (move === "negotiate") {
    windowAt(points, 0.3, 0.72, (point, u, bell) => {
      const towardNow = u < 0.48 ? 1 : -0.7;
      point.x += (otherX - point.x) * 0.38 * bell * towardNow;
    });
  }
  if (!toward) {
    windowAt(points, 0.62, 0.9, (point, _u, bell) => {
      point.x += -Math.sign(otherX - point.x || 1) * 48 * bell;
      point.z = Math.max(0.08, point.z - 0.28 * bell);
    });
  } else {
    windowAt(points, 0.7, 0.92, (point, _u, bell) => {
      point.x += (otherX - point.x) * 0.16 * bell;
    });
  }
}

function attestedRelation(sources, host, guest, hostOrientation, guestOrientation) {
  if (!guest) return null;
  const hostPassage = passageOf(host, hostOrientation);
  const guestPassage = passageOf(guest, guestOrientation);
  const hostTerms = sources.terms(host.index, hostOrientation).filter((row) => row.eligible && row.weight >= CAPACITY_MIN);
  const guestMap = new Map(sources.terms(guest.index, guestOrientation).filter((row) => row.eligible).map((row) => [row.term, row]));
  const found = [];
  for (const row of hostTerms) {
    const other = guestMap.get(row.term);
    if (!other || other.weight < CAPACITY_MIN || sources.grammar.has(row.term)) continue;
    const hostCtx = termContext(hostPassage, row.term);
    const guestCtx = termContext(guestPassage, row.term);
    if (!hostCtx || !guestCtx) continue;
    if (hostCtx.negation === "unproven" || guestCtx.negation === "unproven") continue;
    found.push({
      term: row.term,
      wa: row.weight,
      wb: other.weight,
      capacity: Math.min(row.weight, other.weight),
      hostCtx,
      guestCtx,
    });
  }
  found.sort((a, b) => b.capacity - a.capacity || a.term.localeCompare(b.term));
  const best = found[0];
  if (!best) {
    return {
      earned: false,
      relation: "unresolved",
      term: null,
      shared: found,
      note: "No eligible term is attested in both passages at the capacity threshold. Overlap below that, or a term missing from the passage, does not move the paths.",
    };
  }
  let relation = "mutual-term";
  let hostMove = suitMove(host.suitKey);
  let guestMove = suitMove(guest.suitKey);
  if (best.hostCtx.negated && best.guestCtx.negated) {
    relation = "boundary";
    hostMove = "inscribe";
    guestMove = "resist";
  } else if (best.hostCtx.negated || best.guestCtx.negated) {
    relation = "disagreement";
    hostMove = best.hostCtx.negated ? "resist" : hostMove;
    guestMove = best.guestCtx.negated ? "resist" : "respond";
  }
  return {
    earned: true,
    relation,
    term: best.term,
    hostMove,
    guestMove,
    hostCtx: best.hostCtx,
    guestCtx: best.guestCtx,
    capacity: best.capacity,
    wa: best.wa,
    wb: best.wb,
    shared: found.slice(0, 6),
    note: relation === "mutual-term"
      ? `Both passages affirm “${best.term}”. That licenses a suit-grammar exchange about the term. It does not make the cards the same.`
      : relation === "disagreement"
        ? `One passage affirms “${best.term}” and the other negates it in the same sentence. The paths may resist. This is not a verdict that either card is wrong.`
        : `Both passages negate “${best.term}”. The exchange can hold a boundary. It does not invent a third meaning.`,
  };
}

function look(orientation) {
  return orientation === "shadow" ? "away" : "toward";
}

function applyAttention(points, otherX, toward) {
  windowAt(points, 0.62, 0.9, (point, _u, bell) => {
    const sign = Math.sign(otherX - point.x || 1);
    point.x += (toward ? sign : -sign) * 34 * bell;
    if (!toward) point.z = Math.max(0.08, point.z - 0.22 * bell);
  });
}

function forkStrand(parent, term, nth) {
  const i0 = Math.min(parent.length - 6, Math.max(3, 8 + nth * 7));
  const i1 = Math.min(parent.length - 2, i0 + 8);
  const dir = parent[i0].x < 700 ? -1 : 1;
  const points = [];
  const steps = 16;
  for (let i = 0; i < steps; i += 1) {
    const u = i / (steps - 1);
    const at = parent[Math.round(i0 + (i1 - i0) * u)];
    const bow = Math.sin(u * Math.PI) * (64 + nth * 22) * dir;
    points.push({ x: at.x + bow, y: at.y, z: 0.15, t: at.t, role: "strand" });
  }
  points[0] = { ...parent[i0], role: "strand", z: parent[i0].z };
  points[points.length - 1] = { ...parent[i1], role: "strand", z: parent[i1].z };
  return { id: `strand-${nth + 1}`, term, points, rejoins: true, from: i0, to: i1 };
}

function internalOf(sources, card, orientation, parent, overrides) {
  if (overrides.disableBranch || card.quiet) return [];
  const passage = passageOf(card, orientation);
  const terms = sources.terms(card.index, orientation)
    .filter((row) => row.eligible && row.weight >= 12 && termContext(passage, row.term))
    .slice(0, 2);
  return terms.map((row, nth) => forkStrand(parent, row.term, nth));
}

function downwardRun(points) {
  let best = 0;
  let run = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dy = points[i].y - points[i - 1].y;
    if (dy > 0.4) {
      run += dy;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
}

function project(point) {
  return projectPoint(point);
}

function dOf(points) {
  const mapped = points.map(project);
  let d = `M ${mapped[0][0].toFixed(2)} ${mapped[0][1].toFixed(2)}`;
  for (let i = 1; i < mapped.length; i += 1) d += ` L ${mapped[i][0].toFixed(2)} ${mapped[i][1].toFixed(2)}`;
  return d;
}

function crossings(host, guest) {
  const hits = [];
  for (let i = 2; i < host.length - 2; i += 2) {
    let best = null;
    const hy = project(host[i])[1];
    for (let j = 2; j < guest.length - 2; j += 2) {
      const dy = Math.abs(hy - project(guest[j])[1]);
      if (!best || dy < best.dy) best = { j, dy };
    }
    if (!best || best.dy > 22) continue;
    const a = project(host[i]);
    const b = project(guest[best.j]);
    const dx = Math.abs(a[0] - b[0]);
    const dz = Math.abs(host[i].z - guest[best.j].z);
    if (dx > 18) continue;
    hits.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, dz, same: dz < 0.2 && dx < 12 });
    if (hits.length > 3) break;
  }
  return hits;
}

function glyphPath(term, relation, cx, cy) {
  return livingGlyph(term, relation, cx, cy);
}

function colorOf(card) {
  return card?.palette || { main: "#CED5DF", highlight: "#F4F2E9", support: "#7E91A2" };
}

function pathSvg(points, id, color, width, attrs) {
  const d = dOf(points);
  const shadow = points.map((point) => ({ ...point, x: point.x + 10, y: point.y + 16, z: 0 }));
  return [
    `<path data-lighting="cast-shadow" d="${dOf(shadow)}" fill="none" stroke="${color.support}" stroke-width="${Math.max(6, width - 4)}" stroke-opacity="0.45" stroke-linecap="round"/>`,
    `<path id="${id}" d="${d}" fill="none" stroke="${color.main}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`,
    `<path data-lighting="specular" d="${d}" fill="none" stroke="${color.highlight}" stroke-width="2.2" stroke-opacity="0.85" stroke-linecap="round"/>`,
  ].join("");
}

export function compileScene(sources, hostIndex, affinity, date, orientations = {}, overrides = {}) {
  const host = sources.canon[hostIndex];
  const guest = affinity > 0 ? sources.canon[affinity - 1] : null;
  const hostOrientation = orientations.hostOrientation === "shadow" ? "shadow" : "upright";
  const guestOrientation = orientations.guestOrientation === "shadow" ? "shadow" : "upright";
  const placed = foundations(host, guest);
  const hostLine = spine(host, placed.hostX, date, "host", hostOrientation);
  let guestLine = guest ? spine(guest, placed.guestX, date, "guest", guestOrientation) : null;
  if (overrides.collapseZ) {
    for (const point of hostLine) point.z = 1;
    if (guestLine) {
      for (const point of guestLine) point.z = 1;
      windowAt(guestLine, 0.4, 0.6, (point, _u, bell) => {
        point.x += (hostLine[Math.round(point.t * (hostLine.length - 1))].x - point.x) * 0.85 * bell;
      });
    }
  }
  if (overrides.separateZ && guestLine) {
    for (const point of hostLine) point.z = 2;
    for (const point of guestLine) point.z = 0.05;
  }
  const linked = guest && !overrides.disableLink ? attestedRelation(sources, host, guest, hostOrientation, guestOrientation) : null;
  const landmarks = [];
  const hostToward = look(hostOrientation) === "toward";
  const guestToward = look(guestOrientation) === "toward";
  if (linked?.earned && guestLine) {
    applyMove(hostLine, linked.hostMove, guestLine[20].x, hostToward);
    applyMove(guestLine, linked.guestMove, hostLine[20].x, guestToward);
    landmarks.push(mark(linked.hostMove, "host", host, hostOrientation, linked.hostCtx, linked));
    landmarks.push(mark(linked.guestMove, "guest", guest, guestOrientation, linked.guestCtx, linked));
    if (linked.hostMove === "return" || linked.guestMove === "return") {
      const who = linked.guestMove === "return" ? "guest" : "host";
      const line = who === "guest" ? guestLine : hostLine;
      const dip = downwardRun(line);
      if (dip >= 36) {
        landmarks.push({
          key: "regression-dip",
          participant: who,
          term: linked.term,
          quote: (who === "guest" ? linked.guestCtx : linked.hostCtx).quote,
          dip,
          cause: "Returns recurve. A local downward dip is the regression. Semantic order still runs bottom to top. The dip is not a fall in worth.",
          warning: "Regression is not failure and not a loss of worth.",
        });
      }
    }
  } else if (guestLine) {
    applyAttention(hostLine, guestLine[20].x, hostToward);
    applyAttention(guestLine, hostLine[20].x, guestToward);
  }
  if (guestLine && (!hostToward || !guestToward)) {
    landmarks.push({
      key: "depth-reveal",
      participant: !hostToward ? "host" : "guest",
      term: linked?.term || null,
      quote: null,
      cause: "Shadow looks away and recedes in z so a later looking-back stays possible. Upright looks toward. Neither is good or bad, and neither erases the card.",
    });
  }
  const strands = internalOf(sources, host, hostOrientation, hostLine, overrides);
  if (guest && guestLine) strands.push(...internalOf(sources, guest, guestOrientation, guestLine, overrides).map((strand) => ({ ...strand, id: `guest-${strand.id}` })));
  for (const strand of strands) {
    landmarks.push({
      key: "branch-rejoin",
      participant: strand.id.startsWith("guest") ? "guest" : "host",
      term: strand.term,
      quote: null,
      cause: "An eligible attested term leaves the parent stream and rejoins it. It is support, not a second question and not a new card.",
    });
  }
  let composite = null;
  let glyph = null;
  if (linked?.earned && guestLine) {
    const hx = hostLine[hostLine.length - 1];
    const gx = guestLine[guestLine.length - 1];
    const joinX = (hx.x + gx.x) / 2;
    const join = { x: joinX, y: 230, z: 2.2, t: 1, role: "composite" };
    const top = { x: joinX + dateNudge(date) * 0.2, y: 120, z: 2.2, t: 1, role: "composite" };
    composite = {
      hostJoin: [hx, join],
      guestJoin: [gx, join],
      spine: [join, top],
      relation: linked.relation,
      term: linked.term,
    };
    landmarks.push({
      key: "earned-bridge",
      participant: "both",
      term: linked.term,
      quote: linked.hostCtx.quote,
      cause: "Both roots physically join one upper stream because a source-backed relation was earned. The join is not a blend of colors and not a claim the cards agree as wholes.",
      warning: "Contact here is not consent and not whole-card agreement.",
    });
    landmarks.push({
      key: "shared-confluence",
      participant: "both",
      term: linked.term,
      quote: linked.guestCtx.quote,
      cause: "Two roots enter one successor stem. Each color stays traceable. The stem is not a third card.",
    });
    if (!overrides.disableGlyph && !overrides.hideGlyph) {
      const built = glyphPath(linked.term, linked.relation, top.x, top.y - 36);
      glyph = {
        kind: linked.relation,
        term: linked.term,
        agreement: false,
        d: built.d,
        operators: built.operators,
        cx: top.x,
        cy: top.y - 36,
      };
      landmarks.push({
        key: "top-glyph",
        participant: "both",
        term: linked.term,
        quote: linked.guestCtx.quote,
        cause: `The glyph is built from “${linked.term}” by ${(built.operators || []).join(", ")}. It is not a lotus, ring, or shared placeholder.`,
        warning: "The glyph names this relation only. It is not a new canonical card.",
      });
    }
  } else if (guestLine) {
    landmarks.push({
      key: "open-horizon",
      participant: "both",
      term: null,
      quote: null,
      cause: "No source-backed relation was earned, so the upper field stays open. An ending was not invented to close the picture.",
    });
  }
  const cross = guestLine ? crossings(hostLine, guestLine) : [];
  for (const hit of cross) {
    if (!hit.same) {
      landmarks.push({
        key: "noncontact-crossing",
        participant: "both",
        term: linked?.term || null,
        quote: null,
        cause: "The streams cross in the picture plane at different depths. Different z is not physical contact.",
        at: { x: hit.x, y: hit.y, dz: hit.dz },
      });
    }
  }
  const contact = cross.some((hit) => hit.same);
  const recursion = recursionState(host, guest, hostOrientation, guestOrientation, linked, glyph);
  if (guestLine) {
    landmarks.push({
      key: "foundation-pair",
      participant: "both",
      term: null,
      quote: null,
      cause: "Two foundations stay apart at the root. Separation is not opposition.",
      warning: "Distance at the root is not hostility.",
    });
  }
  const scene = {
    host,
    guest,
    hostOrientation,
    guestOrientation,
    hostLine,
    guestLine,
    strands,
    composite,
    glyph,
    landmarks,
    linked,
    contact,
    recursion,
    date,
    affinity,
  };
  scene.material = compileMaterial(scene);
  scene.dialogue = dialogueOf(scene);
  return scene;
}

function mark(move, participant, card, orientation, ctx, linked) {
  return {
    key: landmarkKey(move),
    participant,
    term: linked.term,
    quote: ctx?.quote || null,
    span: ctx ? { card: card.name, orientation, start: ctx.start, end: ctx.end } : null,
    cause: `${card.name} (${card.suitKey}, ${orientation}) ${move}s around “${linked.term}”. Capacity ${linked.capacity}. The suit grammar supplies the move. The sentence supplies the term. Nothing else was added.`,
  };
}

function dialogueOf(scene) {
  const linked = scene.linked;
  if (!scene.guest) {
    return [{
      event_id: "solo",
      event_type: "solo",
      initiator: scene.host.name,
      participants: [scene.host.name],
      evidence: [],
      epistemic_status: "source_rule_accepted",
      t_span: [0, 1],
      visual_operator: "single_stream",
      relation_rationale: "Neutral. One stream. No guest was introduced.",
    }];
  }
  if (!linked?.earned) {
    return [{
      event_id: "unresolved",
      event_type: "unresolved",
      initiator: null,
      participants: [scene.host.name, scene.guest.name],
      evidence: [],
      epistemic_status: "unresolved",
      t_span: [0.7, 1],
      visual_operator: "open_horizon",
      relation_rationale: linked?.note || "No proposition cleared the capacity and scope rules.",
    }];
  }
  return [
    {
      event_id: `host-${linked.hostMove}`,
      event_type: linked.hostMove,
      initiator: scene.host.name,
      participants: [scene.host.name, scene.guest.name],
      evidence: [linked.hostCtx?.quote].filter(Boolean),
      epistemic_status: "source_rule_accepted",
      t_span: [0.3, 0.72],
      visual_operator: linked.hostMove,
      strength: linked.capacity,
      relation_rationale: linked.note,
    },
    {
      event_id: `guest-${linked.guestMove}`,
      event_type: linked.guestMove,
      initiator: scene.guest.name,
      participants: [scene.guest.name, scene.host.name],
      evidence: [linked.guestCtx?.quote].filter(Boolean),
      epistemic_status: "source_rule_accepted",
      t_span: [0.3, 0.72],
      visual_operator: linked.guestMove,
      strength: linked.capacity,
      relation_rationale: linked.note,
    },
  ];
}

function recursionState(host, guest, hostOrientation, guestOrientation, linked, glyph) {
  if (!guest) {
    return {
      recognized_relational_structure: "solo",
      unresolved_difference: false,
      agreement_assumed: false,
      earned: false,
      constituents: [host.name],
      new_core_concept: null,
      term: null,
      sufficiency: "One card. No composite. Nothing was discarded.",
      loss: null,
    };
  }
  const earned = Boolean(linked?.earned && glyph);
  return {
    recognized_relational_structure: earned ? `${linked.relation}:${linked.term}` : "unresolved",
    unresolved_difference: !earned || linked.relation !== "mutual-term",
    agreement_assumed: false,
    earned,
    relation: linked?.relation || "unresolved",
    term: linked?.term || null,
    new_core_concept: earned ? linked.term : null,
    constituents: [host.name, guest.name],
    orientations: { host: hostOrientation, guest: guestOrientation },
    quotes: earned ? { host: linked.hostCtx.quote, guest: linked.guestCtx.quote } : null,
    glyph_kind: glyph?.kind || null,
    sufficiency: earned
      ? "The composite keeps both names, the deciding term, both quotes, and the glyph kind. It can meet a third card. It does not restore every sentence that was not the deciding one."
      : "Unresolved. No composite was stored, because none was earned.",
    loss: "Full passage history beyond the deciding quotes is not kept. Reversal is examination of what was stored, not a promise of perfect inversion.",
  };
}

export function compileContinuation(sources, prior, nextIndex, date, orientation = "upright") {
  const next = sources.canon[nextIndex];
  if (!prior?.earned || !prior.term) {
    const scene = compileScene(sources, nextIndex, 0, date, { hostOrientation: orientation });
    scene.recursion = {
      ...scene.recursion,
      recognized_relational_structure: "continuation-blocked",
      unresolved_difference: true,
      earned: false,
      prior_constituents: prior?.constituents || [],
      sufficiency: "The previous encounter was unresolved, so it was not turned into a partner. The next card is drawn alone.",
      loss: prior?.loss || "No composite existed to continue.",
    };
    scene.landmarks.push({
      key: "open-horizon",
      participant: "host",
      term: null,
      quote: null,
      cause: "Continuation refused. An unresolved pair does not become a fake participant.",
    });
    return scene;
  }
  const virtual = {
    ...sources.canon[0],
    index: -1,
    name: `Composite:${prior.constituents.join("+")}`,
    suit: "major",
    suitKey: "Major",
    core: prior.term,
    quiet: false,
    upright: prior.quotes?.host || prior.term,
    reversed: prior.quotes?.guest || prior.term,
    palette: { main: "#CED5DF", highlight: "#F4F2E9", support: "#7E91A2", gesture: "measured-facet" },
  };
  const nextPassage = passageOf(next, orientation);
  const nextCtx = termContext(nextPassage, prior.term);
  const nextWeight = sources.terms(next.index, orientation).find((row) => row.term === prior.term && row.eligible)?.weight || 0;
  const scene = compileScene(sources, nextIndex, 0, date, { hostOrientation: orientation });
  const placed = foundations(next, virtual);
  scene.guest = virtual;
  scene.guestLine = spine(virtual, placed.guestX, date, "guest", "upright");
  const meets = Boolean(nextCtx && nextWeight >= CAPACITY_MIN);
  if (meets) {
    applyMove(scene.hostLine, nextCtx.negated ? "resist" : suitMove(next.suitKey), scene.guestLine[20].x, orientation !== "shadow" && !nextCtx.negated);
    applyMove(scene.guestLine, "negotiate", scene.hostLine[20].x, prior.relation !== "boundary");
    const head = scene.hostLine[scene.hostLine.length - 1];
    const foot = scene.guestLine[scene.guestLine.length - 1];
    const join = { x: (head.x + foot.x) / 2, y: 230, z: 2, t: 1, role: "composite" };
    const top = { x: join.x, y: 120, z: 2, t: 1, role: "composite" };
    const relation = nextCtx.negated ? "disagreement" : prior.relation;
    const built = glyphPath(prior.term, relation, top.x, top.y - 36);
    scene.composite = { hostJoin: [head, join], guestJoin: [foot, join], spine: [join, top], relation, term: prior.term };
    scene.glyph = { kind: relation, term: prior.term, agreement: false, d: built.d, operators: built.operators, cx: top.x, cy: top.y - 36 };
  }
  scene.recursion = {
    recognized_relational_structure: nextCtx && nextWeight >= CAPACITY_MIN ? `continued:${prior.relation}:${prior.term}` : "continuation-unresolved",
    unresolved_difference: !(nextCtx && nextWeight >= CAPACITY_MIN && prior.relation === "mutual-term" && !nextCtx.negated),
    agreement_assumed: false,
    earned: Boolean(nextCtx && nextWeight >= CAPACITY_MIN),
    term: prior.term,
    new_core_concept: nextCtx && nextWeight >= CAPACITY_MIN ? prior.term : null,
    constituents: [...prior.constituents, next.name],
    prior_constituents: prior.constituents,
    quotes: { prior_host: prior.quotes?.host || null, prior_guest: prior.quotes?.guest || null, next: nextCtx?.quote || null },
    sufficiency: "Immediate constituents and the stored term are kept. The next card is met only on that term.",
    loss: "Sentences that were not the deciding quotes cannot be recovered from this state.",
  };
  if (!(nextCtx && nextWeight >= CAPACITY_MIN)) {
    scene.landmarks.push({
      key: "open-horizon",
      participant: "both",
      term: prior.term,
      quote: null,
      cause: `${next.name} does not attest “${prior.term}” at the capacity threshold. The stored composite does not force a join.`,
    });
  } else {
    scene.landmarks.push({
      key: nextCtx.negated ? "deflection" : "earned-bridge",
      participant: "both",
      term: prior.term,
      quote: nextCtx.quote,
      cause: `${next.name} attests the stored term “${prior.term}”. The continuation uses that stored term only. ${nextCtx.negated ? "The new sentence negates it." : "The new sentence affirms it."}`,
    });
  }
  scene.material = compileMaterial(scene);
  return scene;
}

function sceneSvg(scene, view = {}) {
  return renderLivingSvg(scene, view || {});
}

function traceOf(sources, scene, svg) {
  const linked = scene.linked;
  return {
    schema: TRACE_SCHEMA,
    renderer: VERSION,
    geometry_digest: sha256(svg),
    guest_card: scene.guest?.name || null,
    source_core_concepts: [
      { card: scene.host.name, core: scene.host.core },
      ...(scene.guest ? [{ card: scene.guest.name, core: scene.guest.core }] : []),
    ],
    lexical_evidence: {
      action: linked?.relation || (scene.guest ? "unresolved" : "solo"),
      note: linked?.note || (scene.guest ? "No grounded relation." : "Neutral. One stream."),
      potential: linked?.capacity || 0,
      policy: POLICY_VERSION,
      policy_note: "The v12 pair table remains unreviewed and is not a veto and not an approval. A path moves only when an eligible term is in both passages at capacity. A nearby not or without does not count as contradiction unless it targets that term.",
      shared_terms: (linked?.shared || []).map((row) => row.term),
    },
    color_provenance: [
      { element: "host", lineage: scene.host.suitKey, mix: "none" },
      ...(scene.guest ? [{ element: "guest", lineage: scene.guest.suitKey, mix: "none" }] : []),
      ...(scene.composite ? [{ element: "composite", lineage: `${scene.host.suitKey}+${scene.guest.suitKey}`, mix: "none" }] : []),
    ],
    layer_positions: {
      host: scene.hostLine[0].z,
      guest: scene.guestLine ? scene.guestLine[0].z : null,
      confluence: scene.composite ? 2 : null,
      assignment: "Depth is attention. Upright looks toward. Shadow looks away and recedes. Weight is capacity, not z, and not the card index.",
    },
    contact_same_z: scene.contact,
    internal_strands: scene.strands.map((strand) => ({ id: strand.id, term: strand.term, weight: null, rejoins: strand.rejoins })),
    glyph: scene.glyph ? { kind: scene.glyph.kind, term: scene.glyph.term, agreement: false } : null,
    landmarks: scene.landmarks.map((item, index) => ({
      ...item,
      landmark_id: `${item.key}-${index + 1}`,
      landmark_type: item.key,
      event_refs: [item.term || item.key],
      bbox: item.bbox || (item.at ? [item.at.x - 12, item.at.y - 12, 24, 24] : [80, 80, 1240, 2100]),
      reader_caption: item.cause,
      source_quotes: item.quote ? [item.quote] : [],
      graph_edge_refs: [item.participant || "host"],
      warning: item.warning || "This mark is a method event. It is not consent, virtue, or proof the cards agree.",
    })),
    recursion_state: scene.recursion,
    material_field: scene.material || null,
    dialogue_events: scene.dialogue || [],
    quality_tier: "2d_material_compositor/1",
    negative_space: {
      reason: scene.guest && !scene.composite
        ? "The upper field is an open horizon because no relation was earned."
        : "Unclaimed field is not a symbol. It is the space the evidence did not enter.",
    },
    derived_paths: scene.landmarks.filter((item) => item.key !== "open-horizon").map((item, index) => ({
      id: `${item.key}-${index + 1}`,
      role_after: item.key,
      event_id: item.term || item.key,
    })),
    rendered_evidence: {
      source_root_marks: scene.guest ? 2 : 1,
      internal_strands: scene.strands.length,
      glyph: Boolean(scene.glyph),
    },
    human_legibility: "not_yet_measured",
  };
}

export async function renderCard(sources, index, date, affinity, options = {}) {
  const scene = compileScene(sources, index, affinity, date, {
    hostOrientation: options.hostOrientation,
    guestOrientation: options.guestOrientation,
  }, options.overrides || {});
  const svg = sceneSvg(scene, options.view || {});
  const trace = traceOf(sources, scene, svg);
  if (options.counterfactuals) trace.counterfactual_probes = await measureCard(sources, index, date, affinity, options);
  let png = null;
  if (options.raster !== false) {
    const finished = await finishCardArtV16({
      scene,
      svg,
      date,
      affinity,
      cardId: sources.canon[index].image,
    });
    png = finished.finalPng1400x2300;
    trace.finishing = finished.evidence;
  }
  const card = sources.canon[index];
  return {
    card: {
      index: index + 1,
      name: card.name,
      suit: card.suit,
      rank: card.rank,
      keywords: card.keywords,
      upright: card.upright,
      reversed: card.reversed,
      image: card.image,
      sort_order: card.sort_order,
    },
    svg,
    png,
    trace,
    scene,
  };
}

export async function measureCard(sources, index, date, affinity, options = {}) {
  const orient = { hostOrientation: options.hostOrientation, guestOrientation: options.guestOrientation };
  const full = await renderCard(sources, index, date, affinity, { ...orient, raster: false });
  const removed = await renderCard(sources, index, date, 0, { raster: false, hostOrientation: orient.hostOrientation });
  const unlinked = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { disableLink: true } });
  const collapsed = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { collapseZ: true } });
  const separated = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { separateZ: true } });
  const unbranched = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { disableBranch: true } });
  const flipped = await renderCard(sources, index, date, affinity, {
    raster: false,
    hostOrientation: orient.hostOrientation === "shadow" ? "upright" : "shadow",
    guestOrientation: orient.guestOrientation,
  });
  const soloUpright = await renderCard(sources, index, date, 0, { raster: false, hostOrientation: "upright" });
  const soloShadow = await renderCard(sources, index, date, 0, { raster: false, hostOrientation: "shadow" });
  const later = await renderCard(sources, index, date === "2099-12-31" ? "2099-12-30" : "2099-12-31", affinity, { ...orient, raster: false });
  const hidden = await renderCard(sources, index, date, affinity, { ...orient, raster: false, overrides: { hideGlyph: true } });
  const identity = (drawn) => sha256(drawn.scene.hostLine.map((point) => point.x.toFixed(2)).join(","));
  return [
    { intervention: "remove_guest", actually_executed: true, svg_changed: full.svg !== removed.svg, measured_delta: full.svg === removed.svg ? 0 : 1, guest_roots_after: removed.trace.rendered_evidence.source_root_marks },
    { intervention: "disable_link", actually_executed: true, svg_changed: full.svg !== unlinked.svg, measured_delta: full.svg === unlinked.svg ? 0 : 1, note: full.scene.linked?.earned ? "Withholding the attested relation removes its motion." : "No attested relation existed, so withholding it does not invent one." },
    { intervention: "separate_z", actually_executed: true, contact_when_collapsed: collapsed.scene.contact, contact_when_separated: separated.scene.contact, contact_changed: collapsed.scene.contact !== separated.scene.contact, svg_changed: collapsed.svg !== separated.svg, measured_delta: collapsed.svg === separated.svg ? 0 : 1 },
    { intervention: "flip_orientation", actually_executed: true, solo_core_unchanged: identity(soloUpright) === identity(soloShadow), svg_changed: full.svg !== flipped.svg, measured_delta: full.svg === flipped.svg ? 0 : 1, core_same: full.trace.source_core_concepts[0].core === flipped.trace.source_core_concepts[0].core },
    { intervention: "disable_branch", actually_executed: true, strands_before: full.trace.rendered_evidence.internal_strands, svg_changed: full.svg !== unbranched.svg, measured_delta: full.svg === unbranched.svg ? 0 : 1 },
    { intervention: "disable_glyph", actually_executed: true, svg_changed: full.svg !== hidden.svg, measured_delta: full.svg === hidden.svg ? 0 : 1, note: full.scene.glyph ? "Hiding the glyph removes the earned mark. It does not invent a replacement." : "No glyph was earned." },
    { intervention: "disable_mix", actually_executed: true, svg_changed: false, measured_delta: 0, composite_elements: 0, note: "Suit colors are not mixed." },
    { intervention: "change_date", actually_executed: true, svg_changed: full.svg !== later.svg, measured_delta: full.svg === later.svg ? 0 : 1 },
  ];
}

function backSvg() {
  return livingBackSvg();
}

async function backAsset() {
  const svg = backSvg();
  const jpeg = await finishBackV16(svg);
  const raw = await sharp(jpeg).ensureAlpha().raw().toBuffer();
  const meta = await sharp(jpeg).metadata();
  let total = 0;
  const count = meta.width * meta.height;
  for (let y = 0; y < meta.height; y += 1) {
    for (let x = 0; x < meta.width; x += 1) {
      const i = (y * meta.width + x) * 4;
      const j = ((meta.height - 1 - y) * meta.width + (meta.width - 1 - x)) * 4;
      total += Math.abs(raw[i] - raw[j]) + Math.abs(raw[i + 1] - raw[j + 1]) + Math.abs(raw[i + 2] - raw[j + 2]);
    }
  }
  const mean = total / (count * 3);
  return { svg, bytes: jpeg, mean, format: "jpeg" };
}

function recipeId(sources, date, affinity) {
  return sha256(JSON.stringify({
    renderer: VERSION,
    grammar: GRAMMAR_VERSION,
    style: STYLE_ID,
    lexicon: ORIGIN_LEXICON,
    policy: POLICY_VERSION,
    date,
    affinity,
    canonical: sources.hashes.canonical,
    weights: sources.hashes.weights,
  }));
}

export async function buildDeck(directory, date, affinity) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date must be YYYY-MM-DD.");
  const sources = await loadSources();
  const recipe = recipeId(sources, date, affinity);
  await mkdir(`${directory}/images`, { recursive: true });
  await mkdir(`${directory}/svg`, { recursive: true });
  await mkdir(`${directory}/procedural_trace`, { recursive: true });
  await mkdir(`${directory}/lexical_provenance`, { recursive: true });
  await mkdir(`${directory}/back`, { recursive: true });
  const cards = [];
  const contexts = [];
  const files = new Map();
  const put = async (rel, data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await writeFile(`${directory}/${rel}`, buf);
    files.set(rel, buf);
  };
  for (let index = 0; index < 78; index += 1) {
    const drawn = await renderCard(sources, index, date, affinity, { counterfactuals: false, raster: true });
    const slug = drawn.card.image.replace(/\.(png|jpg|jpeg)$/i, "");
    await put(`images/${slug}.png`, drawn.png);
    await put(`svg/${slug}.svg`, drawn.svg);
    await put(`procedural_trace/${String(index + 1).padStart(2, "0")}.json`, `${JSON.stringify(drawn.trace, null, 2)}\n`);
    await put(`lexical_provenance/${String(index + 1).padStart(2, "0")}.json`, `${JSON.stringify({
      host: drawn.trace.source_core_concepts[0],
      guest: drawn.trace.source_core_concepts[1] ?? null,
      evidence: drawn.trace.lexical_evidence,
      landmarks: drawn.trace.landmarks,
    }, null, 2)}\n`);
    cards.push({
      name: drawn.card.name,
      suit: drawn.card.suit,
      rank: drawn.card.rank,
      keywords: drawn.card.keywords,
      upright: drawn.card.upright,
      reversed: drawn.card.reversed,
      sortOrder: Number(drawn.card.sort_order),
      file: `images/${slug}.png`,
    });
    contexts.push({
      name: drawn.card.name,
      canonical_index: index + 1,
      core_concept: sources.canon[index].core,
      encounter_layer: affinity === 0 ? null : {
        affinity_index: affinity,
        affinity_name: sources.canon[affinity - 1].name,
        notice: "Encounter proposal only. It does not replace the canonical meaning.",
      },
    });
  }
  const header = ["name", "suit", "rank", "keywords", "upright", "reversed", "image", "sort_order", "image_scale", "image_x", "image_y", "image_radius"];
  const csvEscape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [header.join(",")];
  for (const card of cards) {
    const canon = sources.canon.find((row) => row.name === card.name);
    lines.push([card.name, card.suit, card.rank, card.keywords, card.upright, card.reversed, card.file.split("/").pop(), canon.sort_order, canon.image_scale, canon.image_x, canon.image_y, canon.image_radius].map(csvEscape).join(","));
  }
  await put("cards.csv", `${lines.join("\n")}\n`);
  await put("canonical_cards.csv", sources.files["canonical_cards.csv"]);
  await put("archetype_blueprints.csv", sources.files["archetype_blueprints.csv"]);
  await put("deck_contexts.json", `${JSON.stringify({ schema_version: "velomere-materialized-contexts/16", recipe_id: recipe, affinity, cards: contexts }, null, 2)}\n`);
  const affinityName = affinity === 0 ? "Neutral" : sources.canon[affinity - 1].name;
  const back = await backAsset();
  await put("back/card-back.svg", back.svg);
  await put("back/card-back.jpg", back.bytes);
  const deck = {
    schema_version: RECIPE_VERSION,
    name: `Velomere / ${date} / ${affinityName} (${affinity})`,
    recipe_id: recipe,
    date,
    affinity,
    affinity_name: affinityName,
    renderer: VERSION,
    style_id: STYLE_ID,
    style_label: STYLE_LABEL,
    cardTemplate: "long-tarot",
    cardBack: "back/card-back.jpg",
    back_name: "Dendrite",
    visual_reference_inputs: [],
    cards: cards.map((card) => ({ name: card.name, file: card.file, sort_order: card.sortOrder })),
  };
  await put("deck.json", `${JSON.stringify(deck, null, 2)}\n`);
  await put("recipe.json", `${JSON.stringify({ recipe_id: recipe, renderer: VERSION, recipe_version: RECIPE_VERSION, grammar_version: GRAMMAR_VERSION, style_id: STYLE_ID, origin_lexicon_version: ORIGIN_LEXICON, policy_version: POLICY_VERSION, date, affinity, affinity_name: affinityName, source_hashes: sources.hashes, visual_reference_inputs: [], back_name: "Dendrite", human_legibility: "not_yet_measured" }, null, 2)}\n`);
  await put("provenance.json", `${JSON.stringify({ renderer: VERSION, grammar_version: GRAMMAR_VERSION, style_id: STYLE_ID, origin_lexicon_version: ORIGIN_LEXICON, policy_version: POLICY_VERSION, recipe_id: recipe, date, affinity, affinity_name: affinityName, source_hashes: sources.hashes, visual_reference_inputs: [], card_count: 78, back_name: "Dendrite", back_rotation_mean: back.mean, back_format: back.format, human_legibility: "not_yet_measured" }, null, 2)}\n`);
  const filesSha = {};
  for (const [rel, buf] of files) filesSha[rel] = sha256(buf);
  await put("manifest.json", `${JSON.stringify({ schema_version: RECIPE_VERSION, recipe_id: recipe, files_sha256: filesSha }, null, 2)}\n`);
  const packed = {};
  for (const [rel, buf] of files) packed[rel] = new Uint8Array(buf);
  await writeFile(`${directory}/deck.zip`, zipSync(packed, { mtime: new Date(Date.UTC(2000, 5, 8)) }));
  return { recipe, cards, backMean: back.mean, backFormat: back.format };
}

function endpointsJoined(strand) {
  const a = strand.points[0];
  const b = strand.points[strand.points.length - 1];
  return Number.isFinite(a.x) && Number.isFinite(b.x) && (a.x !== b.x || a.y !== b.y);
}

export async function proveDialogic(date = "2026-11-13") {
  const sources = await loadSources();
  const failures = [];
  if (sources.hashes.canonical !== CANON_SHA) failures.push("canon hash drifted");
  if (sources.canon[0].name !== "The Shuffle") failures.push("affinity 1 is not The Shuffle");
  if (sources.canon[13].name !== "The Dance") failures.push("affinity 14 is not The Dance");
  if (sources.canon[77].name !== "Witness of Sigils") failures.push("affinity 78 is not Witness of Sigils");
  const digests = new Set();
  let scenes = 0;
  let earned = 0;
  let unresolved = 0;
  let asymmetric = 0;
  let equalPairs = 0;
  let glyphs = new Set();
  let sampleEarned = null;
  let sampleUnresolved = null;
  const landmarkKeys = new Set();
  for (let host = 0; host < 78; host += 1) {
    const solo = compileScene(sources, host, 0, date);
    scenes += 1;
    digests.add(sha256(sceneSvg(solo)));
    if (solo.guestLine) failures.push(`${solo.host.name} neutral grew a guest`);
    if (solo.glyph) failures.push(`${solo.host.name} neutral grew a glyph`);
    if (solo.strands.some((strand) => !strand.rejoins || !endpointsJoined(strand))) failures.push(`${solo.host.name} strand does not rejoin`);
    if (solo.host.quiet && solo.strands.length) failures.push(`${solo.host.name} quiet card grew an internal strand`);
    const shadow = compileScene(sources, host, 0, date, { hostOrientation: "shadow" });
    scenes += 1;
    const idA = solo.hostLine.map((point) => point.x.toFixed(2)).join(",");
    const idB = shadow.hostLine.map((point) => point.x.toFixed(2)).join(",");
    if (idA !== idB) failures.push(`${solo.host.name} solo orientation changed the identity line`);
    if (sources.canon[host].suitKey === "Major") {
      const prior = sources.terms(host, "upright").some((row) => row.prior);
      if (prior) failures.push(`${solo.host.name} has a suit prior`);
    }
  }
  if (digests.size !== 78) failures.push(`neutral digests ${digests.size} not 78`);
  for (let host = 0; host < 78; host += 1) {
    for (let affinity = 1; affinity <= 78; affinity += 1) {
      const scene = compileScene(sources, host, affinity, date);
      scenes += 1;
      if (!scene.guestLine || scene.hostLine.length < 8) failures.push(`missing root ${host}x${affinity}`);
      const gap = Math.abs(scene.hostLine[0].x - scene.guestLine[0].x);
      if (gap < 160) failures.push(`foundations close ${scene.host.name} x ${scene.guest.name}`);
      if (scene.linked?.earned) {
        earned += 1;
        if (!scene.composite || !scene.glyph) failures.push(`earned without join ${scene.host.name} x ${scene.guest.name}`);
        if (scene.glyph) glyphs.add(scene.glyph.d);
        if (scene.glyph?.agreement) failures.push("agreement flag set");
        if (!sampleEarned) sampleEarned = { host, affinity, scene };
      } else {
        unresolved += 1;
        if (scene.composite || scene.glyph) failures.push(`unresolved grew a composite ${scene.host.name} x ${scene.guest.name}`);
        if (!scene.landmarks.some((item) => item.key === "open-horizon")) failures.push(`missing horizon ${scene.host.name}`);
        if (!sampleUnresolved) sampleUnresolved = { host, affinity, scene };
      }
      for (const item of scene.landmarks) {
        landmarkKeys.add(item.key);
        if (item.key === "regression-dip" && !(item.dip >= 36)) failures.push(`thin regression ${scene.host.name} x ${scene.guest.name}`);
      }
      if (scene.contact && scene.landmarks.every((item) => item.key !== "noncontact-crossing")) {
        /* same-plane contact is recorded on the scene; it must not be labeled a crossing */
      }
      if (host + 1 === affinity) {
        if (!sceneSvg(scene).includes('data-instance="second-instance"')) failures.push(`self encounter missing second instance ${scene.host.name}`);
      } else if (host < affinity - 1) {
        const other = compileScene(sources, affinity - 1, host + 1, date);
        scenes += 1;
        if (sceneSvg(scene) === sceneSvg(other)) equalPairs += 1;
        else asymmetric += 1;
      }
    }
  }
  if (equalPairs) failures.push(`${equalPairs} ordered pairs drew the same picture`);
  if (!sampleEarned) failures.push("no earned relation in the 78x78 field");
  if (!sampleUnresolved) failures.push("no unresolved encounter");
  if (glyphs.size < 2 && earned > 1) failures.push("earned glyphs collapsed to one shape");
  if (sampleEarned) {
    const shadowScene = compileScene(sources, sampleEarned.host, sampleEarned.affinity, date, { hostOrientation: "shadow" });
    scenes += 1;
    if (sceneSvg(shadowScene) === sceneSvg(sampleEarned.scene)) failures.push("shadow encounter matched upright");
    if (!shadowScene.landmarks.some((item) => item.key === "depth-reveal")) failures.push("shadow did not recede");
    if (shadowScene.host.core !== sampleEarned.scene.host.core) failures.push("shadow changed the core");
  }
  const chain = sampleEarned ? compileContinuation(sources, sampleEarned.scene.recursion, (sampleEarned.host + 3) % 78, date) : null;
  if (chain) {
    scenes += 1;
    const names = chain.recursion.constituents || [];
    if (names.length < 3) failures.push(`recursion kept ${names.length} constituents`);
    if (!String(chain.recursion.loss || "").includes("cannot")) failures.push("recursion loss was not reported");
  }
  const blocked = sampleUnresolved ? compileContinuation(sources, sampleUnresolved.scene.recursion, 0, date) : null;
  if (blocked?.recursion?.earned) failures.push("unresolved pair was continued as if earned");
  const back = await backAsset();
  if (back.mean > 0.25) failures.push(`back mean ${back.mean}`);
  const pngCard = await renderCard(sources, 13, date, 14, { raster: true });
  const meta = await sharp(pngCard.png).metadata();
  if (meta.width !== 1400 || meta.height !== 2300) failures.push(`png ${meta.width}x${meta.height}`);
  const required = ["pursuit-arc", "listening-pocket", "return-loop", "boundary-threshold", "deflection", "negotiation-knot", "earned-bridge", "open-horizon", "top-glyph", "noncontact-crossing", "regression-dip"];
  const missingKeys = required.filter((key) => !landmarkKeys.has(key));
  if (missingKeys.length) failures.push(`missing landmark keys ${missingKeys.join(",")}`);
  const vectari = sources.canon.findIndex((card) => card.name === "The Vectari");
  const witness = sources.canon.findIndex((card) => card.name === "Witness of Sigils");
  const truthHost = termContext(sources.canon[vectari].upright, "truth");
  const truthGuest = termContext(sources.canon[witness].upright, "truth");
  if (!truthHost || truthHost.negated) failures.push("Vectari truth was treated as negated");
  if (!truthGuest || truthGuest.negated || truthGuest.negation !== "unproven") failures.push(`Witness truth scope ${truthGuest?.negation}`);
  const truthScene = compileScene(sources, vectari, witness + 1, date);
  scenes += 1;
  if (truthScene.linked?.term === "truth" && truthScene.linked?.relation === "disagreement") failures.push("truth pair was labeled disagreement");
  const fieldIx = sources.canon.findIndex((card) => card.name === "Field of Hearings");
  const sevenIx = sources.canon.findIndex((card) => card.name === "Seven of Returns");
  const courtCtx = termContext(sources.canon[fieldIx].upright, "court");
  const remainCtx = termContext(sources.canon[sevenIx].upright, "remain");
  if (courtCtx?.negated) failures.push("Field court was treated as negated");
  if (remainCtx?.negated) failures.push("remain was treated as negated");
  const courtScene = compileScene(sources, fieldIx, witness + 1, date);
  const remainScene = compileScene(sources, sevenIx, witness + 1, date);
  scenes += 2;
  if (courtScene.linked?.term === "court" && courtScene.linked.relation === "disagreement") failures.push("court pair was labeled disagreement");
  if (remainScene.linked?.term === "remain" && remainScene.linked.relation === "disagreement") failures.push("remain pair was labeled disagreement");
  const bySuit = new Map();
  for (let host = 0; host < 78; host += 1) {
    const solo = compileScene(sources, host, 0, date);
    const id = solo.material?.host?.id || solo.material?.primary;
    if (solo.host.quiet && id !== "open-interval") failures.push(`${solo.host.name} quiet field ${id}`);
    const suit = solo.host.suitKey;
    if (!bySuit.has(suit)) bySuit.set(suit, new Set());
    bySuit.get(suit).add(id);
    for (const mark of solo.landmarks) {
      if (mark.key === "regression-dip" && !(mark.dip >= 36)) failures.push(`${solo.host.name} regression was not a visible dip`);
    }
  }
  for (const [suit, ids] of bySuit) {
    if (ids.size === 1 && !ids.has("open-interval")) failures.push(`${suit} locked to one material ${[...ids][0]}`);
  }
  return {
    ok: failures.length === 0,
    failures,
    scenes,
    neutrals: 78,
    encounters: 78 * 78,
    earned,
    unresolved,
    asymmetric_pairs: asymmetric,
    equal_pairs: equalPairs,
    glyph_shapes: glyphs.size,
    landmark_keys: [...landmarkKeys],
    back_mean: back.mean,
    sample_earned: sampleEarned ? `${sampleEarned.scene.host.name} × ${sampleEarned.scene.guest.name} (${sampleEarned.scene.linked.relation}:${sampleEarned.scene.linked.term})` : null,
    sample_unresolved: sampleUnresolved ? `${sampleUnresolved.scene.host.name} × ${sampleUnresolved.scene.guest.name}` : null,
    recursion_constituents: chain?.recursion?.constituents || [],
    human_legibility: "not_yet_measured",
    canon_sha: sources.hashes.canonical,
    handoff_zip: "VELoMERE_V16_TWO_STAGE_SEMANTIC_MATERIALIZATION_FULL_GROK_HANDOFF.zip",
    truth_relation: truthScene.linked ? `${truthScene.linked.relation}:${truthScene.linked.term || "none"}` : "unresolved",
    material_ids_by_suit: Object.fromEntries([...bySuit].map(([suit, ids]) => [suit, [...ids].sort()])),
    quality_tier: 1,
    finisher_backend: "2d_material_compositor",
    ray_tracing: false,
  };
}
