// @ts-nocheck
// Semantic scene plan. The graph decides the event. Freedom decides how literal the picture is.
import { clampFreedom, freedomBand } from "./interpretive-freedom.mjs";

export function readTopology(geometry) {
  const joins = Array.isArray(geometry?.joins) ? geometry.joins : [];
  const roots = Array.isArray(geometry?.roots) ? geometry.roots : [];
  const branches = Array.isArray(geometry?.branches) ? geometry.branches : [];
  const regression = Number(geometry?.regression || 0);
  return {
    joins: joins.length,
    roots: roots.length,
    branches: branches.length,
    crossings: Number(geometry?.crossings || 0),
    regression,
    downwardReturn: regression > 1,
    outcome: geometry?.outcome || "unresolved",
    quiet: Boolean(geometry?.quiet),
    consequentialContacts: confluenceCount(joins),
    selfRejoins: branches.filter((branch) => branch?.rejoins).length,
  };
}

function confluenceCount(joins) {
  if (!joins.length) return 0;
  const cells = joins.map((join) => (join.points || []).map((point) => cellOf(point)));
  const shared = cells[0]?.filter((cell) => cells.every((row) => row.includes(cell))) || [];
  if (shared.length) return 1;
  return joins.length;
}

function cellOf(point) {
  return `${Math.round(Number(point?.x || 0) / 24)}:${Math.round(Number(point?.y || 0) / 24)}`;
}

function meaningText(meaning) {
  return [meaning?.core, meaning?.upright, meaning?.shadow]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 700);
}

const MATERIAL = {
  veiled_luminescence: "light, haze, dust, or occlusion",
  living_matter: "growth, weather, or erosion",
  forged_relief: "a made thing with thickness and shadow",
  prismatic_geometry: "refraction and separated planes of light",
  cyber_matrix: "signal, access, or a failed transmission",
  witnessed_dance: "weight, interval, and only the bodies the score allows",
  velomere_codex_becoming_v1: "an illuminated codex of metal, enamel, and engraved relation, not a borrowed occult diagram",
};

function eventClass(topo) {
  if (topo.roots <= 1 && topo.consequentialContacts === 0) return "solo";
  if (topo.consequentialContacts === 0) return "unjoined";
  return "joined";
}

function resemblance(bandId) {
  if (bandId === "structural") return "required";
  if (bandId === "guided") return "high";
  if (bandId === "balanced") return "partial";
  if (bandId === "expressive") return "low";
  return "none";
}

function metaphorOf({ cls, bandId, name, material, topo }) {
  const contact = topo.consequentialContacts;
  if (cls === "solo") {
    if (bandId === "structural" || bandId === "guided") {
      return `Keep one recognizable presence for ${name}. Render it in ${material}. Do not add a partner.`;
    }
    if (bandId === "balanced") {
      return `One condition of ${material}, mostly withheld. This is ${name}. Nothing else arrives.`;
    }
    return `An independent picture of a single withheld event, ${name}. Do not copy contours. Do not add a second presence.`;
  }
  if (cls === "unjoined") {
    if (bandId === "structural") {
      return `Keep the separate contours recognizable and apart. Material may become ${material}. The gap stays empty. No bridge.`;
    }
    if (bandId === "guided") {
      return `Two distinct conditions of ${material} keep their places. A viewer can still find each one. They do not touch.`;
    }
    if (bandId === "balanced") {
      return `Translate the refusal to meet into a place: two conditions of ${material} are both knowable, and neither reaches the other. Not tubes, pillars, or people posed as the strokes. Do not imply a cause that joins them. ${name}.`;
    }
    if (bandId === "expressive") {
      return `A place that shows separation without repeating the strokes. Use ${material}. The interval is the subject. No handshake, cable, shared object, causal link, or third actor. ${name}.`;
    }
    return `An independent picture of ${name}: claims that remain unjoined. Do not imitate path silhouettes. Do not add contact, a messenger, a cause between them, or another participant. Scenery is not an encounter.`;
  }
  if (bandId === "structural") {
    return `Keep the arrangement recognizable, including the ${contact === 1 ? "one narrow meeting" : `${contact} meetings`} and any return. The meeting stays smaller than either side. Material may become ${material}. Do not turn it into a handshake, embrace, or permanent union.`;
  }
  if (bandId === "guided") {
    return `Stay near the layout. Show ${contact === 1 ? "one meeting only" : `${contact} meetings`} in ${material}, then let the presences separate again. The meeting is revisable and smaller than either side. A return, if required, stays inside that same event. Do not depict total reconciliation.`;
  }
  if (bandId === "balanced") {
    return `A physical place in ${material} where ${contact === 1 ? "exactly one narrow meeting" : `${contact} meetings`} is smaller than either side. Below or beyond it they do not touch. Not a handshake, a bar, a rod, or extra figures. The shadow's failure has not happened. ${name}.`;
  }
  if (bandId === "expressive") {
    return `Let the place lead. Embody ${contact === 1 ? "one specific, revisable meeting" : `${contact} meetings`} and the required return, if any, without copying the strokes. The meeting is not a settled union. Extra objects are scenery unless they make contact. ${name}.`;
  }
  return `An independent picture of ${name}. ${contact === 1 ? "One bounded meeting, no second contact, no handshake as total reconciliation." : `${contact} meetings, no extras.`} Do not imitate silhouettes. Do not add people, a bar, or a lower fusion. A return repeats the same event; it is not a new one. The shadow has not happened.`;
}

