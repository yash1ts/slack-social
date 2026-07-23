"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DmConversation } from "@slack-social/shared";
import { timeAgo } from "@/lib/utils";
import { mrkdwnPlainText } from "@/lib/mrkdwn";

export function DmInbox() {
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dms");
        const data = (await res.json()) as {
          conversations?: DmConversation[];
          error?: string;
        };
        if (!cancelled) {
          setConversations(data.conversations ?? []);
          if (!res.ok) setError(data.error ?? "Failed to load messages");
        }
      } catch {
        if (!cancelled) setError("Failed to load messages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  c.avatarUrl ||
                  `https://api.dicebear.com/9.x/initials/svg?seed=${c.name}`
                }
                alt=""
                className="h-14 w-14 shrink-0 rounded-full object-cover"
              />
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
    </ul>
  );
}
