import type { DmConversation, DmMessage } from "@slack-social/shared";
import { slackTsToMs } from "@slack-social/shared";
import type { WebClient } from "@slack/web-api";

type SlackChannel = {
  id?: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  user?: string;
  updated?: number;
};

async function resolveUser(
  client: WebClient,
  userId: string,
  cache: Map<string, { displayName: string; avatarUrl: string | null }>,
) {
  if (cache.has(userId)) return cache.get(userId)!;
  try {
    const res = await client.users.info({ user: userId });
    const u = res.user;
    const info = {
      displayName: u?.profile?.display_name || u?.real_name || u?.name || userId,
      avatarUrl: u?.profile?.image_72 || u?.profile?.image_48 || null,
    };
    cache.set(userId, info);
    return info;
  } catch {
    const info = { displayName: userId, avatarUrl: null as string | null };
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

/** List IM + MPIM conversations with last-message preview (live from Slack). */
export async function listDmConversations(
  client: WebClient,
  viewerUserId: string,
): Promise<DmConversation[]> {
  const listed = await client.conversations.list({
    types: "im,mpim",
    exclude_archived: true,
    limit: 100,
  });

  const channels = (listed.channels ?? []) as SlackChannel[];
  const userCache = new Map<string, { displayName: string; avatarUrl: string | null }>();
  const results: DmConversation[] = [];

  // Fetch last message for each conversation in parallel (bounded)
  const batch = channels.filter((c) => c.id).slice(0, 40);
  await Promise.all(
    batch.map(async (ch) => {
      if (!ch.id) return;

      let name = ch.name || "Direct message";
      let avatarUrl: string | null = null;
      let userId: string | undefined;
      const kind: "im" | "mpim" = ch.is_mpim ? "mpim" : "im";

      if (ch.is_im && ch.user) {
        userId = ch.user;
        const peer = await resolveUser(client, ch.user, userCache);
        name = peer.displayName;
        avatarUrl = peer.avatarUrl;
      } else if (ch.is_mpim) {
        name = (ch.name || "Group DM").replace(/^mpdm-/, "").replace(/--$/, "");
      }

      let lastMessage: string | null = null;
      let lastMessageAt: number | null = ch.updated ? ch.updated * 1000 : null;

      try {
        const hist = await client.conversations.history({
          channel: ch.id,
          limit: 1,
        });
        const msg = hist.messages?.[0];
        if (msg?.ts) {
          lastMessageAt = slackTsToMs(msg.ts);
          if (msg.user === viewerUserId) {
            lastMessage = `You: ${previewText(msg.text) ?? ""}`;
          } else {
            lastMessage = previewText(msg.text);
          }
        }
      } catch {
        /* history may fail for some channels */
      }

      results.push({
        id: ch.id,
        kind,
        name,
        avatarUrl,
        userId,
        lastMessage,
        lastMessageAt,
      });
    }),
  );

  results.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  return results;
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

  const userCache = new Map<string, { displayName: string; avatarUrl: string | null }>();
  let name = ch.name || "Direct message";
  let avatarUrl: string | null = null;
  let userId: string | undefined;
  const kind: "im" | "mpim" = ch.is_mpim ? "mpim" : "im";

  if (ch.is_im && ch.user) {
    userId = ch.user;
    const peer = await resolveUser(client, ch.user, userCache);
    name = peer.displayName;
    avatarUrl = peer.avatarUrl;
  }

  const hist = await client.conversations.history({
    channel: channelId,
    limit: 50,
  });

  const messages: DmMessage[] = [];
  for (const msg of [...(hist.messages ?? [])].reverse()) {
    if (!msg.ts || msg.subtype === "channel_join") continue;
    const uid = msg.user ?? "unknown";
    const user = await resolveUser(client, uid, userCache);
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
