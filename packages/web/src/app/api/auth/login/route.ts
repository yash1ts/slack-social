import { NextResponse } from "next/server";
import { USER_SCOPES } from "@slack-social/shared";
import { resolveClientCredentials } from "@/lib/auth";

export const dynamic = "force-dynamic";

function appOrigin(req: Request): string {
  const url = new URL(req.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return `${url.protocol}//${url.host}`;
  }
  return "http://localhost:3000";
}

export async function GET(req: Request) {
  const origin = appOrigin(req);
  const creds = resolveClientCredentials();
  if (!creds) {
    return NextResponse.redirect(new URL("/login?error=oauth_not_configured", origin));
  }

  const redirectUri = `${origin}/api/auth/callback`;
  const state = crypto.randomUUID().replace(/-/g, "");
  const authorizeUrl =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${encodeURIComponent(creds.clientId)}` +
    `&user_scope=${encodeURIComponent(USER_SCOPES.join(","))}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("slack_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
