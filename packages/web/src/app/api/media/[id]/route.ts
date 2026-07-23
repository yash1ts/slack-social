import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { dbApi, getDb } from "@/lib/db";
import { readCredentials, slackAuthHeaders } from "@/lib/auth";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const db = getDb();
  const att = dbApi.getAttachment(db, id);
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (att.local_path && existsSync(att.local_path)) {
    try {
      const file = Bun.file(att.local_path);
      if (await file.exists()) {
        return new NextResponse(file.stream(), {
          headers: {
            "Content-Type": att.mimetype ?? "application/octet-stream",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    } catch {
      /* fall through */
    }
  }

  // Fallback: proxy from Slack with stored token
  if (att.url_private) {
    const creds = readCredentials();
    if (!creds?.accessToken) {
      return NextResponse.json({ error: "Media not cached" }, { status: 404 });
    }
    const res = await fetch(att.url_private, {
      headers: slackAuthHeaders(creds),
    });
    if (!res.ok) return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
    if (res.body) {
      return new NextResponse(res.body, {
        headers: {
          "Content-Type": att.mimetype ?? res.headers.get("content-type") ?? "image/jpeg",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type": att.mimetype ?? "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
