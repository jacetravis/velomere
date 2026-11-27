export function recipeOf(date: string, affinity: number): Promise<string>;
export function materializeProceduralDeck(
  date: string,
  affinity: number,
): Promise<{ recipe: string; slug: string; imageBase: string; backUrl: string }>;
