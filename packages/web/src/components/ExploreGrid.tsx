import Link from "next/link";
import type { FeedPost } from "@slack-social/shared";
import { mrkdwnPlainText } from "@/lib/mrkdwn";
import { truncate } from "@/lib/utils";

export function ExploreGrid({
  posts,
  emptyMessage = "No posts to show yet.",
}: {
  posts: FeedPost[];
  emptyMessage?: string;
}) {
  if (!posts.length) {
    return (
      <div className="px-4 py-10 text-center text-sm text-[var(--muted)]">{emptyMessage}</div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-[2px]">
      {posts.map((p) => {
        const image = p.attachments.find((a) => a.mimetype?.startsWith("image/"));
        const preview = truncate(mrkdwnPlainText(p.text ?? ""), 90);
        return (
          <Link
            key={p.id}
            href={`/p/${encodeURIComponent(p.id)}`}
            className="relative aspect-square overflow-hidden bg-[#141414]"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${image.id}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full flex-col justify-end bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] p-2">
                <span className="text-[10px] text-[var(--muted)]">#{p.channelName}</span>
                <span className="line-clamp-4 text-xs leading-snug">{preview}</span>
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
