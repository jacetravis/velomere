import { strToU8, unzip, zipSync } from "fflate";
import { fileToDataUrl, svgToPng } from "@/lib/cards/image";
import {
  createDeck,
  deleteDeck,
  importCards,
  listCards,
  listDecks,
  setActiveDeck,
} from "@/lib/cards/server";
import { readDeckArchive, writeDeckZip, type ZipDeckSettings } from "@/lib/cards/zip";
import { keptConsents, type UploadConsent } from "@/lib/consent";
import { conversationFromBackup } from "@/lib/journal/backup";
import { completeLook, useJournal, type Conversation, type DeckLook, type Dream, type Reading, type Ritual } from "@/lib/journal/store";
import { setReadingHand, setVelomereHand } from "@/lib/table-hands";
import { isShuffleAnimation, setShuffleAnimation } from "@/lib/shuffle-animation";
import { LIBRARY } from "@/lib/cards/library";

const KIND = "solace-archive";

type DeckIndex = {
  id: number;
  name: string;
  locked: boolean;
  active: boolean;
  file: string;
};

function extFromMime(type: string, path = "") {
  const hint = `${type} ${path}`.toLowerCase();
  if (hint.includes("svg")) return "svg";
  if (hint.includes("png")) return "png";
  if (hint.includes("webp")) return "webp";
  if (hint.includes("gif")) return "gif";
  return "jpg";
}

async function loadArtwork(url: string) {
  if (url.startsWith("data:")) {
    const base64 = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]*)$/.exec(url);
    if (base64) {
      const binary = atob(base64[2]);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const head = new TextDecoder().decode(bytes.subarray(0, 240)).trimStart().toLowerCase();
      return exportedImage(bytes, head.startsWith("<?xml") || head.startsWith("<svg") ? "svg" : extFromMime(base64[1] ?? ""));
    }
    const plain = /^data:([^;,]+)?(?:;charset=[^;,]+)?,(.*)$/s.exec(url);
    if (!plain) return null;
    const bytes = new TextEncoder().encode(decodeURIComponent(plain[2]));
    const head = new TextDecoder().decode(bytes.subarray(0, 240)).trimStart().toLowerCase();
    return exportedImage(bytes, head.startsWith("<?xml") || head.startsWith("<svg") ? "svg" : extFromMime(plain[1] ?? ""));
  }
  const response = await fetch(url);
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const head = new TextDecoder().decode(bytes.subarray(0, 240)).trimStart().toLowerCase();
  const ext =
    head.startsWith("<?xml") || head.startsWith("<svg")
      ? "svg"
      : type
        ? extFromMime(type, path)
        : path.endsWith(".png")
          ? "png"
          : path.endsWith(".webp")
            ? "webp"
            : path.endsWith(".gif")
              ? "gif"
              : path.endsWith(".svg")
                ? "svg"
                : "jpg";
  return exportedImage(bytes, ext);
}

async function exportedImage(bytes: Uint8Array, ext: string) {
  if (ext !== "svg") return { bytes, ext };
  return { bytes: await svgToPng(bytes), ext: "png" };
}

function artworkName(index: number, name: string, ext: string) {
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "card";
  return `${String(index + 1).padStart(2, "0")}-${stem}.${ext}`;
}

function unzipArchive(data: Uint8Array) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(data, (error, result) => {
      if (error || !result) reject(error ?? new Error("Could not read the zip."));
      else resolve(result);
    });
  });
}

async function pictureUrl(file: { bytes: Uint8Array; name: string; type: string } | null, max: number) {
  if (!file) return null;
  const bytes = new Uint8Array(file.bytes.byteLength);
  bytes.set(file.bytes);
  const url = await fileToDataUrl(new File([bytes], file.name, { type: file.type }), max);
  return url.length > 1_500_000 ? null : url;
}

