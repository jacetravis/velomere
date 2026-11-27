import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { defaultCardArt } from "./art";
import { CUSTOM_CARDS } from "./custom";
import { deleteOwnedOpaque, saveOwnedTree } from "./owned-art";
import { SEED_CARDS } from "./seed";
import { publicGenerateError, velomereScriptPath } from "./script-path.mjs";
import libraryPacks from "./library-cards.json";
import { normalizeSuit, defaultSort, type Card, type CardInput } from "./types";

type CardRow = {
  id: number;
  name: string;
  suit: string;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  image_url: string | null;
  is_seed: boolean;
  sort_order: number;
  image_scale: number;
  image_x: number;
  image_y: number;
  image_radius: number;
  created_at: string;
};

function toCard(row: CardRow): Card {
  return {
    id: row.id,
    name: row.name,
    suit: normalizeSuit(row.suit),
    rank: row.rank,
    keywords: row.keywords,
    upright: row.upright,
    reversed: row.reversed,
    imageUrl: row.image_url,
    isSeed: row.is_seed,
    sortOrder: row.sort_order,
    imageScale: Number(row.image_scale ?? 100),
    imageX: Number(row.image_x ?? 0),
    imageY: Number(row.image_y ?? 0),
    imageRadius: Number(row.image_radius ?? 2),
    createdAt: row.created_at,
  };
}

/** Inline pictures are already on the phone. Echoing them back makes the save response large enough that the preview drops it and the client only sees a missing content-type. */
function forClient(card: Card): Card {
  const image = card.imageUrl;
  if (image && image.startsWith("data:") && image.length > 512) {
    return { ...card, imageUrl: null };
  }
  return card;
}

const SELECT = `id, name, suit, rank, keywords, upright, reversed, image_url,
  is_seed, sort_order, image_scale, image_x, image_y, image_radius, created_at::text as created_at`;

async function fetchCards(): Promise<Card[]> {
  const sql = await getSql();
  const rows = await sql.query<CardRow>(
    `select ${SELECT} from cards order by sort_order asc, id asc`,
  );
  return rows.map(toCard);
}

async function ensureCustomCards(): Promise<void> {
  const sql = await getSql();
  for (const card of CUSTOM_CARDS) {
    const existing = await sql.query<{ id: number }>(
      `select id from cards where name = $1 and suit = $2 limit 1`,
      [card.name, card.suit],
    );
    if (existing.length > 0) continue;
    await sql.query(
      `insert into cards (name, suit, rank, keywords, upright, reversed, image_url, is_seed, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, false, $8)`,
      [
        card.name,
        card.suit,
        card.rank,
        card.keywords,
        card.upright,
        card.reversed,
        card.imageUrl,
        card.sortOrder,
      ],
    );
  }
}

async function seedIfEmpty(): Promise<Card[]> {
  const existing = await fetchCards();
  if (existing.length === 0) {
    const sql = await getSql();
    for (const card of SEED_CARDS) {
      try {
        await sql.query(
          `insert into cards (name, suit, rank, keywords, upright, reversed, is_seed, sort_order)
           select $1, $2, $3, $4, $5, $6, true, $7
           where not exists (
             select 1 from cards
             where is_seed is true and lower(name) = lower($1) and suit = $2
           )`,
          [
            card.name,
            card.suit,
            card.rank,
            card.keywords,
            card.upright,
            card.reversed,
            card.sortOrder,
          ],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/duplicate key|unique constraint/i.test(message)) throw error;
      }
    }
  }
  await ensureCustomCards();
  return fetchCards();
}

