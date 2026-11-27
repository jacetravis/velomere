import { readFile } from "node:fs/promises";

const root = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const bare = specifier.slice(2);
    const withExt = /\.[a-z0-9]+$/i.test(bare) ? bare : `${bare}.ts`;
    return nextResolve(new URL(withExt, root).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z0-9]+$/i.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      return nextResolve(specifier, context);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const raw = await readFile(new URL(url), "utf8");
    return { format: "module", shortCircuit: true, source: `export default ${raw}` };
  }
  return nextLoad(url, context);
}