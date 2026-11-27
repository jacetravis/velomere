/** Stamped face for a locked Default-deck card. Titles are set in type, not by the model. */
export function defaultCardArt(name: string): string {
  return `/cards/${name.toLowerCase().replaceAll(" ", "-")}.jpg`;
}
