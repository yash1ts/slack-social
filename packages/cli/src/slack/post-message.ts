import type { WebClient } from "@slack/web-api";

export type UploadFile = {
  filename: string;
  data: Buffer;
  contentType?: string;
};

/**
 * Post a channel message, optionally with file/image attachments (files.uploadV2).
 */
export async function postChannelMessage(
  client: WebClient,
  channelId: string,
  text: string,
  files: UploadFile[] = [],
): Promise<{ ok: true; ts?: string } | { ok: false; error: string }> {
  const trimmed = text.trim();
  if (!channelId) return { ok: false, error: "Channel is required" };
  if (!trimmed && files.length === 0) {
    return { ok: false, error: "Message text or a file is required" };
  }

  try {
    if (files.length === 0) {
      const res = await client.chat.postMessage({
        channel: channelId,
        text: trimmed,
      });
      if (!res.ok || !res.ts) {
        return { ok: false, error: res.error ?? "Slack rejected the message" };
      }
      return { ok: true, ts: res.ts };
    }

    if (files.length === 1) {
      const file = files[0]!;
      const res = await client.files.uploadV2({
        channel_id: channelId,
        file: file.data,
        filename: file.filename,
        initial_comment: trimmed || undefined,
      });
      if (!res.ok) {
        return { ok: false, error: (res as { error?: string }).error ?? "Upload failed" };
      }
      return { ok: true };
    }

    const res = await client.files.uploadV2({
      channel_id: channelId,
      initial_comment: trimmed || undefined,
      file_uploads: files.map((f) => ({
        file: f.data,
        filename: f.filename,
      })),
    });
    if (!res.ok) {
      return { ok: false, error: (res as { error?: string }).error ?? "Upload failed" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to post message",
    };
  }
}
