import { CARD_TEMPLATES, cardFrame, clampDim, type CardTemplateId } from "./shape.ts";

export type PictureBox = {
  imageAspect: number;
  content: { x: number; y: number; w: number; h: number };
};

/** A pale rim this wide or narrower is the card's own border, not a scan margin. */
export const PRINTED_RIM = 0.055;
/** How far border 0 pulls the edge in from the printed card, toward the art. */
export const TIGHT_INSET = 0.1;
/** A little of the printed border stays. 0 is tight to the art; 100 is the whole card. */
export const DEFAULT_BORDER = 62;

export function contentAspect(picture: PictureBox) {
  const w = Math.max(0.05, picture.content.w);
  const h = Math.max(0.05, picture.content.h);
  return picture.imageAspect * (w / h);
}

export function dimsForAspect(template: CardTemplateId | null, imageRatio: number, sizeHint = 100) {
  const spec = CARD_TEMPLATES.find((item) => item.id === template) ?? { w: 2, h: 3 };
  const base = spec.w / spec.h;
  const ratio = Math.min(2.4, Math.max(0.28, imageRatio));
  const rel = ratio / base;
  const hint = clampDim(sizeHint);
  let width: number;
  let length: number;
  if (rel >= 1) {
    length = hint;
    width = clampDim(Math.round(length * rel));
    length = clampDim(Math.round(width / rel));
  } else {
    width = hint;
    length = clampDim(Math.round(width / rel));
    width = clampDim(Math.round(length * rel));
  }
  return {
    cardWidth: width,
    cardLength: length,
    aspect: cardFrame(template, width, length).aspect,
  };
}

function laidOut(mode: "contain" | "cover", frameAspect: number, imageAspect: number) {
  const wider = imageAspect >= frameAspect;
  if (mode === "contain") {
    if (wider) {
      const drawnH = frameAspect / imageAspect;
      return { ox: 0, oy: (1 - drawnH) / 2, drawnW: 1, drawnH };
    }
    const drawnW = imageAspect / frameAspect;
    return { ox: (1 - drawnW) / 2, oy: 0, drawnW, drawnH: 1 };
  }
  if (wider) {
    const drawnW = imageAspect / frameAspect;
    return { ox: (1 - drawnW) / 2, oy: 0, drawnW, drawnH: 1 };
  }
  const drawnH = frameAspect / imageAspect;
  return { ox: 0, oy: (1 - drawnH) / 2, drawnW: 1, drawnH };
}

function clamp(value: number, min: number, max: number) {
  const rounded = Math.min(max, Math.max(min, Math.round(value)));
  return rounded === 0 ? 0 : rounded;
}

export function fitPicture(mode: "contain" | "cover", frameAspect: number, picture: PictureBox) {
  const box = picture.content;
  const laid = laidOut(mode, frameAspect, picture.imageAspect);
  const left = laid.ox + box.x * laid.drawnW;
  const top = laid.oy + box.y * laid.drawnH;
  const cw = Math.max(0.05, box.w * laid.drawnW);
  const ch = Math.max(0.05, box.h * laid.drawnH);
  const scale = Math.max(1 / cw, 1 / ch);
  const tx = -((left + cw / 2) - 0.5) * scale;
  const ty = -((top + ch / 2) - 0.5) * scale;
  return {
    imageScale: clamp(scale * 100, 40, 220),
    imageX: clamp(tx * 100, -80, 80),
    imageY: clamp(ty * 100, -80, 80),
  };
}

function borderAmount(border: number) {
  const value = Number.isFinite(border) ? border : DEFAULT_BORDER;
  return Math.min(100, Math.max(0, value)) / 100;
}

/** The window of a printed card kept at this border. 0 sits in toward the art; 100 keeps the card. */
export function borderWindow(content: PictureBox["content"], border: number) {
  const inset = TIGHT_INSET * (1 - borderAmount(border));
  const w = content.w * (1 - inset * 2);
  const h = content.h * (1 - inset * 2);
  return {
    x: content.x + (content.w - w) / 2,
    y: content.y + (content.h - h) / 2,
    w,
    h,
  };
}

