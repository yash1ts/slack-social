import { NextResponse } from "next/server";
import { getAuthProvider, getSession, isLoggedIn } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function messageTsFromPostId(postId: string, channelId: string): string | null {
  const prefix = `${channelId}:`;
  if (postId.startsWith(prefix)) return postId.slice(prefix.length);
  const parts = postId.split(":");
  if (parts.length >= 2) return parts.slice(1).join(":");
  return null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const session = getSession();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  const id = decodeURIComponent(rawId);
  const db = getDb();

  const row = db
    .query("SELECT id, channel_id as channelId, ts, permalink FROM posts WHERE id = ?")
    .get(id) as
    | { id: string; channelId: string; ts: string; permalink: string | null }
    | null;

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (row.permalink) {
    return NextResponse.json({ permalink: row.permalink });
  }

  const ts = row.ts || messageTsFromPostId(id, row.channelId);
  if (!ts) {
    return NextResponse.json({ error: "Missing message timestamp" }, { status: 400 });
  }

  try {
    const client = getAuthProvider().createClient();
    const res = await client.chat.getPermalink({
      channel: row.channelId,
      message_ts: ts,
    });
    if (!res.ok || !res.permalink) {
      return NextResponse.json(
        { error: res.error ?? "Could not resolve Slack link" },
        { status: 400 },
      );
    }

    db.run("UPDATE posts SET permalink = ? WHERE id = ?", [res.permalink, id]);
    return NextResponse.json({ permalink: res.permalink });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get permalink" },
      { status: 500 },
    );
  }
}
