import Link from "next/link";
import { dbApi, getDb } from "@/lib/db";
import { PostCard } from "@/components/PostCard";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const tags = dbApi.listTags(db, 24);
  const posts = sp.tag
    ? dbApi.getFeed(db, { tag: sp.tag, limit: 40 })
    : sp.q
      ? dbApi.searchPosts(db, sp.q, 40)
      : [];

  return (
    <div>
      <header className="sticky top-0 z-40 space-y-3 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">Search</h1>
        <form>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search posts, people, channels"
            className="w-full rounded-xl border border-[var(--border)] bg-[#141414] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </form>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Link
              key={t.name}
              href={`/search?tag=${encodeURIComponent(t.name)}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                sp.tag === t.name
                  ? "border-white text-white"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              #{t.name} · {t.count}
            </Link>
          ))}
        </div>
      </header>
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      {!posts.length && (sp.q || sp.tag) ? (
        <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">No matches</p>
      ) : null}
    </div>
  );
}
