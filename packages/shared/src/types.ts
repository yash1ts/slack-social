export type AuthKind =
  | "user_oauth"
  | "browser_session"
  | "bot"
  | "env_token"
  /** Local trial session with seeded dummy data — never calls Slack APIs */
  | "demo";

export type Credentials = {
  accessToken: string;
  teamId: string;
  userId: string;
  clientId: string;
  obtainedAt: number;
  /** Browser session cookie value (`d` / xoxd-…) used with xoxc tokens */
  sessionCookie?: string;
  authKind: AuthKind;
  teamName?: string;
  scopes?: string[];
};

export function inferAuthKind(token: string, opts?: { fromEnv?: boolean }): AuthKind {
  if (opts?.fromEnv) return "env_token";
  if (token.startsWith("xoxdemo-")) return "demo";
  if (token.startsWith("xoxc-")) return "browser_session";
  if (token.startsWith("xoxb-")) return "bot";
  if (token.startsWith("xoxp-")) return "user_oauth";
  // OAuth user tokens sometimes omit a stable prefix in older installs
  return "user_oauth";
}

export function isDemoCredentials(creds: { authKind?: AuthKind; accessToken?: string }): boolean {
  return (
    creds.authKind === "demo" ||
    Boolean(creds.accessToken?.startsWith("xoxdemo-"))
  );
}

export function normalizeCredentials(
  creds: Omit<Credentials, "authKind"> & { authKind?: AuthKind },
): Credentials {
  return {
    ...creds,
    authKind: creds.authKind ?? inferAuthKind(creds.accessToken),
  };
}

export type PermissionCheckResult = {
  ok: boolean;
  teamId?: string;
  teamName?: string;
  userId?: string;
  authKind?: AuthKind;
  channelCount: number;
  missingCapabilities: string[];
  error?: string;
};

export type SyncPhase = "fast_forward" | "delta" | "backfill" | "bootstrap" | "full";

export type SyncStatus =
  | "idle"
  | "starting"
  | "running"
  | "bootstrap_done"
  | "fast_forward_done"
  | "complete"
  | "error";

export type SyncProgress = {
  phase: SyncPhase | null;
  status: SyncStatus;
  channelsTotal: number;
  channelsDone: number;
  currentChannel?: string;
  messagesIndexed: number;
  startedAt: number | null;
  finishedAt?: number | null;
  error?: string;
  hasPosts?: boolean;
};

export type AppConfig = {
  clientId?: string;
  clientSecret?: string;
  oauthPort?: number;
  lastSyncAt?: number;
  /** Last successful emoji.list catalog sync */
  lastEmojiSyncAt?: number;
  lastPermissionCheck?: PermissionCheckResult;
};

export type ReactionSummary = {
  name: string;
  count: number;
};

export type FeedReply = {
  id: string;
  text: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  reactionCount: number;
  postedAt: number;
};

export type FeedAttachment = {
  id: string;
  mimetype: string | null;
  title: string | null;
  localPath: string | null;
  width: number | null;
  height: number | null;
};

export type FeedPost = {
  id: string;
  channelId: string;
  channelName: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  text: string | null;
  permalink: string | null;
  replyCount: number;
  reactionCount: number;
  hasMedia: boolean;
  score: number;
  postedAt: number;
  reactions: ReactionSummary[];
  attachments: FeedAttachment[];
  topReplies: FeedReply[];
  /** Resolved `<@U…>` mention id → display name */
  mentionUsers?: Record<string, string>;
  /** Resolved `<#C…>` mention id → channel name */
  mentionChannels?: Record<string, string>;
};

export type UserProfile = {
  id: string;
  displayName: string;
  realName: string | null;
  avatarUrl: string | null;
  title: string | null;
  /** Slack profile email when visible to the authed user */
  email?: string | null;
  /** About me / bio / role description when set */
  about?: string | null;
  /** Phone number when set on the Slack profile */
  phone?: string | null;
  statusText?: string | null;
  statusEmoji?: string | null;
  reactionsEarned: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  postCount: number;
};

export type DmConversation = {
  id: string;
  kind: "im" | "mpim";
  name: string;
  avatarUrl: string | null;
  userId?: string;
  lastMessage: string | null;
  lastMessageAt: number | null;
  unread?: boolean;
};

export type DmMessage = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  text: string | null;
  postedAt: number;
  isMine: boolean;
};

export type StoryItem = {
  id: string;
  kind: "user" | "channel";
  label: string;
  avatarUrl: string | null;
  trending: boolean;
};

export const USER_SCOPES = [
  "channels:history",
  "channels:read",
  "users:read",
  "users:read.email",
  "users.profile:read",
  "reactions:read",
  "emoji:read",
  "files:read",
  "files:write",
  "im:history",
  "im:read",
  "mpim:history",
  "mpim:read",
  "chat:write",
] as const;

export const OAUTH_REDIRECT_PORT = 53682;
export const OAUTH_REDIRECT_URI = `http://127.0.0.1:${OAUTH_REDIRECT_PORT}/callback`;
/** Web UI OAuth callback (primary login flow) */
export const WEB_OAUTH_REDIRECT_URI = "http://localhost:3000/api/auth/callback";
