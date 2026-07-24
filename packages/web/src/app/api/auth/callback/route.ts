import { NextResponse } from "next/server";
import { resolveClientCredentials, writeCredentials } from "@/lib/auth";
import { finalizeLogin } from "../../../../../../cli/src/slack/post-login";

export const dynamic = "force-dynamic";

function appOrigin(req: Request): string {
  const url = new URL(req.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return `${url.protocol}//${url.host}`;
  }
  return "http://localhost:3000";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = appOrigin(req);
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieHeader = req.headers.get("cookie") ?? "";
  const expected = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("slack_oauth_state="))
    ?.split("=")[1];

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${origin}/login?error=invalid_state`);
  }

  const appCreds = resolveClientCredentials();
  if (!appCreds) {
    return NextResponse.redirect(`${origin}/login?error=missing_app_credentials`);
  }

  const body = new URLSearchParams({
    client_id: appCreds.clientId,
    client_secret: appCreds.clientSecret,
    code,
    redirect_uri: `${origin}/api/auth/callback`,
  });

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await tokenRes.json()) as {
    ok: boolean;
    error?: string;
    team?: { id?: string };
    authed_user?: { id?: string; access_token?: string };
  };

  if (!data.ok || !data.authed_user?.access_token) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(data.error ?? "token_exchange_failed")}`,
    );
  }

  const creds = {
    accessToken: data.authed_user.access_token,
    teamId: data.team?.id ?? "",
    userId: data.authed_user.id ?? "",
    clientId: appCreds.clientId,
    obtainedAt: Date.now(),
    authKind: "user_oauth" as const,
  };
  writeCredentials(creds);

  const perms = await finalizeLogin(creds);
  if (!perms.ok) {
    const msg =
      perms.error ??
      (perms.missingCapabilities.length ? perms.missingCapabilities.join(", ") : "permission_denied");
    const res = NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
    res.cookies.set("slack_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  }

  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.set("slack_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}
