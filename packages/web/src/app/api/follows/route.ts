import { NextResponse } from "next/server";
import { dbApi, getDb } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireAuth();
  if (denied) return denied;
  const body = (await req.json()) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const db = getDb();
  dbApi.followUser(db, body.userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const denied = requireAuth();
  if (denied) return denied;
  const body = (await req.json()) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const db = getDb();
  dbApi.unfollowUser(db, body.userId);
  return NextResponse.json({ ok: true });
}
