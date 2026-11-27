const cache = new Map<string, string>();

function mark(ctx: CanvasRenderingContext2D, suit: string) {
  ctx.save();
  ctx.translate(200, 250);
  ctx.strokeStyle = "#1c1915";
  ctx.fillStyle = "#1c1915";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (suit === "cups") {
    ctx.beginPath();
    ctx.moveTo(-36, -20);
    ctx.quadraticCurveTo(-40, 36, 0, 42);
    ctx.quadraticCurveTo(40, 36, 36, -20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-18, 42);
    ctx.lineTo(-10, 62);
    ctx.lineTo(10, 62);
    ctx.lineTo(18, 42);
    ctx.stroke();
  } else if (suit === "swords") {
    ctx.beginPath();
    ctx.moveTo(0, -70);
    ctx.lineTo(0, 48);
    ctx.moveTo(-22, 18);
    ctx.lineTo(22, 18);
    ctx.moveTo(-12, 48);
    ctx.lineTo(0, 70);
    ctx.lineTo(12, 48);
    ctx.stroke();
  } else if (suit === "wands") {
    ctx.beginPath();
    ctx.moveTo(-8, 64);
    ctx.lineTo(10, -60);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, -60);
    ctx.quadraticCurveTo(-6, -36, 16, -28);
    ctx.stroke();
  } else if (suit === "pentacles") {
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let point = 0; point < 5; point += 1) {
      const angle = -Math.PI / 2 + (point * 2 * Math.PI) / 5;
      const x = Math.cos(angle) * 28;
      const y = Math.sin(angle) * 28;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (suit === "hearings") {
    ctx.beginPath();
    ctx.arc(8, 0, 34, Math.PI * 0.15, Math.PI * 1.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14, 4, 16, Math.PI * 0.2, Math.PI * 1.4);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(8, -6, 28, Math.PI * 0.15, Math.PI * 1.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-18, 18, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, line: number) {
  const words = text.split(" ");
  let row = "";
  let top = y;
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (ctx.measureText(next).width > max && row) {
      ctx.fillText(row, x, top);
      row = word;
      top += line;
    } else {
      row = next;
    }
  }
  if (row) ctx.fillText(row, x, top);
}

export function cardPortrait(card: { name: string; suit: string; rank: string }) {
  const key = `${card.suit}|${card.rank}|${card.name}`;
  const saved = cache.get(key);
  if (saved) return saved;
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#f7f3ea";
  ctx.fillRect(0, 0, 400, 600);
  ctx.strokeStyle = "rgba(28, 25, 21, 0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, 356, 556);
  ctx.strokeStyle = "rgba(28, 25, 21, 0.28)";
  ctx.strokeRect(30, 30, 340, 540);
  ctx.fillStyle = "#1c1915";
  ctx.font = "500 32px 'Cormorant Garamond', Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText(card.rank || "·", 46, 78);
  mark(ctx, card.suit);
  ctx.fillStyle = "#1c1915";
  ctx.font = "500 40px 'Cormorant Garamond', Georgia, serif";
  ctx.textAlign = "center";
  wrap(ctx, card.name, 200, 470, 300, 46);
  const url = canvas.toDataURL("image/jpeg", 0.84);
  cache.set(key, url);
  return url;
}