function frameNumber(value: unknown, fallback: number, min: number, max: number) {
  if (value == null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function parseCardInput(input: unknown): CardInput {
  const data = (input ?? {}) as Record<string, unknown>;
  const name = String(data.name ?? "").trim();
  if (!name) throw new Error("A card needs a name.");
  if (name.length > 120) throw new Error("That card name is too long.");
  const suit = normalizeSuit(String(data.suit ?? "custom"));
  const imageRaw = data.imageUrl;
  const imageUrl =
    typeof imageRaw === "string" && imageRaw.trim() ? imageRaw.trim() : null;
  if (imageUrl && imageUrl.length > 1_500_000) {
    throw new Error(`The picture for ${name} is too large.`);
  }
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? data.sortOrder
      : undefined;
  return {
    name,
    suit,
    rank: String(data.rank ?? "").trim().slice(0, 40),
    keywords: String(data.keywords ?? "").trim().slice(0, 240),
    upright: String(data.upright ?? "").trim().slice(0, 4000),
    reversed: String(data.reversed ?? "").trim().slice(0, 4000),
    imageUrl,
    sortOrder,
    imageScale: frameNumber(data.imageScale, 100, 40, 220),
    imageX: frameNumber(data.imageX, 0, -80, 80),
    imageY: frameNumber(data.imageY, 0, -80, 80),
    imageRadius: frameNumber(data.imageRadius, 2, 0, 40),
  };
}

export type DeckRecord = {
  id: number;
  name: string;
  locked: boolean;
  active: boolean;
  cardCount: number;
};

async function seedDeck(deckId: number): Promise<void> {
  const sql = await getSql();
  for (const card of SEED_CARDS) {
    const url = defaultCardArt(card.name);
    try {
      await sql.query(
        `insert into cards (name, suit, rank, keywords, upright, reversed, image_url, is_seed, sort_order, deck_id)
         select $1, $2, $3, $4, $5, $6, $7, true, $8, $9
         where not exists (
           select 1 from cards
           where deck_id = $9 and is_seed is true and lower(name) = lower($1) and suit = $2
         )`,
        [
          card.name,
          card.suit,
          card.rank,
          card.keywords,
          card.upright,
          card.reversed,
          url,
          card.sortOrder,
          deckId,
        ],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate key|unique constraint/i.test(message)) throw error;
    }
  }
}

type LibraryCard = {
  name: string;
  suit: string;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  image: string;
  sortOrder: number;
  imageScale: number;
  imageX: number;
  imageY: number;
  imageRadius: number;
};

async function seedLibrary(deckId: number, cards: LibraryCard[]): Promise<void> {
  const sql = await getSql();
  for (const card of cards) {
    try {
      await sql.query(
        `insert into cards (name, suit, rank, keywords, upright, reversed, image_url, is_seed, sort_order, image_scale, image_x, image_y, image_radius, deck_id)
         select $1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13
         where not exists (
           select 1 from cards
           where deck_id = $13 and is_seed is true and lower(name) = lower($1) and suit = $2
         )`,
        [
          card.name.slice(0, 120),
          card.suit.slice(0, 40),
          card.rank.slice(0, 40),
          card.keywords.slice(0, 240),
          card.upright.slice(0, 4000),
          card.reversed.slice(0, 4000),
          card.image,
          card.sortOrder,
          card.imageScale,
          card.imageX,
          card.imageY,
          card.imageRadius,
          deckId,
        ],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate key|unique constraint/i.test(message)) throw error;
    }
  }
}

async function ensureLibraryDecks(userId: string): Promise<void> {
  const sql = await getSql();
  for (const pack of libraryPacks.decks) {
    const existing = await sql.query<{ id: number; locked: boolean }>(
      `select id, locked from decks where user_id = $1 and lower(name) = lower($2) order by id asc`,
      [userId, pack.name],
    );
    let deckId = existing.find((deck) => deck.locked === true)?.id;
    let fresh = false;
    if (!deckId) {
      const created = await sql.query<{ id: number }>(
        `insert into decks (name, locked, active, user_id)
         values ($1, true, false, $2)
         returning id`,
        [pack.name, userId],
      );
      deckId = created[0]?.id;
      fresh = deckId != null;
    }
    if (!deckId) continue;
    if (!fresh) {
      const probe = await sql.query<{ count: number; current: boolean }>(
        `select count(*)::int as count,
                coalesce(bool_and(coalesce(image_url, '') like '%?v=4'), false) as current
           from cards where deck_id = $1`,
        [deckId],
      );
      const row = probe[0];
      const ready = Number(row?.count ?? 0) === pack.cards.length && row?.current === true;
      if (ready) continue;
      await sql.query(`delete from cards where deck_id = $1`, [deckId]);
    }
    await seedLibrary(deckId, pack.cards as LibraryCard[]);
  }
}

const deckReady = new Map<string, Promise<void>>();

async function ensureUserDecks(userId: string): Promise<void> {
  const existing = deckReady.get(userId);
  if (existing) return existing;
  let settle!: (value: void | PromiseLike<void>) => void;
  let fail!: (reason: unknown) => void;
  const run = new Promise<void>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  deckReady.set(userId, run);
  void ensureUserDecksNow(userId).then(settle, (error) => {
    deckReady.delete(userId);
    fail(error);
  });
  return run;
}

async function ensureUserDecksNow(userId: string): Promise<void> {
  const sql = await getSql();
  const mine = await sql.query<{ id: number }>(
    `select id from decks where user_id = $1 limit 1`,
    [userId],
  );
  if (!mine[0]) {
    const taken = await sql.query<{ id: number }>(
      `select id from decks where user_id is not null limit 1`,
    );
    if (!taken[0]) {
      await sql.query(`update decks set user_id = $1 where user_id is null`, [userId]);
    }
  }
  await sql.query(
    `delete from cards where deck_id in (
       select id from decks where user_id = $1 and locked is true and lower(name) = 'default'
     )`,
    [userId],
  );
  await sql.query(
    `delete from decks where user_id = $1 and locked is true and lower(name) = 'default'`,
    [userId],
  );
  await ensureLibraryDecks(userId);
  await sql.query(
    `delete from cards where deck_id in (
       select id from decks where user_id = $1 and locked is true and lower(name) = 'velomere'
     )`,
    [userId],
  );
  await sql.query(
    `delete from decks where user_id = $1 and locked is true and lower(name) = 'velomere'`,
    [userId],
  );
  await sql.query(
    `delete from cards
      where deck_id in (select id from decks where user_id = $1)
        and (
          coalesce(image_url, '') like '%/cards/velomere%'
          or coalesce(image_url, '') like '%/cards/procedural/%'
          or coalesce(image_url, '') like '%/cards/procedural-r2/%'
        )`,
    [userId],
  );
  const active = await sql.query<{ id: number }>(
    `select id from decks where user_id = $1 and active is true order by id asc`,
    [userId],
  );
  if (active.length === 0) {
    await sql.query(
      `update decks set active = true where user_id = $1 and id = (
         select id from decks where user_id = $1 and locked is true and lower(name) = 'rider-waite-smith' order by id asc limit 1
       )`,
      [userId],
    );
  } else if (active.length > 1) {
    await sql.query(`update decks set active = false where user_id = $1 and id <> $2`, [
      userId,
      active[0].id,
    ]);
  }
}

async function assertFreshName(sql: Awaited<ReturnType<typeof getSql>>, userId: string, name: string, exceptId?: number) {
  const rows = await sql.query<{ id: number }>(
    `select id from decks where user_id = $1 and lower(name) = lower($2)`,
    [userId, name],
  );
  if (rows.some((row) => Number(row.id) !== exceptId)) throw new Error("A deck already has that name.");
}

async function assertOwned(deckId: number, userId: string, writable: boolean): Promise<void> {
  const sql = await getSql();
  const rows = await sql.query<{ locked: boolean; user_id: string | null }>(
    `select locked, user_id from decks where id = $1`,
    [deckId],
  );
  const deck = rows[0];
  if (!deck || deck.user_id !== userId) throw new Error("That deck is gone.");
  if (writable && deck.locked === true) throw new Error("This deck is locked.");
}

/** Faces belong only on the locked Default deck. Other decks keep the copy they were given. */
async function ensureDefaultArt(defaultId: number): Promise<void> {
  const sql = await getSql();
  const gap = await sql.query<{ id: number }>(
    `select id from cards
      where deck_id = $1
        and is_seed is true
        and (
          image_url is null
          or (
            image_url like '/cards/%'
            and image_url is distinct from ('/cards/' || replace(lower(name), ' ', '-') || '.jpg')
          )
        )
      limit 1`,
    [defaultId],
  );
  if (!gap[0]) return;
  for (const card of SEED_CARDS) {
    const url = defaultCardArt(card.name);
    await sql.query(
      `update cards
          set image_url = $3
        where deck_id = $1
          and is_seed is true
          and name = $2
          and (
            image_url is null
            or (image_url like '/cards/%' and image_url is distinct from $3)
          )`,
      [defaultId, card.name, url],
    );
  }
}

export const listDecks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
  await ensureUserDecks(context.userId);
  const sql = await getSql();
  const rows = await sql.query<{ id: number; name: string; locked: boolean; active: boolean; card_count: number }>(
    `select id, name, locked, active,
            (select count(*)::int from cards where deck_id = decks.id) as card_count
       from decks where user_id = $1 order by locked desc, id asc`,
    [context.userId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    locked: row.locked === true,
    active: row.active === true,
    cardCount: Number(row.card_count ?? 0),
  })) satisfies DeckRecord[];
});

