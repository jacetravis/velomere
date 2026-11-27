/** Spread a layout toward the edges so the cards can use the table, without moving stacked cards apart. */
export function expandedPositions<T extends { x: number; y: number }>(positions: T[], edge = 0.18): T[] {
  if (positions.length < 2) return positions;
  const xs = positions.map((item) => item.x);
  const ys = positions.map((item) => item.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const map = (value: number, min: number, span: number) => (span < 0.04 ? value : edge + ((value - min) / span) * (1 - edge * 2));
  return positions.map((item) => ({ ...item, x: map(item.x, minX, spanX), y: map(item.y, minY, spanY) }));
}

/** Largest uniform card width that keeps every card on the canvas. Scale only; aspect stays the deck's. */
export function fittedCardWidth({
  width,
  height,
  aspect,
  positions,
  margin = 8,
}: {
  width: number;
  height: number;
  aspect: number;
  positions: { x: number; y: number; rotationDeg: number }[];
  margin?: number;
}): number {
  if (width < 40 || height < 40 || !positions.length) return Math.min(width, height) * 0.42;
  const cardAspect = Math.min(1.4, Math.max(0.35, aspect || 0.62));
  const cap = Math.min(width * 0.62, height * cardAspect * 0.9);
  let low = 28;
  let high = Math.max(low, cap);
  const fits = (cardWidth: number) => {
    const cardHeight = cardWidth / cardAspect;
    const boxes = positions.map((position) => {
      const turned = position.rotationDeg === 90 || position.rotationDeg === 270;
      const boxWidth = turned ? cardHeight : cardWidth;
      const boxHeight = turned ? cardWidth : cardHeight;
      return {
        x: position.x * width,
        y: position.y * height,
        hw: boxWidth / 2,
        hh: boxHeight / 2,
      };
    });
    for (const box of boxes) {
      if (box.x - box.hw < margin) return false;
      if (box.x + box.hw > width - margin) return false;
      if (box.y - box.hh < margin) return false;
      if (box.y + box.hh > height - margin) return false;
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 12) continue;
        const apartX = Math.abs(a.x - b.x) >= a.hw + b.hw + 4;
        const apartY = Math.abs(a.y - b.y) >= a.hh + b.hh + 4;
        if (!apartX && !apartY) return false;
      }
    }
    return true;
  };
  if (!fits(low)) return low;
  for (let step = 0; step < 18; step += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}
