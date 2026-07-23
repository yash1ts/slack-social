import Link from "next/link";
import { notFound } from "next/navigation";
import { dbApi, getDb } from "@/lib/db";
import { PostCard } from "@/components/PostCard";
import { SlackText } from "@/components/SlackText";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const id = decodeURIComponent(postId);
  const db = getDb();
  const post = dbApi.getPost(db, id);
  if (!post) notFound();
  const replies = dbApi.getThreadReplies(db, id);
  const { mentionUsers, mentionChannels } = dbApi.getMentionMaps(db, [
    post.text,
    ...replies.map((r) => r.text),
  ]);

  return (
    <div>
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-sm text-[var(--muted)]">
          ← Back
        </Link>
        <h1 className="font-semibold">Thread</h1>
      </header>
      <PostCard
        post={{ ...post, mentionUsers, mentionChannels }}
        full
      />
      <div className="divide-y divide-[var(--border)]">
        {replies.map((r) => (
          <div key={r.id} className="flex gap-3 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                r.avatarUrl ||
                `https://api.dicebear.com/9.x/initials/svg?seed=${r.displayName}`
              }
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <Link href={`/u/${r.userId}`} className="font-semibold">
                  {r.displayName}
                </Link>
                <span className="text-xs text-[var(--muted)]">{timeAgo(r.postedAt)}</span>
              </div>
              <SlackText
                text={r.text}
                muted
                className="mt-1 text-sm"
                mentionUsers={mentionUsers}
                mentionChannels={mentionChannels}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
