import { strToU8, unzip, zipSync } from "fflate";
import type { CardTemplateId } from "./shape.ts";
import { normalizeSuit } from "./types.ts";

export const CARDS_CSV_TEMPLATE = `name,suit,rank,keywords,upright,reversed,image,sort_order,image_scale,image_x,image_y,image_radius
Ace of Hearings,hearings,Ace,"listen, attend, opening","The ear opens. This is a beginning, not a verdict.","Noise mistaken for signal.",ace-of-hearings.jpg,,100,0,0,2
`;

const MAX_CARDS = 200;
const MAX_UNPACKED = 100_000_000;

export type ZipImage = {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  type: string;
};

export type ZipDraft = {
  name: string;
  suit: string;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  sortOrder?: number;
  imageScale: number;
  imageX: number;
  imageY: number;
  imageRadius: number;
  imageName: string | null;
  image: ZipImage | null;
};

type Row = {
  name: string;
  suit: string;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  image: string;
  sort: string;
  scale: string;
  x: string;
  y: string;
  radius: string;
};

const FIELD: Record<string, keyof Row> = {
  name: "name",
  card: "name",
  title: "name",
  suit: "suit",
  rank: "rank",
  keywords: "keywords",
  keyword: "keywords",
  upright: "upright",
  "upright meaning": "upright",
  meaning: "upright",
  reversed: "reversed",
  "reversed meaning": "reversed",
  image: "image",
  "image file": "image",
  filename: "image",
  file: "image",
  picture: "image",
  sort: "sort",
  "sort order": "sort",
  sort_order: "sort",
  image_scale: "scale",
  scale: "scale",
  image_x: "x",
  image_y: "y",
  image_radius: "radius",
};

function emptyRow(): Row {
  return {
    name: "",
    suit: "",
    rank: "",
    keywords: "",
    upright: "",
    reversed: "",
    image: "",
    sort: "",
    scale: "",
    x: "",
    y: "",
    radius: "",
  };
}

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((value) => value.trim().toLowerCase());
  return rows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      if (key) record[key] = (values[index] ?? "").trim();
    });
    return record;
  });
}

function soften(value: string) {
  return value.trim().replace(/\\n/g, "\n");
}

function toRow(record: Record<string, string>): Row {
  const row = emptyRow();
  for (const [key, value] of Object.entries(record)) {
    const field = FIELD[key.trim().toLowerCase()];
    if (field) row[field] = soften(value);
  }
  return row;
}

function mimeFor(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}

function looksLikeSvg(bytes: Uint8Array) {
  const head = new TextDecoder().decode(bytes.subarray(0, 240)).trimStart().toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg");
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}

function isJunk(path: string): boolean {
  const base = baseName(path);
  return (
    !base ||
    base.startsWith(".") ||
    path.split("/").includes("__MACOSX") ||
    base === "Thumbs.db"
  );
}

function titleFromFile(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  return stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function cardsFromSpreadsheet(text: string): ZipDraft[] {
  return draftsFromRows(parseCsv(text).map(toRow), new Map());
}

function unzipArchive(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (error, result) => {
      if (error || !result) reject(error ?? new Error("Could not read the zip."));
      else resolve(result);
    });
  });
}

function draftsFromRows(
  rows: Row[],
  images: Map<string, ZipImage>,
): ZipDraft[] {
  const drafts: ZipDraft[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    const suit = normalizeSuit(row.suit);
    const key = `${suit}\n${name.toLowerCase()}`;
    const imageName = row.image.trim();
    const image = imageName
      ? (images.get(imageName.toLowerCase()) ??
        images.get(baseName(imageName).toLowerCase()) ??
        null)
      : null;
    const sort = Number(row.sort);
    const draft: ZipDraft = {
      name,
      suit,
      rank: row.rank.trim(),
      keywords: row.keywords.trim(),
      upright: row.upright.trim(),
      reversed: row.reversed.trim(),
      sortOrder: Number.isFinite(sort) && row.sort.trim() ? sort : undefined,
      imageScale: frameNumber(row.scale, 100, 40, 220),
      imageX: frameNumber(row.x, 0, -80, 80),
      imageY: frameNumber(row.y, 0, -80, 80),
      imageRadius: frameNumber(row.radius, 2, 0, 40),
      imageName: imageName || null,
      image,
    };
    if (seen.has(key)) {
      const index = drafts.findIndex(
        (item) => item.suit === suit && item.name.toLowerCase() === name.toLowerCase(),
      );
      if (index >= 0) drafts[index] = draft;
    } else {
      seen.add(key);
      drafts.push(draft);
    }
  }
  return drafts;
}

type OpenedZip = {
  drafts: ZipDraft[];
  images: Map<string, ZipImage>;
  deckText: string | null;
};

