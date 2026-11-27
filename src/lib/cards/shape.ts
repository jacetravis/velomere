export const CARD_TEMPLATES = [
  { id: "tarot", label: "Tarot", detail: "2.75 × 4.75 in", w: 2.75, h: 4.75 },
  { id: "long-tarot", label: "Long Tarot", detail: "3.5 × 5.75 in", w: 3.5, h: 5.75 },
  { id: "oracle", label: "Oracle", detail: "3.5 × 5 in", w: 3.5, h: 5 },
  { id: "long-oracle", label: "Long Oracle", detail: "4 × 6 in", w: 4, h: 6 },
] as const;

export type CardTemplateId = (typeof CARD_TEMPLATES)[number]["id"];

const CLASSIC = { w: 2, h: 3 };

export function clampDim(value: number) {
  return Math.min(160, Math.max(55, Math.round(value)));
}

export function cardFrame(template: CardTemplateId | null, width: number, length: number) {
  const spec = CARD_TEMPLATES.find((item) => item.id === template) ?? CLASSIC;
  const widthScale = width / 100;
  const lengthScale = length / 100;
  const aspect = (spec.w / spec.h) * (widthScale / lengthScale);
  const size = template ? spec.w / 2.75 : 1;
  const rem = 12.33 * size * widthScale;
  const vw = Math.min(86, 52 * size * widthScale);
  return {
    width: `min(${rem.toFixed(2)}rem, ${vw.toFixed(1)}vw)`,
    aspect,
  };
}
