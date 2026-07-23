import { getSlackAppCredentials, inferAuthKind, normalizeCredentials } from "@slack-social/shared";
import type { AppConfig, Credentials } from "@slack-social/shared";
import { readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from "node:fs";
import { CONFIG_PATH, CREDENTIALS_PATH, ensureDataDirs } from "./paths";

export function readConfig(): AppConfig {
  ensureDataDirs();
  if (!existsSync(CONFIG_PATH)) return {};
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as AppConfig;
}

export function writeConfig(config: AppConfig): void {
  ensureDataDirs();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {
    /* ignore */
  }
}

export function readCredentials(): Credentials | null {
  ensureDataDirs();
  if (process.env.SLACK_TOKEN) {
    return normalizeCredentials({
      accessToken: process.env.SLACK_TOKEN,
      teamId: process.env.SLACK_TEAM_ID ?? "",
      userId: process.env.SLACK_USER_ID ?? "",
      clientId: process.env.SLACK_CLIENT_ID ?? "",
      obtainedAt: Date.now(),
      authKind: "env_token",
    });
  }
  if (!existsSync(CREDENTIALS_PATH)) return null;
  const raw = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8")) as Credentials;
  return normalizeCredentials({
    ...raw,
    authKind: raw.authKind ?? inferAuthKind(raw.accessToken),
  });
}

export function writeCredentials(creds: Credentials): void {
  ensureDataDirs();
  const normalized = normalizeCredentials({
    ...creds,
    authKind: creds.authKind ?? inferAuthKind(creds.accessToken),
  });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(normalized, null, 2), { mode: 0o600 });
  try {
    chmodSync(CREDENTIALS_PATH, 0o600);
  } catch {
    /* ignore */
  }
}

export function clearCredentials(): void {
  if (existsSync(CREDENTIALS_PATH)) unlinkSync(CREDENTIALS_PATH);
}

/** OAuth app credentials: env overrides, else ~/.slack-social/config.json from the login form. */
export function resolveClientCredentials(): { clientId: string; clientSecret: string } | null {
  const fromEnv = getSlackAppCredentials();
  if (fromEnv) return fromEnv;
  const config = readConfig();
  if (config.clientId && config.clientSecret) {
    return { clientId: config.clientId, clientSecret: config.clientSecret };
  }
  return null;
}
