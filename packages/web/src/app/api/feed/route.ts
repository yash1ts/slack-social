import { NextResponse } from "next/server";
import { dbApi, getDb } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 40;

export async function GET(req: Request) {
  const denied = requireAuth();
  if (denied) return denied;

  const url = new URL(req.url);
  const sort = url.searchParams.get("sort") === "recent" ? "recent" : "trending";
  const following = url.searchParams.get("following") === "1";
  const tag = url.searchParams.get("tag") ?? undefined;
  const markViewed = url.searchParams.get("markViewed") === "1";
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );

  const db = getDb();
  const page = dbApi.getFeedPage(db, { sort, following, tag, limit: limit + 1, offset });
  const hasMore = page.posts.length > limit;
  const posts = hasMore ? page.posts.slice(0, limit) : page.posts;

  let dividerAfterIndex = page.dividerAfterIndex;
  if (dividerAfterIndex != null && dividerAfterIndex >= posts.length) {
    dividerAfterIndex = posts.length > 0 ? posts.length - 1 : null;
  }

  if (markViewed && offset === 0) {
    dbApi.markFeedViewed(db);
  }

  return NextResponse.json({
    posts,
    offset,
    limit,
    nextOffset: hasMore ? offset + limit : null,
    hasMore,
    caughtUp: page.caughtUp,
    lastViewedAt: page.lastViewedAt,
    unreadCount: page.unreadCount,
    dividerAfterIndex: dividerAfterIndex,
    hasMoreHistory: page.hasMoreHistory,
  });
}
