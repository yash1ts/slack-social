"use client";

import { useState, type ReactNode } from "react";
import {
  parseMrkdwn,
  truncateMrkdwn,
  truncateMrkdwnByWords,
  type MrkdwnNode,
} from "@/lib/mrkdwn";
import { SlackEmoji } from "./Emoji";

function renderNodes(
  nodes: MrkdwnNode[],
  keyPrefix: string,
  mentionUsers?: Record<string, string>,
  mentionChannels?: Record<string, string>,
): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case "text":
        return <span key={key}>{node.value}</span>;
      case "br":
        return <br key={key} />;
      case "link": {
        const href =
          node.url.startsWith("http") || node.url.startsWith("mailto:")
            ? node.url
            : node.url.startsWith("/")
              ? node.url
              : `https://${node.url}`;
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="slack-link font-medium text-[#1d9bd1] underline decoration-[#1d9bd1]/35 underline-offset-2 hover:text-[#4eb3e0] hover:decoration-[#4eb3e0]"
            onClick={(e) => e.stopPropagation()}
          >
            {node.label}
          </a>
        );
      }
      case "user": {
        const name = node.label || mentionUsers?.[node.id];
        return (
          <span
            key={key}
            className="font-medium text-[#1d9bd1]"
          >
            @{name || node.id}
          </span>
        );
      }
      case "channel": {
        const name = node.label || mentionChannels?.[node.id];
        return (
          <span
            key={key}
            className="font-medium text-[#1d9bd1]"
          >
            #{name || node.id}
          </span>
        );
      }
      case "broadcast":
        return (
          <span
            key={key}
            className="font-medium text-[#e0a458]"
          >
            @{node.name}
          </span>
        );
      case "emoji":
        return <SlackEmoji key={key} name={node.name} size={18} className="align-[-3px]" />;
      case "code":
        return (
          <code
            key={key}
            className="rounded-[3px] bg-[#1a1d21] px-1.5 py-0.5 font-mono text-[13px] text-[#e01e5a]"
          >
            {node.value}
          </code>
        );
      case "pre":
        return (
          <pre
            key={key}
            className="my-2 overflow-x-auto rounded-lg border border-[#2a2a2a] bg-[#1a1d21] p-3 font-mono text-[12.5px] leading-relaxed text-[#e8e8e8]"
          >
            <code>{node.value}</code>
          </pre>
        );
      case "bold":
        return (
          <strong key={key} className="font-bold text-white">
            {renderNodes(node.children, key, mentionUsers, mentionChannels)}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic text-white/95">
            {renderNodes(node.children, key, mentionUsers, mentionChannels)}
          </em>
        );
      case "strike":
        return (
          <s key={key} className="text-white/60 line-through">
            {renderNodes(node.children, key, mentionUsers, mentionChannels)}
          </s>
        );
      case "quote":
        return (
          <blockquote
            key={key}
            className="my-1.5 border-l-[3px] border-[#3d3d3d] pl-3 text-[var(--muted)]"
          >
            {renderNodes(node.children, key, mentionUsers, mentionChannels)}
          </blockquote>
        );
      default:
        return null;
    }
  });
}

export function SlackText({
  text,
  maxLength,
  maxWords,
  className,
  muted,
  inline,
  mentionUsers,
  mentionChannels,
}: {
  text: string | null | undefined;
  /** Approximate plain-text character budget (keeps links intact). */
  maxLength?: number;
  /** Soft cap on plain-text words; shows “… more” to expand. */
  maxWords?: number;
  className?: string;
  muted?: boolean;
  /** Render as inline span (for reply previews). */
  inline?: boolean;
  mentionUsers?: Record<string, string>;
  mentionChannels?: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  let source = text;
  let truncated = false;

  if (!expanded && maxWords != null) {
    const clipped = truncateMrkdwnByWords(text, maxWords);
    source = clipped.text;
    truncated = clipped.truncated;
  } else if (!expanded && maxLength != null) {
    const clipped = truncateMrkdwn(text, maxLength);
    if (clipped !== text && clipped.endsWith("…")) {
      source = clipped.slice(0, -1).trimEnd();
      truncated = true;
    }
  }

  const nodes = parseMrkdwn(source);
  const classes = [
    "slack-mrkdwn",
    inline ? "inline break-words" : "whitespace-pre-wrap break-words",
    "text-[15px] leading-[1.46668] text-[#d1d2d3]",
    muted ? "text-[var(--muted)]" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = renderNodes(nodes, "m", mentionUsers, mentionChannels);
  const more = truncated ? (
    <>
      {"… "}
      <button
        type="button"
        className="inline italic font-normal text-[var(--muted)] hover:text-[var(--text)]"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
        }}
      >
        load more
      </button>
    </>
  ) : null;

  if (inline) {
    return (
      <span className={classes}>
        {content}
        {more}
      </span>
    );
  }

  return (
    <div className={classes}>
      {content}
      {more}
    </div>
  );
}
