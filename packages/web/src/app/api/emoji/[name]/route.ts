import { NextResponse } from "next/server";
import { resolveEmojiRow, getEmojiRow } from "../../../../../../cli/src/db/queries";
import { getDb } from "@/lib/db";
import { getSession, slackAuthHeaders } from "@/lib/auth";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

function mimeForPath(path: string): string {
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const denied = requireAuth();
  if (denied) return denied;

  const { name: raw } = await ctx.params;
  const name = decodeURIComponent(raw).split("::")[0] ?? decodeURIComponent(raw);
  const db = getDb();
  const row = resolveEmojiRow(db, name) ?? getEmojiRow(db, name);
  if (!row) {
    return NextResponse.json({ error: "Emoji not found" }, { status: 404 });
  }

  if (row.local_path) {
    try {
      const file = Bun.file(row.local_path);
      if (await file.exists()) {
        return new NextResponse(file.stream(), {
          headers: {
            "Content-Type": mimeForPath(row.local_path),
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    } catch {
      /* fall through */
    }
  }

  if (row.url) {
    try {
      const session = getSession();
      const headers = session ? slackAuthHeaders(session) : {};
      let res = await fetch(row.url, { headers });
      if (!res.ok) {
        res = await fetch(row.url);
      }
      if (!res.ok) {
        return NextResponse.json({ error: "Upstream emoji failed" }, { status: 502 });
      }
      const buf = await res.arrayBuffer();
      return new NextResponse(buf, {
        headers: {
          "Content-Type": res.headers.get("content-type") ?? "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return NextResponse.json({ error: "Failed to fetch emoji" }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Emoji has no image" }, { status: 404 });
}
