import { USER_SCOPES } from "@slack-social/shared";
import { clearSession, readCredentials, resolveClientCredentials } from "../config";
import { stopSyncBackground } from "../slack/sync-runner";
import { runLocalOAuth } from "../slack/oauth";

export async function authLogin(): Promise<void> {
  const creds = resolveClientCredentials();
  if (!creds) {
    console.error(`
Slack app credentials not found.

1. Create an app from app-manifest.json at https://api.slack.com/apps
2. Open http://localhost:3000 and paste Client ID / Secret on the login page
   (or set SLACK_CLIENT_ID / SLACK_CLIENT_SECRET in the environment)
`);
    throw new Error("Missing Slack Client ID / Client Secret");
  }

  const existing = readCredentials();
  if (existing?.accessToken) {
    console.log(`Already authenticated as user ${existing.userId} (team ${existing.teamId}).`);
    console.log("Re-running OAuth to refresh…");
  }

  console.log(`User scopes: ${USER_SCOPES.join(", ")}`);
  console.log("\nTip: you can also click Login with Slack at http://localhost:3000\n");

  const result = await runLocalOAuth(creds);
  console.log(`\nAuthenticated! User ${result.userId} · Team ${result.teamId}`);
  console.log("Token saved to ~/.slack-social/credentials.json");
}

export async function authLogout(): Promise<void> {
  stopSyncBackground();
  clearSession();
  console.log(
    "Logged out. Removed session (~/.slack-social/credentials.json).\n" +
      "Kept local index: db, media, and emoji cache under ~/.slack-social/",
  );
}
