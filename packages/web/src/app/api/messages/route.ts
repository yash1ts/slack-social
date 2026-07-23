import { NextResponse } from "next/server";
import { getAuthProvider, isLoggedIn } from "@/lib/auth";
import {
  postChannelMessage,
  type UploadFile,
} from "../../../../../cli/src/slack/post-message";

export const dynamic = "force-dynamic";

const MAX_FILES = 8;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
  if (!isLoggedIn()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let channelId = "";
  let text = "";
  const files: UploadFile[] = [];

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      channelId = String(form.get("channelId") ?? "").trim();
      text = String(form.get("text") ?? "").trim();
      const entries = form.getAll("files");
      for (const entry of entries) {
        if (!(entry instanceof File)) continue;
        if (files.length >= MAX_FILES) break;
        if (entry.size <= 0) continue;
        if (entry.size > MAX_FILE_BYTES) {
          return NextResponse.json(
            { error: `"${entry.name}" is too large (max 50MB)` },
            { status: 400 },
          );
        }
        const buf = Buffer.from(await entry.arrayBuffer());
        files.push({
          filename: entry.name || `upload-${files.length + 1}`,
          data: buf,
          contentType: entry.type || undefined,
        });
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        channelId?: string;
        text?: string;
      };
      channelId = body.channelId?.trim() ?? "";
      text = body.text?.trim() ?? "";
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body" },
      { status: 400 },
    );
  }

  if (!channelId) {
    return NextResponse.json({ error: "Channel is required" }, { status: 400 });
  }
  if (!text && files.length === 0) {
    return NextResponse.json(
      { error: "Message text or a file is required" },
      { status: 400 },
    );
  }

  try {
    const client = getAuthProvider().createClient();
    const result = await postChannelMessage(client, channelId, text, files);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ts: result.ts ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post" },
      { status: 500 },
    );
  }
}
