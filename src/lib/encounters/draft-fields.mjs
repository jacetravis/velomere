// @ts-nocheck
// Builds the personal-card form from the immutable source card plus the reader's own turns.
// Assistant wording is never treated as the reader's interpretation. Nothing here is saved.

export const DRAFT_FIELDS = Object.freeze(["name", "core", "upright", "shadow", "keywords"]);

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function keywordsOf(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 40)).filter(Boolean).slice(0, 8);
  return String(value || "").split(/[,;\n]/).map((item) => clean(item, 40)).filter(Boolean).slice(0, 8);
}

export function draftDefaults(source) {
  for (const key of DRAFT_FIELDS) {
    if (source?.[key] == null || (key !== "keywords" && !String(source[key]).trim())) {
      throw new Error(`The source card has no ${key}.`);
    }
  }
  const keywords = keywordsOf(source.keywords);
  if (!keywords.length) throw new Error("The source card has no keywords.");
  return {
    name: { value: clean(source.name, 80), origin: "velomere_default", evidenceMessageIds: [], manual: false },
    core: { value: clean(source.core, 1400), origin: "velomere_default", evidenceMessageIds: [], manual: false },
    upright: { value: clean(source.upright, 2400), origin: "velomere_default", evidenceMessageIds: [], manual: false },
    shadow: { value: clean(source.shadow, 2400), origin: "velomere_default", evidenceMessageIds: [], manual: false },
    keywords: { value: keywords, origin: "velomere_default", evidenceMessageIds: [], manual: false },
  };
}

function fieldValue(field, raw) {
  if (field === "keywords") return keywordsOf(raw);
  const max = field === "name" ? 80 : field === "core" ? 1400 : 2400;
  return clean(raw, max);
}

export function proposeReaderChanges(messages) {
  const changes = {};
  const readers = (messages || []).filter((message) => message && message.role === "user" && !message.hidden && message.id);
  const patterns = [
    ["name", /\b(?:call it|name it|the name is|name)\s*:\s*(.+)/i],
    ["name", /\b(?:call it|name it|the name is)\s+(.{1,80})/i],
    ["core", /\b(?:the core is|core)\s*:\s*(.+)/i],
    ["core", /\b(?:i read this as|for me this is|for me this means)\s+(.{8,600})/i],
    ["upright", /\b(?:the upright is|upright)\s*:\s*(.+)/i],
    ["shadow", /\b(?:the shadow is|shadow)\s*:\s*(.+)/i],
    ["keywords", /\b(?:keywords are|keywords)\s*:\s*(.+)/i],
  ];
  for (const message of readers) {
    const text = String(message.content || "").trim();
    if (!text) continue;
    let matched = false;
    for (const [field, pattern] of patterns) {
      const found = text.match(pattern);
      if (!found) continue;
      const value = fieldValue(field, found[1]);
      if ((field === "keywords" && !value.length) || (field !== "keywords" && !value)) continue;
      changes[field] = { value, evidenceMessageIds: [message.id] };
      matched = true;
    }
    if (!matched && /\bi disagree\b/i.test(text) && text.length > 24 && !/\?\s*$/.test(text)) {
      changes.core = { value: fieldValue("core", text), evidenceMessageIds: [message.id] };
    }
  }
  return changes;
}

export function applyReaderEvidence(draft, proposed, messages) {
  const byId = new Map((messages || []).filter((message) => message?.role === "user" && !message.hidden && message.id).map((message) => [message.id, message]));
  const next = structuredClone(draft);
  for (const [field, change] of Object.entries(proposed || {})) {
    if (!DRAFT_FIELDS.includes(field) || next[field]?.manual) continue;
    const ids = change?.evidenceMessageIds || [];
    if (!ids.length || !ids.every((id) => byId.has(id))) continue;
    const value = field === "keywords" ? keywordsOf(change.value) : fieldValue(field, change.value);
    if ((field === "keywords" && !value.length) || (field !== "keywords" && !value)) continue;
    next[field] = { value, origin: "reader_interpretation", evidenceMessageIds: [...ids], manual: false };
  }
  return next;
}

export function prepareDraft(source, messages, previous) {
  const base = applyReaderEvidence(draftDefaults(source), proposeReaderChanges(messages), messages);
  if (!previous) return base;
  for (const field of DRAFT_FIELDS) {
    if (previous[field]?.manual) base[field] = structuredClone(previous[field]);
  }
  return base;
}

export function manualEdit(draft, field, value) {
  if (!DRAFT_FIELDS.includes(field)) throw new Error("That field is not on the card.");
  const next = fieldValue(field, value);
  return {
    ...draft,
    [field]: {
      value: next,
      origin: "manual_edit",
      evidenceMessageIds: [],
      manual: true,
    },
  };
}

export function originLabel(origin) {
  if (origin === "reader_interpretation") return "Reader interpretation";
  if (origin === "manual_edit") return "Manual edit";
  if (origin === "proposed_revision") return "Proposed revision";
  return "Velomere default";
}
