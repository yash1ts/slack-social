import { NextResponse } from "next/server";
import { dbApi, getDb } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = requireAuth();
  if (denied) return denied;
  const db = getDb();
  return NextResponse.json(dbApi.getExplore(db));
}
