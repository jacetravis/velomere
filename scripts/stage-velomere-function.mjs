/**
 * The published server is a bundled function. Create spawns the generator as a
 * real file and rasterizes with sharp, so those files have to sit inside the
 * function directory or the published app reports "Cannot find module".
 * Create is Node-only. The old Python runtime is not extracted.
 */
import { execFile } from "node:child_process";
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const func = path.join(root, ".vercel/output/functions/__server.func");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function copy(from, to) {
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, dereference: true });
}

if (!(await exists(path.join(func, "index.mjs")))) {
  console.error("[velomere] server function is missing; build did not produce one");
  process.exit(1);
}

const files = ["photo-generate.mjs"];
for (const name of files) {
  await copy(path.join(root, "src/lib/cards", name), path.join(func, "src/lib/cards", name));
}
await copy(path.join(root, "velomere-crystal"), path.join(func, "velomere-crystal"));
await rm(path.join(func, "velomere-crystal", "PHOTO_WORK"), { recursive: true, force: true });
await rm(path.join(func, "velomere-crystal", "pyruntime"), { recursive: true, force: true });
await rm(path.join(func, "velomere-crystal", "DATA", "photo_sources.json"), { force: true });

const modules = [
  "sharp",
  "detect-libc",
  "semver",
  "fflate",
  "@img/colour",
  "@img/sharp-linux-x64",
  "@img/sharp-libvips-linux-x64",
];
for (const name of modules) {
  const from = path.join(root, "node_modules", name);
  if (!(await exists(from))) {
    console.error(`[velomere] missing dependency ${name}`);
    process.exit(1);
  }
  await copy(from, path.join(func, "node_modules", name));
}

// PGLite fallback resolves these next to the bundled module. Nitro emitted the
// wasm into static assets, which this script does not ship.
const pgliteDist = path.join(root, "node_modules/@electric-sql/pglite/dist");
for (const name of ["pglite.wasm", "pglite.data", "initdb.wasm"]) {
  const from = path.join(pgliteDist, name);
  if (!(await exists(from))) {
    console.error(`[velomere] missing pglite runtime ${name}`);
    process.exit(1);
  }
  await copy(from, path.join(func, "_libs", name));
}

const vcPath = path.join(func, ".vc-config.json");
const vc = JSON.parse(await readFile(vcPath, "utf8"));
vc.maxDuration = 300;
await writeFile(vcPath, `${JSON.stringify(vc, null, 2)}\n`);

const output = path.join(root, ".vercel/output");
const staticRoot = path.join(output, "static");
await rm(path.join(staticRoot, "cards", "owned"), { recursive: true, force: true });
await rm(path.join(func, "public", "cards", "owned"), { recursive: true, force: true });
await rm(path.join(staticRoot, "velomere-photo"), { recursive: true, force: true });
await rm(path.join(func, "public", "velomere-photo"), { recursive: true, force: true });
await rm(path.join(staticRoot, "velomere-bench"), { recursive: true, force: true });
await rm(path.join(func, "public", "velomere-bench"), { recursive: true, force: true });
await rm(path.join(func, "PHOTOS"), { recursive: true, force: true });
for (const dir of [
  path.join(staticRoot, "velomere-photo"),
  path.join(func, "public", "velomere-photo"),
  path.join(staticRoot, "downloads"),
  path.join(func, "public", "downloads"),
]) {
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    names = [];
  }
  for (const name of names) {
    if (!name.endsWith(".zip")) continue;
    const file = path.join(dir, name);
    if ((await stat(file)).size > 90 * 1024 * 1024) await rm(file, { force: true });
  }
}
let assetNames = [];
try {
  assetNames = await readdir(path.join(staticRoot, "assets"));
} catch {
  assetNames = [];
}
for (const name of assetNames) {
  if (name.startsWith("pglite-") && (name.endsWith(".wasm") || name.endsWith(".data"))) {
    await rm(path.join(staticRoot, "assets", name), { force: true });
  }
}

const identity = await import(pathToFileURL(path.join(root, "velomere-crystal/engine/export-identity.mjs")).href);

const downloadNames = [
  "velomere-full-build",
  "velomere-deck-process",
  "velomere-dialogic-neutral-deck",
  "velomere-dialogic-affinity-1",
  "velomere-dialogic-affinity-14",
  "velomere-dialogic-affinity-78",
  "velomere-rootline-neutral-deck",
  "velomere-v10-neutral-deck",
];
const placeholder = "null_on_purpose\n";
for (const dir of [path.join(staticRoot, "downloads"), path.join(root, "public", "downloads")]) {
  await mkdir(dir, { recursive: true });
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    names = [];
  }
  for (const name of names) {
    if (name.endsWith(".zip")) await rm(path.join(dir, name), { force: true });
  }
  for (const name of downloadNames) {
    await writeFile(path.join(dir, `${name}.txt`), placeholder);
  }
}
await rm(path.join(staticRoot, "velomere-bench"), { recursive: true, force: true });
await rm(path.join(root, "public", "velomere-bench"), { recursive: true, force: true });
await mkdir(path.join(root, "public", "velomere-bench"), { recursive: true });
await mkdir(path.join(staticRoot, "velomere-bench"), { recursive: true });
await writeFile(path.join(root, "public", "velomere-bench", "null_on_purpose.txt"), placeholder);
await writeFile(path.join(staticRoot, "velomere-bench", "null_on_purpose.txt"), placeholder);
console.log(`[velomere] table downloads and workbench are placeholders (${identity.VERSION})`);

const limit = 95 * 1024 * 1024;
const tooBig = [];
async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if ((await stat(full)).size > limit) tooBig.push(full);
  }
}
await walk(output);
if (tooBig.length) {
  console.error("[velomere] a published file is over 95MB");
  for (const file of tooBig) console.error(file);
  process.exit(1);
}
const { stdout: sized } = await execFileAsync("du", ["-sb", func]);
const funcBytes = Number(String(sized).trim().split(/\s+/)[0]);
if (!Number.isFinite(funcBytes) || funcBytes > 240 * 1024 * 1024) {
  console.error(`[velomere] published function is over 240MB (${funcBytes} bytes)`);
  process.exit(1);
}
console.log(`[velomere] staged generator into the published function (${Math.round(funcBytes / 1048576)}MB)`);
