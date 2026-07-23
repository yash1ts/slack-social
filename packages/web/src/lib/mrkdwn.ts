/**
 * Minimal Slack mrkdwn → AST parser.
 * Supports: links, user/channel/broadcast mentions, code, bold, italic, strike, quotes,
 * and bare http(s) URL autolinking.
 * @see https://api.slack.com/reference/surfaces/formatting
 */

export {
  extractSlackUserIds,
  extractSlackChannelIds,
} from "@slack-social/shared";

export type MrkdwnNode =
  | { type: "text"; value: string }
  | { type: "br" }
  | { type: "link"; url: string; label: string }
  | { type: "user"; id: string; label?: string }
  | { type: "channel"; id: string; label?: string }
  | { type: "broadcast"; name: string }
  | { type: "emoji"; name: string }
  | { type: "code"; value: string }
  | { type: "pre"; value: string }
  | { type: "bold"; children: MrkdwnNode[] }
  | { type: "italic"; children: MrkdwnNode[] }
  | { type: "strike"; children: MrkdwnNode[] }
  | { type: "quote"; children: MrkdwnNode[] };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseAngleToken(raw: string): MrkdwnNode {
  const body = raw.slice(1, -1); // strip < >

  if (body.startsWith("@")) {
    const [id, label] = body.slice(1).split("|");
    return { type: "user", id, label: label ? decodeEntities(label) : undefined };
  }
  if (body.startsWith("#")) {
    const [id, label] = body.slice(1).split("|");
    return { type: "channel", id, label: label ? decodeEntities(label) : undefined };
  }
  if (body.startsWith("!")) {
    const name = body.slice(1).split("^")[0].split("|")[0];
    return { type: "broadcast", name };
  }

  const pipe = body.indexOf("|");
  const url = pipe === -1 ? body : body.slice(0, pipe);
  const label = pipe === -1 ? url : body.slice(pipe + 1);
  return {
    type: "link",
    url: decodeEntities(url),
    label: decodeEntities(label),
  };
}

/** Find closing marker that isn't escaped; prefer nearest valid pair. */
function findClose(input: string, openIdx: number, marker: string): number {
  let i = openIdx + marker.length;
  while (i < input.length) {
    if (input[i] === "`") {
      // skip inline code spans so markers inside code aren't closers
      const end = input.indexOf("`", i + 1);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (input[i] === "<") {
      const end = input.indexOf(">", i + 1);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (input.startsWith(marker, i)) {
      if (i > openIdx + marker.length) return i;
    }
    i++;
  }
  return -1;
}

const BARE_URL_RE = /https?:\/\/[^\s<>\[\]()]+/g;

function trimUrlTrailingPunct(url: string): string {
  return url.replace(/[.,;:!?)]+$/g, "");
}

function pushTextWithAutolinks(nodes: MrkdwnNode[], value: string) {
  if (!value) return;
  const decoded = decodeEntities(value);
  let last = 0;
  BARE_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BARE_URL_RE.exec(decoded)) !== null) {
    if (m.index > last) {
      nodes.push({ type: "text", value: decoded.slice(last, m.index) });
    }
    const raw = m[0];
    const url = trimUrlTrailingPunct(raw);
    const trailing = raw.slice(url.length);
    nodes.push({ type: "link", url, label: url });
    if (trailing) nodes.push({ type: "text", value: trailing });
    last = m.index + raw.length;
  }
  if (last < decoded.length) {
    nodes.push({ type: "text", value: decoded.slice(last) });
  }
}