export const createDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { name?: unknown; sourceId?: unknown };
    const name = String(raw.name ?? "").trim();
    if (!name) throw new Error("A deck needs a name.");
    if (name.length > 60) throw new Error("That name is too long.");
    if (name.toLowerCase() === "velomere") throw new Error("Velomere is your personal deck. It is already on the Decks page.");
    if (raw.sourceId != null && raw.sourceId !== "") throw new Error("Decks can't be copied.");
    return { name };
  })
  .handler(async ({ data, context }) => {
    await ensureUserDecks(context.userId);
    const sql = await getSql();
    await assertFreshName(sql, context.userId, data.name);
    const created = await sql.query<{ id: number }>(
      `insert into decks (name, locked, active, user_id) values ($1, false, false, $2) returning id`,
      [data.name, context.userId],
    );
    const deckId = created[0]?.id;
    if (!deckId) throw new Error("Could not create the deck.");
    return {
      id: Number(deckId),
      name: data.name,
      locked: false,
      active: false,
      cardCount: 0,
    } satisfies DeckRecord;
  });

type VelomereTicket = {
  userId: string;
  child: { kill: (signal?: NodeJS.Signals) => boolean } | null;
  canceled: boolean;
  status: "running" | "done" | "error";
  deck?: {
    id: number;
    name: string;
    locked: boolean;
    active: boolean;
    cardCount: number;
    backUrl: string;
    recipe?: string;
    archiveUrl: string;
  };
  message?: string;
};
type VelomereGlobal = typeof globalThis & { __velomereJobs__?: Map<string, VelomereTicket> };
const velomereJobs = ((globalThis as VelomereGlobal).__velomereJobs__ ??= new Map<string, VelomereTicket>());

function civilDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (date < "1900-01-01" || date > "2100-12-31") return false;
  const [year, month, day] = date.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= days;
}

function ownedArtDir(urls: Array<string | null>) {
  const ids = new Set<string>();
  for (const url of urls) {
    const match = /^\/cards\/owned\/([a-f0-9]{32})\//.exec(url ?? "");
    if (match) ids.add(match[1]);
  }
  if (ids.size !== 1) return null;
  return [...ids][0];
}

async function removeOwnedArt(urls: Array<string | null>) {
  const id = ownedArtDir(urls);
  if (!id) return;
  const { rm } = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.resolve(process.cwd(), "data", "cards", "owned");
  const full = path.resolve(root, id);
  if (full === path.join(root, id)) {
    await rm(full, { recursive: true, force: true });
  }
  try {
    const sql = await getSql();
    await deleteOwnedOpaque(sql, id);
  } catch (error) {
    console.error("[owned-art]", error instanceof Error ? error.message : error);
  }
}

function runVelomereScript(payload: unknown, token: string, scriptName = "photo-generate.mjs", timeoutMs = 240000) {
  return new Promise<string>((resolve, reject) => {
    void (async () => {
      const { spawn } = await import("node:child_process");
      const path = await import("node:path");
      const script = velomereScriptPath(scriptName);
      const root = path.resolve(path.dirname(script), "../../..");
      const child = spawn(process.execPath, [script], {
        cwd: root,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });
      const job = velomereJobs.get(token);
      if (job) job.child = child;
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        out += chunk;
      });
      child.stderr.on("data", (chunk) => {
        err += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (velomereJobs.get(token)?.canceled) {
          reject(new Error("canceled"));
          return;
        }
        if (code !== 0) reject(new Error(err.trim().slice(0, 180) || "Generation failed"));
        else resolve(out);
      });
      child.stdin.end(JSON.stringify(payload));
    })().catch(reject);
  });
}

