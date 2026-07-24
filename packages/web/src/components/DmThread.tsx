"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { DmConversation, DmMessage } from "@slack-social/shared";
import { SlackText } from "./SlackText";
import { DmAvatar } from "./DmAvatar";
import { timeAgo } from "@/lib/utils";

export function DmThread({ channelId }: { channelId: string }) {
  const [conversation, setConversation] = useState<DmConversation | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dms/${encodeURIComponent(channelId)}`);
      const data = (await res.json()) as {
        conversation?: DmConversation;
        messages?: DmMessage[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to load conversation");
        return;
      }
      setConversation(data.conversation ?? null);
      setMessages(data.messages ?? []);
      setError(null);
    } catch {
      setError("Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    setText("");
    startTransition(async () => {
      const res = await fetch(`/api/dms/${encodeURIComponent(channelId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to send");
        setText(body);
        return;
      }
      await load();
    });
  }

  if (loading) {
    return (
      <div className="px-4 py-16 text-center text-sm text-[var(--muted)]">Loading chat…</div>
    );
  }

  if (error && !conversation) {
    return (
      <div className="space-y-3 px-6 py-16 text-center">
        <p className="text-sm text-red-300">{error}</p>
        <Link href="/messages" className="text-sm text-[var(--muted)] underline">
          Back to messages
        </Link>
      </div>
    );
  }

  return (
    <div className="relative -mb-20 flex h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/95 px-3 py-2.5 backdrop-blur">
        <Link href="/messages" className="text-sm text-[var(--muted)]">
          ←
        </Link>
        {conversation ? <DmAvatar conversation={conversation} size="sm" /> : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{conversation?.name ?? "Chat"}</h1>
          {conversation?.userId ? (
            <Link
              href={`/u/${conversation.userId}`}
              className="text-[11px] text-[var(--muted)]"
            >
              View profile
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 pb-24">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.isMine ? "flex-row-reverse" : "flex-row"}`}
          >
            {!m.isMine ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  m.avatarUrl ||
                  `https://api.dicebear.com/9.x/initials/svg?seed=${m.displayName}`
                }
                alt=""
                className="mt-1 h-7 w-7 shrink-0 rounded-full object-cover"
              />
            ) : null}
            <div
              className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                m.isMine
                  ? "rounded-br-md bg-gradient-to-br from-[#f77737] to-[#e1306c] text-white"
                  : "rounded-bl-md bg-[#1c1c1c]"
              }`}
            >
              {!m.isMine ? (
                <div className="mb-0.5 text-[11px] font-semibold text-[var(--muted)]">
                  {m.displayName}
                </div>
              ) : null}
              <SlackText
                text={m.text}
                className={`text-sm ${m.isMine ? "text-white" : ""}`}
              />
              <div
                className={`mt-1 text-[10px] ${
                  m.isMine ? "text-white/70" : "text-[var(--muted)]"
                }`}
              >
                {timeAgo(m.postedAt)}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={send}
        className="absolute bottom-0 left-0 right-0 z-40 flex gap-2 border-t border-[var(--border)] bg-[var(--bg)]/95 px-3 py-2.5 backdrop-blur"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          className="min-w-0 flex-1 rounded-full border border-[var(--border)] bg-[#141414] px-4 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          Send
        </button>
      </form>
      {error ? (
        <p className="absolute bottom-16 left-0 right-0 z-40 px-4 text-center text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
