import type { Credentials, PermissionCheckResult } from "@slack-social/shared";
import { readConfig, writeConfig, writeCredentials } from "../config";
import { fromCredentials } from "./auth-provider";
import { checkPermissions } from "./permissions";

/**
 * After credentials are written, verify Slack capabilities and persist the result.
 * On failure, clears credentials so the user is not left in a half-logged-in state.
 */
export async function finalizeLogin(
  creds: Credentials,
  opts?: { clearOnFailure?: boolean },
): Promise<PermissionCheckResult> {
  const provider = fromCredentials(creds);
  const result = await checkPermissions(provider);

  if (result.ok) {
    writeCredentials({
      ...creds,
      teamId: result.teamId ?? creds.teamId,
      userId: result.userId ?? creds.userId,
      teamName: result.teamName ?? creds.teamName,
    });
    writeConfig({ ...readConfig(), lastPermissionCheck: result });
    return result;
  }

  writeConfig({ ...readConfig(), lastPermissionCheck: result });
  if (opts?.clearOnFailure !== false) {
    const { clearCredentials } = await import("../config");
    clearCredentials();
  }
  return result;
}