export const cancelVelomereDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const token = String((input as { token?: unknown })?.token ?? "");
    if (!/^[a-f0-9]{16}$/.test(token)) throw new Error("Missing generation.");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const job = velomereJobs.get(data.token);
    if (!job || job.userId !== context.userId) return { ok: true as const };
    job.canceled = true;
    job.child?.kill("SIGTERM");
    console.info("[velomere-d3] cancel");
    return { ok: true as const };
  });

export const createVelomereDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { name?: unknown; date?: unknown; affinity?: unknown; token?: unknown; treatment?: unknown };
    const name = String(raw.name ?? "").trim();
    const date = String(raw.date ?? "");
    const affinity = Number(raw.affinity);
    const token = String(raw.token ?? "");
    const treatment = raw.treatment == null || raw.treatment === "" ? "relational-field" : String(raw.treatment);
    if (!name) throw new Error("A deck needs a name.");
    if (name.length > 60) throw new Error("That name is too long.");
    if (name.toLowerCase() === "velomere") throw new Error("Velomere is your personal deck. It is already on the Decks page.");
    if (!civilDate(date)) throw new Error("Choose a real date from 1900 through 2100.");
    if (!Number.isInteger(affinity) || affinity < 0 || affinity > 78) {
      throw new Error("Affinity must be a whole number from 0 to 78.");
    }
    if (treatment !== "relational-field" && treatment !== "geometry" && treatment !== "rootline") {
      throw new Error("This deck draws a rising path. Photo anatomy is not part of it.");
    }
    if (!/^[a-f0-9]{16}$/.test(token)) throw new Error("Missing generation.");
    return { name, date, affinity, token, treatment };
  })
  .handler(async ({ data, context }) => {
    if (process.env.VEL_ALLOW_BULK_DECK !== "1") {
      throw new Error("A full Velomere deck is not offered. Open Velomere Encounters and draw two cards.");
    }
    for (const job of velomereJobs.values()) {
      if (job.userId === context.userId && job.status === "running") throw new Error("A deck is already being generated.");
    }
    const ticket: VelomereTicket = { userId: context.userId, child: null, canceled: false, status: "running" };
    velomereJobs.set(data.token, ticket);
    void finishVelomereDeck(data, context.userId).catch((error) => {
      const current = velomereJobs.get(data.token);
      if (!current || current.status !== "running") return;
      current.status = "error";
      current.message = publicGenerateError(error);
    });
    return { accepted: true as const, token: data.token };
  });