export function planFromExample(
  template: CardTemplateId | null,
  example: PictureBox,
  border: number,
  sizeHint = 100,
) {
  const window = borderWindow(example.content, border);
  const ratio = contentAspect({ imageAspect: example.imageAspect, content: window });
  return { window, ...dimsForAspect(template, ratio, sizeHint) };
}

/** Place one card in the example's frame, using the same border on that card's own printed box. */
export function placeInFrame(frameAspect: number, picture: PictureBox, border: number) {
  return fitPicture("contain", frameAspect, {
    imageAspect: picture.imageAspect,
    content: borderWindow(picture.content, border),
  });
}

/** Scale the fitted art so it can run past the card edge. 0 shows the fitted card. 100 is the fullest bleed. The card's own size does not change. */
export function withBleed(
  place: { imageScale: number; imageX: number; imageY: number },
  bleed: number,
) {
  const amount = Math.min(100, Math.max(0, Number.isFinite(bleed) ? bleed : 0)) / 100;
  return {
    imageScale: Math.min(220, Math.max(40, Math.round(place.imageScale * (1 + amount * 0.5)))),
    imageX: place.imageX,
    imageY: place.imageY,
  };
}

/**
 * A modest pale rim is the printed border, so it stays part of the card.
 * A wide pale rim is outside the card and stays cropped. A full card returns null.
 */
export function printedBox(raw: PictureBox["content"]): PictureBox["content"] | null {
  const right = 1 - (raw.x + raw.w);
  const bottom = 1 - (raw.y + raw.h);
  const x = raw.x > PRINTED_RIM ? raw.x : 0;
  const y = raw.y > PRINTED_RIM ? raw.y : 0;
  const rightEdge = right > PRINTED_RIM ? raw.x + raw.w : 1;
  const bottomEdge = bottom > PRINTED_RIM ? raw.y + raw.h : 1;
  const w = rightEdge - x;
  const h = bottomEdge - y;
  if (w < 0.45 || h < 0.45) return null;
  if (x < 0.008 && y < 0.008 && w > 0.984 && h > 0.984) return null;
  return { x, y, w, h };
}

function isMargin(r: number, g: number, b: number, a: number) {
  if (a < 12) return true;
  const light = (r + g + b) / 3;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return light > 236 && chroma < 22;
}

function readContent(image: HTMLImageElement): PictureBox["content"] | null {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const longest = Math.max(iw, ih);
  const scale = Math.min(1, 200 / longest);
  const sw = Math.max(1, Math.round(iw * scale));
  const sh = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, sw, sh);
  const data = context.getImageData(0, 0, sw, sh).data;
  const marginRow = (y: number) => {
    let ink = 0;
    for (let x = 0; x < sw; x += 1) {
      const index = (y * sw + x) * 4;
      if (!isMargin(data[index], data[index + 1], data[index + 2], data[index + 3])) ink += 1;
    }
    return ink < sw * 0.02;
  };
  const marginCol = (x: number) => {
    let ink = 0;
    for (let y = 0; y < sh; y += 1) {
      const index = (y * sw + x) * 4;
      if (!isMargin(data[index], data[index + 1], data[index + 2], data[index + 3])) ink += 1;
    }
    return ink < sh * 0.02;
  };
  let top = 0;
  while (top < sh - 1 && marginRow(top)) top += 1;
  let bottom = sh - 1;
  while (bottom > top && marginRow(bottom)) bottom -= 1;
  let left = 0;
  while (left < sw - 1 && marginCol(left)) left += 1;
  let right = sw - 1;
  while (right > left && marginCol(right)) right -= 1;
  const x = left / sw;
  const y = top / sh;
  const w = (right - left + 1) / sw;
  const h = (bottom - top + 1) / sh;
  return printedBox({ x, y, w, h });
}

export function measurePicture(src: string): Promise<PictureBox | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const iw = image.naturalWidth;
      const ih = image.naturalHeight;
      if (!iw || !ih) {
        resolve(null);
        return;
      }
      const imageAspect = iw / ih;
      const full = { imageAspect, content: { x: 0, y: 0, w: 1, h: 1 } };
      try {
        const content = readContent(image);
        resolve(content ? { imageAspect, content } : full);
      } catch {
        resolve(full);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
