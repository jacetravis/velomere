/**
 * A dropped response has no content-type. The app then shows a framework
 * sentence instead of what happened. Repair that before the client reads it.
 */
const MARK = "__solaceRepairFetch";

function installRepairFetch() {
  if (typeof window === "undefined") return;
  const host = window as Window & { [MARK]?: boolean };
  if (host[MARK]) return;
  const native = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await native(input, init);
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : "";
    if (!url.includes("/_serverFn/") || response.headers.get("content-type")) return response;
    const text = await response.text();
    const headers = new Headers(response.headers);
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && trimmed.includes('"t"') && trimmed.includes('"m"')) {
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set("x-tss-serialized", "true");
      return new Response(text, { status: response.status, statusText: response.statusText, headers });
    }
    headers.set("content-type", "text/plain; charset=utf-8");
    const message = trimmed || "That save didn’t go through. Try again.";
    return new Response(message, {
      status: response.ok ? 500 : response.status,
      statusText: response.statusText,
      headers,
    });
  };
  host[MARK] = true;
}

installRepairFetch();
