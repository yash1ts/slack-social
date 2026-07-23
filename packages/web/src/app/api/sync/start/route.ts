import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { startSync } from "../../../../../../cli/src/slack/sync-runner";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    force?: boolean;
    skipIfFresh?: boolean;
  };

  const force = Boolean(body.force);
  const status = startSync({
    force,
    // Auto-start from feed uses skipIfFresh; explicit force sync does not
    skipIfFresh: force ? false : body.skipIfFresh !== false,
  });

  return NextResponse.json(status);
}
