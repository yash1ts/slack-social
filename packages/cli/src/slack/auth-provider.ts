import { WebClient } from "@slack/web-api";
import { inferAuthKind, normalizeCredentials, type AuthKind, type Credentials } from "@slack-social/shared";
import { readCredentials } from "../config";
import { createSlackClient, slackAuthHeaders } from "./client";

export interface SlackAuthProvider {
  readonly kind: AuthKind;
  getCredentials(): Credentials;
  createClient(): WebClient;
  authHeaders(): Record<string, string>;
}

class StoredAuthProvider implements SlackAuthProvider {
  constructor(private readonly creds: Credentials) {}

  get kind(): AuthKind {
    return this.creds.authKind;
  }

  getCredentials(): Credentials {
    return this.creds;
  }

  createClient(): WebClient {
    return createSlackClient(this.creds.accessToken, this.creds.sessionCookie);
  }

  authHeaders(): Record<string, string> {
    return slackAuthHeaders(this.creds);
  }
}

/** Build a provider from already-normalized credentials. */
export function fromCredentials(creds: Credentials): SlackAuthProvider {
  return new StoredAuthProvider(normalizeCredentials(creds));
}

/**
 * Resolve the active Slack auth provider from env override or stored credentials.
 * Throws if nothing is authenticated.
 */
export function getAuthProvider(): SlackAuthProvider {
  const stored = readCredentials();
  if (!stored?.accessToken) {
    throw new Error("Not authenticated. Open http://localhost:3000 and log in.");
  }
  const fromEnv = Boolean(process.env.SLACK_TOKEN);
  const creds = normalizeCredentials({
    ...stored,
    authKind: fromEnv ? "env_token" : (stored.authKind ?? inferAuthKind(stored.accessToken)),
  });
  return fromCredentials(creds);
}

export function tryGetAuthProvider(): SlackAuthProvider | null {
  try {
    return getAuthProvider();
  } catch {
    return null;
  }
}

export { inferAuthKind, normalizeCredentials };
