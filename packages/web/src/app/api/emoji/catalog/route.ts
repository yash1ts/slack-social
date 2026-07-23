import { NextResponse } from "next/server";
import { getEmojiAliases, getEmojiCatalog } from "../../../../../../cli/src/db/queries";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = requireAuth();
  if (denied) return denied;

  const db = getDb();
  return NextResponse.json({
    emoji: getEmojiCatalog(db),
    aliases: getEmojiAliases(db),
  });
}
