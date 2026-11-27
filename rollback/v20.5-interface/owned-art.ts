import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "@/lib/db";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".csv": "text/csv; charset=utf-8",
  ".zip": "application/zip",
  ".mjs": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

export function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
    if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
    return null;
  }
  return null;
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = String(entry).split(path.sep).join("/");
    if (!rel || rel.includes("..")) continue;
    const full = path.join(directory, rel);
    const info = await stat(full);
    if (info.isFile()) files.push(rel);
  }
  files.sort();
  return files;
}

export async function saveOwnedTree(sql: Sql, userId: string, opaque: string, directory: string) {
  const files = (await filesUnder(directory)).filter((rel) => !rel.startsWith("photo_proof/"));
  if (files.length < 78) throw new Error("Incomplete deck");
  for (const rel of files) {
    const ext = path.extname(rel).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const bytes = await readFile(path.join(directory, rel));
    if (bytes.byteLength > 80 * 1024 * 1024) {
      throw new Error("One deck file is too large to store.");
    }
    await sql.query(
      `insert into owned_art (user_id, opaque, relpath, mime, bytes)
       values ($1, $2, $3, $4, $5)
       on conflict (opaque, relpath) do update
         set user_id = excluded.user_id, mime = excluded.mime, bytes = excluded.bytes`,
      [userId, opaque, rel, mime, bytes],
    );
  }
}

export async function readOwnedFile(sql: Sql, userId: string, opaque: string, relpath: string) {
  const rows = await sql.query<{ mime: string; bytes: unknown }>(
    `select mime, bytes from owned_art where user_id = $1 and opaque = $2 and relpath = $3`,
    [userId, opaque, relpath],
  );
  const row = rows[0];
  if (!row) return null;
  const bytes = bytesOf(row.bytes);
  if (!bytes || bytes.byteLength < 1) return null;
  return { mime: row.mime, bytes };
}

export async function deleteOwnedOpaque(sql: Sql, opaque: string) {
  await sql.query(`delete from owned_art where opaque = $1`, [opaque]);
}
