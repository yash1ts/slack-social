"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import type { FeedPost, FeedReply } from "@slack-social/shared";
import { SlackText } from "./SlackText";
import { timeAgo } from "@/lib/utils";

type ThreadResponse = {
  postId: string;
  replyCount: number;
  replies: FeedReply[];
  mentionUsers: FeedPost["mentionUsers"];
  mentionChannels: FeedPost["mentionChannels"];
};

type Viewer = {
  displayName: string;
  avatarUrl: string | null;
};

export function ThreadSheet({
  post,
  open,
  onClose,
}: {
  post: FeedPost;
  open: boolean;
  onClose: () => void;
}) {
  const [replies, setReplies] = useState<FeedReply[]>(post.topReplies);
  const [mentionUsers, setMentionUsers] = useState(post.mentionUsers);
  const [mentionChannels, setMentionChannels] = useState(post.mentionChannels);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSendError(null);
    setDraft("");
    setReplies(post.topReplies);
    setMentionUsers(post.mentionUsers);
    setMentionChannels(post.mentionChannels);

    (async () => {
      try {
        const res = await fetch(
          `/api/posts/${encodeURIComponent(post.id)}/replies?refresh=1`,
        );
        if (!res.ok) throw new Error("Failed to load replies");
        const data = (await res.json()) as ThreadResponse;
        if (cancelled) return;
        setReplies(data.replies);
        setMentionUsers(data.mentionUsers);
        setMentionChannels(data.mentionChannels);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load replies");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally only refetch when sheet opens for a given post
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile?: { displayName?: string; avatarUrl?: string | null };
        };
        if (cancelled || !data.profile) return;
        setViewer({
          displayName: data.profile.displayName ?? "You",
          avatarUrl: data.profile.avatarUrl ?? null,
        });
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || loading) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, loading, replies.length]);

  const canPost = draft.trim().length > 0 && !sending;

  async function submitReply(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(post.id)}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as {
        error?: string;
        replies?: FeedReply[];
        reply?: FeedReply;
        mentionUsers?: FeedPost["mentionUsers"];
        mentionChannels?: FeedPost["mentionChannels"];
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to post");

      if (data.replies) setReplies(data.replies);
      else if (data.reply) setReplies((prev) => [...prev, data.reply!]);
      if (data.mentionUsers) setMentionUsers(data.mentionUsers);
      if (data.mentionChannels) setMentionChannels(data.mentionChannels);
      setDraft("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setSending(false);
    }
  }

  if (!open || !mounted) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    setDragY(0);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current == null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    setDragY(dy);
  };

  const onPointerUp = () => {
    if (dragY > 120) onClose();
    dragStartY.current = null;
    setDragY(0);
  };

  const avatarSrc =
    viewer?.avatarUrl ||
    `https://api.dicebear.com/9.x/initials/svg?seed=${viewer?.displayName ?? "You"}`;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close replies"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity"
        style={{ opacity: Math.max(0.25, 1 - dragY / 320) }}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Thread replies"
        className="relative z-[81] flex max-h-[78dvh] w-full max-w-[470px] flex-col rounded-t-2xl border border-[var(--border)] border-b-0 bg-[var(--surface)] shadow-[0_-12px_40px_rgba(0,0,0,0.45)]"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragStartY.current == null ? "transform 0.2s ease-out" : "none",
        }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mt-2 h-1 w-10 rounded-full bg-[#3a3a3a]" />
          <div className="flex w-full items-center justify-between px-4 pb-2 pt-3">
            <h2 className="text-[15px] font-semibold">Replies</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-[var(--muted)] hover:bg-white/5"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {loading && replies.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--muted)]">
              Loading replies…
            </div>
          ) : error && replies.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--muted)]">{error}</div>
          ) : replies.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--muted)]">
              No replies yet. Be the first to comment.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)] pb-2">
              {replies.map((r) => (
                <li key={r.id} className="flex gap-3 px-4 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      r.avatarUrl ||
                      `https://api.dicebear.com/9.x/initials/svg?seed=${r.displayName}`
                    }
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <Link
                        href={`/u/${r.userId}`}
                        className="font-semibold"
                        onClick={onClose}
                      >
                        {r.displayName}
                      </Link>
                      <span className="text-xs text-[var(--muted)]">
                        {timeAgo(r.postedAt)}
                      </span>
                    </div>
                    <SlackText
                      text={r.text}
                      muted
                      className="mt-1 text-sm"
                      mentionUsers={mentionUsers}
                      mentionChannels={mentionChannels}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {loading && replies.length > 0 ? (
            <div className="px-4 pb-4 text-center text-xs text-[var(--muted)]">
              Refreshing…
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          {sendError ? (
            <p className="mb-1.5 px-1 text-xs text-red-400">{sendError}</p>
          ) : null}
          <form onSubmit={submitReply} className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarSrc}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--border)] bg-[#0f0f0f] px-3.5 py-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
                disabled={sending}
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!canPost}
                className="shrink-0 text-sm font-semibold text-[#3897f0] disabled:opacity-30"
              >
                {sending ? "…" : "Post"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
