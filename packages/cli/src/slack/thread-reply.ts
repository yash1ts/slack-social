import type { Database } from "bun:sqlite";
import type { WebClient } from "@slack/web-api";
import { slackTsToMs } from "@slack-social/shared";
import { upsertPost } from "../db/queries";

/**
 * Post a thread reply in Slack and store it locally.
 */
export async function postThreadReply(
  client: WebClient,
  db: Database,
  postId: string,
  text: string,
  userId: string,
): Promise<{ ok: true; replyId: string; ts: string } | { ok: false; error: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Message text is required" };

  const parent = db
    .query("SELECT channel_id as channelId, ts, reply_count as replyCount FROM posts WHERE id = ?")
    .get(postId) as
    | { channelId: string; ts: string; replyCount: number }
    | null;
  if (!parent) return { ok: false, error: "Post not found" };

  try {
    const res = await client.chat.postMessage({
      channel: parent.channelId,
      text: trimmed,
      thread_ts: parent.ts,
    });
    if (!res.ok || !res.ts) {
      return { ok: false, error: res.error ?? "Slack rejected the message" };
    }

    const replyId = `${parent.channelId}:${res.ts}`;
    upsertPost(db, {
      id: replyId,
      channelId: parent.channelId,
      userId,
      ts: res.ts,
      threadTs: parent.ts,
      text: trimmed,
      replyCount: 0,
      reactionCount: 0,
      hasMedia: false,
      postedAt: slackTsToMs(res.ts),
    });

    db.run("UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?", [postId]);

    return { ok: true, replyId, ts: res.ts };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to post reply",
    };
  }
}
