import { NextResponse } from "next/server";
import { readConfig, writeConfig } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { clientId?: string; clientSecret?: string };
  const clientId = body.clientId?.trim();
  const clientSecret = body.clientSecret?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Client ID and Client Secret are required" }, { status: 400 });
  }

  writeConfig({
    ...readConfig(),
    clientId,
    clientSecret,
  });

  return NextResponse.json({ ok: true });
}
