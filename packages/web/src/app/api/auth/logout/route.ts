import { NextRequest, NextResponse } from "next/server";
import { clearSession, isLoggedIn } from "@/lib/auth";
import { stopSyncBackground } from "../../../../../../cli/src/slack/sync-runner";

export const dynamic = "force-dynamic";

function loginRedirect(req: NextRequest): NextResponse {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : req.nextUrl.origin;
  return NextResponse.redirect(new URL("/login", origin));
}

/** Keep DB / media / emoji; drop credentials + permission session only. */
function logout(): void {
  stopSyncBackground();
  clearSession();
}

export async function POST(req: NextRequest) {
  logout();
  return loginRedirect(req);
}

export async function GET(req: NextRequest) {
  logout();
  // Confirm session is gone before sending the browser to login
  if (isLoggedIn()) {
    return NextResponse.json(
      { error: "Failed to clear session credentials" },
      { status: 500 },
    );
  }
  return loginRedirect(req);
}
