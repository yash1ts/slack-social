"use client";

import type { ReactionSummary } from "@slack-social/shared";
import { MessageCircle } from "lucide-react";
import { SlackEmoji } from "./Emoji";

export function ReactionBar({
  reactions,
  replyCount,
  onOpenReplies,
}: {
  reactions: ReactionSummary[];
  replyCount: number;
  onOpenReplies?: () => void;
}) {
  const shown = reactions.filter((r) => r.count > 0);
  if (shown.length === 0 && replyCount <= 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
      {replyCount > 0 ? (
        <button
          type="button"
          onClick={onOpenReplies}
          className="inline-flex items-center gap-1 text-[13px] text-[var(--muted)]"
        >
          <MessageCircle size={16} />
          {replyCount}
        </button>
      ) : null}
      {shown.map((r) => (
        <span
          key={r.name}
          className="inline-flex items-center gap-1 rounded-full border border-[#333] bg-[#1a1d21] px-2 py-0.5 text-[13px] text-[#d1d2d3]"
          title={`:${r.name}:`}
        >
          <SlackEmoji name={r.name} size={16} />
          <span className="tabular-nums text-[12px] text-[#ababad]">{r.count}</span>
        </span>
      ))}
    </div>
  );
}