/** Parse inline mrkdwn (no code fences / quote lines). */
function parseInline(input: string): MrkdwnNode[] {
  const nodes: MrkdwnNode[] = [];
  let i = 0;

  while (i < input.length) {
    // Slack link / mention
    if (input[i] === "<") {
      const end = input.indexOf(">", i + 1);
      if (end !== -1) {
        nodes.push(parseAngleToken(input.slice(i, end + 1)));
        i = end + 1;
        continue;
      }
    }

    // Emoji shortcode :name:
    if (input[i] === ":") {
      const end = input.indexOf(":", i + 1);
      if (end !== -1 && end > i + 1) {
        const name = input.slice(i + 1, end);
        if (/^[a-zA-Z0-9_+-]+$/.test(name)) {
          nodes.push({ type: "emoji", name });
          i = end + 1;
          continue;
        }
      }
    }

    // Inline code
    if (input[i] === "`") {
      const end = input.indexOf("`", i + 1);
      if (end !== -1 && end > i + 1) {
        nodes.push({ type: "code", value: decodeEntities(input.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    // Bold *...*
    if (input[i] === "*") {
      const end = findClose(input, i, "*");
      if (end !== -1) {
        nodes.push({ type: "bold", children: parseInline(input.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    // Italic _..._
    if (input[i] === "_") {
      const end = findClose(input, i, "_");
      if (end !== -1) {
        const before = i === 0 || /[\s([{>"'*/~`]/.test(input[i - 1]!);
        const after = end === input.length - 1 || /[\s)\]}.,!?;:'"*_~`]/.test(input[end + 1]!);
        // Avoid snake_case: require a non-word-ish boundary on at least one side
        const midWord =
          i > 0 &&
          /[A-Za-z0-9]/.test(input[i - 1]!) &&
          end + 1 < input.length &&
          /[A-Za-z0-9]/.test(input[end + 1]!);
        if ((before || after) && !midWord) {
          nodes.push({ type: "italic", children: parseInline(input.slice(i + 1, end)) });
          i = end + 1;
          continue;
        }
      }
    }

    // Strike ~...~
    if (input[i] === "~") {
      const end = findClose(input, i, "~");
      if (end !== -1) {
        nodes.push({ type: "strike", children: parseInline(input.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    // Plain text run until next special char
    let j = i + 1;
    while (j < input.length && !"<`*_~:".includes(input[j]!)) j++;
    pushTextWithAutolinks(nodes, input.slice(i, j));
    i = j;
  }

  return nodes;
}

function parseBlock(text: string): MrkdwnNode[] {
  const lines = text.split("\n");
  const nodes: MrkdwnNode[] = [];
  let quoteBuf: string[] = [];

  const flushQuote = () => {
    if (!quoteBuf.length) return;
    const inner = quoteBuf.map((l) => l.replace(/^>\s?/, "")).join("\n");
    nodes.push({ type: "quote", children: parseInline(inner) });
    quoteBuf = [];
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    if (line.startsWith(">")) {
      quoteBuf.push(line);
      continue;
    }
    flushQuote();
    if (li > 0 && nodes.length) nodes.push({ type: "br" });
    nodes.push(...parseInline(line));
  }
  flushQuote();
  return nodes;
}

/** Full message parse including ```code fences```. */
export function parseMrkdwn(text: string): MrkdwnNode[] {
  if (!text) return [];
  const nodes: MrkdwnNode[] = [];
  const fenceRe = /```(?:\w*\n)?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(...parseBlock(text.slice(last, m.index)));
    }
    nodes.push({
      type: "pre",
      value: decodeEntities(m[1]!.replace(/^\n/, "").replace(/\n$/, "")),
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(...parseBlock(text.slice(last)));
  }
  return nodes;
}

/** Plain-text length for truncation decisions. */
export function mrkdwnPlainText(text: string): string {
  return parseMrkdwn(text)
    .map(function walk(n: MrkdwnNode): string {
      switch (n.type) {
        case "text":
        case "code":
        case "pre":
          return n.value;
        case "br":
          return "\n";
        case "link":
          return n.label;
        case "user":
          return n.label ? `@${n.label}` : `@${n.id}`;
        case "channel":
          return n.label ? `#${n.label}` : `#${n.id}`;
        case "broadcast":
          return `@${n.name}`;
        case "emoji":
          return `:${n.name}:`;
        case "bold":
        case "italic":
        case "strike":
        case "quote":
          return n.children.map(walk).join("");
        default:
          return "";
      }
    })
    .join("");
}

/**
 * Truncate source mrkdwn by approximate plain length without cutting inside `<...>`.
 */
export function truncateMrkdwn(text: string, maxPlain: number): string {
  if (!text) return text;
  if (mrkdwnPlainText(text).length <= maxPlain) return text;

  let plain = 0;
  let i = 0;
  let out = "";
  while (i < text.length && plain < maxPlain) {
    if (text[i] === "<") {
      const end = text.indexOf(">", i + 1);
      if (end !== -1) {
        const token = text.slice(i, end + 1);
        const labelLen = mrkdwnPlainText(token).length;
        if (plain + labelLen > maxPlain) break;
        out += token;
        plain += labelLen;
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "`" && text.slice(i, i + 3) === "```") {
      const end = text.indexOf("```", i + 3);
      if (end !== -1) {
        const token = text.slice(i, end + 3);
        const labelLen = mrkdwnPlainText(token).length;
        if (plain + labelLen > maxPlain) break;
        out += token;
        plain += labelLen;
        i = end + 3;
        continue;
      }
    }
    out += text[i];
    if (text[i] !== "&") plain += 1;
    i += 1;
  }
  return `${out.trimEnd()}…`;
}

/**
 * Truncate mrkdwn to at most `maxWords` plain-text words.
 * Returns whether truncation was applied (caller can show "more").
 */
export function truncateMrkdwnByWords(
  text: string,
  maxWords: number,
): { text: string; truncated: boolean } {
  if (!text || maxWords <= 0) return { text, truncated: false };
  const plain = mrkdwnPlainText(text).trim();
  if (!plain) return { text, truncated: false };

  const wordRe = /\S+/g;
  let match: RegExpExecArray | null;
  let count = 0;
  let end = 0;
  while ((match = wordRe.exec(plain)) && count < maxWords) {
    end = match.index + match[0].length;
    count++;
  }

  if (count < maxWords || end >= plain.length) {
    return { text, truncated: false };
  }

  // Budget matches the plain prefix so truncateMrkdwn cuts at a similar point
  const clipped = truncateMrkdwn(text, end);
  return {
    text: clipped.endsWith("…") ? clipped.slice(0, -1).trimEnd() : clipped,
    truncated: true,
  };
}
