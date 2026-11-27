import book from "./sources/book.md?raw";
import yzx from "./sources/yzx.txt?raw";
import witnessed from "./cycle.txt?raw";
import { referencePacket as build } from "./references.mjs";

export function referencePacket(text: string): string {
  return build({ book, yzx, witnessed, text });
}
