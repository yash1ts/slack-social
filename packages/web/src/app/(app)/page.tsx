import { dbApi, getDb } from "@/lib/db";
import { FeedClient } from "@/components/FeedClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ following?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const following = sp.following === "1";
  const activeTag = sp.tag || "trending";
  const isFeedMode = activeTag === "trending" || activeTag === "recent";
  const page = dbApi.getFeedPage(db, {
    sort: activeTag === "recent" ? "recent" : "trending",
    following,
    tag: isFeedMode ? undefined : activeTag,
    limit: PAGE_SIZE + 1,
    offset: 0,
  });
  const hasMore = page.posts.length > PAGE_SIZE;
  const posts = hasMore ? page.posts.slice(0, PAGE_SIZE) : page.posts;
  let dividerAfterIndex = page.dividerAfterIndex;
  if (dividerAfterIndex != null && dividerAfterIndex >= posts.length) {
    dividerAfterIndex = posts.length > 0 ? posts.length - 1 : null;
  }

  return (
    <FeedClient
      initialPosts={posts}
      initialHasMore={hasMore}
      initialDividerAfterIndex={dividerAfterIndex}
      initialHasMoreHistory={page.hasMoreHistory}
      pageSize={PAGE_SIZE}
      following={following}
      activeTag={activeTag}
    />
  );
}
