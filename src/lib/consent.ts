export type UploadConsent = {
  terms: true;
  rights: true;
  at: string;
};

export function consentFrom(value: unknown): UploadConsent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { terms?: unknown; rights?: unknown; at?: unknown };
  if (raw.terms !== true || raw.rights !== true) return null;
  if (typeof raw.at !== "string" || Number.isNaN(new Date(raw.at).getTime())) return null;
  return { terms: true, rights: true, at: raw.at };
}

export function keptConsents(value: unknown): Record<string, UploadConsent> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, UploadConsent> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const consent = consentFrom(item);
    if (consent) out[key] = consent;
  }
  return out;
}