function lookFromSettings(settings: ZipDeckSettings, cardBack: string | null, tableImage: string | null, stockBack: string | null): DeckLook {
  return completeLook({
    edge: settings.edge,
    edgeColor: settings.edgeColor,
    edgeSat: settings.edgeSat,
    edgeLight: settings.edgeLight,
    cardThickness: settings.cardThickness,
    cardRadius: settings.cardRadius,
    cardWidth: settings.cardWidth,
    cardLength: settings.cardLength,
    cardLocked: settings.cardLocked,
    cardTemplate: settings.cardTemplate,
    backX: settings.backX,
    backY: settings.backY,
    backScale: settings.backScale,
    backRotate: settings.backRotate,
    cardBack,
    ...(stockBack != null ? { stockBack } : {}),
    tableImage,
    tableX: settings.tableX,
    tableY: settings.tableY,
    tableScale: settings.tableScale,
    tableRotate: settings.tableRotate,
    tableColor: settings.tableColor,
    tableSat: settings.tableSat,
    tableLight: settings.tableLight,
    tableContrast: settings.tableContrast,
    tableVignette: settings.tableVignette,
  });
}

export async function buildArchive(): Promise<Uint8Array> {
  const state = useJournal.getState();
  const decks = await listDecks();
  const files: Record<string, Uint8Array> = {};
  const index: DeckIndex[] = [];
  for (const deck of decks) {
    if (deck.locked) continue;
    const cards = await listCards({ data: { deckId: deck.id } });
    const look = completeLook(state.deckLooks[String(deck.id)] ?? (deck.active ? state : undefined));
    const packed = [];
    for (const [cardIndex, card] of cards.entries()) {
      const artwork = card.imageUrl ? await loadArtwork(card.imageUrl) : null;
      packed.push({
        name: card.name,
        suit: card.suit,
        rank: card.rank,
        keywords: card.keywords,
        upright: card.upright,
        reversed: card.reversed,
        sortOrder: card.sortOrder,
        imageScale: card.imageScale ?? 100,
        imageX: card.imageX ?? 0,
        imageY: card.imageY ?? 0,
        imageRadius: card.imageRadius ?? 2,
        imageName: artwork ? artworkName(cardIndex, card.name, artwork.ext) : null,
        image: artwork?.bytes ?? null,
      });
    }
    const back = look.cardBack ? await loadArtwork(look.cardBack) : null;
    const table = look.tableImage ? await loadArtwork(look.tableImage) : null;
    const stockPath = typeof look.stockBack === "string" && look.stockBack.startsWith("/") ? look.stockBack : null;
    const stock = !stockPath && look.stockBack ? await loadArtwork(look.stockBack) : null;
    const zipped = writeDeckZip(packed, {
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
      cardBackName: back ? `card-back.${back.ext}` : null,
      cardBack: back?.bytes ?? null,
      stockBackName: stock ? `stock-back.${stock.ext}` : null,
      stockBack: stock?.bytes ?? null,
      stockBackPath: stockPath,
      customSuits: state.customSuits ?? [],
      tableImageName: table ? `table.${table.ext}` : null,
      tableImage: table?.bytes ?? null,
      tableX: look.tableX,
      tableY: look.tableY,
      tableScale: look.tableScale,
      tableRotate: look.tableRotate,
      tableColor: look.tableColor,
      tableSat: look.tableSat,
      tableLight: look.tableLight,
      tableContrast: look.tableContrast,
      tableVignette: look.tableVignette,
    });
    const file = `decks/${deck.id}.zip`;
    files[file] = zipped;
    index.push({ id: deck.id, name: deck.name, locked: deck.locked, active: deck.active, file });
  }
  files["library.json"] = strToU8(
    JSON.stringify({
      readings: state.readings ?? [],
      dreams: state.dreams ?? [],
      rituals: state.rituals ?? [],
      conversations: state.conversations ?? [],
      labels: state.labels ?? [],
      customSuits: state.customSuits ?? [],
      suitOrders: state.suitOrders ?? {},
      deckConsents: keptConsents(state.deckConsents),
      cardConsents: keptConsents(state.cardConsents),
      shuffleLocked: state.shuffleLocked !== false,
      includeReversals: state.includeReversals === true,
      hand: window.localStorage.getItem("lumen-hand"),
      readingHand: window.localStorage.getItem("lumen-hand"),
      velomereHand: window.localStorage.getItem("velomere-hand"),
      shuffleAnimation: window.localStorage.getItem("solace-shuffle-style"),
    }),
  );
  files["manifest.json"] = strToU8(JSON.stringify({ kind: KIND, version: 1, decks: index }));
  return zipSync(files);
}

