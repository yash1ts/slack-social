import type { UserProfile } from "@slack-social/shared";
import { getAuthProvider, getSession } from "@/lib/auth";
import { dbApi, getDb } from "@/lib/db";
import { fetchAndCacheSlackProfile } from "../../../cli/src/slack/profile";

/**
 * Prefer live Slack profile (users.info / users.profile.get), cache to SQLite,
 * then return the enriched UserProfile used by the UI.
 */
export async function resolveUserProfile(
  userId: string,
  extras?: {
    statusText?: string | null;
    statusEmoji?: string | null;
    email?: string | null;
    about?: string | null;
    phone?: string | null;
  },
): Promise<UserProfile | null> {
  const db = getDb();

  try {
    const provider = getAuthProvider();
    const client = provider.createClient();
    const live = await fetchAndCacheSlackProfile(client, db, userId);
    if (live) {
      extras = {
        statusText: live.statusText,
        statusEmoji: live.statusEmoji,
        email: live.email,
        about: live.about,
        phone: live.phone,
      };
    }
  } catch {
    // Fall through to DB — e.g. offline / missing scopes
  }

  const profile = dbApi.getUserProfile(db, userId);
  if (!profile) {
    // Build a minimal profile from session if this is the viewer and Slack failed
    const session = getSession();
    if (session?.userId === userId) {
      return {
        id: userId,
        displayName: session.userId,
        realName: null,
        avatarUrl: null,
        title: null,
        email: extras?.email ?? null,
        about: extras?.about ?? null,
        phone: extras?.phone ?? null,
        statusText: extras?.statusText ?? null,
        statusEmoji: extras?.statusEmoji ?? null,
        reactionsEarned: 0,
        followerCount: 0,
        followingCount: 0,
        isFollowing: false,
        postCount: 0,
      };
    }
    return null;
  }

  return {
    ...profile,
    email: extras?.email ?? profile.email ?? null,
    about: extras?.about ?? profile.about ?? null,
    phone: extras?.phone ?? profile.phone ?? null,
    statusText: extras?.statusText ?? profile.statusText ?? null,
    statusEmoji: extras?.statusEmoji ?? profile.statusEmoji ?? null,
  };
}
