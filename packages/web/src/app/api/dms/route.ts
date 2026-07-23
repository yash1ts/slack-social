import { NextResponse } from "next/server";
import { getSession, getAuthProvider } from "@/lib/auth";
import { requireAuth } from "@/lib/require-auth";
import { listDmConversations } from "../../../../../cli/src/slack/dms";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = requireAuth();
  if (denied) return denied;

  const session = getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = getAuthProvider().createClient();
    const conversations = await listDmConversations(client, session.userId);
    return NextResponse.json({ conversations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load DMs";
    const missing =
      message.includes("missing_scope") || message.includes("not_allowed_token_type");
    return NextResponse.json(
      {
        error: missing
          ? "Missing DM scopes. Re-auth with an updated Slack app (im:read, im:history) or use a browser session."
          : message,
        conversations: [],
      },
      { status: missing ? 403 : 500 },
    );
  }
}
