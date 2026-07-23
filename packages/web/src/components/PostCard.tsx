"use client";

import { useState } from "react";
import Link from "next/link";
import type { FeedPost } from "@slack-social/shared";
import { timeAgo } from "@/lib/utils";
import { ReactionBar } from "./ReactionBar";
import { SlackText } from "./SlackText";
import { PostMenu } from "./PostMenu";
import { useOpenThread } from "./ThreadSheetProvider";

export function PostCard({ post, full }: { post: FeedPost; full?: boolean }) {
  const openThread = useOpenThread();
  const image = post.attachments.find((a) => a.mimetype?.startsWith("image/"));
  const openReplies = () => openThread(post);

  return (
    <article className="border-b border-[var(--border)] pb-2">
      <header className="flex items-center gap-3 px-3 py-3">
        <Link href={`/u/${post.userId}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              post.avatarUrl ||
              `https://api.dicebear.com/9.x/initials/svg?seed=${post.displayName}`
            }
            alt={post.displayName}
            className="h-9 w-9 rounded-full object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/u/${post.userId}`} className="truncate font-semibold">
              {post.displayName}
            </Link>
            <span className="rounded bg-[#1c1c1c] px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
              #{post.channelName}
            </span>
          </div>
          <div className="text-xs text-[var(--muted)]">{timeAgo(post.postedAt)}</div>
        </div>
        <PostMenu postId={post.id} permalink={post.permalink} />
      </header>

      {image ? (
        <button type="button" onClick={openReplies} className="block w-full text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/media/${image.id}`}
            alt={image.title ?? "attachment"}
            loading="lazy"
            className="max-h-[520px] w-full object-cover"
          />
        </button>
      ) : null}

      {post.text ? (
        <div className="px-3">
          <SlackText
            text={post.text}
            maxWords={full ? undefined : 30}
            mentionUsers={post.mentionUsers}
            mentionChannels={post.mentionChannels}
          />
        </div>
      ) : null}

      <ReactionBar
        reactions={post.reactions}
        replyCount={post.replyCount}
        onOpenReplies={openReplies}
      />
    </article>
  );
}
