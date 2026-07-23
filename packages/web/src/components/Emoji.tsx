"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { baseEmojiName, unicodeForEmoji } from "@slack-social/shared";

type EmojiCatalog = Record<string, string>;
type EmojiAliases = Record<string, string>;

type EmojiContextValue = {
  /** Full catalog — loaded only when a consumer asks (e.g. emoji picker). */
  catalog: EmojiCatalog;
  aliases: EmojiAliases;
  /** Bumps after background metadata sync so failed custom imgs can retry. */
  metaEpoch: number;
  ensureCatalog: () => void;
};

const EmojiContext = createContext<EmojiContextValue>({
  catalog: {},
  aliases: {},
  metaEpoch: 0,
  ensureCatalog: () => {},
});

export function EmojiProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<EmojiCatalog>({});
  const [aliases, setAliases] = useState<EmojiAliases>({});
  const [metaEpoch, setMetaEpoch] = useState(0);
  const catalogRequested = useRef(false);

  // Warm DB metadata in the background — never pull the full catalog into the feed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/emoji/sync", { method: "POST" });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { synced?: boolean };
        // Only bump when metadata changed so failed custom imgs can retry.
        if (data.synced) setMetaEpoch((n) => n + 1);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureCatalog = useCallback(() => {
    if (catalogRequested.current) return;
    catalogRequested.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/emoji/catalog");
        if (!res.ok) return;
        const data = (await res.json()) as {
          emoji?: EmojiCatalog;
          aliases?: EmojiAliases;
        };
        if (data.emoji) setCatalog(data.emoji);
        if (data.aliases) setAliases(data.aliases);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const value = useMemo(
    () => ({ catalog, aliases, metaEpoch, ensureCatalog }),
    [catalog, aliases, metaEpoch, ensureCatalog],
  );

  return <EmojiContext.Provider value={value}>{children}</EmojiContext.Provider>;
}

/** Full custom catalog — triggers a one-time fetch (for pickers). */
export function useEmojiCatalog(): EmojiCatalog {
  const { catalog, ensureCatalog } = useContext(EmojiContext);
  useEffect(() => {
    ensureCatalog();
  }, [ensureCatalog]);
  return catalog;
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

    // Prefer a known custom image (picker catalog / overrides) when present.
    const custom = catalog[base] ?? catalog[name] ?? null;
    if (custom) return { src: custom, unicode };

    // Standard emoji: render unicode locally — no network, no catalog.
    if (unicode) return { src: null, unicode };

    // Unknown custom: fetch image on demand (browser lazy-loads + disk-caches).
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
  const { metaEpoch } = useContext(EmojiContext);
  const { src, unicode } = useEmojiSrc(name);
  const [imgFailed, setImgFailed] = useState(false);
  const label = title ?? `:${name}:`;

  useEffect(() => {
    setImgFailed(false);
  }, [src, name, metaEpoch]);

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
        decoding="async"
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