async function finishVelomereDeck(
  data: { name: string; date: string; affinity: number; token: string; treatment: string },
  userId: string,
) {
  let job = velomereJobs.get(data.token);
  if (!job) {
    job = { userId, child: null, canceled: false, status: "running" };
    velomereJobs.set(data.token, job);
  }
  const note = async (line: string) => {
    console.info("[velomere-d3]", line);
    try {
      const { appendFile } = await import("node:fs/promises");
      await appendFile("/tmp/velomere-create.log", `${new Date().toISOString()} ${line}\n`);
    } catch {
      /* logging must not stop the deck */
    }
  };
    const [{ randomBytes }, { cp, mkdir, rm, stat }, os, path] = await Promise.all([
      import("node:crypto"),
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
    ]);
    const opaque = randomBytes(16).toString("hex");
    const kind = "velomere-d3";
    let directory = "";
    let tempError: unknown;
    for (const root of ["/tmp", os.tmpdir()]) {
      const candidate = path.join(root, kind, opaque);
      try {
        await mkdir(candidate, { recursive: true });
        directory = candidate;
        break;
      } catch (error) {
        tempError = error;
      }
    }
    if (!directory) {
      job.status = "error";
      job.message = publicGenerateError(tempError instanceof Error ? tempError : new Error("No writable temporary folder."));
      throw new Error(job.message);
    }
    const published = path.join(process.cwd(), "data", "cards", "owned", opaque);
    let deckId = 0;
    await note("generate");
    try {
      const stdout = await runVelomereScript(
        { date: data.date, affinity: data.affinity, directory, treatment: data.treatment },
        data.token,
        "photo-generate.mjs",
        240000,
      );
      if (job.canceled) throw new Error("canceled");
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("The drawings came back empty");
      const built = JSON.parse(stdout.slice(start, end + 1)) as {
        recipe?: string;
        cards?: Array<{
          name: string;
          suit: string;
          rank: string;
          keywords: string;
          upright: string;
          reversed: string;
          sortOrder: number;
          file: string;
        }>;
      };
      const cards = built.cards ?? [];
      if (cards.length !== 78) throw new Error("Incomplete deck");
      const root = path.resolve(directory);
      for (const card of cards) {
        if (!/^images\/\d{2}-[a-z0-9-]+\.(?:png|jpe?g)$/.test(card.file)) throw new Error("Incomplete deck");
        const full = path.resolve(root, card.file);
        if (!full.startsWith(root + path.sep)) throw new Error("Incomplete deck");
        const info = await stat(full);
        if (info.size < 2048) throw new Error("Incomplete deck");
        const svg = full.replace(`${path.sep}images${path.sep}`, `${path.sep}svg${path.sep}`).replace(/\.(?:png|jpe?g)$/i, ".svg");
        const drawn = await stat(svg);
        if (drawn.size < 200) throw new Error("Incomplete deck");
      }
      const extras = [
        "back/card-back.jpg",
        "back/card-back.svg",
        "cards.csv",
        "canonical_cards.csv",
        "archetype_blueprints.csv",
        "deck_contexts.json",
        "deck.json",
        "recipe.json",
        "manifest.json",
        "provenance.json",
        "deck.zip",
      ];
      for (const extra of extras) {
        const full = path.resolve(root, extra);
        if (!full.startsWith(root + path.sep)) throw new Error("Incomplete deck");
        const info = await stat(full);
        if (info.size < 20) throw new Error("Incomplete deck");
      }
      if (job.canceled) throw new Error("canceled");
      const sql = await getSql();
      await saveOwnedTree(sql, userId, opaque, directory);
      // The account copy above is what loads. A local folder is only a
      // convenience, and it stays outside public/ so Vite does not publish it.
      try {
        await mkdir(path.dirname(published), { recursive: true });
        await cp(directory, published, { recursive: true });
      } catch (error) {
        console.error("[velomere-d3]", "local picture folder skipped", error instanceof Error ? error.message : error);
      }
      await rm(directory, { recursive: true, force: true });
      if (job.canceled) throw new Error("canceled");
      const created = await sql.query<{ id: number }>(
        `insert into decks (name, locked, active, user_id) values ($1, false, false, $2) returning id`,
        [data.name, userId],
      );
      deckId = Number(created[0]?.id ?? 0);
      if (!deckId) throw new Error("Could not create the deck.");
      for (const card of cards) {
        await sql.query(
          `insert into cards (name, suit, rank, keywords, upright, reversed, image_url, is_seed, sort_order, image_scale, image_x, image_y, image_radius, deck_id)
           values ($1, $2, $3, $4, $5, $6, $7, false, $8, 100, 0, 0, 2, $9)`,
          [
            card.name,
            card.suit,
            card.rank,
            card.keywords,
            card.upright,
            card.reversed,
            `/cards/owned/${opaque}/${card.file}`,
            card.sortOrder,
            deckId,
          ],
        );
      }
      const counted = await sql.query<{ n: number }>(
        `select count(*)::int as n from cards where deck_id = $1`,
        [deckId],
      );
      if (Number(counted[0]?.n ?? 0) !== 78) throw new Error("Incomplete deck");
      const deck = {
        id: deckId,
        name: data.name,
        locked: false,
        active: false,
        cardCount: 78,
        backUrl: `/cards/owned/${opaque}/back/card-back.jpg`,
        recipe: built.recipe,
        archiveUrl: `/cards/owned/${opaque}/deck.zip`,
      };
      job.status = "done";
      job.deck = deck;
      await note(`done ${deckId}`);
      setTimeout(() => {
        const current = velomereJobs.get(data.token);
        if (current && current.status !== "running") velomereJobs.delete(data.token);
      }, 10 * 60 * 1000);
      return deck;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      await rm(published, { recursive: true, force: true });
      try {
        const sql = await getSql();
        await deleteOwnedOpaque(sql, opaque);
        if (deckId) {
          await sql.query(`delete from cards where deck_id = $1`, [deckId]);
          await sql.query(`delete from decks where id = $1 and user_id = $2`, [deckId, userId]);
        }
      } catch (cleanupError) {
        console.error("[velomere-d3]", cleanupError instanceof Error ? cleanupError.message : cleanupError);
      }
      const message =
        job.canceled || (error instanceof Error && error.message === "canceled")
          ? "Generation canceled. Nothing was saved."
          : publicGenerateError(error);
      job.status = "error";
      job.message = message;
      console.error("[velomere-d3]", error instanceof Error ? error.message : error);
      await note(`error ${message}`);
      setTimeout(() => {
        const current = velomereJobs.get(data.token);
        if (current && current.status !== "running") velomereJobs.delete(data.token);
      }, 10 * 60 * 1000);
      throw new Error(message);
    }
}

export const velomereDeckStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const token = String((input as { token?: unknown })?.token ?? "");
    if (!/^[a-f0-9]{16}$/.test(token)) throw new Error("Missing generation.");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const ticket = velomereJobs.get(data.token);
    if (!ticket || ticket.userId !== context.userId) {
      return { status: "error" as const, message: "The drawing was interrupted. Nothing was saved." };
    }
    if (ticket.status === "done" && ticket.deck?.id) return { status: "done" as const, deck: ticket.deck };
    if (ticket.status === "error") {
      return { status: "error" as const, message: ticket.message || "The deck could not be finished. Nothing was saved." };
    }
    return { status: "running" as const };
  });

export const deleteDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown })?.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Missing deck.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const rows = await sql.query<{ id: number; locked: boolean; active: boolean }>(
      `select id, locked, active from decks where id = $1 and user_id = $2`,
      [data.id, context.userId],
    );
    const deck = rows[0];
    if (!deck) throw new Error("That deck is gone.");
    if (deck.locked === true) throw new Error("This deck is locked.");
    const images = await sql.query<{ image_url: string | null }>(
      `select image_url from cards where deck_id = $1`,
      [data.id],
    );
    await sql.query(`delete from cards where deck_id = $1`, [data.id]);
    await sql.query(`delete from decks where id = $1`, [data.id]);
    await removeOwnedArt(images.map((row) => row.image_url));
    if (deck.active === true) {
      await sql.query(`update decks set active = false where user_id = $1`, [context.userId]);
      await sql.query(
        `update decks set active = true where user_id = $1 and id = (
           select id from decks where user_id = $1 and locked is true and lower(name) = 'rider-waite-smith' order by id asc limit 1
         )`,
        [context.userId],
      );
    }
    return { ok: true as const };
  });

