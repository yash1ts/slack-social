import { NextResponse } from "next/server";
import { dbApi, getDb } from "@/lib/db";
import { resolveUserProfile } from "@/lib/profile";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const profile = await resolveUserProfile(id);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const posts = dbApi.getUserPosts(getDb(), id);
  return NextResponse.json({ profile, posts });
}
