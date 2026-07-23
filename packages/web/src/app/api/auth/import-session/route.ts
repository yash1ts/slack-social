import { NextResponse } from "next/server";
import {
  importBrowserSession,
  listBrowserSessionOptions,
  verifyAndStoreSession,
} from "../../../../../../cli/src/slack/extract-session";
import { finalizeLogin } from "../../../../../../cli/src/slack/post-login";
import { readCredentials } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sessions: listBrowserSessionOptions() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    launchChrome?: boolean;
    sessionId?: string;
  };
  if (!body.sessionId) {
    return NextResponse.json({ error: "Select a workspace session first" }, { status: 400 });
  }
  try {
    const imported = await importBrowserSession({
      launchChrome: body.launchChrome !== false,
      sessionId: body.sessionId,
    });
    const saved = await verifyAndStoreSession(imported);
    const creds = readCredentials();
    if (!creds) {
      return NextResponse.json({ error: "Credentials were not stored" }, { status: 500 });
    }

    const perms = await finalizeLogin(creds);
    if (!perms.ok) {
      return NextResponse.json(
        {
          error: perms.error ?? "Permission check failed",
          missingCapabilities: perms.missingCapabilities,
          permissions: perms,
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      ok: true,
      userId: saved.userId,
      teamId: saved.teamId,
      teamName: saved.teamName,
      source: saved.source,
      permissions: perms,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 400 },
    );
  }
}