export const renameDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { id?: unknown; name?: unknown };
    const id = Number(raw.id);
    const name = String(raw.name ?? "").trim();
    if (!Number.isFinite(id) || id <= 0) throw new Error("Missing deck.");
    if (!name) throw new Error("A deck needs a name.");
    if (name.length > 60) throw new Error("That name is too long.");
    if (name.toLowerCase() === "velomere") throw new Error("Velomere is your personal deck. It is already on the Decks page.");
    return { id, name };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    await assertOwned(data.id, context.userId, false);
    const rows = await sql.query<{ locked: boolean }>(
      `select locked from decks where id = $1 and user_id = $2`,
      [data.id, context.userId],
    );
    if (rows[0]?.locked === true) throw new Error("A standard deck keeps its name.");
    await assertFreshName(sql, context.userId, data.name, data.id);
    await sql.query(`update decks set name = $2 where id = $1 and user_id = $3`, [
      data.id,
      data.name,
      context.userId,
    ]);
    return { ok: true as const, name: data.name };
  });

export const updateCardMeaning = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { id?: unknown; upright?: unknown; reversed?: unknown };
    const id = Number(raw.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Missing card.");
    return {
      id,
      upright: String(raw.upright ?? "").slice(0, 8000),
      reversed: String(raw.reversed ?? "").slice(0, 8000),
    };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const home = await sql.query<{ deck_id: number | null }>(
      `select deck_id from cards where id = $1`,
      [data.id],
    );
    const deckId = home[0]?.deck_id;
    if (!deckId) throw new Error("That card is no longer in the deck.");
    await assertOwned(deckId, context.userId, true);
    const rows = await sql.query<CardRow>(
      `update cards set upright = $2, reversed = $3 where id = $1 returning ${SELECT}`,
      [data.id, data.upright, data.reversed],
    );
    const row = rows[0];
    if (!row) throw new Error("That card is no longer in the deck.");
    return forClient(toCard(row));
  });

export const setActiveDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown })?.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Missing deck.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const found = await sql.query<{ id: number }>(
      `select id from decks where id = $1 and user_id = $2`,
      [data.id, context.userId],
    );
    if (!found[0]) throw new Error("That deck is gone.");
    await sql.query(`update decks set active = false where user_id = $1`, [context.userId]);
    await sql.query(`update decks set active = true where id = $1 and user_id = $2`, [
      data.id,
      context.userId,
    ]);
    return { ok: true as const };
  });

export const listCards = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { deckId?: unknown } | null)?.deckId);
    return { deckId: Number.isFinite(id) && id > 0 ? id : null };
  })
  .handler(async ({ data, context }) => {
    await ensureUserDecks(context.userId);
    const sql = await getSql();
    if (data.deckId) {
      await assertOwned(data.deckId, context.userId, false);
      const rows = await sql.query<CardRow>(
        `select ${SELECT} from cards where deck_id = $1 order by sort_order asc, id asc`,
        [data.deckId],
      );
      return rows.map(toCard);
    }
    const rows = await sql.query<CardRow>(
      `select ${SELECT} from cards
        where deck_id = (
          select id from decks where user_id = $1 and active is true order by id asc limit 1
        )
        order by sort_order asc, id asc`,
      [context.userId],
    );
    return rows.map(toCard);
  });

export const createCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const data = (input ?? {}) as Record<string, unknown>;
    const deckId = Number(data.deckId);
    if (!Number.isFinite(deckId) || deckId <= 0) throw new Error("Missing deck.");
    return { deckId, ...parseCardInput(data) };
  })
  .handler(async ({ data, context }) => {
    await assertOwned(data.deckId, context.userId, true);
    const sql = await getSql();
    const rows = await sql.query<CardRow>(
      `insert into cards (name, suit, rank, keywords, upright, reversed, image_url, is_seed, sort_order, image_scale, image_x, image_y, image_radius, deck_id)
       values ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11, $12, $13)
       returning ${SELECT}`,
      [
        data.name,
        data.suit,
        data.rank,
        data.keywords,
        data.upright,
        data.reversed,
        data.imageUrl,
        data.sortOrder ?? defaultSort(data.suit),
        data.imageScale ?? 100,
        data.imageX ?? 0,
        data.imageY ?? 0,
        data.imageRadius ?? 2,
        data.deckId,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("Could not save the card.");
    return forClient(toCard(row));
  });

export const updateCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const data = (input ?? {}) as Record<string, unknown>;
    const id = Number(data.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Missing card.");
    return { id, ...parseCardInput(data) };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const home = await sql.query<{ deck_id: number | null }>(
      `select deck_id from cards where id = $1`,
      [data.id],
    );
    const deckId = home[0]?.deck_id;
    if (!deckId) throw new Error("That card is no longer in the deck.");
    await assertOwned(deckId, context.userId, true);
    const rows = await sql.query<CardRow>(
      `update cards
         set name = $2,
             suit = $3,
             rank = $4,
             keywords = $5,
             upright = $6,
             reversed = $7,
             image_url = coalesce($8, image_url),
             sort_order = coalesce($9, sort_order),
             image_scale = $10,
             image_x = $11,
             image_y = $12,
             image_radius = $13
       where id = $1
       returning ${SELECT}`,
      [
        data.id,
        data.name,
        data.suit,
        data.rank,
        data.keywords,
        data.upright,
        data.reversed,
        data.imageUrl,
        data.sortOrder ?? null,
        data.imageScale ?? 100,
        data.imageX ?? 0,
        data.imageY ?? 0,
        data.imageRadius ?? 2,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("That card is no longer in the deck.");
    return forClient(toCard(row));
  });

export const deleteCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = Number((input as { id?: unknown })?.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Missing card.");
    return { id };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const home = await sql.query<{ deck_id: number | null }>(
      `select deck_id from cards where id = $1`,
      [data.id],
    );
    const deckId = home[0]?.deck_id;
    if (!deckId) throw new Error("That card is no longer in the deck.");
    await assertOwned(deckId, context.userId, true);
    await sql.query(`delete from cards where id = $1 and deck_id = $2`, [data.id, deckId]);
    return { ok: true as const };
  });

export const reorderCards = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { deckId?: unknown; ids?: unknown };
    const deckId = Number(raw.deckId);
    if (!Number.isFinite(deckId) || deckId <= 0) throw new Error("Missing deck.");
    if (!Array.isArray(raw.ids) || raw.ids.length === 0) throw new Error("Nothing to arrange.");
    const ids = raw.ids.map((id) => Number(id));
    if (ids.some((id) => !Number.isFinite(id) || id <= 0)) throw new Error("That card is missing.");
    return { deckId, ids };
  })
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    await assertOwned(data.deckId, context.userId, true);
    for (const [index, id] of data.ids.entries()) {
      await sql.query(`update cards set sort_order = $3 where id = $1 and deck_id = $2`, [
        id,
        data.deckId,
        index,
      ]);
    }
    const rows = await sql.query<CardRow>(
      `select ${SELECT} from cards where deck_id = $1 order by sort_order asc, id asc`,
      [data.deckId],
    );
    return rows.map((row) => forClient(toCard(row)));
  });