async function cardsFromArchive(cards: Awaited<ReturnType<typeof readDeckArchive>>["cards"]) {
  const prepared = [];
  for (const card of cards) {
    let imageUrl: string | null = null;
    if (card.image) {
      try {
        imageUrl = await pictureUrl(card.image, 960);
      } catch {
        imageUrl = null;
      }
    }
    prepared.push({
      name: card.name,
      suit: card.suit,
      rank: card.rank,
      keywords: card.keywords,
      upright: card.upright,
      reversed: card.reversed,
      imageUrl,
      sortOrder: card.sortOrder,
      imageScale: card.imageScale,
      imageX: card.imageX,
      imageY: card.imageY,
      imageRadius: card.imageRadius,
    });
  }
  return prepared;
}

export async function restoreArchive(data: Uint8Array) {
  const files = await unzipArchive(data);
  const manifestText = textOf(files, "manifest.json");
  const libraryText = textOf(files, "library.json");
  if (!manifestText || !libraryText) throw new Error("That file is not a backup of this table.");
  const manifest = JSON.parse(manifestText) as { kind?: string; decks?: DeckIndex[] };
  if (manifest.kind !== KIND || !Array.isArray(manifest.decks)) {
    throw new Error("That file is not a backup of this table.");
  }
  const library = JSON.parse(libraryText) as {
    readings?: Reading[];
    dreams?: Dream[];
    rituals?: Ritual[];
    conversations?: unknown[];
    labels?: { id: string; name: string; color: string }[];
    customSuits?: string[];
    suitOrders?: Record<string, string[]>;
    deckConsents?: unknown;
    cardConsents?: unknown;
    shuffleLocked?: boolean;
    includeReversals?: boolean;
    hand?: string | null;
    readingHand?: string | null;
    velomereHand?: string | null;
    shuffleAnimation?: string | null;
  };
  const current = await listDecks();
  const lockedByName = new Map<string, (typeof current)[number]>();
  for (const deck of current) {
    if (!deck.locked) continue;
    const key = deck.name.trim().toLowerCase();
    if (!lockedByName.has(key)) lockedByName.set(key, deck);
  }
  const idMap = new Map<number, number>();
  const looks = new Map<number, DeckLook>();
  const created: number[] = [];
  let activeId = current.find((deck) => deck.active)?.id ?? lockedByName.get("rider-waite-smith")?.id ?? null;

  for (const deck of manifest.decks) {
    const bytes = files[deck.file] ?? findFile(files, deck.file);
    if (!bytes) continue;
    const archive = await readDeckArchive(bytes);
    let cardBack: string | null = null;
    let tableImage: string | null = null;
    if (archive.settings?.cardBack) cardBack = await pictureUrl(archive.settings.cardBack, 480);
    if (archive.settings?.tableImage) tableImage = await pictureUrl(archive.settings.tableImage, 1280);
    let stockBack: string | null = archive.settings?.stockBackPath ?? null;
    if (archive.settings?.stockBack) stockBack = await pictureUrl(archive.settings.stockBack, 480);
    const look = archive.settings ? lookFromSettings(archive.settings, cardBack, tableImage, stockBack) : completeLook(null);
    if (deck.locked) {
      const match = lockedByName.get(deck.name.trim().toLowerCase());
      if (!match) continue;
      idMap.set(deck.id, match.id);
      looks.set(match.id, look);
      if (deck.active) activeId = match.id;
      continue;
    }
    const made = await createDeck({ data: { name: deck.name.slice(0, 60) || "Deck", sourceId: null } });
    const inputs = await cardsFromArchive(archive.cards);
    for (let index = 0; index < inputs.length; index += 8) {
      const batch = inputs.slice(index, index + 8);
      if (batch.length === 0) continue;
      await importCards({ data: { deckId: made.id, cards: batch } });
    }
    idMap.set(deck.id, made.id);
    looks.set(made.id, look);
    created.push(made.id);
    if (deck.active) activeId = made.id;
  }

  for (const deck of current) {
    if (!deck.locked && !created.includes(deck.id)) await deleteDeck({ data: { id: deck.id } });
  }
  if (activeId) await setActiveDeck({ data: { id: activeId } });

  const deckLooks: Record<string, DeckLook> = {};
  for (const [id, look] of looks) deckLooks[String(id)] = look;
  const activeLook = activeId != null ? deckLooks[String(activeId)] : undefined;
  const readings = (Array.isArray(library.readings) ? library.readings : []).map((reading) => {
    const nextId = reading.deckId != null ? idMap.get(reading.deckId) : undefined;
    return nextId != null ? { ...reading, deckId: nextId } : reading;
  });
  const readingHand = library.readingHand ?? library.hand;
  if (readingHand === "left" || readingHand === "right") setReadingHand(readingHand);
  if (library.velomereHand === "left" || library.velomereHand === "right") setVelomereHand(library.velomereHand);
  if (isShuffleAnimation(library.shuffleAnimation)) setShuffleAnimation(library.shuffleAnimation);
  useJournal.setState({
    readings,
    dreams: Array.isArray(library.dreams) ? library.dreams : [],
    rituals: Array.isArray(library.rituals) ? library.rituals : [],
    conversations: Array.isArray(library.conversations)
      ? library.conversations
          .map(conversationFromBackup)
          .filter((item): item is Conversation => item != null)
          .map((conversation) => remapConversationDeck(conversation, idMap))
      : [],
    labels: Array.isArray(library.labels) ? library.labels : [],
    customSuits: Array.isArray(library.customSuits) ? library.customSuits : [],
    suitOrders: remapSuitOrders(library.suitOrders, idMap),
    deckConsents: remapKeyedConsents(library.deckConsents, idMap),
    cardConsents: remapCardConsents(library.cardConsents, idMap),
    shuffleLocked: library.shuffleLocked !== false,
    includeReversals: library.includeReversals === true,
    deckLooks,
    deckOrder: [
      ...current
        .filter((deck) => deck.locked)
        .sort((a, b) => {
          const rank = (name: string) => {
            const key = name.trim().toLowerCase();
            if (key === "rider-waite-smith") return 0;
            const index = LIBRARY.findIndex((item) => item.name.toLowerCase() === key);
            return index >= 0 ? index + 1 : 50;
          };
          return rank(a.name) - rank(b.name) || a.id - b.id;
        })
        .map((deck) => deck.id),
      ...created,
    ],
    activeDeckId: activeId,
    ...(activeLook ?? {}),
  });
}

