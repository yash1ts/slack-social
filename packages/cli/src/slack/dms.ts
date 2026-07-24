import type { DmConversation, DmMessage } from "@slack-social/shared";
import { isBotUser, shouldSkipMessage, slackTsToMs } from "@slack-social/shared";
import type { WebClient } from "@slack/web-api";

type SlackChannel = {
  id?: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  is_open?: boolean;
  is_user_deleted?: boolean;
  is_archived?: boolean;
  user?: string;
  updated?: number;
  num_members?: number;
};

type SlackHistoryMessage = {
  ts?: string;
  user?: string;
  text?: string;
  subtype?: string;
  bot_id?: string;
  app_id?: string;
  username?: string;
  files?: unknown[];
  attachments?: unknown[];
};

type PeerInfo = {
  displayName: string;
  avatarUrl: string | null;
  isBot: boolean;
  deleted: boolean;
};

const SYSTEM_USER_IDS = new Set(["USLACKBOT", "USLACK"]);

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;
/** Extra candidates per page to cover bots / empty history skips. */
const CANDIDATE_BUFFER = 8;
const HISTORY_PREVIEW_SCAN = 15;
const LIST_PAGE_SIZE = 200;
const MAX_LIST_PAGES = 10;
const HISTORY_CONCURRENCY = 6;

function isSystemUserId(userId: string | undefined): boolean {
  return Boolean(userId && SYSTEM_USER_IDS.has(userId));
}

async function resolvePeer(
  client: WebClient,
  userId: string,
  cache: Map<string, PeerInfo>,
): Promise<PeerInfo> {
  if (cache.has(userId)) return cache.get(userId)!;
  try {
    const res = await client.users.info({ user: userId });
    const u = res.user;
    const info: PeerInfo = {
      displayName: u?.profile?.display_name || u?.real_name || u?.name || userId,
      avatarUrl: u?.profile?.image_72 || u?.profile?.image_48 || null,
      isBot:
        isSystemUserId(userId) ||
        isBotUser(u) ||
        Boolean((u as { is_app_user?: boolean } | undefined)?.is_app_user),
      deleted: Boolean(u?.deleted),
    };
    cache.set(userId, info);
    return info;
  } catch {
    const info: PeerInfo = {
      displayName: userId,
      avatarUrl: null,
      isBot: isSystemUserId(userId),
      deleted: false,
    };
    cache.set(userId, info);
    return info;
  }
}

function previewText(text: string | undefined | null): string | null {
  if (!text) return null;
  return text.replace(/<([^|>]+)(?:\|([^>]+))?>/g, (_m, url: string, label?: string) =>
    label || url,
  );
}

function messagePreview(msg: SlackHistoryMessage, viewerUserId: string): string | null {
  const text = previewText(msg.text);
  if (text) {
    return msg.user === viewerUserId ? `You: ${text}` : text;
  }
  if (msg.files?.length) {
    return msg.user === viewerUserId ? "You: Sent a file" : "Sent a file";
  }
  if (msg.attachments?.length) {
    return msg.user === viewerUserId ? "You: Shared an attachment" : "Shared an attachment";
  }
  return null;
}

function isImChannel(ch: SlackChannel): boolean {
  return Boolean(ch.is_im || (ch.id?.startsWith("D") && !ch.is_mpim));
}

function isMpimChannel(ch: SlackChannel): boolean {
  return Boolean(ch.is_mpim || ch.id?.startsWith("G"));
}

function isValidDmChannel(ch: SlackChannel): boolean {
  if (!ch.id) return false;
  if (ch.is_archived) return false;
  const im = isImChannel(ch);
  const mpim = isMpimChannel(ch);
  if (!im && !mpim) return false;
  // Closed IMs are not active DMs in Slack's sidebar
  if (im && ch.is_open === false) return false;
  if (im && ch.is_user_deleted) return false;
  if (im && !ch.user) return false;
  if (im && isSystemUserId(ch.user)) return false;
  return true;
}

/** Conversations the authed user is in (correct source for DM inbox). */
async function listAllDmChannels(client: WebClient): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const listed = await client.users.conversations({
      types: "im,mpim",
      exclude_archived: true,
      limit: LIST_PAGE_SIZE,
      cursor,
    });

    for (const ch of (listed.channels ?? []) as SlackChannel[]) {
      if (isValidDmChannel(ch)) channels.push(ch);
    }

    cursor = listed.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }

  return channels;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}

function pickLatestUserMessage(messages: SlackHistoryMessage[]): SlackHistoryMessage | null {
  // Slack history is newest-first
  for (const msg of messages) {
    if (!msg.ts) continue;
    if (shouldSkipMessage(msg)) continue;
    return msg;
  }
  return null;
}

export type ListDmConversationsResult = {
  conversations: DmConversation[];
  nextOffset: number | null;
  hasMore: boolean;
};

