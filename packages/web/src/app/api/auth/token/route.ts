import { NextResponse } from "next/server";
import { inferAuthKind } from "@slack-social/shared";
import { writeCredentials, slackAuthHeaders, readCredentials } from "@/lib/auth";
import { finalizeLogin } from "../../../../../../cli/src/slack/post-login";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { token?: string; sessionCookie?: string };
  const token = body.token?.trim();
  const sessionCookie = body.sessionCookie?.trim() || undefined;
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  if (token.startsWith("xapp-")) {
    return NextResponse.json(
      {
        error:
          "Socket Mode app tokens (xapp-) cannot call the Slack Web API. Use a bot (xoxb), user OAuth (xoxp), or browser session (xoxc) token.",
      },
      { status: 400 },
    );
  }

  if (!token.startsWith("xoxc-") && !token.startsWith("xoxp-") && !token.startsWith("xoxb-")) {
    return NextResponse.json(
      { error: "Expected a Slack token (xoxc- for browser session, xoxp-, or xoxb-)" },
      { status: 400 },
    );
  }

  if (token.startsWith("xoxc-") && !sessionCookie) {
    return NextResponse.json(
      { error: "Browser session tokens (xoxc-) also need the d cookie (xoxd-…)" },
      { status: 400 },
    );
  }

  const res = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: {
      ...slackAuthHeaders({ accessToken: token, sessionCookie }),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    user_id?: string;
    team_id?: string;
  };

  if (!data.ok) {
    return NextResponse.json(
      { error: data.error ?? "Token rejected by Slack" },
      { status: 401 },
    );
  }

  const authKind = inferAuthKind(token);
  writeCredentials({
    accessToken: token,
    teamId: data.team_id ?? "",
    userId: data.user_id ?? "",
    clientId: "",
    obtainedAt: Date.now(),
    sessionCookie,
    authKind,
  });

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
    userId: data.user_id,
    teamId: data.team_id,
    authKind,
    permissions: perms,
  });
}
