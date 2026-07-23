/**
 * Convert Slack Block Kit `rich_text` blocks into mrkdwn so the feed can
 * render bold / italic / strike / code / links like the Slack client.
 *
 * @see https://docs.slack.dev/reference/block-kit/blocks/rich-text-block
 */

type Style = {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
};

type RichElement = {
  type?: string;
  text?: string;
  url?: string;
  name?: string; // emoji
  unicode?: string;
  user_id?: string;
  channel_id?: string;
  usergroup_id?: string;
  style?: Style | "bullet" | "ordered" | "check";
  elements?: RichElement[];
  indent?: number;
  border?: number;
};

type SlackBlock = {
  type?: string;
  elements?: RichElement[];
};

function escapeMrkdwnSpecials(text: string): string {
  // Keep text mostly literal; Slack already escaped & < > in some contexts
  return text;
}

function applyStyle(text: string, style?: Style | string): string {
  if (!text) return "";
  if (!style || typeof style === "string") return escapeMrkdwnSpecials(text);
  let out = escapeMrkdwnSpecials(text);
  // Innermost first: code then strike/bold/italic (Slack nesting)
  if (style.code) out = `\`${out.replace(/`/g, "'")}\``;
  if (style.strike) out = `~${out}~`;
  if (style.bold) out = `*${out}*`;
  if (style.italic) out = `_${out}_`;
  return out;
}

function renderInlineElements(elements: RichElement[] | undefined): string {
  if (!elements?.length) return "";
  let out = "";
  for (const el of elements) {
    switch (el.type) {
      case "text":
        out += applyStyle(el.text ?? "", el.style);
        break;
      case "link": {
        const url = el.url ?? "";
        const label = applyStyle(el.text || url, el.style);
        out += url ? `<${url}|${label}>` : label;
        break;
      }
      case "user":
        out += el.user_id ? `<@${el.user_id}>` : "";
        break;
      case "channel":
        out += el.channel_id ? `<#${el.channel_id}>` : "";
        break;
      case "usergroup":
        out += el.usergroup_id ? `<!subteam^${el.usergroup_id}>` : "";
        break;
      case "broadcast":
        out += el.name ? `<!${el.name}>` : "";
        break;
      case "emoji":
        out += el.name ? `:${el.name}:` : "";
        break;
      case "color":
        // color swatch — skip or show hex text if present
        if (el.text) out += applyStyle(el.text, el.style);
        break;
      case "date":
        // {type:date, timestamp, format, fallback}
        out += (el as { fallback?: string }).fallback ?? "";
        break;
      default:
        if (el.text) out += applyStyle(el.text, el.style);
        if (el.elements) out += renderInlineElements(el.elements);
        break;
    }
  }
  return out;
}

function renderRichSection(el: RichElement): string {
  return renderInlineElements(el.elements);
}

function renderRichPreformatted(el: RichElement): string {
  const body = renderInlineElements(el.elements);
  return `\`\`\`\n${body}\n\`\`\``;
}

function renderRichQuote(el: RichElement): string {
  const body = renderInlineElements(el.elements);
  return body
    .split("\n")
    .map((line) => `>${line}`)
    .join("\n");
}

function renderRichList(el: RichElement): string {
  const listStyle = typeof el.style === "string" ? el.style : (el as { style?: string }).style;
  const ordered = listStyle === "ordered";
  const items = el.elements ?? [];
  const lines: string[] = [];
  items.forEach((item, idx) => {
    const indent = "  ".repeat(item.indent ?? el.indent ?? 0);
    const prefix = ordered ? `${idx + 1}. ` : "• ";
    const body = renderInlineElements(item.elements);
    const [first, ...rest] = body.split("\n");
    lines.push(`${indent}${prefix}${first ?? ""}`);
    for (const r of rest) lines.push(`${indent}  ${r}`);
  });
  return lines.join("\n");
}

function renderRichTextBlock(block: SlackBlock): string {
  const parts: string[] = [];
  for (const el of block.elements ?? []) {
    switch (el.type) {
      case "rich_text_section":
        parts.push(renderRichSection(el));
        break;
      case "rich_text_preformatted":
        parts.push(renderRichPreformatted(el));
        break;
      case "rich_text_quote":
        parts.push(renderRichQuote(el));
        break;
      case "rich_text_list":
        parts.push(renderRichList(el));
        break;
      default:
        if (el.elements) parts.push(renderInlineElements(el.elements));
        break;
    }
  }
  return parts.join("\n");
}

/**
 * Prefer rich_text blocks when present; otherwise return null so callers
 * can fall back to the message `text` field.
 */
export function richTextBlocksToMrkdwn(blocks: unknown): string | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const rich = (blocks as SlackBlock[]).filter((b) => b?.type === "rich_text");
  if (!rich.length) return null;
  const converted = rich
    .map(renderRichTextBlock)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return converted || null;
}

/** Best available body for indexing / display. */
export function slackMessageBody(message: {
  text?: string | null;
  blocks?: unknown;
}): string {
  const fromBlocks = richTextBlocksToMrkdwn(message.blocks);
  if (fromBlocks) return fromBlocks;
  return message.text ?? "";
}