function remapConversationDeck(conversation: Conversation, idMap: Map<number, number>): Conversation {
  const origin = conversation.origin;
  if (!origin || origin.kind !== "card" || origin.deckId == null) return conversation;
  const nextId = idMap.get(origin.deckId);
  if (nextId == null) return conversation;
  return { ...conversation, origin: { ...origin, deckId: nextId } };
}

function remapKeyedConsents(raw: unknown, idMap: Map<number, number>): Record<string, UploadConsent> {
  const kept = keptConsents(raw);
  const out: Record<string, UploadConsent> = {};
  for (const [key, consent] of Object.entries(kept)) {
    const nextId = idMap.get(Number(key));
    if (nextId != null) out[String(nextId)] = consent;
  }
  return out;
}

function remapCardConsents(raw: unknown, idMap: Map<number, number>): Record<string, UploadConsent> {
  const kept = keptConsents(raw);
  const out: Record<string, UploadConsent> = {};
  for (const [key, consent] of Object.entries(kept)) {
    const split = key.indexOf(":");
    if (split < 1) continue;
    const nextId = idMap.get(Number(key.slice(0, split)));
    if (nextId == null) continue;
    out[`${nextId}:${key.slice(split + 1)}`] = consent;
  }
  return out;
}

function remapSuitOrders(raw: unknown, idMap: Map<number, number>): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    const nextId = idMap.get(Number(key));
    if (nextId == null || !Array.isArray(list)) continue;
    const suits = list
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase().slice(0, 40))
      .filter(Boolean)
      .slice(0, 40);
    if (suits.length > 0) out[String(nextId)] = suits;
  }
  return out;
}

function textOf(files: Record<string, Uint8Array>, name: string) {
  const bytes = files[name] ?? findFile(files, name);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

function findFile(files: Record<string, Uint8Array>, name: string) {
  const lower = name.toLowerCase();
  const found = Object.entries(files).find(([path]) => path.replace(/\\/g, "/").toLowerCase().endsWith(lower));
  return found?.[1];
}
