"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncProgress } from "@slack-social/shared";

type SyncStatusResponse = SyncProgress & {
  lastSyncAt?: number;
  hasPosts: boolean;
  started?: boolean;
  hasMoreHistory?: boolean;
};

function statusLabel(s: SyncStatusResponse): string {
  if (s.status === "error") return s.error ?? "Indexing failed";
  if (s.status === "complete") return "Index up to date";
  if (
    s.status === "fast_forward_done" ||
    s.status === "bootstrap_done" ||
    s.phase === "fast_forward" ||
    s.phase === "bootstrap"
  ) {
    return s.currentChannel
      ? `Fetching recent posts from #${s.currentChannel}…`
      : "Fetching last 36 hours…";
  }
  if (s.phase === "delta" && s.currentChannel) {
    return `Checking #${s.currentChannel} for updates…`;
  }
  if (s.phase === "backfill" && s.currentChannel) {
    return `Loading older posts from #${s.currentChannel}…`;
  }
  if (s.status === "starting" || s.status === "running") {
    return "Building workspace index…";
  }
  return "Preparing index…";
}

function isActive(status: SyncStatusResponse["status"], phase?: SyncStatusResponse["phase"]): boolean {
  // Background delta / on-demand backfill should not re-open the boot banner
  if (phase === "delta" || phase === "backfill") return false;
  return (
    status === "starting" ||
    status === "running" ||
    status === "bootstrap_done" ||
    status === "fast_forward_done"
  );
}

export function IndexingStatus({
  onPostsMaybeReady,
}: {
  onPostsMaybeReady?: () => void;
}) {
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [showCompleteFlash, setShowCompleteFlash] = useState(false);
  const [hidden, setHidden] = useState(false);
  const onReadyRef = useRef(onPostsMaybeReady);
  onReadyRef.current = onPostsMaybeReady;
  const startedRef = useRef(false);
  const readyFiredRef = useRef(false);
  const completeRefreshRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status");
      if (!res.ok) return;
      const data = (await res.json()) as SyncStatusResponse;
      setStatus((prev) => {
        const wasActive = prev ? isActive(prev.status, prev.phase) : false;
        if (
          (data.status === "complete" || data.status === "fast_forward_done") &&
          wasActive
        ) {
          queueMicrotask(() => {
            setShowCompleteFlash(true);
            window.setTimeout(() => {
              setShowCompleteFlash(false);
              setHidden(true);
            }, 2200);
          });
        }
        if (data.status === "error" && data.phase !== "delta") {
          queueMicrotask(() => setHidden(false));
        }
        return data;
      });
      const hasContent =
        data.messagesIndexed > 0 || data.hasPosts || data.status === "fast_forward_done";
      if (hasContent && !readyFiredRef.current) {
        readyFiredRef.current = true;
        onReadyRef.current?.();
      } else if (data.status === "fast_forward_done" && !completeRefreshRef.current) {
        completeRefreshRef.current = true;
        onReadyRef.current?.();
      }
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(
    async (force = false) => {
      setHidden(false);
      setShowCompleteFlash(false);
      readyFiredRef.current = false;
      completeRefreshRef.current = false;
      try {
        const res = await fetch("/api/sync/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force, skipIfFresh: !force }),
        });
        if (res.ok) {
          const data = (await res.json()) as SyncStatusResponse;
          setStatus(data);
          if (data.status === "complete" && !data.started && data.hasPosts) {
            setHidden(true);
          }
        }
      } catch {
        /* ignore */
      }
      await poll();
    },
    [poll],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start(false);
  }, [start]);

  useEffect(() => {
    if (!status || !isActive(status.status, status.phase)) return;
    const id = window.setInterval(() => void poll(), 3000);
    return () => window.clearInterval(id);
  }, [status?.status, status?.phase, poll]);

  if (hidden && !showCompleteFlash) return null;
  if (!status) return null;

  const active = isActive(status.status, status.phase);
  const errored = status.status === "error" && status.phase !== "delta";
  const complete = status.status === "complete" && showCompleteFlash;

  if (!active && !errored && !complete) return null;

  const pct =
    status.channelsTotal > 0
      ? Math.min(100, Math.round((status.channelsDone / status.channelsTotal) * 100))
      : null;

  return (
    <div
      className={`border-b border-[var(--border)] px-4 py-3 ${
        errored ? "bg-red-950/40" : "bg-[#141414]"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${errored ? "text-red-300" : "text-white"}`}>
            {complete ? "Index up to date" : statusLabel(status)}
          </p>
          {!errored && !complete ? (
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {status.messagesIndexed > 0
                ? `${status.messagesIndexed} messages indexed`
                : "Indexing last 36 hours of public channels"}
              {status.channelsTotal > 0
                ? ` · ${status.channelsDone}/${status.channelsTotal} channels`
                : ""}
            </p>
          ) : null}
          {errored ? (
            <p className="mt-0.5 text-xs text-red-300/80">{status.error}</p>
          ) : null}
        </div>
        {errored ? (
          <button
            type="button"
            onClick={() => void start(true)}
            className="shrink-0 rounded-lg border border-red-400/40 px-2.5 py-1 text-xs font-semibold text-red-200 hover:bg-red-900/40"
          >
            Retry
          </button>
        ) : null}
      </div>

      {active ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#2a2a2a]">
          {pct !== null ? (
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#f77737] via-[#e1306c] to-[#c13584] transition-[width] duration-500"
              style={{ width: `${Math.max(pct, 4)}%` }}
            />
          ) : (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-[#f77737] via-[#e1306c] to-[#c13584]" />
          )}
        </div>
      ) : null}
    </div>
  );
}