function representations(topo, cls, bandId) {
  const rows = [];
  rows.push({
    fact: `${topo.roots} consequential participant${topo.roots === 1 ? "" : "s"}`,
    shownAs: topo.roots <= 1
      ? "Exactly one event. Empty air is allowed. A second actor is not."
      : "That many presences, no more. Weather, furniture, dust, and walls are scenery, not further participants.",
  });
  rows.push({
    fact: topo.consequentialContacts === 0
      ? "0 consequential contacts"
      : `${topo.consequentialContacts} consequential contact${topo.consequentialContacts === 1 ? "" : "s"} (${topo.joins} recorded join segments)`,
    shownAs: topo.consequentialContacts === 0
      ? "A real interval. Nothing touches, bridges, or fuses. Overlap in the source picture is not a join."
      : topo.consequentialContacts === 1
        ? "One meeting only. The recorded segments are that one meeting, not several contacts along the length."
        : "Each authorized contact is separate and countable. Do not smear them into one, and do not add another.",
  });
  if (topo.downwardReturn) {
    rows.push({
      fact: "A downward return inside the same event",
      shownAs: "The event turns back or descends once. It is not a new story and not a second meeting.",
    });
  }
  if (topo.selfRejoins > 0) {
    rows.push({
      fact: `${topo.selfRejoins} supports rejoin their own side`,
      shownAs: "Texture or a repeated gesture on that same participant. Not a bridge to the other side.",
    });
  }
  if (bandId === "structural" || bandId === "guided") {
    rows.push({
      fact: "Layout resemblance",
      shownAs: cls === "solo"
        ? "The single presence stays recognizable."
        : "Left, right, the gap, and any meeting stay findable.",
    });
  }
  return rows;
}

export function validateScenePlan(plan, topology) {
  const topo = topology || plan.topology;
  const issues = [];
  if (!plan || !topo) issues.push("missing-plan");
  if (plan && topo) {
    if (plan.participants.length !== topo.roots) issues.push("participant-count");
    if (plan.consequentialContacts !== topo.consequentialContacts) issues.push("contact-count");
    if (topo.consequentialContacts === 0 && plan.depictsContact) issues.push("invented-contact");
    if (topo.downwardReturn && !plan.representations.some((row) => /return/i.test(row.fact))) issues.push("missing-return");
    if (!topo.downwardReturn && plan.representations.some((row) => /downward return/i.test(row.fact))) issues.push("invented-return");
    const literal = String(plan.literalResemblance || "");
    if ((plan.freedomBand === "intuitive" || plan.freedomBand === "expressive") && literal === "required") issues.push("high-freedom-still-stencil");
    if (plan.freedomBand === "structural" && literal === "none") issues.push("low-freedom-abandoned");
    if (plan.freedom >= 75 && /reproduce the silhouette|keep the separate contours/i.test(plan.metaphor || "")) issues.push("high-freedom-copies-strokes");
  }
  return { ok: issues.length === 0, issues };
}

