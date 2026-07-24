"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DmConversation } from "@slack-social/shared";
import { timeAgo } from "@/lib/utils";
import { mrkdwnPlainText } from "@/lib/mrkdwn";
import { DmAvatar } from "./DmAvatar";

const PAGE_SIZE = 12;

type DmPage = {
  conversations?: DmConversation[];
  nextOffset?: number | null;
  hasMore?: boolean;
  error?: string;
};

export function DmInbox() {
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLLIElement>(null);

  const fetchPage = useCallback(async (offset: number) => {
    const res = await fetch(`/api/dms?limit=${PAGE_SIZE}&offset=${offset}`);
    const data = (await res.json()) as DmPage;
    return { res, data };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { res, data } = await fetchPage(0);
        if (cancelled) return;
        setConversations(data.conversations ?? []);
        setHasMore(Boolean(data.hasMore));
        setNextOffset(data.nextOffset ?? null);
        if (!res.ok) setError(data.error ?? "Failed to load messages");
      } catch {
        if (!cancelled) setError("Failed to load messages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || nextOffset == null) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const { res, data } = await fetchPage(nextOffset);
      if (!res.ok) return;
      setConversations((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const appended = (data.conversations ?? []).filter((c) => !seen.has(c.id));
        return [...prev, ...appended];
      });
      setHasMore(Boolean(data.hasMore));
      setNextOffset(data.nextOffset ?? null);
    } catch {
      /* ignore */
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, nextOffset]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, conversations.length]);

  if (loading) {
    return (
      <div className="px-4 py-16 text-center text-sm text-[var(--muted)]">Loading messages…</div>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <div className="space-y-2 px-6 py-16 text-center">
        <p className="text-sm text-red-300">{error}</p>
        <p className="text-xs text-[var(--muted)]">
          Browser session login usually works. For OAuth apps, add im/mpim scopes and re-auth.
        </p>
      </div>
    );
  }

  if (!conversations.length) {
    return (
      <div className="px-6 py-16 text-center text-sm text-[var(--muted)]">
        No direct messages yet.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {conversations.map((c) => {
        const preview = c.lastMessage
          ? mrkdwnPlainText(c.lastMessage).slice(0, 80)
          : "No messages yet";
        return (
          <li key={c.id}>
            <Link
              href={`/messages/${encodeURIComponent(c.id)}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
            >
              <DmAvatar conversation={c} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{c.name}</span>
                  {c.lastMessageAt ? (
                    <span className="shrink-0 text-[11px] text-[var(--muted)]">
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-sm text-[var(--muted)]">{preview}</p>
              </div>
            </Link>
          </li>
        );
      })}
      {hasMore ? (
        <li
          ref={sentinelRef}
          className="px-4 py-4 text-center text-xs text-[var(--muted)]"
          aria-hidden
        >
          {loadingMore ? "Loading more…" : ""}
        </li>
      ) : null}
    </ul>
  );
}
