import type { Database } from "bun:sqlite";
import {
  categorizePost,
  computeScore,
  extractSlackChannelIds,
  extractSlackUserIds,
  UNREAD_SCORE_FLOOR,
} from "@slack-social/shared";
import type {
  FeedAttachment,
  FeedPost,
  FeedReply,
  ReactionSummary,
  StoryItem,
  UserProfile,
} from "@slack-social/shared";

const LOCAL_VIEWER = "local";
const LAST_VIEWED_KEY = "last_viewed_at";

export type ChannelSyncRow = {
  channel_id: string;
  newest_synced_ts: string | null;
  oldest_synced_ts: string | null;
  has_more_history: number;
  last_synced_at: number | null;
};

export type FeedPageMeta = {
  posts: FeedPost[];
  lastViewedAt: number | null;
  unreadCount: number;
  caughtUp: boolean;
  dividerAfterIndex: number | null;
  hasMoreHistory: boolean;
};

export type EmojiRow = {
  name: string;
  url: string | null;
  alias_of: string | null;
  local_path: string | null;
};

export function upsertEmoji(
  db: Database,
  row: {
    name: string;
    url?: string | null;
    aliasOf?: string | null;
    localPath?: string | null;
    updatedAt?: number;
  },
): void {
  db.run(
    `INSERT INTO emojis (name, url, alias_of, local_path, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       url = excluded.url,
       alias_of = excluded.alias_of,
       local_path = COALESCE(excluded.local_path, emojis.local_path),
       updated_at = excluded.updated_at`,
    [
      row.name,
      row.url ?? null,
      row.aliasOf ?? null,
      row.localPath ?? null,
      row.updatedAt ?? Date.now(),
    ],
  );
}

export function clearEmojis(db: Database): void {
  db.run("DELETE FROM emojis");
}

export function countEmojis(db: Database): number {
  return (db.query("SELECT COUNT(*) as c FROM emojis").get() as { c: number }).c;
}

export function getEmojiRow(db: Database, name: string): EmojiRow | null {
  return (
    (db
      .query("SELECT name, url, alias_of, local_path FROM emojis WHERE name = ?")
      .get(name) as EmojiRow | null) ?? null
  );
}

/** Resolve aliases up to a few hops; returns the concrete emoji row or null. */
export function resolveEmojiRow(db: Database, name: string, depth = 0): EmojiRow | null {
  if (depth > 5) return null;
  const base = name.split("::")[0] ?? name;
  const row = getEmojiRow(db, base);
  if (!row) return null;
  if (row.alias_of) {
    const next = resolveEmojiRow(db, row.alias_of, depth + 1);
    // Alias may point at a standard Unicode emoji (not in the custom table)
    return next;
  }
  return row;
}

/**
 * Catalog for the UI: custom emoji name → public URL path (/api/emoji/name).
 * Also returns alias → target name for clients to resolve Unicode fallbacks.
 */
export function getEmojiCatalog(db: Database): Record<string, string> {
  const rows = db
    .query("SELECT name, url, alias_of, local_path FROM emojis")
    .all() as EmojiRow[];
  const catalog: Record<string, string> = {};
  for (const row of rows) {
    if (row.alias_of) {
      const resolved = resolveEmojiRow(db, row.alias_of);
      if (resolved && (resolved.local_path || resolved.url)) {
        catalog[row.name] = `/api/emoji/${encodeURIComponent(row.name)}`;
      }
      continue;
    }
    if (row.local_path || row.url) {
      catalog[row.name] = `/api/emoji/${encodeURIComponent(row.name)}`;
    }
  }
  return catalog;
}

/** Alias short-name → target short-name (for Unicode resolution when target isn't custom). */
export function getEmojiAliases(db: Database): Record<string, string> {
  const rows = db
    .query("SELECT name, alias_of FROM emojis WHERE alias_of IS NOT NULL")
    .all() as Array<{ name: string; alias_of: string }>;
  const aliases: Record<string, string> = {};
  for (const row of rows) aliases[row.name] = row.alias_of;
  return aliases;
}

export function upsertUser(
  db: Database,
  user: {
    id: string;
    displayName: string;
    realName?: string | null;
    avatarUrl?: string | null;
    title?: string | null;
    isBot?: boolean;
  },
): void {
  db.run(
    `INSERT INTO users (id, display_name, real_name, avatar_url, title, is_bot, reactions_earned, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       real_name = excluded.real_name,
       avatar_url = excluded.avatar_url,
       title = excluded.title,
       is_bot = excluded.is_bot,
       updated_at = excluded.updated_at`,
    [
      user.id,
      user.displayName,
      user.realName ?? null,
      user.avatarUrl ?? null,
      user.title ?? null,
      user.isBot ? 1 : 0,
      Date.now(),
    ],
  );
}

