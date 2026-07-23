import { WebClient } from "@slack/web-api";
import { readCredentials } from "../config";
import type { Credentials } from "@slack-social/shared";

export function slackAuthHeaders(creds: Pick<Credentials, "accessToken" | "sessionCookie">): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.accessToken}`,
  };
  if (creds.sessionCookie) {
    const raw = creds.sessionCookie.trim();
    headers.Cookie = raw.startsWith("d=") ? raw : `d=${raw}`;
  }
  return headers;
}

export function createSlackClient(token?: string, sessionCookie?: string): WebClient {
  const stored = readCredentials();
  const accessToken = token ?? stored?.accessToken;
  const cookie = sessionCookie ?? stored?.sessionCookie;
  if (!accessToken) {
    throw new Error(
      "Not authenticated. Open http://localhost:3000 and log in.",
    );
  }
  return new WebClient(accessToken, {
    headers: cookie
      ? { Cookie: cookie.trim().startsWith("d=") ? cookie.trim() : `d=${cookie.trim()}` }
      : undefined,
  });
}
