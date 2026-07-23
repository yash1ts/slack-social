import { getSession } from "@/lib/auth";
import { dbApi, getDb } from "@/lib/db";
import { resolveUserProfile } from "@/lib/profile";
import { UserProfileView } from "@/components/UserProfile";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const creds = getSession();
  if (!creds?.userId) {
    return (
      <div className="space-y-3 px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Not signed in</h1>
        <Link href="/login" className="text-sm text-[var(--accent)]">
          Log in
        </Link>
      </div>
    );
  }

  const profile = await resolveUserProfile(creds.userId);
  if (!profile) {
    return (
      <div className="space-y-4 px-6 py-16 text-center">
        <p className="text-sm text-[var(--muted)]">Could not load your Slack profile.</p>
        <a
          href="/api/auth/logout"
          className="inline-block text-sm text-[var(--muted)] underline"
        >
          Log out
        </a>
      </div>
    );
  }

  const posts = dbApi.getUserPosts(getDb(), creds.userId, 40);
  return (
    <div>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <h1 className="text-sm font-semibold">{profile.displayName}</h1>
        <a href="/api/auth/logout" className="text-xs text-[var(--muted)] underline">
          Log out
        </a>
      </div>
      <UserProfileView profile={profile} posts={posts} isSelf />
    </div>
  );
}
