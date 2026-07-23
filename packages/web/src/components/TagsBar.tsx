import Link from "next/link";
import { cn } from "@/lib/utils";

export const FEED_TAGS = [
  { id: "recent", label: "Recent" },
  { id: "trending", label: "Trending" },
  { id: "engineering", label: "Engineering" },
  { id: "design", label: "Design" },
  { id: "culture", label: "Culture" },
  { id: "productivity", label: "Productivity" },
  { id: "wins", label: "Wins" },
  { id: "events", label: "Events" },
  { id: "announcement", label: "Announcement" },
] as const;

export type FeedTagId = (typeof FEED_TAGS)[number]["id"];

/** Special feed modes that aren't content tags */
export const FEED_MODES = new Set(["recent", "trending"]);

function hrefForTag(tagId: string, following: boolean) {
  const params = new URLSearchParams();
  if (following) params.set("following", "1");
  if (tagId !== "trending") params.set("tag", tagId);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function TagsBar({
  activeTag = "trending",
  following = false,
}: {
  activeTag?: string;
  following?: boolean;
}) {
  const current = activeTag || "trending";

  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto border-b border-[var(--border)] px-3 py-3">
      {FEED_TAGS.map((tag) => {
        const active = current === tag.id;
        return (
          <Link
            key={tag.id}
            href={hrefForTag(tag.id, following)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-transparent bg-gradient-to-r from-[#f77737] via-[#e1306c] to-[#c13584] text-white"
                : "border-[var(--border)] bg-[#141414] text-[var(--muted)] hover:border-[#404040] hover:text-white",
            )}
          >
            {tag.label}
          </Link>
        );
      })}
    </div>
  );
}
