import { join } from "node:path";
import type { Database } from "bun:sqlite";
import type { ConversationsHistoryResponse, WebClient } from "@slack/web-api";
import {
  defaultTagForChannel,
  extractSlackUserIds,
  FAST_FORWARD_MS,
  isBotUser,
  msToSlackTs,
  shouldSkipMessage,
  slackMessageBody,
  slackTsToMs,
  type SyncProgress,
} from "@slack-social/shared";
import { MEDIA_DIR } from "../paths";
import {
  applyPostTags,
  getChannelSync,
  listChannelsNeedingBackfill,
  recomputeScores,
  replaceReactions,
  updatePostScore,
  upsertAttachment,
  upsertChannel,
  upsertChannelSync,
  upsertPost,
  upsertUser,
} from "../db/queries";
import { syncWorkspaceEmojis } from "./emoji-sync";

type SlackMessage = NonNullable<ConversationsHistoryResponse["messages"]>[number];

type SlackChannel = {
  id?: string;
  name?: string;
  topic?: { value?: string };
  is_archived?: boolean;
  num_members?: number;
};

export type SyncOptions = {
  force?: boolean;
  channels?: string[];
  historyLimit?: number;
  /** fast_forward | delta | backfill (legacy aliases: bootstrap→fast_forward, full→delta) */
  phase?: "fast_forward" | "delta" | "backfill" | "bootstrap" | "full";
  /** Boot window in ms (default 36h) */
  lookbackMs?: number;
  /** Max history pages to pull across channels during one backfill call */
  backfillPages?: number;
  onProgress?: (progress: SyncProgress) => void;
  sessionCookie?: string;
  startedAt?: number;
};

function resolvePhase(
  phase: SyncOptions["phase"],
): "fast_forward" | "delta" | "backfill" {
  if (phase === "bootstrap") return "fast_forward";
  if (phase === "full") return "delta";
  return phase ?? "fast_forward";
}

function emit(
  opts: SyncOptions,
  partial: Omit<SyncProgress, "startedAt"> & { startedAt?: number | null },
) {
  const startedAt = partial.startedAt ?? opts.startedAt ?? Date.now();
  opts.onProgress?.({ ...partial, startedAt });
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const rateLimited =
        msg.includes("ratelimited") ||
        msg.includes("rate_limited") ||
        msg.includes("429");
      if (!rateLimited || i === retries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

/** Cache of userIds known to be bots / corporate apps — skip indexing their posts. */
type UserBotCache = Map<string, boolean>;

async function warmUserDirectory(
  client: WebClient,
  db: Database,
  seenUsers: Set<string>,
  botCache: UserBotCache,
): Promise<void> {
  let cursor: string | undefined;
  try {
    do {
      const listed = await withBackoff(() =>
        client.users.list({ limit: 200, cursor }),
      );
      for (const u of listed.members ?? []) {
        if (!u?.id || u.deleted) continue;
        const bot = isBotUser(u);
        botCache.set(u.id, bot);
        seenUsers.add(u.id);
        upsertUser(db, {
          id: u.id,
          displayName: u.profile?.display_name || u.real_name || u.name || u.id,
          realName: u.real_name ?? null,
          avatarUrl: u.profile?.image_192 || u.profile?.image_72 || null,
          title: u.profile?.title ?? null,
          isBot: bot,
        });
      }
      cursor = listed.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch (err) {
    console.warn("  ! users.list warm failed (falling back to users.info):", err);
  }
}

async function ensureUser(
  client: WebClient,
  db: Database,
  userId: string,
  seenUsers: Set<string>,
  botCache: UserBotCache,
): Promise<{ isBot: boolean }> {
  if (!userId) return { isBot: true };
  if (botCache.has(userId)) return { isBot: botCache.get(userId)! };

  if (!seenUsers.has(userId)) {
    seenUsers.add(userId);

    const cached = db
      .query("SELECT is_bot FROM users WHERE id = ?")
      .get(userId) as { is_bot: number } | null;
    if (cached) {
      const bot = Boolean(cached.is_bot);
      botCache.set(userId, bot);
      return { isBot: bot };
    }

    try {
      const res = await client.users.info({ user: userId });
      const u = res.user;
      if (!u?.id) {
        botCache.set(userId, true);
        return { isBot: true };
      }
      const bot = isBotUser(u);
      botCache.set(userId, bot);
      upsertUser(db, {
        id: u.id,
        displayName: u.profile?.display_name || u.real_name || u.name || u.id,
        realName: u.real_name ?? null,
        avatarUrl: u.profile?.image_192 || u.profile?.image_72 || null,
        title: u.profile?.title ?? null,
        isBot: bot,
      });
      return { isBot: bot };
    } catch {
      // Unknown user — allow through once; don't permanently mark as bot
      upsertUser(db, { id: userId, displayName: userId });
      botCache.set(userId, false);
      return { isBot: false };
    }
  }

  return { isBot: botCache.get(userId) ?? false };
}

async function downloadMedia(
  token: string,
  file: {
    id?: string;
    url_private_download?: string;
    url_private?: string;
    mimetype?: string;
    name?: string;
  },
  cookie?: string,
): Promise<string | null> {
  if (!file.id) return null;
  const url = file.url_private_download || file.url_private;
  if (!url) return null;
  if (file.mimetype && !file.mimetype.startsWith("image/")) return null;

  const ext = file.mimetype?.split("/")[1] || "bin";
  const localPath = join(MEDIA_DIR, `${file.id}.${ext}`);
  const existing = Bun.file(localPath);
  if (await existing.exists()) return localPath;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(cookie
          ? { Cookie: cookie.trim().startsWith("d=") ? cookie.trim() : `d=${cookie.trim()}` }
          : {}),
      },
    });
    if (!res.ok) return null;
    await Bun.write(localPath, res);
    return localPath;
  } catch {
    return null;
  }
}