export const importCards = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { cards?: unknown; deckId?: unknown };
    const list = raw.cards;
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("Nothing to import.");
    }
    if (list.length > 8) throw new Error("Too many cards in one batch.");
    const deckId = Number(raw.deckId);
    if (!Number.isFinite(deckId) || deckId <= 0) throw new Error("Missing deck.");
    return { deckId, cards: list.map(parseCardInput) };
  })
  .handler(async ({ data, context }) => {
    await assertOwned(data.deckId, context.userId, true);
    const sql = await getSql();
    let created = 0;
    let updated = 0;
    for (const card of data.cards) {
      const existing = await sql.query<{ id: number }>(
        `select id from cards where lower(name) = lower($1) and suit = $2 and deck_id = $3 limit 1`,
        [card.name, card.suit, data.deckId],
      );
      const id = existing[0]?.id;
      if (id) {
        await sql.query(
          `update cards
             set rank = $2,
                 keywords = $3,
                 upright = $4,
                 reversed = $5,
                 image_url = coalesce($6, image_url),
                 sort_order = coalesce($7, sort_order),
                 image_scale = $8,
                 image_x = $9,
                 image_y = $10,
                 image_radius = $11
           where id = $1`,
          [
            id,
            card.rank,
            card.keywords,
            card.upright,
            card.reversed,
            card.imageUrl,
            card.sortOrder ?? null,
            card.imageScale ?? 100,
            card.imageX ?? 0,
            card.imageY ?? 0,
            card.imageRadius ?? 2,
          ],
        );
        updated += 1;
      } else {
        await sql.query(
          `insert into cards (name, suit, rank, keywords, upright, reversed, image_url, is_seed, sort_order, image_scale, image_x, image_y, image_radius, deck_id)
           values ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11, $12, $13)`,
          [
            card.name,
            card.suit,
            card.rank,
            card.keywords,
            card.upright,
            card.reversed,
            card.imageUrl,
            card.sortOrder ?? defaultSort(card.suit),
            card.imageScale ?? 100,
            card.imageX ?? 0,
            card.imageY ?? 0,
            card.imageRadius ?? 2,
            data.deckId,
          ],
        );
        created += 1;
      }
    }
    return { created, updated };
  });

export const readVelomereEncounter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { first?: unknown; second?: unknown };
    const first = Number(raw.first);
    const second = Number(raw.second);
    if (!Number.isInteger(first) || first < 1 || first > 78) throw new Error("Choose a card from 1 to 78.");
    if (!Number.isInteger(second) || second < 1 || second > 78) throw new Error("Choose a card from 1 to 78.");
    return { first, second };
  })
  .handler(async ({ data }) => {
    const path = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const root = path.join(process.cwd(), "velomere-crystal");
    const { readEncounter } = await import(pathToFileURL(path.join(root, "engine/encounter.mjs")).href);
    const trace = readEncounter(path.join(root, "DATA"), data.first, data.second);
    return {
      first: data.first,
      second: data.second,
      firstName: trace.firstName,
      secondName: trace.secondName,
      origin: trace.origin,
      operators: trace.operators,
      intensity: trace.intensity,
      categories: trace.categories,
      cause: trace.cause,
      question: trace.question,
      consequence: trace.consequence ?? null,
      counter: trace.counter,
      noNewStrokeReason: trace.noNewStrokeReason,
      reference: trace.reference,
      notice: trace.origin === "golden-authored"
        ? "This pair is one of the 78 authored Dance references. It is still a proposal, not a new canon."
        : trace.origin === "neutral"
          ? "Affinity 0 adds no second story."
          : "This pair is generated from both blueprints. It is not a human-authored reading.",
    };
  });

