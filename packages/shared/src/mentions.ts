/** Collect Slack user IDs from `<@U…>` / `<@W…>` mention tokens. */
export function extractSlackUserIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids = new Set<string>();
  const re = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}

/** Collect Slack channel IDs from `<#C…>` mention tokens. */
export function extractSlackChannelIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids = new Set<string>();
  const re = /<#(C[A-Z0-9]+)(?:\|[^>]*)?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}