async function ingestMessage(
  client: WebClient,
  db: Database,
  token: string,
  channel: { id: string; name: string; defaultTag?: string | null },
  message: SlackMessage,
  seenUsers: Set<string>,
  botCache: UserBotCache,
  isReply = false,
  cookie?: string,
  opts?: { skipMedia?: boolean },
): Promise<boolean> {
  if (!message.ts) return false;

  // Fast path: bot_id / system subtypes / known bot usernames
  if (
    shouldSkipMessage({
      user: message.user,
      bot_id: message.bot_id,
      subtype: message.subtype,
      username: message.username,
      app_id: (message as { app_id?: string }).app_id,
    })
  ) {
    return false;
  }

  if (message.user) {
    const { isBot } = await ensureUser(client, db, message.user, seenUsers, botCache);
    if (isBot) return false;
  } else {
    // No user and not already caught — skip anonymous/app posts
    return false;
  }

  // Resolve @mentions so the feed can show display names instead of raw IDs
  const body = slackMessageBody(message);
  for (const mentionedId of extractSlackUserIds(body)) {
    if (mentionedId === message.user) continue;
    await ensureUser(client, db, mentionedId, seenUsers, botCache);
  }

  const postId = `${channel.id}:${message.ts}`;
  const reactions =
    message.reactions?.map((r) => ({ name: r.name ?? "unknown", count: r.count ?? 0 })) ?? [];
  const reactionCount = reactions.reduce((sum, r) => sum + r.count, 0);
  const files = message.files ?? [];
  const hasMedia = files.some((f) => f.mimetype?.startsWith("image/"));

  const threadTs = isReply ? (message.thread_ts ?? message.ts) : message.ts;

  upsertPost(db, {
    id: postId,
    channelId: channel.id,
    userId: message.user ?? null,
    ts: message.ts,
    threadTs,
    text: body || null,
    replyCount: message.reply_count ?? 0,
    reactionCount,
    hasMedia,
    postedAt: slackTsToMs(message.ts),
  });

  replaceReactions(db, postId, reactions);
  applyPostTags(db, postId, {
    channelName: channel.name,
    channelDefaultTag: channel.defaultTag,
    text: body,
    reactionNames: reactions.map((r) => r.name),
  });
  if (!isReply) updatePostScore(db, postId);

  if (opts?.skipMedia) return true;

  for (const file of files) {
    if (!file.id) continue;
    const localPath = await downloadMedia(token, file, cookie);
    upsertAttachment(db, {
      id: file.id,
      postId,
      mimetype: file.mimetype ?? null,
      title: file.title || file.name || null,
      urlPrivate: file.url_private ?? null,
      localPath,
      width: typeof file.original_w === "number" ? file.original_w : null,
      height: typeof file.original_h === "number" ? file.original_h : null,
      thumbUrl: file.thumb_720 || file.thumb_360 || null,
    });
  }
  return true;
}

