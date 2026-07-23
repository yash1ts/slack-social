import { NextResponse } from "next/server";
import { getSession, isLoggedIn } from "@/lib/auth";
import { resolveUserProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const session = getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await resolveUserProfile(session.userId);
  return NextResponse.json({
    profile: profile ?? {
      id: session.userId,
      displayName: session.userId,
      avatarUrl: null,
    },
  });
}
