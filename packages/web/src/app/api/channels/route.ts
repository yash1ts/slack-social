import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { dbApi, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

  // Require a search query — don't dump the full channel list
  if (!query) {
    return NextResponse.json({ channels: [], query: "" });
  }

  const channels = dbApi.listIndexedChannels(getDb(), { query, limit });
  return NextResponse.json({ channels, query });
}
