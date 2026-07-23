import { NextResponse } from "next/server";
import { unicodeForEmoji } from "@slack-social/shared";
import {
  getEmojiRow,
  resolveEmojiRow,
  upsertEmoji,
} from "../../../../../../cli/src/db/queries";
import { downloadEmoji } from "../../../../../../cli/src/slack/emoji-sync";
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

/** Serve an alias that points at a standard Unicode emoji as a tiny SVG (works as <img src>). */
function unicodeSvgResponse(uni: string): NextResponse {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><text x="32" y="34" text-anchor="middle" dominant-baseline="central" font-size="52">${uni}</text></svg>`;
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function aliasUnicode(db: ReturnType<typeof getDb>, start: string): string | null {
  let name = start;
  for (let i = 0; i < 6; i++) {
    const uni = unicodeForEmoji(name);
    if (uni) return uni;
    const row = getEmojiRow(db, name);
    if (!row?.alias_of) return null;
    name = row.alias_of;
  }
  return null;
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
  const resolved = resolveEmojiRow(db, name);
  const row = resolved ?? getEmojiRow(db, name);
  if (!row) {
    // May be a pure unicode short-name requested as an image — rare.
    const uni = unicodeForEmoji(name);
    if (uni) return unicodeSvgResponse(uni);
    return NextResponse.json(
      { error: "Emoji not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
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
    const session = getSession();
    // Cache to disk on first paint so later feeds are local.
    const localPath = await downloadEmoji(
      row.name,
      row.url,
      session?.accessToken,
      session?.sessionCookie,
    );
    if (localPath) {
      upsertEmoji(db, {
        name: row.name,
        url: row.url,
        aliasOf: null,
        localPath,
        updatedAt: Date.now(),
      });
      try {
        const file = Bun.file(localPath);
        if (await file.exists()) {
          return new NextResponse(file.stream(), {
            headers: {
              "Content-Type": mimeForPath(localPath),
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      } catch {
        /* fall through to proxy */
      }
    }

    try {
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

  // Alias → unicode (no custom image)
  if (row.alias_of) {
    const uni = aliasUnicode(db, row.alias_of);
    if (uni) return unicodeSvgResponse(uni);
  }

  return NextResponse.json(
    { error: "Emoji has no image" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
