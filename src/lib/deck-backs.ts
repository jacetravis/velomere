import { THEMES } from "@/lib/themes";

export const FRESH_DECK_BACK = "/backs/fresh.jpg";

export const DECK_BACKS = [
  { id: "fresh", name: "Fresh", src: FRESH_DECK_BACK },
  ...THEMES.map((theme) => ({ id: theme.id, name: theme.name, src: `/backs/${theme.id}.jpg` })),
];
