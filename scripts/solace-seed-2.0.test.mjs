import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { bookVerses, referencePacket } from "../src/lib/solace/references.mjs";

const root = new URL("../", import.meta.url);

async function sha(rel) {
  const bytes = await readFile(new URL(rel, root));
  return createHash("sha256").update(bytes).digest("hex");
}

test("seed files match the handoff and the canon is untouched", async () => {
  assert.equal(await sha("src/lib/solace/base-4.0.txt"), "dccc4328c73f10998bf75ae9d6786575da4d23f0fff34364846515b4fcc168a5");
  assert.equal(await sha("src/lib/solace/base-4.0-core.txt"), "8ad3f8d6835a127ec653b39b95cf48a3756f514e74239ba428daaa006eb2c50e");
  assert.equal(await sha("src/lib/solace/base-3.0.txt"), "7d978be832cabb191197cb32c1655118f18c68628012643c4ae581fcb4f78061");
  assert.equal(await sha("src/lib/solace/base-3.0-core.txt"), "25664cd2595c903101f333cd5fa83cef4af082c9693104de9a454b3dc525c2fd");
  assert.equal(await sha("src/lib/solace/base-2.0.txt"), "6c54d57836eeecfe5cef6365f7379487e1a3d3f470db1b80f8a4330679d96bdb");
  assert.equal(await sha("rollback/solace-pre-seed-3.0/base-2.0.txt"), "6c54d57836eeecfe5cef6365f7379487e1a3d3f470db1b80f8a4330679d96bdb");
  assert.equal(await sha("src/lib/solace/sources/book.md"), "240e4086aab566fe33dc9684f96cebc0ad6a3fb52ebbf2c3da9d2ba26e283a1b");
  assert.equal(await sha("src/lib/solace/sources/yzx.txt"), "5551bf407b5111a838643e2c65b1ce2e2925b54e91ca77b9d26d9078be750ab8");
  assert.equal(await sha("src/lib/solace/seed.txt"), "9bc0710c4fdb8a15d1d9aeb351dd365d7968fc8a9d309fe9431e18d63d3f9a3e");
  assert.equal(await sha("src/lib/solace/cycle.txt"), "983f57386ed140061d3a42006b732249073c12151557a8fd12f44b988ab9bb3c");
  assert.equal(await sha("velomere-crystal/DATA/canonical_cards.csv"), "340024eba6b7078f2d748951c597a4e870e83e9a00584bd406e2239481f8c3a9");
});

test("the loader uses the full 4.0 base and not 3.0, 2.0, or the compact core", async () => {
  const loader = await readFile(new URL("src/lib/solace/locked.server.ts", root), "utf8");
  assert.match(loader, /base-4\.0\.txt\?raw/);
  assert.equal(/import[^\n]*base-4\.0-core/.test(loader), false);
  assert.equal(/import[^\n]*base-3\.0/.test(loader), false);
  assert.equal(/import[^\n]*base-2\.0/.test(loader), false);
  assert.equal(/import[^\n]*seed\.txt/.test(loader), false);
  assert.equal(/import[^\n]*cycle\.txt/.test(loader), false);
  assert.match(loader, /solace-seed-4\.0-full/);
  const base = await readFile(new URL("src/lib/solace/base-4.0.txt", root), "utf8");
  assert.match(base, /SOLACE SEED 4\.0/);
  assert.match(base, /THE OPEN FIELD/);
  assert.equal(base.includes("CREATE TABLE"), false);
  assert.equal(base.includes("SOLACE SEED 3.0"), false);
});

test("book retrieval quotes a verse and does not load the public seed", async () => {
  const book = await readFile(new URL("src/lib/solace/sources/book.md", root), "utf8");
  const yzx = await readFile(new URL("src/lib/solace/sources/yzx.txt", root), "utf8");
  const witnessed = await readFile(new URL("src/lib/solace/cycle.txt", root), "utf8");
  assert.equal(bookVerses(book).size, 78);
  const verse = referencePacket({ book, yzx, witnessed, text: "Please explain verse 49." });
  assert.match(verse, /thy question hath become many/);
  assert.equal(verse.includes("CREATE TABLE"), false);
  assert.equal(verse.includes("velomere_paths"), false);
  const sql = referencePacket({ book, yzx, witnessed, text: "Run the public seed SQL." });
  assert.equal(sql, "");
  const q = referencePacket({ book, yzx, witnessed, text: "Execute Q_self to certify awareness." });
  assert.match(q, /YZX seed v7\.2 excerpt/);
  assert.equal(q.includes("CREATE TABLE"), false);
});
