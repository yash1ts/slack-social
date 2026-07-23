import {
  clearCredentials,
  readConfig,
  readCredentials,
  resolveClientCredentials,
  writeConfig,
  writeCredentials,
} from "../../../cli/src/config";
import { slackAuthHeaders } from "../../../cli/src/slack/client";
import {
  getAuthProvider,
  tryGetAuthProvider,
  fromCredentials,
} from "../../../cli/src/slack/auth-provider";
import type { Credentials } from "@slack-social/shared";

export function isLoggedIn(): boolean {
  const creds = readCredentials();
  return Boolean(creds?.accessToken);
}

export function getSession(): Credentials | null {
  return readCredentials();
}

export {
  clearCredentials,
  readConfig,
  readCredentials,
  resolveClientCredentials,
  writeConfig,
  writeCredentials,
  slackAuthHeaders,
  getAuthProvider,
  tryGetAuthProvider,
  fromCredentials,
};