export function upsertChannel(
  db: Database,
  ch: {
    id: string;
    name: string;
    topic?: string | null;
    isArchived?: boolean;
    memberCount?: number | null;
    defaultTag?: string | null;
  },
): void {
  db.run(
    `INSERT INTO channels (id, name, topic, is_archived, member_count, default_tag, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       topic = excluded.topic,
       is_archived = excluded.is_archived,
       member_count = excluded.member_count,
       default_tag = COALESCE(excluded.default_tag, channels.default_tag),
       updated_at = excluded.updated_at`,
    [
      ch.id,
      ch.name,
      ch.topic ?? null,
      ch.isArchived ? 1 : 0,
      ch.memberCount ?? null,
      ch.defaultTag ?? null,
      Date.now(),
    ],
  );
}

/** Public channels known from indexing, for compose channel picker. */
export function listIndexedChannels(
  db: Database,
  opts: { query?: string; limit?: number } = {},
): Array<{ id: string; name: string; memberCount: number | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const q = opts.query?.trim().replace(/^#/, "") ?? "";

  if (!q) {
    return db
      .query(
        `SELECT id, name, member_count as memberCount
         FROM channels
         WHERE is_archived = 0
         ORDER BY name COLLATE NOCASE ASC
         LIMIT ?`,
      )
      .all(limit) as Array<{ id: string; name: string; memberCount: number | null }>;
  }

  return db
    .query(
      `SELECT id, name, member_count as memberCount
       FROM channels
       WHERE is_archived = 0 AND name LIKE ? ESCAPE '\\'
       ORDER BY
         CASE WHEN lower(name) = lower(?) THEN 0
              WHEN lower(name) LIKE lower(?) || '%' ESCAPE '\\' THEN 1
              ELSE 2 END,
         name COLLATE NOCASE ASC
       LIMIT ?`,
    )
    .all(`%${escapeLike(q)}%`, q, escapeLike(q), limit) as Array<{
    id: string;
    name: string;
    memberCount: number | null;
  }>;
}

function escapeLike(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

export function getChannelSync(db: Database, channelId: string): ChannelSyncRow | null {
  return (
    (db
      .query(
        `SELECT channel_id, newest_synced_ts, oldest_synced_ts, has_more_history, last_synced_at
         FROM channel_sync WHERE channel_id = ?`,
      )
      .get(channelId) as ChannelSyncRow | null) ?? null
  );
}

export function upsertChannelSync(
  db: Database,
  row: {
    channelId: string;
    newestSyncedTs?: string | null;
    oldestSyncedTs?: string | null;
    hasMoreHistory?: boolean;
    lastSyncedAt?: number | null;
  },
): void {
  const existing = getChannelSync(db, row.channelId);
  const newest =
    row.newestSyncedTs !== undefined
      ? row.newestSyncedTs
      : (existing?.newest_synced_ts ?? null);
  const oldest =
    row.oldestSyncedTs !== undefined
      ? row.oldestSyncedTs
      : (existing?.oldest_synced_ts ?? null);
  const hasMore =
    row.hasMoreHistory !== undefined
      ? row.hasMoreHistory
        ? 1
        : 0
      : (existing?.has_more_history ?? 1);
  const lastAt =
    row.lastSyncedAt !== undefined
      ? row.lastSyncedAt
      : (existing?.last_synced_at ?? Date.now());

  db.run(
    `INSERT INTO channel_sync (channel_id, newest_synced_ts, oldest_synced_ts, has_more_history, last_synced_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(channel_id) DO UPDATE SET
       newest_synced_ts = excluded.newest_synced_ts,
       oldest_synced_ts = excluded.oldest_synced_ts,
       has_more_history = excluded.has_more_history,
       last_synced_at = excluded.last_synced_at`,
    [row.channelId, newest, oldest, hasMore, lastAt],
  );
}

export function listChannelsNeedingBackfill(db: Database, limit = 20): ChannelSyncRow[] {
  return db
    .query(
      `SELECT channel_id, newest_synced_ts, oldest_synced_ts, has_more_history, last_synced_at
       FROM channel_sync
       WHERE has_more_history = 1 AND oldest_synced_ts IS NOT NULL
       ORDER BY (last_synced_at IS NULL) DESC, last_synced_at ASC
       LIMIT ?`,
    )
    .all(limit) as ChannelSyncRow[];
}

export function anyChannelHasMoreHistory(db: Database): boolean {
  const row = db
    .query("SELECT 1 AS ok FROM channel_sync WHERE has_more_history = 1 LIMIT 1")
    .get() as { ok: number } | null;
  return Boolean(row);
}

export function upsertPost(
  db: Database,
  post: {
    id: string;
    channelId: string;
    userId?: string | null;
    ts: string;
    threadTs?: string | null;
    text?: string | null;
    permalink?: string | null;
    replyCount?: number;
    reactionCount?: number;
    hasMedia?: boolean;
    postedAt: number;
  },
): void {
  db.run(
    `INSERT INTO posts (
       id, channel_id, user_id, ts, thread_ts, text, permalink,
       reply_count, reaction_count, has_media, score, posted_at, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       thread_ts = excluded.thread_ts,
       text = excluded.text,
       permalink = excluded.permalink,
       reply_count = excluded.reply_count,
       reaction_count = excluded.reaction_count,
       has_media = excluded.has_media,
       posted_at = excluded.posted_at,
       synced_at = excluded.synced_at`,
    [
      post.id,
      post.channelId,
      post.userId ?? null,
      post.ts,
      post.threadTs ?? null,
      post.text ?? null,
      post.permalink ?? null,
      post.replyCount ?? 0,
      post.reactionCount ?? 0,
      post.hasMedia ? 1 : 0,
      post.postedAt,
      Date.now(),
    ],
  );
}

export function replaceReactions(
  db: Database,
  postId: string,
  reactions: Array<{ name: string; count: number }>,
): void {
  db.run("DELETE FROM reactions WHERE post_id = ?", [postId]);
  for (const r of reactions) {
    db.run("INSERT INTO reactions (post_id, name, count) VALUES (?, ?, ?)", [
      postId,
      r.name,
      r.count,
    ]);
  }
}

/** Remove posts authored by users marked as bots (e.g. from earlier syncs). */
export function pruneBotPosts(db: Database): number {
  const oldIds = db
    .query(
      `SELECT p.id FROM posts p
       JOIN users u ON u.id = p.user_id
       WHERE u.is_bot = 1`,
    )
    .all() as Array<{ id: string }>;
  if (!oldIds.length) return 0;

  const delRelated = db.transaction(() => {
    for (const { id } of oldIds) {
      db.run("DELETE FROM reactions WHERE post_id = ?", [id]);
      db.run("DELETE FROM attachments WHERE post_id = ?", [id]);
      db.run("DELETE FROM post_tags WHERE post_id = ?", [id]);
      db.run("DELETE FROM posts WHERE id = ?", [id]);
    }
    db.run(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM post_tags)`);
  });
  delRelated();
  return oldIds.length;
}

export function upsertAttachment(
  db: Database,
  att: {
    id: string;
    postId: string;
    mimetype?: string | null;
    title?: string | null;
    urlPrivate?: string | null;
    localPath?: string | null;
    width?: number | null;
    height?: number | null;
    thumbUrl?: string | null;
  },
): void {
  db.run(
    `INSERT INTO attachments (
       id, post_id, mimetype, title, url_private, local_path, width, height, thumb_url
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       post_id = excluded.post_id,
       mimetype = excluded.mimetype,
       title = excluded.title,
       url_private = excluded.url_private,
       local_path = COALESCE(excluded.local_path, attachments.local_path),
       width = excluded.width,
       height = excluded.height,
       thumb_url = excluded.thumb_url`,
    [
      att.id,
      att.postId,
      att.mimetype ?? null,
      att.title ?? null,
      att.urlPrivate ?? null,
      att.localPath ?? null,
      att.width ?? null,
      att.height ?? null,
      att.thumbUrl ?? null,
    ],
  );
}

/** @deprecated Prefer applyPostTags for 3-tier categorization. */
export function upsertTagsForPost(
  db: Database,
  postId: string,
  text: string | null | undefined,
): void {
  applyPostTags(db, postId, { text });
}

export function applyPostTags(
  db: Database,
  postId: string,
  input: {
    channelName?: string | null;
    channelDefaultTag?: string | null;
    text?: string | null;
    reactionNames?: string[];
  },
): void {
  const tags = categorizePost(input);
  db.run("DELETE FROM post_tags WHERE post_id = ?", [postId]);
  for (const name of tags) {
    db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [name]);
    const tag = db.query("SELECT id FROM tags WHERE name = ?").get(name) as { id: number };
    db.run("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)", [postId, tag.id]);
  }
}

export function getSyncCursor(db: Database, key: string): string | null {
  const row = db.query("SELECT value FROM sync_state WHERE key = ?").get(key) as
    | { value: string }
    | null;
  return row?.value ?? null;
}

export function setSyncCursor(db: Database, key: string, value: string): void {
  db.run(
    `INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, Date.now()],
  );
}

export function getLastViewedAt(db: Database): number | null {
  const raw = getSyncCursor(db, LAST_VIEWED_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function markFeedViewed(db: Database, atMs = Date.now()): void {
  setSyncCursor(db, LAST_VIEWED_KEY, String(atMs));
}

export function countUnreadHighEngagement(
  db: Database,
  lastViewedAt: number | null,
  scoreFloor = UNREAD_SCORE_FLOOR,
): number {
  if (lastViewedAt == null) {
    // First session: treat everything as already "seen" for divider purposes
    return 0;
  }
  const row = db
    .query(
      `SELECT COUNT(*) as c FROM posts p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE (p.thread_ts IS NULL OR p.thread_ts = p.ts)
         AND p.user_id IS NOT NULL
         AND COALESCE(u.is_bot, 0) = 0
         AND p.posted_at > ?
         AND p.score >= ?`,
    )
    .get(lastViewedAt, scoreFloor) as { c: number };
  return row.c;
}

/** Score a single top-level post (no-op for thread replies). */
export function updatePostScore(db: Database, postId: string, nowMs = Date.now()): void {
  const p = db
    .query(
      `SELECT id, reaction_count, reply_count, has_media, posted_at, ts, thread_ts
       FROM posts WHERE id = ?`,
    )
    .get(postId) as
    | {
        id: string;
        reaction_count: number;
        reply_count: number;
        has_media: number;
        posted_at: number;
        ts: string;
        thread_ts: string | null;
      }
    | null;
  if (!p) return;
  if (p.thread_ts != null && p.thread_ts !== p.ts) return;

  const reactions = db
    .query("SELECT name, count FROM reactions WHERE post_id = ?")
    .all(postId) as Array<{ name: string; count: number }>;
  const score = computeScore({
    reactions,
    reactionCount: p.reaction_count,
    replyCount: p.reply_count,
    hasMedia: Boolean(p.has_media),
    postedAtMs: p.posted_at,
    nowMs,
  });
  db.run("UPDATE posts SET score = ? WHERE id = ?", [score, postId]);
}

export function recomputeScores(db: Database): void {
  pruneBotPosts(db);
  const now = Date.now();
  const posts = db
    .query(
      `SELECT id, reaction_count, reply_count, has_media, posted_at
       FROM posts WHERE thread_ts IS NULL OR thread_ts = ts`,
    )
    .all() as Array<{
    id: string;
    reaction_count: number;
    reply_count: number;
    has_media: number;
    posted_at: number;
  }>;

  const reactionsStmt = db.prepare(
    "SELECT name, count FROM reactions WHERE post_id = ?",
  );
  const update = db.prepare("UPDATE posts SET score = ? WHERE id = ?");
  const tx = db.transaction(() => {
    for (const p of posts) {
      const reactions = reactionsStmt.all(p.id) as Array<{ name: string; count: number }>;
      const score = computeScore({
        reactions,
        reactionCount: p.reaction_count,
        replyCount: p.reply_count,
        hasMedia: Boolean(p.has_media),
        postedAtMs: p.posted_at,
        nowMs: now,
      });
      update.run(score, p.id);
    }
  });
  tx();

  db.run(
    `UPDATE users SET reactions_earned = COALESCE((
       SELECT SUM(p.reaction_count) FROM posts p
       WHERE p.user_id = users.id AND (p.thread_ts IS NULL OR p.thread_ts = p.ts)
     ), 0)`,
  );
}

type FeedRow = {
  id: string;
  channelId: string;
  channelName: string;
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  text: string | null;
  permalink: string | null;
  replyCount: number;
  reactionCount: number;
  hasMedia: number;
  score: number;
  postedAt: number;
  ts: string;
};

function resolveMentionMaps(
  db: Database,
  texts: Array<string | null | undefined>,
): { mentionUsers: Record<string, string>; mentionChannels: Record<string, string> } {
  const userIds = new Set<string>();
  const channelIds = new Set<string>();
  for (const text of texts) {
    for (const id of extractSlackUserIds(text)) userIds.add(id);
    for (const id of extractSlackChannelIds(text)) channelIds.add(id);
  }

  const mentionUsers: Record<string, string> = {};
  if (userIds.size > 0) {
    const ids = [...userIds];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .query(`SELECT id, display_name FROM users WHERE id IN (${placeholders})`)
      .all(...ids) as Array<{ id: string; display_name: string }>;
    for (const row of rows) {
      if (row.display_name) mentionUsers[row.id] = row.display_name;
    }
  }

  const mentionChannels: Record<string, string> = {};
  if (channelIds.size > 0) {
    const ids = [...channelIds];
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .query(`SELECT id, name FROM channels WHERE id IN (${placeholders})`)
      .all(...ids) as Array<{ id: string; name: string }>;
    for (const row of rows) {
      if (row.name) mentionChannels[row.id] = row.name;
    }
  }

  return { mentionUsers, mentionChannels };
}

export function getMentionMaps(
  db: Database,
  texts: Array<string | null | undefined>,
): { mentionUsers: Record<string, string>; mentionChannels: Record<string, string> } {
  return resolveMentionMaps(db, texts);
}

/** Batch-hydrate feed rows (reactions, attachments, top replies, mentions) in a few queries. */
function hydrateFeedPosts(db: Database, rows: FeedRow[]): FeedPost[] {
  if (rows.length === 0) return [];

  const postIds = rows.map((r) => r.id);
  const idPlaceholders = postIds.map(() => "?").join(",");

  const reactionRows = db
    .query(
      `SELECT post_id as postId, name, count FROM reactions
       WHERE post_id IN (${idPlaceholders})
       ORDER BY count DESC`,
    )
    .all(...postIds) as Array<{ postId: string; name: string; count: number }>;
  const reactionsByPost = new Map<string, ReactionSummary[]>();
  for (const r of reactionRows) {
    const list = reactionsByPost.get(r.postId) ?? [];
    list.push({ name: r.name, count: r.count });
    reactionsByPost.set(r.postId, list);
  }

  const attachmentRows = db
    .query(
      `SELECT id, post_id as postId, mimetype, title, local_path as localPath, width, height
       FROM attachments WHERE post_id IN (${idPlaceholders})`,
    )
    .all(...postIds) as Array<{
    id: string;
    postId: string;
    mimetype: string | null;
    title: string | null;
    localPath: string | null;
    width: number | null;
    height: number | null;
  }>;
  const attachmentsByPost = new Map<string, FeedAttachment[]>();
  for (const a of attachmentRows) {
    const list = attachmentsByPost.get(a.postId) ?? [];
    list.push({
      id: a.id,
      mimetype: a.mimetype,
      title: a.title,
      localPath: a.localPath,
      width: a.width,
      height: a.height,
    });
    attachmentsByPost.set(a.postId, list);
  }

  const orClauses = rows.map(() => "(p.channel_id = ? AND p.thread_ts = ? AND p.ts != ?)").join(" OR ");
  const replyParams: string[] = [];
  for (const r of rows) {
    replyParams.push(r.channelId, r.ts, r.ts);
  }

  const topRepliesByKey = new Map<string, FeedReply[]>();
  if (orClauses) {
    const replyRows = db
      .query(
        `SELECT p.id, p.channel_id as channelId, p.thread_ts as threadTs, p.text,
                p.user_id as userId, p.reaction_count as reactionCount, p.posted_at as postedAt,
                u.display_name as displayName, u.avatar_url as avatarUrl
         FROM posts p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE ${orClauses}
         ORDER BY p.reaction_count DESC, p.posted_at ASC`,
      )
      .all(...replyParams) as Array<{
      id: string;
      channelId: string;
      threadTs: string;
      text: string | null;
      userId: string | null;
      reactionCount: number;
      postedAt: number;
      displayName: string | null;
      avatarUrl: string | null;
    }>;
    for (const r of replyRows) {
      const key = `${r.channelId}\0${r.threadTs}`;
      const list = topRepliesByKey.get(key) ?? [];
      if (list.length >= 2) continue;
      list.push({
        id: r.id,
        text: r.text ?? "",
        userId: r.userId ?? "",
        displayName: r.displayName ?? "Unknown",
        avatarUrl: r.avatarUrl,
        reactionCount: r.reactionCount,
        postedAt: r.postedAt,
      });
      topRepliesByKey.set(key, list);
    }
  }

  const texts: Array<string | null | undefined> = [];
  for (const row of rows) {
    texts.push(row.text);
    for (const reply of topRepliesByKey.get(`${row.channelId}\0${row.ts}`) ?? []) {
      texts.push(reply.text);
    }
  }
  const { mentionUsers, mentionChannels } = resolveMentionMaps(db, texts);

  return rows.map((row) => {
    const key = `${row.channelId}\0${row.ts}`;
    return {
      id: row.id,
      channelId: row.channelId,
      channelName: row.channelName,
      userId: row.userId ?? "",
      displayName: row.displayName ?? "Unknown",
      avatarUrl: row.avatarUrl,
      text: row.text,
      permalink: row.permalink,
      replyCount: row.replyCount,
      reactionCount: row.reactionCount,
      hasMedia: Boolean(row.hasMedia),
      score: row.score,
      postedAt: row.postedAt,
      reactions: reactionsByPost.get(row.id) ?? [],
      attachments: attachmentsByPost.get(row.id) ?? [],
      topReplies: topRepliesByKey.get(key) ?? [],
      mentionUsers,
      mentionChannels,
    };
  });
}

export function getFeed(
  db: Database,
  opts: {
    sort?: "trending" | "recent";
    following?: boolean;
    limit?: number;
    offset?: number;
    tag?: string;
  } = {},
): FeedPost[] {
  const limit = opts.limit ?? 50;
  const offset = Math.max(0, opts.offset ?? 0);
  const order = opts.sort === "recent" ? "p.posted_at DESC" : "p.score DESC, p.posted_at DESC";
  const followingJoin = opts.following
    ? `INNER JOIN follows f ON f.followee_id = p.user_id AND f.follower_id = '${LOCAL_VIEWER}'`
    : "";

  const params: Array<string | number> = [];
  let tagFilter = "";
  if (opts.tag) {
    const tag = opts.tag.toLowerCase();
    tagFilter = `AND (
      c.default_tag = ?
      OR c.name = ?
      OR EXISTS (
        SELECT 1 FROM post_tags pt
        JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id = p.id AND t.name = ?
      )
    )`;
    params.push(tag, tag, tag);
  }
  params.push(limit, offset);

  const rows = db
    .query(
      `SELECT p.id, p.channel_id as channelId, c.name as channelName, p.user_id as userId,
              u.display_name as displayName, u.avatar_url as avatarUrl, p.text, p.permalink,
              p.reply_count as replyCount, p.reaction_count as reactionCount, p.has_media as hasMedia,
              p.score, p.posted_at as postedAt, p.ts
       FROM posts p
       JOIN channels c ON c.id = p.channel_id
       LEFT JOIN users u ON u.id = p.user_id
       ${followingJoin}
       WHERE (p.thread_ts IS NULL OR p.thread_ts = p.ts)
         AND p.user_id IS NOT NULL
         AND COALESCE(u.is_bot, 0) = 0
       ${tagFilter}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
    )
    .all(...params) as Array<{
    id: string;
    channelId: string;
    channelName: string;
    userId: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    text: string | null;
    permalink: string | null;
    replyCount: number;
    reactionCount: number;
    hasMedia: number;
    score: number;
    postedAt: number;
    ts: string;
  }>;

  return hydrateFeedPosts(db, rows);
}

/**
 * Feed page with "You're All Caught Up" metadata based on last_viewed_at.
 */
export function getFeedPage(
  db: Database,
  opts: {
    sort?: "trending" | "recent";
    following?: boolean;
    limit?: number;
    offset?: number;
    tag?: string;
  } = {},
): FeedPageMeta {
  const posts = getFeed(db, opts);
  const lastViewedAt = getLastViewedAt(db);
  const unreadCount = countUnreadHighEngagement(db, lastViewedAt);
  const caughtUp = unreadCount === 0 && lastViewedAt != null;

  let dividerAfterIndex: number | null = null;
  if (lastViewedAt != null && unreadCount > 0) {
    // Last index in this page that is still "unread" (posted after last view + high score)
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i]!;
      if (p.postedAt > lastViewedAt && p.score >= UNREAD_SCORE_FLOOR) {
        dividerAfterIndex = i;
      }
    }
  }

  return {
    posts,
    lastViewedAt,
    unreadCount,
    caughtUp,
    dividerAfterIndex,
    hasMoreHistory: anyChannelHasMoreHistory(db),
  };
}

export function getExplore(db: Database, limit = 60): FeedPost[] {
  const rows = db
    .query(
      `SELECT p.id, p.channel_id as channelId, c.name as channelName, p.user_id as userId,
              u.display_name as displayName, u.avatar_url as avatarUrl, p.text, p.permalink,
              p.reply_count as replyCount, p.reaction_count as reactionCount, p.has_media as hasMedia,
              p.score, p.posted_at as postedAt, p.ts
       FROM posts p
       JOIN channels c ON c.id = p.channel_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE (p.thread_ts IS NULL OR p.thread_ts = p.ts)
         AND (p.has_media = 1 OR p.score > 0)
         AND p.user_id IS NOT NULL
         AND COALESCE(u.is_bot, 0) = 0
       ORDER BY p.has_media DESC, p.score DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    channelId: string;
    channelName: string;
    userId: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    text: string | null;
    permalink: string | null;
    replyCount: number;
    reactionCount: number;
    hasMedia: number;
    score: number;
    postedAt: number;
    ts: string;
  }>;
  return hydrateFeedPosts(db, rows);
}

export function getPost(db: Database, postId: string): FeedPost | null {
  const row = db
    .query(
      `SELECT p.id, p.channel_id as channelId, c.name as channelName, p.user_id as userId,
              u.display_name as displayName, u.avatar_url as avatarUrl, p.text, p.permalink,
              p.reply_count as replyCount, p.reaction_count as reactionCount, p.has_media as hasMedia,
              p.score, p.posted_at as postedAt, p.ts
       FROM posts p
       JOIN channels c ON c.id = p.channel_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`,
    )
    .get(postId) as
    | {
        id: string;
        channelId: string;
        channelName: string;
        userId: string | null;
        displayName: string | null;
        avatarUrl: string | null;
        text: string | null;
        permalink: string | null;
        replyCount: number;
        reactionCount: number;
        hasMedia: number;
        score: number;
        postedAt: number;
        ts: string;
      }
    | null;
  if (!row) return null;
  return hydrateFeedPosts(db, [row])[0] ?? null;
}

export function getThreadReplies(db: Database, postId: string): FeedReply[] {
  const parent = db.query("SELECT channel_id, ts FROM posts WHERE id = ?").get(postId) as
    | { channel_id: string; ts: string }
    | null;
  if (!parent) return [];
  return (
    db
      .query(
        `SELECT p.id, p.text, p.user_id as userId, p.reaction_count as reactionCount, p.posted_at as postedAt,
                u.display_name as displayName, u.avatar_url as avatarUrl
         FROM posts p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.channel_id = ? AND p.thread_ts = ? AND p.ts != ?
         ORDER BY p.posted_at ASC`,
      )
      .all(parent.channel_id, parent.ts, parent.ts) as Array<{
      id: string;
      text: string | null;
      userId: string | null;
      reactionCount: number;
      postedAt: number;
      displayName: string | null;
      avatarUrl: string | null;
    }>
  ).map((r) => ({
    id: r.id,
    text: r.text ?? "",
    userId: r.userId ?? "",
    displayName: r.displayName ?? "Unknown",
    avatarUrl: r.avatarUrl,
    reactionCount: r.reactionCount,
    postedAt: r.postedAt,
  }));
}

export function getStories(db: Database): StoryItem[] {
  const users = db
    .query(
      `SELECT u.id, u.display_name as label, u.avatar_url as avatarUrl,
              SUM(p.reaction_count) as reactions
       FROM users u
       JOIN posts p ON p.user_id = u.id
         AND (p.thread_ts IS NULL OR p.thread_ts = p.ts)
         AND p.posted_at > ?
       WHERE u.is_bot = 0
       GROUP BY u.id
       ORDER BY reactions DESC
       LIMIT 12`,
    )
    .all(Date.now() - 24 * 3_600_000) as Array<{
    id: string;
    label: string;
    avatarUrl: string | null;
    reactions: number;
  }>;

  return users.map((u) => ({
    id: u.id,
    kind: "user" as const,
    label: u.label,
    avatarUrl: u.avatarUrl,
    trending: u.reactions > 5,
  }));
}

export function getUserProfile(db: Database, userId: string): UserProfile | null {
  const u = db
    .query(
      `SELECT id, display_name as displayName, real_name as realName, avatar_url as avatarUrl,
              title, reactions_earned as reactionsEarned
       FROM users WHERE id = ?`,
    )
    .get(userId) as
    | {
        id: string;
        displayName: string;
        realName: string | null;
        avatarUrl: string | null;
        title: string | null;
        reactionsEarned: number;
      }
    | null;
  if (!u) return null;

  const followerCount = (
    db.query("SELECT COUNT(*) as c FROM follows WHERE followee_id = ?").get(userId) as {
      c: number;
    }
  ).c;
  const followingCount = (
    db.query("SELECT COUNT(*) as c FROM follows WHERE follower_id = ?").get(userId) as {
      c: number;
    }
  ).c;
  const isFollowing = Boolean(
    db
      .query("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?")
      .get(LOCAL_VIEWER, userId),
  );
  const postCount = (
    db
      .query(
        `SELECT COUNT(*) as c FROM posts
         WHERE user_id = ? AND (thread_ts IS NULL OR thread_ts = ts)`,
      )
      .get(userId) as { c: number }
  ).c;

  return {
    ...u,
    followerCount,
    followingCount,
    isFollowing,
    postCount,
  };
}

export function getUserPosts(db: Database, userId: string, limit = 30): FeedPost[] {
  const rows = db
    .query(
      `SELECT p.id, p.channel_id as channelId, c.name as channelName, p.user_id as userId,
              u.display_name as displayName, u.avatar_url as avatarUrl, p.text, p.permalink,
              p.reply_count as replyCount, p.reaction_count as reactionCount, p.has_media as hasMedia,
              p.score, p.posted_at as postedAt, p.ts
       FROM posts p
       JOIN channels c ON c.id = p.channel_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.user_id = ? AND (p.thread_ts IS NULL OR p.thread_ts = p.ts)
       ORDER BY p.score DESC, p.posted_at DESC
       LIMIT ?`,
    )
    .all(userId, limit) as Array<{
    id: string;
    channelId: string;
    channelName: string;
    userId: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    text: string | null;
    permalink: string | null;
    replyCount: number;
    reactionCount: number;
    hasMedia: number;
    score: number;
    postedAt: number;
    ts: string;
  }>;
  return hydrateFeedPosts(db, rows);
}

export function followUser(db: Database, followeeId: string): void {
  db.run(
    `INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)`,
    [LOCAL_VIEWER, followeeId, Date.now()],
  );
}

export function unfollowUser(db: Database, followeeId: string): void {
  db.run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", [
    LOCAL_VIEWER,
    followeeId,
  ]);
}

export function searchPosts(db: Database, q: string, limit = 40): FeedPost[] {
  const like = `%${q}%`;
  const rows = db
    .query(
      `SELECT p.id, p.channel_id as channelId, c.name as channelName, p.user_id as userId,
              u.display_name as displayName, u.avatar_url as avatarUrl, p.text, p.permalink,
              p.reply_count as replyCount, p.reaction_count as reactionCount, p.has_media as hasMedia,
              p.score, p.posted_at as postedAt, p.ts
       FROM posts p
       JOIN channels c ON c.id = p.channel_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE (p.thread_ts IS NULL OR p.thread_ts = p.ts)
         AND p.user_id IS NOT NULL
         AND COALESCE(u.is_bot, 0) = 0
         AND (p.text LIKE ? OR u.display_name LIKE ? OR c.name LIKE ?)
       ORDER BY p.score DESC
       LIMIT ?`,
    )
    .all(like, like, like, limit) as Array<{
    id: string;
    channelId: string;
    channelName: string;
    userId: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    text: string | null;
    permalink: string | null;
    replyCount: number;
    reactionCount: number;
    hasMedia: number;
    score: number;
    postedAt: number;
    ts: string;
  }>;
  return hydrateFeedPosts(db, rows);
}

export function listTags(db: Database, limit = 40): Array<{ name: string; count: number }> {
  return db
    .query(
      `SELECT t.name, COUNT(pt.post_id) as count
       FROM tags t
       JOIN post_tags pt ON pt.tag_id = t.id
       GROUP BY t.id
       ORDER BY count DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{ name: string; count: number }>;
}

export function getAttachment(db: Database, id: string): {
  id: string;
  local_path: string | null;
  mimetype: string | null;
  url_private: string | null;
} | null {
  return db
    .query("SELECT id, local_path, mimetype, url_private FROM attachments WHERE id = ?")
    .get(id) as {
    id: string;
    local_path: string | null;
    mimetype: string | null;
    url_private: string | null;
  } | null;
}
