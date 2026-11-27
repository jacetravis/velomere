import { buildDeck } from "../../../velomere-crystal/engine/dialogic.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const payload = JSON.parse(raw);
  buildDeck(payload.directory, payload.date, Number(payload.affinity))
    .then((result) => {
      process.stdout.write(JSON.stringify(result));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
});
