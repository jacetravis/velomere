export type ThemeId = "threshold" | "moonwell" | "scriptorium" | "atelier" | "glasshouse" | "rite" | "firmament" | "numen";

export type RoomTheme = {
  id: ThemeId;
  name: string;
  note: string;
  scheme: "dark" | "light";
  table: string;
};

export const THEMES: RoomTheme[] = [
  {
    id: "moonwell",
    name: "Moonwell",
    note: "Silver on still water. A honed slate table.",
    scheme: "dark",
    table: "/tables/slate.jpg",
  },
  {
    id: "rite",
    name: "Rite",
    note: "A working room. Soot, oxblood, and black stone.",
    scheme: "dark",
    table: "/tables/basalt.jpg",
  },
  {
    id: "scriptorium",
    name: "Scriptorium",
    note: "Gallery daylight. Ink on white, over pale oak.",
    scheme: "light",
    table: "/tables/oak.jpg",
  },
  {
    id: "firmament",
    name: "Firmament",
    note: "Night measurement. Indigo cloth and old chart gold.",
    scheme: "dark",
    table: "/tables/indigo.jpg",
  },
  {
    id: "glasshouse",
    name: "Glasshouse",
    note: "Cool daylight. Green ink on pale limestone.",
    scheme: "light",
    table: "/tables/limestone.jpg",
  },
  {
    id: "atelier",
    name: "Atelier",
    note: "A dark room. Bone type, clay, blackened walnut.",
    scheme: "dark",
    table: "/tables/walnut.jpg",
  },
  {
    id: "numen",
    name: "Numen",
    note: "The hour between. Pearl, mist, and moonstone.",
    scheme: "light",
    table: "/tables/moonstone.jpg",
  },
  {
    id: "threshold",
    name: "Threshold",
    note: "Candle, ink, and pale marble.",
    scheme: "dark",
    table: "/marble.jpg",
  },
];

export const DEFAULT_THEME: ThemeId = "moonwell";

const KEY = "solace-theme";
const listeners = new Set<() => void>();

export function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function themeById(id: ThemeId): RoomTheme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function themeId(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = window.localStorage.getItem(KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

export function setThemeId(id: ThemeId) {
  window.localStorage.setItem(KEY, id);
  document.documentElement.dataset.theme = id;
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
