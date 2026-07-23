import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { runBackfillAndWait } from "../../../../../../cli/src/slack/sync-runner";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await runBackfillAndWait();
  return NextResponse.json({
    ...result,
    hasMoreHistory: result.hasMoreHistory,
    messagesIndexed: result.messagesIndexed,
  });
}