export function buildScenePlan({ meaning, geometry, styleId, freedom }) {
  const topo = readTopology(geometry);
  const level = clampFreedom(freedom);
  const band = freedomBand(level);
  const material = MATERIAL[styleId];
  if (!material) throw new Error("Choose a registered style. Custom prompts are not part of this release.");
  const name = String(meaning?.name || "Untitled").slice(0, 80);
  const cls = eventClass(topo);
  const participants = Array.from({ length: topo.roots }, (_, index) => {
    if (topo.roots === 1) return `The only consequential presence in ${name}.`;
    return index === 0
      ? `First presence in ${name}. It does not become the other presence.`
      : topo.consequentialContacts === 0
        ? `Second presence in ${name}. It never touches the first.`
        : `Second presence in ${name}. It meets the first only at the authorized contact.`;
  });
  const plan = {
    promptVersion: "v20.4",
    cardName: name,
    meaning: meaningText(meaning),
    styleId,
    freedom: level,
    freedomBand: band.id,
    freedomLabel: band.label,
    literalResemblance: resemblance(band.id),
    generationMode: level <= 37 ? "geometry-edit" : "scene-first-then-reconcile",
    topology: topo,
    consequentialContacts: topo.consequentialContacts,
    participants,
    scenery: [
      "Dust, haze, walls, weather, furniture, and unused light are scenery.",
      "Scenery must not touch both presences, carry a message, or start a new encounter.",
    ],
    metaphor: metaphorOf({ cls, bandId: band.id, name, material, topo }),
    representations: representations(topo, cls, band.id),
    mandatory: [
      `${topo.roots} participant${topo.roots === 1 ? "" : "s"}.`,
      `${topo.consequentialContacts} consequential contact${topo.consequentialContacts === 1 ? "" : "s"}.`,
      topo.downwardReturn ? "The return stays inside this event." : "No invented return.",
      "Provenance and outcome stay as recorded.",
    ],
    prohibited: [
      topo.consequentialContacts === 0 ? "Any depicted contact, bridge, handshake, fuse, causal link, or shared handle." : "Any contact beyond the authorized meeting. A handshake, embrace, or permanent union shown as total reconciliation.",
      "Extra consequential participants.",
      "Treating higher freedom as permission to add actors, joins, or events.",
      "Depicting the shadow's failure as an established fact.",
      "Readable text, letters, numbers, logos.",
      level >= 75 ? "Copying the path silhouettes, tubes, pillars, or stroke-count as object-count." : "Erasing a required gap or meeting.",
      styleId === "witnessed_dance" && topo.consequentialContacts === 0 ? "Bodily contact or a held hand." : "A human figure posed as a path unless this style is Witnessed Dance and the graph allows that body.",
      ...(styleId === "velomere_codex_becoming_v1"
        ? [
          "Any human, hood, face, hand, or robe.",
          "A question-mark character, fog, a stone pier, an arch, a sunburst, or linked rings.",
        ]
        : []),
    ],
    meaningPreserved: true,
    depictsContact: topo.consequentialContacts > 0,
  };
  const verdict = validateScenePlan(plan, topo);
  if (!verdict.ok) throw new Error(`The scene plan contradicted the encounter (${verdict.issues.join(", ")}). Nothing was generated.`);
  return plan;
}

export function planToPrompt(plan, stage) {
  const relations = plan.representations.map((row) => `${row.fact}: ${row.shownAs}`).join(" ");
  const lines = [
    stage === "scene"
      ? "Create the scene described below. No reference picture is a stencil. Do not invent a diagram of lines."
      : stage === "reconcile"
        ? "IMAGE 1 is the scene to keep. IMAGE 2 is the original geometric score, a relation check only. Do not redraw IMAGE 2. Do not copy its strokes, tubes, or silhouette. Change IMAGE 1 only if a required relation is missing or a forbidden contact is present."
        : "The attached image is the original geometric score. At this setting its layout should stay recognizable. Change material and light. Do not change the event.",
    `Card (do not letter it): ${plan.cardName}.`,
    `Meaning: ${plan.meaning}`,
    `Interpretive freedom ${plan.freedom} of 100, ${plan.freedomLabel}. Literal resemblance: ${plan.literalResemblance}. More freedom is not more events.`,
    `Metaphor: ${plan.metaphor}`,
    `Mandatory: ${plan.mandatory.join(" ")}`,
    `How to show it: ${relations}`,
    `Prohibited: ${plan.prohibited.join(" ")}`,
    `Scenery: ${plan.scenery.join(" ")}`,
    `Participants: ${plan.participants.join(" ")}`,
    plan.artMeaning ? plan.artMeaning.promptText : "",
    "Portrait. No border, caption, letters, or numbers.",
  ];
  return lines.join("\n");
}
