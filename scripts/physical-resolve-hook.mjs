const root = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(`${specifier.slice(2)}.ts`, root).href, context);
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