export const previewEncounterGeometry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { cardId?: unknown; date?: unknown; affinity?: unknown };
    const cardId = String(raw.cardId ?? "");
    const date = String(raw.date ?? "");
    const affinity = Number(raw.affinity);
    if (!/^\d{2}-[a-z0-9-]+$/.test(cardId)) throw new Error("Choose a card.");
    if (!civilDate(date)) throw new Error("Choose a real date from 1900 through 2100.");
    if (!Number.isInteger(affinity) || affinity < 0 || affinity > 78) throw new Error("Affinity must be a whole number from 0 to 78.");
    return { cardId, date, affinity };
  })
  .handler(async ({ data }) => {
    const { spawn } = await import("node:child_process");
    const path = await import("node:path");
    const script = velomereScriptPath("encounter-preview.mjs");
    const root = path.resolve(path.dirname(script), "../../..");
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [script], { cwd: root, stdio: ["pipe", "pipe", "pipe"], env: process.env });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), 20000);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        out += chunk;
      });
      child.stderr.on("data", (chunk) => {
        err += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(err.trim().slice(0, 180) || "Preview failed"));
        else resolve(out);
      });
      child.stdin.end(JSON.stringify(data));
    });
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The preview came back empty.");
    return JSON.parse(stdout.slice(start, end + 1)) as {
      svg: string;
      trace: {
        identity: { invariants: string[]; failure_condition: string };
        protected_voids: Array<{ id: string; rule: string }>;
        operations: Array<{ id: string; operator: string; rationale: string; output_svg_ids: string[]; source_field: string }>;
        counterreading: { operator: string; svg_id: string } | null;
        geometry_digest: string;
        affinity_index: number;
        encounter_guest: string | null;
      };
    };
  });

export const previewRootline = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const cardId = String(raw.cardId ?? "");
    const date = String(raw.date ?? "");
    const affinity = Number(raw.affinity);
    const hostOrientation = raw.hostOrientation === "shadow" ? "shadow" as const : "upright" as const;
    const guestOrientation = raw.guestOrientation === "shadow" ? "shadow" as const : "upright" as const;
    if (!/^\d{2}-[a-z0-9-]+$/.test(cardId)) throw new Error("Choose a card.");
    if (!civilDate(date)) throw new Error("Choose a real date from 1900 through 2100.");
    if (!Number.isInteger(affinity) || affinity < 0 || affinity > 78) throw new Error("Affinity must be a whole number from 0 to 78.");
    const view = (raw.view ?? {}) as Record<string, unknown>;
    return {
      cardId,
      date,
      affinity,
      hostOrientation,
      guestOrientation,
      includePng: raw.includePng === true,
      counterfactuals: raw.counterfactuals === true,
      view: {
        roots: view.roots !== false,
        derived: view.derived !== false,
        events: view.events !== false,
        strands: view.strands !== false,
        glyph: view.glyph !== false,
      },
    };
  })
  .handler(async ({ data }) => {
    const stdout = await runVelomereScript(data, "rootline-preview", "encounter-preview.mjs", 30000);
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The preview came back empty.");
    return JSON.parse(stdout.slice(start, end + 1)) as {
      svg: string;
      png: { width: number; height: number; bytes: number } | null;
      trace: {
        host_card: string;
        guest_card: string | null;
        affinity: number;
        affinity_name: string;
        source_core_concepts: Array<{ card: string; core: string }>;
        root_paths: string[];
        derived_paths: Array<{ id: string; role_after: string; event_id: string }>;
        lexical_evidence: {
          shared_terms: string[];
          question_terms: string[];
          axiom_terms: string[];
          policy: string;
          action?: string;
          potential?: number;
          machine_inferred: boolean;
          weight?: number;
          note?: string;
        };
        layer_positions: { host: string; guest: string | null; confluence?: string | null; assignment?: string };
        glyph?: { id: string; kind: string; agreement: boolean } | null;
        recursion_state?: {
          new_core_concept: string;
          recognized_relational_structure: string;
          unresolved_difference: boolean;
          agreement_assumed: boolean;
          sufficiency: string;
        } | null;
        internal_strands?: Array<{ id: string; term: string; weight: number; rejoins: boolean; z: number; speech_act: null }>;
        color_provenance: Array<{ element: string; lineage: string; mix?: string }>;
        negative_space: { id: string; reason: string };
        contact_same_z: boolean;
        projected_overlap: boolean;
        landmarks?: Array<{ key: string; participant: string; term?: string | null; cause: string; quote?: string | null }>;
        human_legibility: string;
        geometry_digest: string;
        rendered_evidence: { source_root_marks: number; derived_marks: number; internal_strands?: number; glyph?: boolean };
        counterfactual_probes?: Array<{
          intervention: string;
          actually_executed: boolean;
          svg_changed?: boolean;
          measured_delta?: number;
          note?: string;
          contact_changed?: boolean;
          contact_when_collapsed?: boolean;
          contact_when_separated?: boolean;
        }>;
      };
    };
  });

export const auditRootline = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const date = String((input as { date?: unknown })?.date ?? "2026-11-13");
    if (!civilDate(date)) throw new Error("Choose a real date from 1900 through 2100.");
    return { mode: "prove" as const, date };
  })
  .handler(async ({ data }) => {
    const stdout = await runVelomereScript(data, "rootline-prove", "encounter-preview.mjs", 180000);
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The audit came back empty.");
    return JSON.parse(stdout.slice(start, end + 1)) as {
      ok: boolean;
      failure_count: number;
      failures: string[];
      scenes: number;
      neutrals: number;
      encounters: number;
      unique_neutral_digests: number;
      asymmetric_pairs: number;
      equal_pairs: number;
      back_mean: number;
      canonical_sha256: string;
      human_legibility: string;
      renderer: string;
    };
  });
