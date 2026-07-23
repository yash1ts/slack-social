import { NextResponse } from "next/server";
import { dbApi, getDb } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = requireAuth();
  if (denied) return denied;

  const db = getDb();
  dbApi.markFeedViewed(db);
  return NextResponse.json({ ok: true, lastViewedAt: Date.now() });
}