async function openZip(data: Uint8Array): Promise<OpenedZip> {
  let files: Record<string, Uint8Array>;
  try {
    files = await unzipArchive(data);
  } catch {
    throw new Error("That file is not a zip archive.");
  }

  let unpacked = 0;
  const images = new Map<string, ZipImage>();
  let csvText: string | null = null;
  let jsonText: string | null = null;
  let deckText: string | null = null;

  for (const [rawPath, bytes] of Object.entries(files)) {
    unpacked += bytes.byteLength;
    if (unpacked > MAX_UNPACKED) {
      throw new Error("That archive unpacked too large.");
    }
    const path = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (isJunk(path)) continue;
    const base = baseName(path);
    const lower = base.toLowerCase();
    const type = looksLikeSvg(bytes) ? "image/svg+xml" : mimeFor(base);
    if (type) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const image = { name: base, bytes: copy, type };
      images.set(lower, image);
      images.set(path.toLowerCase(), image);
      continue;
    }
    const text = new TextDecoder().decode(bytes);
    if (lower === "cards.csv") csvText = text;
    else if (lower === "cards.json" && csvText === null) jsonText = text;
    else if (lower === "deck.json") deckText = text;
  }

  if (csvText !== null) {
    const drafts = draftsFromRows(parseCsv(csvText).map(toRow), images);
    if (drafts.length > MAX_CARDS) {
      throw new Error(`Import ${MAX_CARDS} cards or fewer at a time.`);
    }
    return { drafts, images, deckText };
  }

  if (jsonText !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("cards.json is not valid JSON.");
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { cards?: unknown }).cards)
        ? (parsed as { cards: unknown[] }).cards
        : null;
    if (!list) throw new Error("cards.json should be a list of cards.");
    const rows = list.map((item) => {
      const record: Record<string, string> = {};
      if (item && typeof item === "object") {
        for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
          if (value == null) continue;
          record[key] = String(value);
        }
      }
      return toRow(record);
    });
    const drafts = draftsFromRows(rows, images);
    if (drafts.length > MAX_CARDS) {
      throw new Error(`Import ${MAX_CARDS} cards or fewer at a time.`);
    }
    return { drafts, images, deckText };
  }

  const drafts: ZipDraft[] = [];
  const seen = new Set<string>();
  for (const [key, image] of images) {
    if (key.includes("/")) continue;
    if (seen.has(image.name.toLowerCase())) continue;
    seen.add(image.name.toLowerCase());
    const name = titleFromFile(image.name);
    if (!name) continue;
    drafts.push({
      name,
      suit: "custom",
      rank: "",
      keywords: "",
      upright: "",
      reversed: "",
      imageName: image.name,
      imageScale: 100,
      imageX: 0,
      imageY: 0,
      imageRadius: 2,
      image,
    });
  }
  if (drafts.length > MAX_CARDS) {
    throw new Error(`Import ${MAX_CARDS} cards or fewer at a time.`);
  }
  return { drafts, images, deckText };
}

export async function readCardZip(data: Uint8Array): Promise<ZipDraft[]> {
  return (await openZip(data)).drafts;
}

const TEMPLATES = new Set<CardTemplateId>(["tarot", "long-tarot", "oracle", "long-oracle"]);

export type ZipDeckSettings = {
  edge: number;
  edgeColor: number;
  edgeSat: number;
  edgeLight: number;
  cardThickness: number;
  cardRadius: number;
  cardWidth: number;
  cardLength: number;
  cardLocked: boolean;
  cardTemplate: CardTemplateId | null;
  backX: number;
  backY: number;
  backScale: number;
  backRotate: number;
  cardBack: ZipImage | null;
  customSuits: string[];
  tableImage: ZipImage | null;
  tableX: number;
  tableY: number;
  tableScale: number;
  tableRotate: number;
  tableColor: number;
  tableSat: number;
  tableLight: number;
  tableContrast: number;
  tableVignette: number;
};

