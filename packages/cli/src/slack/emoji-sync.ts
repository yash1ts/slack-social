import { join, extname } from "node:path";
import type { Database } from "bun:sqlite";
import type { WebClient } from "@slack/web-api";
import { EMOJI_DIR, ensureDataDirs } from "../paths";
import { readConfig, writeConfig } from "../config";
import { clearEmojis, countEmojis, upsertEmoji } from "../db/queries";

const EMOJI_SYNC_TTL_MS = 6 * 60 * 60_000; // 6 hours

function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const ext = extname(path).toLowerCase();
    if (ext === ".png" || ext === ".gif" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
      return ext;
    }
  } catch {
    /* ignore */
  }
  return ".png";
}

function authHeaders(token?: string, cookie?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) {
    const raw = cookie.trim();
    headers.Cookie = raw.startsWith("d=") ? raw : `d=${raw}`;
  }
  return headers;
}

/**
 * Download a single custom emoji image on demand and cache it under EMOJI_DIR.
 * Used by the image API when a feed/reaction actually needs to show the emoji.
 */
export async function downloadEmoji(
  name: string,
  url: string,
  token?: string,
  cookie?: string,
): Promise<string | null> {
  ensureDataDirs();
  const ext = extFromUrl(url);
  // Sanitize filename — Slack names are usually safe, but keep it filesystem-friendly
  const safe = name.replace(/[^a-zA-Z0-9_+-]/g, "_");
  const localPath = join(EMOJI_DIR, `${safe}${ext}`);
  const existing = Bun.file(localPath);
  if (await existing.exists()) {
    const size = existing.size;
    if (size > 0) return localPath;
  }

  try {
    const res = await fetch(url, { headers: authHeaders(token, cookie) });
    if (!res.ok) {
      // Retry without auth — many slack-edge URLs are public
      if (token || cookie) {
        const retry = await fetch(url);
        if (!retry.ok) return null;
        await Bun.write(localPath, retry);
        return localPath;
      }
      return null;
    }
    await Bun.write(localPath, res);
    return localPath;
  } catch {
    return null;
  }
}

/**
 * Fetch workspace custom emoji via emoji.list and store metadata only.
 * Image bytes are downloaded lazily when `/api/emoji/[name]` is requested.
 */
export async function syncWorkspaceEmojis(
  client: WebClient,
  db: Database,
  _opts: { token?: string; sessionCookie?: string; force?: boolean } = {},
): Promise<{ count: number }> {
  let emoji: Record<string, string> = {};
  try {
    const res = await client.emoji.list({});
    if (!res.ok) {
      console.warn("  ! emoji.list not ok:", res.error);
      return { count: 0 };
    }
    emoji = (res.emoji as Record<string, string> | undefined) ?? {};
  } catch (err) {
    console.warn("  ! emoji.list failed (need emoji:read scope?):", err);
    return { count: 0 };
  }

  const now = Date.now();
  // Full replace keeps catalog accurate (drops stale/test rows)
  clearEmojis(db);

  for (const [name, value] of Object.entries(emoji)) {
    if (value.startsWith("alias:")) {
      upsertEmoji(db, {
        name,
        aliasOf: value.slice("alias:".length),
        url: null,
        localPath: null,
        updatedAt: now,
      });
    } else {
      upsertEmoji(db, {
        name,
        url: value,
        aliasOf: null,
        localPath: null,
        updatedAt: now,
      });
    }
  }

  writeConfig({ ...readConfig(), lastEmojiSyncAt: now });
  console.log(`  emoji catalog: ${Object.keys(emoji).length} custom emoji (metadata only)`);
  return { count: Object.keys(emoji).length };
}

/**
 * Ensure the local emoji catalog is fresh. Safe to call on every app load.
 */
export async function ensureEmojiCatalog(
  client: WebClient,
  db: Database,
  opts: { token?: string; sessionCookie?: string; force?: boolean } = {},
): Promise<{ count: number; synced: boolean }> {
  const config = readConfig();
  const existing = countEmojis(db);
  const age = config.lastEmojiSyncAt ? Date.now() - config.lastEmojiSyncAt : Infinity;
  const stale = opts.force || existing === 0 || age > EMOJI_SYNC_TTL_MS;

  if (!stale) {
    return { count: existing, synced: false };
  }

  const result = await syncWorkspaceEmojis(client, db, opts);
  return { count: result.count, synced: true };
}
