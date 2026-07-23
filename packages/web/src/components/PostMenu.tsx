"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MoreHorizontal } from "lucide-react";

export function PostMenu({
  postId,
  permalink,
}: {
  postId: string;
  permalink?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openInSlack() {
    setError(null);
    if (permalink) {
      window.open(permalink, "_blank", "noopener,noreferrer");
      setOpen(false);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/permalink`);
      const data = (await res.json()) as { permalink?: string; error?: string };
      if (!res.ok || !data.permalink) {
        throw new Error(data.error ?? "Could not open in Slack");
      }
      window.open(data.permalink, "_blank", "noopener,noreferrer");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open in Slack");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Post options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setError(null);
          setOpen((v) => !v);
        }}
        className="rounded-full p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
      >
        <MoreHorizontal size={18} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-[var(--border)] bg-[#1a1a1a] py-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void openInSlack()}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--text)] hover:bg-white/5 disabled:opacity-50"
          >
            <ExternalLink size={15} className="shrink-0 text-[var(--muted)]" />
            {busy ? "Opening…" : "Open in Slack"}
          </button>
          {error ? (
            <p className="border-t border-[var(--border)] px-3.5 py-2 text-[11px] text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
