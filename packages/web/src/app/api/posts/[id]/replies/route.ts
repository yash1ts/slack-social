import { NextResponse } from "next/server";
import { getAuthProvider, getSession, isLoggedIn } from "@/lib/auth";
import { dbApi, getDb } from "@/lib/db";
import { refreshThreadReplies } from "../../../../../../../cli/src/slack/indexer";
import { postThreadReply } from "../../../../../../../cli/src/slack/thread-reply";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  const id = decodeURIComponent(rawId);
  const db = getDb();
  const post = dbApi.getPost(db, id);
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let replies = dbApi.getThreadReplies(db, id);
  const refresh =
    new URL(req.url).searchParams.get("refresh") === "1" ||
    (post.replyCount > 0 && replies.length < Math.min(post.replyCount, 3));

  if (refresh) {
    try {
      const session = getSession();
      if (session?.accessToken) {
        const client = getAuthProvider().createClient();
        await refreshThreadReplies(client, db, session.accessToken, id, {
          sessionCookie: session.sessionCookie,
        });
        replies = dbApi.getThreadReplies(db, id);
      }
    } catch (err) {
      console.warn("thread refresh failed:", err);
    }
  }

  const { mentionUsers, mentionChannels } = dbApi.getMentionMaps(db, [
    post.text,
    ...replies.map((r) => r.text),
  ]);

  return NextResponse.json({
    postId: id,
    replyCount: post.replyCount,
    replies,
    mentionUsers,
    mentionChannels,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const session = getSession();
  if (!session?.userId || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  const id = decodeURIComponent(rawId);
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  }

  const db = getDb();
  const post = dbApi.getPost(db, id);
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const client = getAuthProvider().createClient();
    const result = await postThreadReply(client, db, id, text, session.userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const replies = dbApi.getThreadReplies(db, id);
    const { mentionUsers, mentionChannels } = dbApi.getMentionMaps(db, [
      post.text,
      ...replies.map((r) => r.text),
    ]);
    const profile = dbApi.getUserProfile(db, session.userId);

    return NextResponse.json({
      ok: true,
      replyId: result.replyId,
      replies,
      mentionUsers,
      mentionChannels,
      reply: {
        id: result.replyId,
        text,
        userId: session.userId,
        displayName: profile?.displayName ?? "You",
        avatarUrl: profile?.avatarUrl ?? null,
        reactionCount: 0,
        postedAt: Date.now(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post reply" },
      { status: 500 },
    );
  }
}
