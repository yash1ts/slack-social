import type { Database } from "bun:sqlite";
import type { WebClient } from "@slack/web-api";
import { upsertUser } from "../db/queries";

export type SlackProfileSnapshot = {
  id: string;
  displayName: string;
  realName: string | null;
  avatarUrl: string | null;
  title: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  isBot: boolean;
};

/**
 * Fetch a Slack user profile via users.info (+ optional users.profile.get)
 * and cache into SQLite. Returns null if Slack rejects / user missing.
 */
export async function fetchAndCacheSlackProfile(
  client: WebClient,
  db: Database,
  userId: string,
): Promise<SlackProfileSnapshot | null> {
  try {
    const res = await client.users.info({ user: userId });
    const u = res.user;
    if (!u?.id) return null;

    let title = u.profile?.title ?? null;
    let statusText = u.profile?.status_text ?? null;
    let statusEmoji = u.profile?.status_emoji ?? null;

    try {
      const profileRes = await client.users.profile.get({ user: userId });
      const p = profileRes.profile;
      if (p) {
        title = p.title ?? title;
        statusText = p.status_text ?? statusText;
        statusEmoji = p.status_emoji ?? statusEmoji;
      }
    } catch {
      // users.profile.get may fail for some token kinds — users.info is enough
    }

    const displayName =
      u.profile?.display_name || u.real_name || u.name || u.id;

    upsertUser(db, {
      id: u.id,
      displayName,
      realName: u.real_name ?? null,
      avatarUrl: u.profile?.image_192 || u.profile?.image_72 || null,
      title,
      isBot: Boolean(u.is_bot),
    });

    return {
      id: u.id,
      displayName,
      realName: u.real_name ?? null,
      avatarUrl: u.profile?.image_192 || u.profile?.image_72 || null,
      title,
      statusText,
      statusEmoji,
      isBot: Boolean(u.is_bot),
    };
  } catch (err) {
    console.warn("fetchAndCacheSlackProfile failed:", err);
    return null;
  }
}
