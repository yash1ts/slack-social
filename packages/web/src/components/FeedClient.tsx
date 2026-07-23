"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import type { FeedPost } from "@slack-social/shared";
import { FEED_MODES, TagsBar } from "@/components/TagsBar";
import { PostCard } from "@/components/PostCard";
import { IndexingStatus } from "@/components/IndexingStatus";

const ComposeSheet = dynamic(
  () => import("@/components/ComposeSheet").then((m) => ({ default: m.ComposeSheet })),
  { ssr: false },
);

type FeedPageResponse = {
  posts: FeedPost[];
  nextOffset: number | null;
  hasMore: boolean;
  caughtUp?: boolean;
  unreadCount?: number;
  dividerAfterIndex?: number | null;
  hasMoreHistory?: boolean;
};

export function FeedClient({
  initialPosts,
  initialHasMore,
  initialDividerAfterIndex,
  initialHasMoreHistory,
  pageSize,
  following,
  activeTag,
}: {
  initialPosts: FeedPost[];
  initialHasMore: boolean;
  initialDividerAfterIndex?: number | null;
  initialHasMoreHistory?: boolean;
  pageSize: number;
  following: boolean;
  activeTag: string;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialHasMore ? initialPosts.length : null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dividerAfterIndex, setDividerAfterIndex] = useState<number | null>(
    initialDividerAfterIndex ?? null,
  );
  const [hasMoreHistory, setHasMoreHistory] = useState(initialHasMoreHistory ?? false);
  const [backfilling, setBackfilling] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [followingSoon, setFollowingSoon] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const markedViewedRef = useRef(false);
  const isFeedMode = FEED_MODES.has(activeTag);

  const buildParams = useCallback(
    (offset: number, markViewed = false) => {
      const params = new URLSearchParams();
      params.set("sort", activeTag === "recent" ? "recent" : "trending");
      params.set("limit", String(pageSize));
      params.set("offset", String(offset));
      if (following) params.set("following", "1");
      if (!isFeedMode) params.set("tag", activeTag);
      if (markViewed) params.set("markViewed", "1");
      return params;
    },
    [activeTag, following, isFeedMode, pageSize],
  );

  const refreshFeed = useCallback(async () => {
    try {
      const res = await fetch(`/api/feed?${buildParams(0).toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as FeedPageResponse;
      setPosts(data.posts);
      setHasMore(data.hasMore);
      setNextOffset(data.nextOffset);
      setDividerAfterIndex(data.dividerAfterIndex ?? null);
      setHasMoreHistory(Boolean(data.hasMoreHistory));
    } catch {
      /* ignore */
    }
  }, [buildParams]);

  const requestBackfill = useCallback(async (): Promise<boolean> => {
    if (backfilling) return false;
    setBackfilling(true);
    try {
      const res = await fetch("/api/sync/backfill", { method: "POST" });
      if (!res.ok) return false;
      const data = (await res.json()) as { hasMoreHistory?: boolean; messagesIndexed?: number };
      setHasMoreHistory(Boolean(data.hasMoreHistory));
      return (data.messagesIndexed ?? 0) > 0 || Boolean(data.hasMoreHistory);
    } catch {
      return false;
    } finally {
      setBackfilling(false);
    }
  }, [backfilling]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;

    if (!hasMore || nextOffset == null) {
      if (!hasMoreHistory || backfilling) return;
      loadingRef.current = true;
      setLoadingMore(true);
      try {
        const gotMore = await requestBackfill();
        if (!gotMore) {
          setHasMore(false);
          setHasMoreHistory(false);
          return;
        }
        const offset = posts.length;
        const res = await fetch(`/api/feed?${buildParams(offset).toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as FeedPageResponse;
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const appended = data.posts.filter((p) => !seen.has(p.id));
          return [...prev, ...appended];
        });
        setHasMore(data.hasMore || Boolean(data.hasMoreHistory));
        setNextOffset(data.nextOffset ?? (data.hasMore ? offset + data.posts.length : null));
        setHasMoreHistory(Boolean(data.hasMoreHistory));
      } finally {
        loadingRef.current = false;
        setLoadingMore(false);
      }
      return;
    }

    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/feed?${buildParams(nextOffset).toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as FeedPageResponse;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const appended = data.posts.filter((p) => !seen.has(p.id));
        return [...prev, ...appended];
      });
      setHasMore(data.hasMore);
      setNextOffset(data.nextOffset);
      setHasMoreHistory(Boolean(data.hasMoreHistory));
    } catch {
      /* ignore */
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [
    buildParams,
    hasMore,
    nextOffset,
    hasMoreHistory,
    backfilling,
    posts.length,
    requestBackfill,
  ]);

  useEffect(() => {
    setPosts(initialPosts);
    setHasMore(initialHasMore);
    setNextOffset(initialHasMore ? initialPosts.length : null);
    setDividerAfterIndex(initialDividerAfterIndex ?? null);
    setHasMoreHistory(initialHasMoreHistory ?? false);
  }, [initialPosts, initialHasMore, initialDividerAfterIndex, initialHasMoreHistory]);

  useEffect(() => {
    if (markedViewedRef.current || posts.length === 0) return;
    markedViewedRef.current = true;
    void fetch("/api/feed/viewed", { method: "POST" });
  }, [posts.length]);

  useEffect(() => {
    const node = sentinelRef.current;
    const root = scrollRef.current;
    if (!node || !root) return;
    if (!hasMore && !hasMoreHistory) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, hasMoreHistory, loadMore]);

  const showTerminalCaughtUp = !hasMore && !hasMoreHistory && !loadingMore && !backfilling;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="z-40 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--border)] bg-[var(--bg)]/90 px-3 py-3 backdrop-blur">
        <div className="justify-self-start">
          <button
            type="button"
            aria-label="New message"
            onClick={() => setComposeOpen(true)}
            className="rounded-full p-1.5 text-[var(--text)] hover:bg-white/5"
          >
            <Plus size={22} strokeWidth={2.25} />
          </button>
        </div>
        <h1 className="justify-self-center flex items-center gap-2 text-xl font-bold tracking-tight text-white">
          <img
            src="/logo.svg"
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-[7px]"
          />
          <span className="bg-gradient-to-r from-[#f77737] via-[#e1306c] to-[#c13584] bg-clip-text text-transparent">
            slack-social
          </span>
        </h1>
        <div className="justify-self-end">
          <button
            type="button"
            onClick={() => {
              setFollowingSoon(true);
              window.setTimeout(() => setFollowingSoon(false), 1600);
            }}
            className="px-1 text-xs text-[var(--muted)]"
          >
            {followingSoon ? "Coming soon" : "Following"}
          </button>
        </div>
      </header>

      <ComposeSheet open={composeOpen} onClose={() => setComposeOpen(false)} />

      <div className="shrink-0">
        <IndexingStatus onPostsMaybeReady={refreshFeed} />
      </div>

      <div className="shrink-0">
        <TagsBar activeTag={activeTag} following={following} />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {posts.length === 0 ? (
          <div className="space-y-3 px-6 py-16 text-center">
            <p className="text-lg font-semibold">
              {isFeedMode ? "Building your feed…" : `No posts for #${activeTag}`}
            </p>
            <p className="text-sm text-[var(--muted)]">
              {isFeedMode
                ? "Pulling the last 36 hours from your public Slack channels. They will appear here shortly."
                : "Try another tag, or wait for indexing to finish."}
            </p>
          </div>
        ) : (
          <>
            {posts.map((post, index) => (
              <div key={post.id}>
                <PostCard post={post} />
                {dividerAfterIndex === index ? (
                  <div className="flex items-center gap-3 px-4 py-5">
                    <div className="h-px flex-1 bg-[var(--border)]" />
                    <p className="shrink-0 text-xs font-semibold tracking-wide text-[var(--muted)]">
                      You&apos;re All Caught Up
                    </p>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                ) : null}
              </div>
            ))}
            <div ref={sentinelRef} className="px-4 py-6 text-center text-xs text-[var(--muted)]">
              {loadingMore || backfilling
                ? backfilling
                  ? "Fetching older posts…"
                  : "Loading more…"
                : hasMore || hasMoreHistory
                  ? "Scroll for more"
                  : showTerminalCaughtUp
                    ? "You're All Caught Up"
                    : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
