import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { getSyncStatus } from "../../../../../../cli/src/slack/sync-runner";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(getSyncStatus());
}
