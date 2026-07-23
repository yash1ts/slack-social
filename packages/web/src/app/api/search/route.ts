import { NextResponse } from "next/server";
import { dbApi, getDb } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAuth();
  if (denied) return denied;
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const tag = url.searchParams.get("tag");
  const db = getDb();
  if (tag) return NextResponse.json(dbApi.getFeed(db, { tag, limit: 40 }));
  if (!q) return NextResponse.json([]);
  return NextResponse.json(dbApi.searchPosts(db, q));
}
