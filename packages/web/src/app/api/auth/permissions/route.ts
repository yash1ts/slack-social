import { NextResponse } from "next/server";
import type { PermissionCheckResult } from "@slack-social/shared";
import {
  getAuthProvider,
  readConfig,
  readCredentials,
  writeConfig,
  writeCredentials,
} from "@/lib/auth";
import { checkPermissions } from "../../../../../../cli/src/slack/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const creds = readCredentials();
  if (!creds?.accessToken) {
    return NextResponse.json(
      {
        ok: false,
        channelCount: 0,
        missingCapabilities: ["authentication"],
        error: "Not logged in",
      } satisfies PermissionCheckResult,
      { status: 401 },
    );
  }

  try {
    const provider = getAuthProvider();
    const result = await checkPermissions(provider);

    // Persist identity hints from the probe
    if (result.teamName || result.teamId || result.userId) {
      writeCredentials({
        ...creds,
        teamId: result.teamId ?? creds.teamId,
        userId: result.userId ?? creds.userId,
        teamName: result.teamName ?? creds.teamName,
      });
    }
    writeConfig({ ...readConfig(), lastPermissionCheck: result });

    return NextResponse.json(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Permission check failed";
    return NextResponse.json(
      {
        ok: false,
        channelCount: 0,
        missingCapabilities: ["permission check"],
        error,
      } satisfies PermissionCheckResult,
      { status: 500 },
    );
  }
}
