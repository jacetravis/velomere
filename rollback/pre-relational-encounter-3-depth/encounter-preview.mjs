// @ts-nocheck
import { loadSources, renderCard } from "../../../velomere-crystal/engine/encounter2.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const payload = JSON.parse(raw);
  loadSources()
    .then(async (sources) => {
      const id = String(payload.cardId || "");
      const index = sources.canon.findIndex((row) => row.image.replace(/\.png$/, "") === id);
      if (index < 0) throw new Error("Unknown card.");
      const drawn = await renderCard(sources, index, payload.date, Number(payload.affinity), { raster: false });
      process.stdout.write(JSON.stringify({ svg: drawn.svg, trace: drawn.trace }));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
});
