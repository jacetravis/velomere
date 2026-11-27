// @ts-nocheck
import sharp from "sharp";
import { loadSources, proveDialogic, renderCard } from "../../../velomere-crystal/engine/dialogic.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const payload = JSON.parse(raw);
  const run = async () => {
    if (payload.mode === "prove") {
      const report = await proveDialogic(payload.date || "2026-11-13");
      return report;
    }
    const sources = await loadSources();
    const id = String(payload.cardId || "");
    const index = sources.canon.findIndex((row) => row.image.replace(/\.(png|jpe?g)$/i, "") === id);
    if (index < 0) throw new Error("Unknown card.");
    const drawn = await renderCard(sources, index, payload.date, Number(payload.affinity), {
      raster: payload.includePng === true,
      compact: true,
      counterfactuals: payload.counterfactuals === true,
      hostOrientation: payload.hostOrientation,
      guestOrientation: payload.guestOrientation,
      view: payload.view || {},
    });
    let png = null;
    if (drawn.png) {
      const meta = await sharp(drawn.png).metadata();
      png = { width: meta.width, height: meta.height, bytes: drawn.png.length };
    }
    return { svg: drawn.svg, trace: drawn.trace, png };
  };
  run()
    .then((result) => {
      process.stdout.write(JSON.stringify(result));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
});
