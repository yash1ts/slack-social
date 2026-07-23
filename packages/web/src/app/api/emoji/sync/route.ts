import { NextResponse } from "next/server";
import { getAuthProvider, getSession, isLoggedIn } from "@/lib/auth";
import { dbApi, getDb } from "@/lib/db";
import { ensureEmojiCatalog } from "../../../../../../cli/src/slack/emoji-sync";

export const dynamic = "force-dynamic";

/** Sync custom emoji via Slack emoji.list and return the catalog. */
export async function POST(req: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const force = new URL(req.url).searchParams.get("force") === "1";
  const session = getSession();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No token" }, { status: 401 });
  }

  try {
    const client = getAuthProvider().createClient();
    const db = getDb();
    const result = await ensureEmojiCatalog(client, db, {
      token: session.accessToken,
      sessionCookie: session.sessionCookie,
      force,
    });
    return NextResponse.json({
      ...result,
      emoji: dbApi.getEmojiCatalog(db),
      aliases: dbApi.getEmojiAliases(db),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Emoji sync failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sync = new URL(req.url).searchParams.get("sync") === "1";
  const db = getDb();

  if (sync) {
    try {
      const session = getSession();
      if (session?.accessToken) {
        const client = getAuthProvider().createClient();
        await ensureEmojiCatalog(client, db, {
          token: session.accessToken,
          sessionCookie: session.sessionCookie,
        });
      }
    } catch (err) {
      console.warn("emoji sync on catalog get failed:", err);
    }
  }

  return NextResponse.json({
    emoji: dbApi.getEmojiCatalog(db),
    aliases: dbApi.getEmojiAliases(db),
  });
}
