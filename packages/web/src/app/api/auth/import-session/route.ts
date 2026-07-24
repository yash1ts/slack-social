import { NextResponse } from "next/server";
import {
  findBrowserSessions,
  importBrowserSession,
  listValidBrowserSessionOptions,
  sessionIdFor,
  verifyAndStoreSession,
} from "../../../../../../cli/src/slack/extract-session";
import { finalizeLogin } from "../../../../../../cli/src/slack/post-login";
import { readCredentials } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await listValidBrowserSessionOptions({ launchChrome: true });
    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      {
        sessions: [],
        error: err instanceof Error ? err.message : "Could not validate sessions",
      },
      { status: 200 },
    );
  }
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
    const all = findBrowserSessions();
    const selected = all.find((s) => sessionIdFor(s.token) === body.sessionId);
    // Prefer the selected token, then newer tokens for the same team (stale LevelDB copies are common).
    const candidates = selected?.teamId
      ? [
          selected,
          ...all.filter(
            (s) =>
              s.teamId === selected.teamId && s.token !== selected.token,
          ),
        ]
      : selected
        ? [selected]
        : [];

    if (!candidates.length) {
      return NextResponse.json(
        { error: "Selected session is no longer available. Refresh the list and try again." },
        { status: 400 },
      );
    }

    let lastError = "Import failed";
    for (const candidate of candidates) {
      try {
        const imported = await importBrowserSession({
          launchChrome: body.launchChrome !== false,
          sessionId: sessionIdFor(candidate.token),
        });
        const saved = await verifyAndStoreSession(imported);
        const creds = readCredentials();
        if (!creds) {
          return NextResponse.json({ error: "Credentials were not stored" }, { status: 500 });
        }

        const perms = await finalizeLogin(creds);
        if (!perms.ok) {
          lastError = perms.error ?? "Permission check failed";
          continue;
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
        lastError = err instanceof Error ? err.message : "Import failed";
      }
    }

    return NextResponse.json({ error: lastError }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 400 },
    );
  }
}
