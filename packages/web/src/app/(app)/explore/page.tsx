import { dbApi, getDb } from "@/lib/db";
import { ExploreGrid } from "@/components/ExploreGrid";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const db = getDb();
  const posts = dbApi.getExplore(db, 60);

  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">Explore</h1>
        <p className="text-xs text-[var(--muted)]">Top media & trending public posts</p>
      </header>
      <ExploreGrid posts={posts} emptyMessage="No trending posts yet. Check back after syncing." />
    </div>
  );
}