function frameNumber(value: unknown, fallback: number, min: number, max: number) {
  if (value == null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function num(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function flag(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function settingsFrom(text: string, images: Map<string, ZipImage>): ZipDeckSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  const backName = typeof raw.cardBack === "string" ? raw.cardBack.trim() : "";
  const tableName = typeof raw.tableImage === "string" ? raw.tableImage.trim() : "";
  const templateRaw = typeof raw.cardTemplate === "string" ? raw.cardTemplate : "";
  const cardTemplate = TEMPLATES.has(templateRaw as CardTemplateId)
    ? (templateRaw as CardTemplateId)
    : null;
  return {
    edge: num(raw.edge, 100),
    edgeColor: num(raw.edgeColor, 0),
    edgeSat: num(raw.edgeSat, 0),
    edgeLight: num(raw.edgeLight, 26),
    cardThickness: num(raw.cardThickness, 75),
    cardRadius: num(raw.cardRadius, 5),
    cardWidth: num(raw.cardWidth, 55),
    cardLength: num(raw.cardLength, 55),
    cardLocked: flag(raw.cardLocked, true),
    cardTemplate,
    backX: num(raw.backX, 0),
    backY: num(raw.backY, 0),
    backScale: num(raw.backScale, 100),
    backRotate: num(raw.backRotate, 0),
    cardBack: backName
      ? (images.get(backName.toLowerCase()) ??
        images.get(baseName(backName).toLowerCase()) ??
        null)
      : null,
    customSuits: Array.isArray(raw.customSuits)
      ? raw.customSuits
          .filter((item): item is string => typeof item === "string")
          .map((item) => normalizeSuit(item))
          .filter((item) => item && item !== "custom")
          .slice(0, 40)
      : [],
    tableImage: tableName
      ? (images.get(tableName.toLowerCase()) ??
        images.get(baseName(tableName).toLowerCase()) ??
        null)
      : null,
    tableX: frameNumber(raw.tableX, 0, -80, 80),
    tableY: frameNumber(raw.tableY, 0, -80, 80),
    tableScale: frameNumber(raw.tableScale, 100, 80, 220),
    tableRotate: frameNumber(raw.tableRotate, 0, -180, 180),
    tableColor: frameNumber(raw.tableColor, 0, 0, 360),
    tableSat: frameNumber(raw.tableSat, 100, 0, 200),
    tableLight: frameNumber(raw.tableLight, 100, 40, 180),
    tableContrast: frameNumber(raw.tableContrast, 100, 60, 160),
    tableVignette: frameNumber(raw.tableVignette, 18, 0, 80),
  };
}

export async function readDeckArchive(
  data: Uint8Array,
): Promise<{ cards: ZipDraft[]; settings: ZipDeckSettings | null }> {
  const opened = await openZip(data);
  return {
    cards: opened.drafts,
    settings: opened.deckText ? settingsFrom(opened.deckText, opened.images) : null,
  };
}

export type ZipCardFile = {
  name: string;
  suit: string;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  sortOrder: number;
  imageScale: number;
  imageX: number;
  imageY: number;
  imageRadius: number;
  imageName: string | null;
  image: Uint8Array | null;
};

export type ZipLookFile = {
  edge: number;
  edgeColor: number;
  edgeSat: number;
  edgeLight: number;
  cardThickness: number;
  cardRadius: number;
  cardWidth: number;
  cardLength: number;
  cardLocked: boolean;
  cardTemplate: string | null;
  backX: number;
  backY: number;
  backScale: number;
  backRotate: number;
  cardBackName: string | null;
  cardBack: Uint8Array | null;
  customSuits: string[];
  tableImageName: string | null;
  tableImage: Uint8Array | null;
  tableX: number;
  tableY: number;
  tableScale: number;
  tableRotate: number;
  tableColor: number;
  tableSat: number;
  tableLight: number;
  tableContrast: number;
  tableVignette: number;
};

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function writeDeckZip(
  cards: ZipCardFile[],
  look: ZipLookFile,
  extras?: Record<string, Uint8Array>,
  preferExtras = false,
): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const lines = ["name,suit,rank,keywords,upright,reversed,image,sort_order,image_scale,image_x,image_y,image_radius"];
  for (const card of cards) {
    lines.push(
      [
        csvCell(card.name),
        csvCell(card.suit),
        csvCell(card.rank),
        csvCell(card.keywords),
        csvCell(card.upright),
        csvCell(card.reversed),
        csvCell(card.imageName ?? ""),
        String(card.sortOrder),
        String(card.imageScale ?? 100),
        String(card.imageX ?? 0),
        String(card.imageY ?? 0),
        String(card.imageRadius ?? 2),
      ].join(","),
    );
    if (card.image && card.imageName) files[`images/${card.imageName}`] = card.image;
  }
  files["cards.csv"] = strToU8(`${lines.join("\n")}\n`);
  files["deck.json"] = strToU8(
    JSON.stringify({
      edge: look.edge,
      edgeColor: look.edgeColor,
      edgeSat: look.edgeSat,
      edgeLight: look.edgeLight,
      cardThickness: look.cardThickness,
      cardRadius: look.cardRadius,
      cardWidth: look.cardWidth,
      cardLength: look.cardLength,
      cardLocked: look.cardLocked,
      cardTemplate: look.cardTemplate,
      backX: look.backX,
      backY: look.backY,
      backScale: look.backScale,
      backRotate: look.backRotate,
      cardBack: look.cardBackName,
      customSuits: look.customSuits ?? [],
      tableImage: look.tableImageName,
      tableX: look.tableX ?? 0,
      tableY: look.tableY ?? 0,
      tableScale: look.tableScale ?? 100,
      tableRotate: look.tableRotate ?? 0,
      tableColor: look.tableColor ?? 0,
      tableSat: look.tableSat ?? 100,
      tableLight: look.tableLight ?? 100,
      tableContrast: look.tableContrast ?? 100,
      tableVignette: look.tableVignette ?? 18,
    }),
  );
  if (look.cardBack && look.cardBackName) files[`back/${look.cardBackName}`] = look.cardBack;
  if (look.tableImage && look.tableImageName) files[`table/${look.tableImageName}`] = look.tableImage;
  if (extras) {
    for (const [name, bytes] of Object.entries(extras)) {
      if (bytes?.length && (preferExtras || !files[name])) files[name] = bytes;
    }
  }
  return zipSync(files);
}