/** List IM + MPIM conversations with last-message preview (live from Slack), paginated. */
export async function listDmConversations(
  client: WebClient,
  viewerUserId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<ListDmConversationsResult> {
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, opts.limit ?? DEFAULT_PAGE_SIZE),
  );
  const offset = Math.max(0, opts.offset ?? 0);

  const channels = await listAllDmChannels(client);
  const userCache = new Map<string, PeerInfo>();

  // Prefer recently updated conversations before spending history API calls.
  // Slack `updated` may be seconds or ms depending on client/token — normalize.
  const updatedMs = (ch: SlackChannel) => {
    const raw = ch.updated ?? 0;
    return raw > 1e12 ? raw : raw * 1000;
  };
  channels.sort((a, b) => updatedMs(b) - updatedMs(a));

  // Cheap prefilter only — bot/deleted checks happen during page enrichment.
  const candidates = channels.filter((ch) => {
    if (isImChannel(ch) && ch.user) {
      if (ch.user === viewerUserId) return false;
      if (isSystemUserId(ch.user)) return false;
    }
    return true;
  });

  // Walk candidates from offset, enriching only a window until we fill the page.
  const conversations: DmConversation[] = [];
  let cursor = offset;

  while (conversations.length < limit && cursor < candidates.length) {
    const batch = candidates.slice(
      cursor,
      cursor + (limit - conversations.length) + CANDIDATE_BUFFER,
    );
    if (!batch.length) break;

    const enriched = await mapPool(batch, HISTORY_CONCURRENCY, async (ch) => {
      if (!ch.id) return null;

      let name = ch.name || "Direct message";
      let avatarUrl: string | null = null;
      let userId: string | undefined;
      const kind: "im" | "mpim" = isMpimChannel(ch) ? "mpim" : "im";

      if (kind === "im" && ch.user) {
        userId = ch.user;
        const peer = await resolvePeer(client, ch.user, userCache);
        if (peer.isBot || peer.deleted) return null;
        name = peer.displayName;
        avatarUrl = peer.avatarUrl;
      } else if (kind === "mpim") {
        name = (ch.name || "Group DM").replace(/^mpdm-/, "").replace(/--$/, "");
      }

      let lastMessage: string | null = null;
      let lastMessageAt: number | null = null;

      try {
        const hist = await client.conversations.history({
          channel: ch.id,
          limit: HISTORY_PREVIEW_SCAN,
        });
        const msg = pickLatestUserMessage((hist.messages ?? []) as SlackHistoryMessage[]);
        if (!msg?.ts) return null;

        lastMessageAt = slackTsToMs(msg.ts);
        lastMessage = messagePreview(msg, viewerUserId);
      } catch {
        // No history access / empty / invalid — skip from inbox
        return null;
      }

      if (!lastMessageAt) return null;

      const row: DmConversation = {
        id: ch.id,
        kind,
        name,
        avatarUrl,
        lastMessage,
        lastMessageAt,
      };
      if (userId) row.userId = userId;
      return row;
    });

    for (let i = 0; i < batch.length; i++) {
      cursor += 1;
      const row = enriched[i];
      if (row) {
        conversations.push(row);
        if (conversations.length >= limit) break;
      }
    }
  }

  conversations.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));

  const hasMore = cursor < candidates.length;
  return {
    conversations,
    nextOffset: hasMore ? cursor : null,
    hasMore,
  };
}

export async function getDmThread(
  client: WebClient,
  channelId: string,
  viewerUserId: string,
): Promise<{
  conversation: DmConversation;
  messages: DmMessage[];
}> {
  const info = await client.conversations.info({ channel: channelId });
  const ch = info.channel as SlackChannel | undefined;
  if (!ch?.id) throw new Error("Conversation not found");

  const userCache = new Map<string, PeerInfo>();
  let name = ch.name || "Direct message";
  let avatarUrl: string | null = null;
  let userId: string | undefined;
  const kind: "im" | "mpim" = isMpimChannel(ch) ? "mpim" : "im";

  if (kind === "im" && ch.user) {
    userId = ch.user;
    const peer = await resolvePeer(client, ch.user, userCache);
    if (peer.deleted) throw new Error("This conversation is no longer available");
    name = peer.displayName;
    avatarUrl = peer.avatarUrl;
  } else if (kind === "mpim") {
    name = (ch.name || "Group DM").replace(/^mpdm-/, "").replace(/--$/, "");
  }

  const hist = await client.conversations.history({
    channel: channelId,
    limit: 50,
  });

  const messages: DmMessage[] = [];
  for (const msg of [...((hist.messages ?? []) as SlackHistoryMessage[])].reverse()) {
    if (!msg.ts || shouldSkipMessage(msg)) continue;
    const uid = msg.user ?? "unknown";
    const user = await resolvePeer(client, uid, userCache);
    messages.push({
      id: `${channelId}:${msg.ts}`,
      userId: uid,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      text: msg.text ?? null,
      postedAt: slackTsToMs(msg.ts),
      isMine: uid === viewerUserId,
    });
  }

  // Chat UI expects chronological order (oldest → newest)
  messages.sort((a, b) => a.postedAt - b.postedAt);

  return {
    conversation: {
      id: channelId,
      kind,
      name,
      avatarUrl,
      userId,
      lastMessage: messages.at(-1)?.text ?? null,
      lastMessageAt: messages.at(-1)?.postedAt ?? null,
    },
    messages,
  };
}

export async function sendDmMessage(
  client: WebClient,
  channelId: string,
  text: string,
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  try {
    const res = await client.chat.postMessage({
      channel: channelId,
      text,
    });
    if (!res.ok) return { ok: false, error: "Slack rejected the message" };
    return { ok: true, ts: res.ts };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send",
    };
  }
}
