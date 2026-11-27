type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPrompt | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installVersion() {
  return version;
}

export function canPromptInstall() {
  return deferred != null;
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const touch = navigator.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
}

export function isSamsung() {
  if (typeof navigator === "undefined") return false;
  return /SamsungBrowser/i.test(navigator.userAgent || "");
}

export function installHelp() {
  if (isSamsung()) {
    return "In Samsung Internet, tap the menu at the bottom. Choose Add page to, then Home screen.";
  }
  return "Open this page in Chrome or Samsung Internet, tap the browser menu, then choose Install app or Add to Home screen.";
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const event = deferred;
  deferred = null;
  emit();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}

if (typeof window !== "undefined") {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}
