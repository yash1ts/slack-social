"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FeedPost, UserProfile } from "@slack-social/shared";
import { PostCard } from "./PostCard";

export function UserProfileView({
  profile,
  posts,
  isSelf = false,
}: {
  profile: UserProfile;
  posts: FeedPost[];
  isSelf?: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(profile.isFollowing);
  const [pending, startTransition] = useTransition();

  async function toggleFollow() {
    const method = following ? "DELETE" : "POST";
    await fetch("/api/follows", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: profile.id }),
    });
    setFollowing(!following);
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div className="flex items-start gap-4 px-4 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            profile.avatarUrl ||
            `https://api.dicebear.com/9.x/initials/svg?seed=${profile.displayName}`
          }
          alt={profile.displayName}
          className="h-20 w-20 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{profile.displayName}</h1>
          {profile.realName && profile.realName !== profile.displayName ? (
            <p className="text-sm text-[var(--muted)]">{profile.realName}</p>
          ) : null}
          {profile.title ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{profile.title}</p>
          ) : null}
          {profile.statusText || profile.statusEmoji ? (
            <p className="mt-1 text-sm">
              {profile.statusEmoji ? <span className="mr-1">{profile.statusEmoji}</span> : null}
              {profile.statusText}
            </p>
          ) : null}
          <div className="mt-3 flex gap-4 text-sm">
            <div>
              <span className="font-semibold">{profile.postCount}</span>{" "}
              <span className="text-[var(--muted)]">posts</span>
            </div>
            <div>
              <span className="font-semibold">{profile.followerCount}</span>{" "}
              <span className="text-[var(--muted)]">followers</span>
            </div>
            <div>
              <span className="font-semibold">{profile.reactionsEarned}</span>{" "}
              <span className="text-[var(--muted)]">reactions</span>
            </div>
          </div>
          {!isSelf ? (
            <button
              type="button"
              disabled={pending}
              onClick={toggleFollow}
              className="mt-3 w-full rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-60"
            >
              {following ? "Following" : "Follow"}
            </button>
          ) : null}
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[var(--muted)]">
          {isSelf
            ? "No posts of yours are in the index yet. They’ll show up as public channels sync."
            : "No posts from this person in the index yet."}
        </div>
      ) : (
        <div className="border-t border-[var(--border)]">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
