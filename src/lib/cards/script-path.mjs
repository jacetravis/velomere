import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The published function does not contain the app source tree unless the build
 * staged it. Dev and preview still have the files next to this module.
 * @param {string} scriptName
 * @param {string} [fromUrl]
 */
export function velomereScriptPath(scriptName, fromUrl = import.meta.url) {
  const sibling = path.join(path.dirname(fileURLToPath(fromUrl)), scriptName);
  if (existsSync(sibling)) return sibling;
  const roots = [process.cwd()];
  let dir = path.dirname(fileURLToPath(fromUrl));
  for (let i = 0; i < 8; i += 1) {
    roots.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const root of roots) {
    const script = path.join(root, "src", "lib", "cards", scriptName);
    if (existsSync(script)) return script;
  }
  throw new Error("The deck generator is not in this published app.");
}

/** @param {unknown} error */
export function publicGenerateError(error) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/deck generator is not|cannot find module/i.test(raw)) {
    return "The deck could not be finished. Nothing was saved. This published copy is missing the generator. Publish again after the update.";
  }
  if (/EROFS|read-only file system/i.test(raw)) {
    return "The deck could not be finished. Nothing was saved. The pictures could not be stored.";
  }
  if (/\bsharp\b|libvips/i.test(raw)) {
    return "The deck could not be finished. Nothing was saved. The picture maker did not start.";
  }
  if (/ENOENT|spawn python/i.test(raw)) {
    return "The deck could not be finished. Nothing was saved. The picture maker did not start.";
  }
  const safe = raw
    .replace(/\/[\w.+@[\]-]+/g, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(/node:internal\S*/g, "")
    .replace(/Module\._resolveFilename/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  if (!safe || /throw err/i.test(safe)) {
    return "The deck could not be finished. Nothing was saved.";
  }
  return `The deck could not be finished. Nothing was saved. ${safe}`;
}
