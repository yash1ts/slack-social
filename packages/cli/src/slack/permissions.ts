import type { PermissionCheckResult } from "@slack-social/shared";
import type { SlackAuthProvider } from "./auth-provider";

function slackErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { data?: { error?: string }; message?: string };
    if (e.data?.error) return e.data.error;
    if (e.message) return e.message;
  }
  return err instanceof Error ? err.message : String(err);
}

function capabilityFromError(error: string): string {
  switch (error) {
    case "missing_scope":
      return "channels:read / channels:history (missing_scope)";
    case "not_allowed_token_type":
      return "Web API access (token type not allowed — xapp Socket Mode tokens cannot index)";
    case "invalid_auth":
    case "token_revoked":
    case "account_inactive":
    case "not_authed":
      return "valid authentication";
    default:
      return error;
  }
}

/**
 * Probe Slack after login: auth.test + conversations.list (+ optional users.info).
 * Same capability checks for OAuth user, bot, session, and env tokens.
 */
export async function checkPermissions(provider: SlackAuthProvider): Promise<PermissionCheckResult> {
  const creds = provider.getCredentials();
  const missingCapabilities: string[] = [];
  let teamId = creds.teamId || undefined;
  let teamName = creds.teamName;
  let userId = creds.userId || undefined;
  let channelCount = 0;

  if (creds.accessToken.startsWith("xapp-")) {
    return {
      ok: false,
      authKind: creds.authKind,
      channelCount: 0,
      missingCapabilities: [
        "Web API access (Socket Mode app tokens cannot list channels or history)",
      ],
      error:
        "Socket Mode app tokens (xapp-) are not supported for indexing. Use a bot, user OAuth, or browser session token.",
    };
  }

  const client = provider.createClient();

  try {
    const auth = await client.auth.test();
    if (!auth.ok) {
      return {
        ok: false,
        authKind: creds.authKind,
        channelCount: 0,
        missingCapabilities: ["valid authentication"],
        error: "auth.test failed",
      };
    }
    teamId = (auth.team_id as string | undefined) ?? teamId;
    teamName = (auth.team as string | undefined) ?? teamName;
    userId = (auth.user_id as string | undefined) ?? userId;
  } catch (err) {
    const error = slackErrorMessage(err);
    return {
      ok: false,
      authKind: creds.authKind,
      teamId,
      teamName,
      userId,
      channelCount: 0,
      missingCapabilities: [capabilityFromError(error)],
      error,
    };
  }

  try {
    const listed = await client.conversations.list({
      types: "public_channel",
      exclude_archived: true,
      limit: 200,
    });
    channelCount = listed.channels?.length ?? 0;
    if (channelCount === 0) {
      missingCapabilities.push("access to at least one public channel");
    }
  } catch (err) {
    const error = slackErrorMessage(err);
    missingCapabilities.push(
      error === "missing_scope"
        ? "channels:read (list public channels)"
        : capabilityFromError(error),
    );
    return {
      ok: false,
      authKind: creds.authKind,
      teamId,
      teamName,
      userId,
      channelCount: 0,
      missingCapabilities,
      error,
    };
  }

  if (userId) {
    try {
      await client.users.info({ user: userId });
    } catch {
      // Soft failure — indexing can continue without users.info
    }
  }

  const ok = channelCount > 0 && missingCapabilities.length === 0;
  return {
    ok,
    authKind: creds.authKind,
    teamId,
    teamName,
    userId,
    channelCount,
    missingCapabilities,
    error: ok ? undefined : missingCapabilities.join("; ") || "permission check failed",
  };
}
