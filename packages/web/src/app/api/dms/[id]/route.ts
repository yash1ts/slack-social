import { NextResponse } from "next/server";
import { getSession, getAuthProvider } from "@/lib/auth";
import { requireAuth } from "@/lib/require-auth";
import { getDmThread, sendDmMessage } from "../../../../../../cli/src/slack/dms";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = requireAuth();
  if (denied) return denied;

  const session = getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const client = getAuthProvider().createClient();
    const thread = await getDmThread(client, id, session.userId);
    return NextResponse.json(thread);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load conversation" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = requireAuth();
  if (denied) return denied;

  const session = getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  }

  try {
    const client = getAuthProvider().createClient();
    const result = await sendDmMessage(client, id, text);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Send failed" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ts: result.ts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send" },
      { status: 500 },
    );
  }
}
