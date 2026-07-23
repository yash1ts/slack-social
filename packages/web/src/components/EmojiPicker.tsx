"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { unicodeForEmoji } from "@slack-social/shared";
import { SlackEmoji, useEmojiCatalog } from "./Emoji";

const QUICK_EMOJI = [
  "grinning",
  "joy",
  "heart_eyes",
  "fire",
  "tada",
  "+1",
  "clap",
  "wave",
  "thinking_face",
  "eyes",
  "heart",
  "pray",
  "rocket",
  "sparkles",
  "sob",
  "open_mouth",
];

export function EmojiPicker({
  onPick,
}: {
  onPick: (shortName: string) => void;
}) {
  const catalog = useEmojiCatalog();
  const [query, setQuery] = useState("");

  const customNames = useMemo(
    () => Object.keys(catalog).sort((a, b) => a.localeCompare(b)),
    [catalog],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^:|:$/g, "");
    const pool = [
      ...QUICK_EMOJI,
      ...customNames.filter((n) => !QUICK_EMOJI.includes(n)),
    ];
    // Dedupe while preserving order
    const seen = new Set<string>();
    const unique = pool.filter((n) => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
    if (!q) return unique.slice(0, 80);
    return unique.filter((n) => n.includes(q)).slice(0, 80);
  }, [catalog, customNames, query]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[#141414] shadow-xl">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Search size={14} className="shrink-0 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
          autoFocus
        />
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {filtered.map((name) => {
          const hasCustom = Boolean(catalog[name]);
          const uni = unicodeForEmoji(name);
          if (!hasCustom && !uni) return null;
          return (
            <button
              key={name}
              type="button"
              title={`:${name}:`}
              onClick={() => onPick(name)}
              className="flex h-9 w-full items-center justify-center rounded-md hover:bg-white/10"
            >
              <SlackEmoji name={name} size={22} />
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className="col-span-8 py-6 text-center text-xs text-[var(--muted)]">
            No matches
          </p>
        ) : null}
      </div>
    </div>
  );
}
