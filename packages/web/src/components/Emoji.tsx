"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { baseEmojiName, unicodeForEmoji } from "@slack-social/shared";

type EmojiCatalog = Record<string, string>;
type EmojiAliases = Record<string, string>;

type EmojiContextValue = {
  catalog: EmojiCatalog;
  aliases: EmojiAliases;
};

const EmojiContext = createContext<EmojiContextValue>({ catalog: {}, aliases: {} });

export function EmojiProvider({
  initialCatalog,
  initialAliases,
  children,
}: {
  initialCatalog?: EmojiCatalog;
  initialAliases?: EmojiAliases;
  children: ReactNode;
}) {
  const [catalog, setCatalog] = useState<EmojiCatalog>(initialCatalog ?? {});
  const [aliases, setAliases] = useState<EmojiAliases>(initialAliases ?? {});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const hasInitial = Object.keys(initialCatalog ?? {}).length > 0;
        // Prefer a cheap catalog read when SSR already hydrated us; sync only when empty.
        const res = await fetch(
          hasInitial ? "/api/emoji/catalog" : "/api/emoji/sync",
          hasInitial ? undefined : { method: "POST" },
        );
        if (!res.ok) {
          if (hasInitial) return;
          const fallback = await fetch("/api/emoji/catalog");
          if (!fallback.ok) return;
          const data = (await fallback.json()) as {
            emoji?: EmojiCatalog;
            aliases?: EmojiAliases;
          };
          if (cancelled) return;
          if (data.emoji) setCatalog(data.emoji);
          if (data.aliases) setAliases(data.aliases);
          return;
        }
        const data = (await res.json()) as {
          emoji?: EmojiCatalog;
          aliases?: EmojiAliases;
        };
        if (cancelled) return;
        if (data.emoji) setCatalog(data.emoji);
        if (data.aliases) setAliases(data.aliases);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally mount-once: initial props seed state; refresh from API after hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ catalog, aliases }), [catalog, aliases]);

  return <EmojiContext.Provider value={value}>{children}</EmojiContext.Provider>;
}

export function useEmojiCatalog(): EmojiCatalog {
  return useContext(EmojiContext).catalog;
}

export function useEmojiSrc(name: string): {
  src: string | null;
  unicode: string | null;
} {
  const { catalog, aliases } = useContext(EmojiContext);
  return useMemo(() => {
    const base = baseEmojiName(name);
    const aliasTarget = aliases[base];
    const unicode =
      unicodeForEmoji(name) ??
      (aliasTarget ? unicodeForEmoji(aliasTarget) : null) ??
      null;

    const custom = catalog[base] ?? catalog[name] ?? null;
    if (custom) return { src: custom, unicode };

    if (unicode) return { src: null, unicode };

    // Custom emoji that may still be syncing — try the API once.
    return { src: `/api/emoji/${encodeURIComponent(base)}`, unicode: null };
  }, [catalog, aliases, name]);
}

/** Renders a Slack emoji (custom image or unicode) by short name. */
export function SlackEmoji({
  name,
  size = 16,
  className = "",
  title,
}: {
  name: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  const { src, unicode } = useEmojiSrc(name);
  const [imgFailed, setImgFailed] = useState(false);
  const label = title ?? `:${name}:`;

  // Reset failure state when the resolved source changes (e.g. after catalog sync)
  useEffect(() => {
    setImgFailed(false);
  }, [src, name]);

  if (src && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        title={label}
        width={size}
        height={size}
        className={`inline-block object-contain ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    );
  }

  if (unicode) {
    return (
      <span
        className={`inline-flex items-center justify-center leading-none ${className}`}
        style={{ fontSize: size * 0.92, width: size, height: size }}
        title={label}
        role="img"
        aria-label={label}
      >
        {unicode}
      </span>
    );
  }

  return (
    <span className={`text-[11px] text-[var(--muted)] ${className}`} title={label}>
      :{name}:
    </span>
  );
}