async function listChannels(
  client: WebClient,
  opts: SyncOptions,
): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;
  do {
    const listed = await withBackoff(() =>
      client.conversations.list({
        types: "public_channel",
        exclude_archived: true,
        limit: 200,
        cursor,
      }),
    );
    channels.push(...(listed.channels ?? []));
    cursor = listed.response_metadata?.next_cursor || undefined;
  } while (cursor);

  if (opts.channels?.length) {
    const wanted = new Set(opts.channels.map((c) => c.replace(/^#/, "").toLowerCase()));
    return channels.filter(
      (c) => c.id && (wanted.has(c.id.toLowerCase()) || wanted.has((c.name ?? "").toLowerCase())),
    );
  }
  return channels;
}

function channelMeta(ch: SlackChannel): {
  id: string;
  name: string;
  defaultTag: string | null;
} | null {
  if (!ch.id || !ch.name) return null;
  return {
    id: ch.id,
    name: ch.name,
    defaultTag: defaultTagForChannel(ch.name),
  };
}

async function ingestHistoryPage(
  client: WebClient,
  db: Database,
  token: string,
  channel: { id: string; name: string; defaultTag: string | null },
  messages: SlackMessage[],
  seenUsers: Set<string>,
  botCache: UserBotCache,
  cookie: string | undefined,
  opts: { skipMedia?: boolean; fetchReplies?: boolean; oldestBound?: string },
): Promise<number> {
  let count = 0;
  for (const message of messages) {
    if (opts.oldestBound && message.ts && message.ts < opts.oldestBound) continue;
    const ingested = await ingestMessage(
      client,
      db,
      token,
      channel,
      message,
      seenUsers,
      botCache,
      false,
      cookie,
      { skipMedia: opts.skipMedia },
    );
    if (!ingested) continue;
    count++;

    if (opts.fetchReplies && (message.reply_count ?? 0) > 0 && message.ts) {
      try {
        const replies = await withBackoff(() =>
          client.conversations.replies({
            channel: channel.id,
            ts: message.ts!,
            limit: 100,
            oldest: opts.oldestBound,
          }),
        );
        for (const reply of replies.messages ?? []) {
          if (reply.ts === message.ts) continue;
          if (opts.oldestBound && reply.ts && reply.ts < opts.oldestBound) continue;
          const replyIngested = await ingestMessage(
            client,
            db,
            token,
            channel,
            reply,
            seenUsers,
            botCache,
            true,
            cookie,
            { skipMedia: opts.skipMedia },
          );
          if (replyIngested) count++;
        }
      } catch (err) {
        console.warn(`  ! replies failed for ${channel.name}/${message.ts}:`, err);
      }
    }
  }
  return count;
}

/** Fast-forward boot: last 24–48h (default 36h) across tracked public channels. */
async function syncFastForward(
  client: WebClient,
  db: Database,
  token: string,
  opts: SyncOptions,
): Promise<{ channels: number; messages: number }> {
  const cookie = opts.sessionCookie;
  const seenUsers = new Set<string>();
  const botCache: UserBotCache = new Map();
  const startedAt = opts.startedAt ?? Date.now();
  const lookbackMs = opts.lookbackMs ?? FAST_FORWARD_MS;
  const oldestBound = msToSlackTs(Date.now() - lookbackMs);
  const historyLimit = Math.min(opts.historyLimit ?? 100, 200);

  const channels = await listChannels(client, opts);
  let messagesSynced = 0;
  let channelsDone = 0;

  await warmUserDirectory(client, db, seenUsers, botCache);

  emit(opts, {
    phase: "fast_forward",
    status: "running",
    channelsTotal: channels.length,
    channelsDone: 0,
    messagesIndexed: 0,
    startedAt,
  });

  for (const ch of channels) {
    const meta = channelMeta(ch);
    if (!meta) continue;

    upsertChannel(db, {
      id: meta.id,
      name: meta.name,
      topic: ch.topic?.value ?? null,
      isArchived: Boolean(ch.is_archived),
      memberCount: ch.num_members ?? null,
      defaultTag: meta.defaultTag,
    });

    emit(opts, {
      phase: "fast_forward",
      status: "running",
      channelsTotal: channels.length,
      channelsDone,
      currentChannel: meta.name,
      messagesIndexed: messagesSynced,
      startedAt,
    });

    try {
      let cursor: string | undefined;
      let newestTs: string | null = null;
      let oldestTs: string | null = null;
      let page = 0;
      let hasMore = false;

      do {
        const history = await withBackoff(() =>
          client.conversations.history({
            channel: meta.id,
            limit: historyLimit,
            oldest: oldestBound,
            cursor,
          }),
        );

        const messages = history.messages ?? [];
        for (const m of messages) {
          if (!m.ts) continue;
          if (!newestTs || m.ts > newestTs) newestTs = m.ts;
          if (!oldestTs || m.ts < oldestTs) oldestTs = m.ts;
        }

        messagesSynced += await ingestHistoryPage(
          client,
          db,
          token,
          meta,
          messages,
          seenUsers,
          botCache,
          cookie,
          {
            skipMedia: true, // keep boot under ~3s; delta/backfill hydrate media
            fetchReplies: false, // load replies on thread open
            oldestBound,
          },
        );

        hasMore = Boolean(history.has_more);
        cursor = history.response_metadata?.next_cursor || undefined;
        page++;
        // Cap boot pages per channel to stay under ~3s for typical workspaces
        if (page >= 2) {
          hasMore = hasMore || Boolean(cursor);
          break;
        }
      } while (cursor);

      const existing = getChannelSync(db, meta.id);
      // After a time-windowed boot, older history almost always remains to lazy-backfill
      const moreHistory = true;

      upsertChannelSync(db, {
        channelId: meta.id,
        newestSyncedTs:
          newestTs && existing?.newest_synced_ts
            ? newestTs > existing.newest_synced_ts
              ? newestTs
              : existing.newest_synced_ts
            : (newestTs ?? existing?.newest_synced_ts ?? null),
        oldestSyncedTs:
          oldestTs && existing?.oldest_synced_ts
            ? oldestTs < existing.oldest_synced_ts
              ? oldestTs
              : existing.oldest_synced_ts
            : (oldestTs ?? existing?.oldest_synced_ts ?? oldestBound),
        hasMoreHistory: moreHistory,
        lastSyncedAt: Date.now(),
      });
    } catch (err) {
      console.warn(`  ! fast-forward failed for #${meta.name}:`, err);
    }

    channelsDone++;
    emit(opts, {
      phase: "fast_forward",
      status: "running",
      channelsTotal: channels.length,
      channelsDone,
      currentChannel: meta.name,
      messagesIndexed: messagesSynced,
      startedAt,
    });
  }

  recomputeScores(db);

  emit(opts, {
    phase: "fast_forward",
    status: "fast_forward_done",
    channelsTotal: channels.length,
    channelsDone,
    messagesIndexed: messagesSynced,
    startedAt,
  });

  return { channels: channelsDone, messages: messagesSynced };
}

/** Background delta: fetch messages newer than newest_synced_ts. */
async function syncDelta(
  client: WebClient,
  db: Database,
  token: string,
  opts: SyncOptions,
): Promise<{ channels: number; messages: number }> {
  const cookie = opts.sessionCookie;
  const seenUsers = new Set<string>();
  const botCache: UserBotCache = new Map();
  const startedAt = opts.startedAt ?? Date.now();
  const historyLimit = Math.min(opts.historyLimit ?? 100, 200);

  const channels = await listChannels(client, opts);
  let messagesSynced = 0;
  let channelsDone = 0;

  await warmUserDirectory(client, db, seenUsers, botCache);

  emit(opts, {
    phase: "delta",
    status: "running",
    channelsTotal: channels.length,
    channelsDone: 0,
    messagesIndexed: 0,
    startedAt,
  });

  for (const ch of channels) {
    const meta = channelMeta(ch);
    if (!meta) continue;

    upsertChannel(db, {
      id: meta.id,
      name: meta.name,
      topic: ch.topic?.value ?? null,
      isArchived: Boolean(ch.is_archived),
      memberCount: ch.num_members ?? null,
      defaultTag: meta.defaultTag,
    });

    const sync = getChannelSync(db, meta.id);
    const oldest = sync?.newest_synced_ts ?? msToSlackTs(Date.now() - FAST_FORWARD_MS);

    emit(opts, {
      phase: "delta",
      status: "running",
      channelsTotal: channels.length,
      channelsDone,
      currentChannel: meta.name,
      messagesIndexed: messagesSynced,
      startedAt,
    });

    try {
      const history = await withBackoff(() =>
        client.conversations.history({
          channel: meta.id,
          limit: historyLimit,
          oldest,
        }),
      );

      const messages = history.messages ?? [];
      let newestTs = sync?.newest_synced_ts ?? null;
      for (const m of messages) {
        if (m.ts && (!newestTs || m.ts > newestTs)) newestTs = m.ts;
      }

      messagesSynced += await ingestHistoryPage(
        client,
        db,
        token,
        meta,
        messages,
        seenUsers,
        botCache,
        cookie,
        { skipMedia: false, fetchReplies: false, oldestBound: oldest },
      );

      upsertChannelSync(db, {
        channelId: meta.id,
        newestSyncedTs: newestTs,
        oldestSyncedTs: sync?.oldest_synced_ts ?? oldest,
        hasMoreHistory: sync ? Boolean(sync.has_more_history) : true,
        lastSyncedAt: Date.now(),
      });
    } catch (err) {
      console.warn(`  ! delta failed for #${meta.name}:`, err);
    }

    channelsDone++;
  }

  // Scores updated incrementally in ingestMessage; skip full-table recompute on delta.

  emit(opts, {
    phase: "delta",
    status: "complete",
    channelsTotal: channels.length,
    channelsDone,
    messagesIndexed: messagesSynced,
    startedAt,
    finishedAt: Date.now(),
  });

  return { channels: channelsDone, messages: messagesSynced };
}

/**
 * On-demand backfill: pull older pages prior to oldest_synced_ts for channels
 * that still have history.
 */
export async function backfillWorkspace(
  client: WebClient,
  db: Database,
  token: string,
  opts: SyncOptions = {},
): Promise<{ channels: number; messages: number; hasMoreHistory: boolean }> {
  const cookie = opts.sessionCookie;
  const seenUsers = new Set<string>();
  const botCache: UserBotCache = new Map();
  const startedAt = opts.startedAt ?? Date.now();
  const pageBudget = opts.backfillPages ?? 2;
  const historyLimit = Math.min(opts.historyLimit ?? 100, 200);

  // Ensure channel rows exist / discover new channels lightly
  const listed = await listChannels(client, opts);
  const byId = new Map<string, SlackChannel>();
  for (const ch of listed) {
    if (ch.id) byId.set(ch.id, ch);
  }

  let targets = listChannelsNeedingBackfill(db, 50);
  if (targets.length === 0) {
    // First backfill after boot: seed from listed channels that have sync rows
    for (const ch of listed) {
      const meta = channelMeta(ch);
      if (!meta) continue;
      upsertChannel(db, {
        id: meta.id,
        name: meta.name,
        topic: ch.topic?.value ?? null,
        isArchived: Boolean(ch.is_archived),
        memberCount: ch.num_members ?? null,
        defaultTag: meta.defaultTag,
      });
      const sync = getChannelSync(db, meta.id);
      if (!sync) {
        upsertChannelSync(db, {
          channelId: meta.id,
          hasMoreHistory: true,
          lastSyncedAt: Date.now(),
        });
      }
    }
    targets = listChannelsNeedingBackfill(db, 50);
  }

  let messagesSynced = 0;
  let channelsTouched = 0;
  let pagesUsed = 0;

  emit(opts, {
    phase: "backfill",
    status: "running",
    channelsTotal: targets.length,
    channelsDone: 0,
    messagesIndexed: 0,
    startedAt,
  });

  for (const sync of targets) {
    if (pagesUsed >= pageBudget) break;
    const ch = byId.get(sync.channel_id);
    const meta = ch
      ? channelMeta(ch)
      : (() => {
          const row = db
            .query("SELECT id, name, default_tag FROM channels WHERE id = ?")
            .get(sync.channel_id) as
            | { id: string; name: string; default_tag: string | null }
            | null;
          return row
            ? { id: row.id, name: row.name, defaultTag: row.default_tag }
            : null;
        })();
    if (!meta || !sync.oldest_synced_ts) continue;

    emit(opts, {
      phase: "backfill",
      status: "running",
      channelsTotal: targets.length,
      channelsDone: channelsTouched,
      currentChannel: meta.name,
      messagesIndexed: messagesSynced,
      startedAt,
    });

    try {
      // Slack: latest = exclusive upper bound → messages older than oldest_synced_ts
      const history = await withBackoff(() =>
        client.conversations.history({
          channel: meta.id,
          limit: historyLimit,
          latest: sync.oldest_synced_ts!,
        }),
      );

      const messages = history.messages ?? [];
      let oldestTs = sync.oldest_synced_ts;
      for (const m of messages) {
        if (m.ts && m.ts < oldestTs) oldestTs = m.ts;
      }

      messagesSynced += await ingestHistoryPage(
        client,
        db,
        token,
        meta,
        messages,
        seenUsers,
        botCache,
        cookie,
        { skipMedia: false, fetchReplies: false },
      );

      const hasMore = Boolean(history.has_more) && messages.length > 0;
      upsertChannelSync(db, {
        channelId: meta.id,
        newestSyncedTs: sync.newest_synced_ts,
        oldestSyncedTs: oldestTs,
        hasMoreHistory: hasMore,
        lastSyncedAt: Date.now(),
      });

      pagesUsed++;
      channelsTouched++;
    } catch (err) {
      console.warn(`  ! backfill failed for #${meta.name}:`, err);
    }
  }

  recomputeScores(db);

  const hasMoreHistory = listChannelsNeedingBackfill(db, 1).length > 0;

  emit(opts, {
    phase: "backfill",
    status: "complete",
    channelsTotal: targets.length,
    channelsDone: channelsTouched,
    messagesIndexed: messagesSynced,
    startedAt,
    finishedAt: Date.now(),
  });

  return { channels: channelsTouched, messages: messagesSynced, hasMoreHistory };
}

export async function syncWorkspace(
  client: WebClient,
  db: Database,
  token: string,
  opts: SyncOptions = {},
): Promise<{ channels: number; messages: number }> {
  const phase = resolvePhase(opts.phase);
  // Emoji catalog is TTL-cached; only refresh on fast-forward, not every delta tick.
  if (phase === "fast_forward") {
    await syncWorkspaceEmojis(client, db, {
      token,
      sessionCookie: opts.sessionCookie,
    });
  }
  if (phase === "fast_forward") {
    return syncFastForward(client, db, token, opts);
  }
  if (phase === "backfill") {
    const result = await backfillWorkspace(client, db, token, opts);
    return { channels: result.channels, messages: result.messages };
  }
  return syncDelta(client, db, token, opts);
}

/**
 * On-demand: pull conversations.replies for a parent post and store them.
 * Used when opening the thread sheet and local replies are missing/stale.
 */
export async function refreshThreadReplies(
  client: WebClient,
  db: Database,
  token: string,
  postId: string,
  opts: { sessionCookie?: string } = {},
): Promise<number> {
  const parent = db
    .query(
      `SELECT p.channel_id as channelId, p.ts, c.name as channelName, c.default_tag as defaultTag
       FROM posts p
       JOIN channels c ON c.id = p.channel_id
       WHERE p.id = ?`,
    )
    .get(postId) as
    | {
        channelId: string;
        ts: string;
        channelName: string;
        defaultTag: string | null;
      }
    | null;
  if (!parent) return 0;

  const channel = {
    id: parent.channelId,
    name: parent.channelName,
    defaultTag: parent.defaultTag,
  };
  const seenUsers = new Set<string>();
  const botCache: UserBotCache = new Map();
  let count = 0;
  let cursor: string | undefined;

  do {
    const replies = await withBackoff(() =>
      client.conversations.replies({
        channel: parent.channelId,
        ts: parent.ts,
        limit: 200,
        cursor,
      }),
    );
    for (const reply of replies.messages ?? []) {
      if (reply.ts === parent.ts) continue;
      const ingested = await ingestMessage(
        client,
        db,
        token,
        channel,
        reply,
        seenUsers,
        botCache,
        true,
        opts.sessionCookie,
        { skipMedia: true },
      );
      if (ingested) count++;
    }
    cursor = replies.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return count;
}
