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
const exportText = [
  `renderer: ${identity.VERSION}`,
  `grammar: ${identity.GRAMMAR_VERSION}`,
  `recipe: ${identity.RECIPE_VERSION}`,
  `trace: ${identity.TRACE_SCHEMA}`,
  `style: ${identity.STYLE_ID}`,
  `label: ${identity.STYLE_LABEL}`,
  `lexicon: ${identity.ORIGIN_LEXICON}`,
  `policy: ${identity.POLICY_VERSION}`,
  "rewritten_by: scripts/stage-velomere-function.mjs",
  "note: This file is rewritten on every production build. The table shows the same renderer and grammar.",
  "",
].join("\n");

const fullBuild = path.join(staticRoot, "downloads", "velomere-full-build.zip");
const fullBuildPublic = path.join(root, "public", "downloads", "velomere-full-build.zip");
await rm(fullBuild, { force: true });
await rm(fullBuildPublic, { force: true });
const stagedZip = path.join(root, ".velomere-full-build.zip");
await execFileAsync("python3", ["-c", `
import os, sys, zipfile
output, dest, note = sys.argv[1], sys.argv[2], sys.argv[3]
def skip(rel):
    rel = rel.replace(os.sep, "/")
    return (
        rel.startswith("static/downloads/")
        or rel.startswith("static/cards/")
        or rel.startswith("static/velomere-bench/")
        or rel.startswith("static/velomere-photo/")
        or "/pyruntime/" in "/" + rel + "/"
        or "/cards/owned/" in "/" + rel + "/"
    )
with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    zf.writestr("EXPORT.txt", note)
    for dirpath, _dirnames, filenames in os.walk(output):
        for name in filenames:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, output)
            if skip(rel):
                continue
            zf.write(full, rel)
`, output, stagedZip, exportText]);
const built = await stat(stagedZip);
if (built.size > 90 * 1024 * 1024) {
  await rm(stagedZip, { force: true });
  console.error(`[velomere] full-build zip is over 90MB (${built.size} bytes)`);
  process.exit(1);
}
await mkdir(path.dirname(fullBuild), { recursive: true });
await cp(stagedZip, fullBuild);
await cp(stagedZip, fullBuildPublic);
await rm(stagedZip, { force: true });

const processPairs = [
  ["engine/dialogic.mjs", path.join(root, "velomere-crystal/engine/dialogic.mjs")],
  ["engine/export-identity.mjs", path.join(root, "velomere-crystal/engine/export-identity.mjs")],
  ["engine/rootline.mjs", path.join(root, "velomere-crystal/engine/rootline.mjs")],
  ["cards/photo-generate.mjs", path.join(root, "src/lib/cards/photo-generate.mjs")],
  ["cards/encounter-preview.mjs", path.join(root, "src/lib/cards/encounter-preview.mjs")],
  ["data/canonical_cards.csv", path.join(root, "velomere-crystal/DATA/canonical_cards.csv")],
  ["data/archetype_blueprints.csv", path.join(root, "velomere-crystal/DATA/archetype_blueprints.csv")],
  ["data/rootline/78_ONE_PATH_CORE_CONCEPTS.json", path.join(root, "velomere-crystal/DATA/rootline/78_ONE_PATH_CORE_CONCEPTS.json")],
];
const confluenceDir = path.join(root, "velomere-crystal/DATA/confluence");
for (const name of await readdir(confluenceDir)) {
  if (name.endsWith(".csv")) processPairs.push([`data/confluence/${name}`, path.join(confluenceDir, name)]);
}
const processNote = `${exportText}\nCreate spawns cards/photo-generate.mjs. That calls buildDeck in engine/dialogic.mjs. dialogic.mjs loads the canon and the weight matrices through engine/rootline.mjs. Encounter geometry does not replace the readings.\n`;
const processZip = path.join(staticRoot, "downloads", "velomere-deck-process.zip");
const processPublic = path.join(root, "public", "downloads", "velomere-deck-process.zip");
const stagedProcess = path.join(root, ".velomere-deck-process.zip");
await execFileAsync("python3", ["-c", `
import sys, zipfile
dest, note = sys.argv[1], sys.argv[2]
pairs = sys.argv[3:]
with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    zf.writestr("EXPORT.txt", note)
    zf.writestr("PROCESS.md", note)
    if len(pairs) % 2:
        raise SystemExit("process zip pairs are uneven")
    for i in range(0, len(pairs), 2):
        zf.write(pairs[i + 1], pairs[i])
`, stagedProcess, processNote, ...processPairs.flat()]);
const processStat = await stat(stagedProcess);
if (processStat.size > 90 * 1024 * 1024) {
  await rm(stagedProcess, { force: true });
  console.error(`[velomere] process zip is over 90MB (${processStat.size} bytes)`);
  process.exit(1);
}
await cp(stagedProcess, processZip);
await cp(stagedProcess, processPublic);
await rm(stagedProcess, { force: true });
console.log(`[velomere] deck-process zip ${Math.round(processStat.size / 1024)}KB ${identity.VERSION}`);

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
console.log(`[velomere] full-build zip ${Math.round(built.size / 1048576)}MB`);
