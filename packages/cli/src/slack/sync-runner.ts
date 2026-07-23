import {
  DELTA_INTERVAL_MS,
  type SyncProgress,
} from "@slack-social/shared";
import { readConfig, writeConfig } from "../config";
import { openDb } from "../db/migrate";
import { anyChannelHasMoreHistory } from "../db/queries";
import { getAuthProvider } from "./auth-provider";
import { backfillWorkspace, syncWorkspace } from "./indexer";
import { checkPermissions } from "./permissions";

const SYNC_TTL_MS = 10 * 60_000;

const idleProgress = (): SyncProgress => ({
  phase: null,
  status: "idle",
  channelsTotal: 0,
  channelsDone: 0,
  messagesIndexed: 0,
  startedAt: null,
  finishedAt: null,
});

let current: SyncProgress = idleProgress();
let running: Promise<void> | null = null;
let backfillRunning: Promise<void> | null = null;
let deltaTimer: ReturnType<typeof setInterval> | null = null;
let deltaInFlight: Promise<void> | null = null;

function countPosts(): boolean {
  try {
    const db = openDb();
    const row = db.query("SELECT COUNT(*) AS c FROM posts WHERE thread_ts = ts").get() as
      | { c: number }
      | undefined;
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

export function getSyncStatus(): SyncProgress & {
  lastSyncAt?: number;
  hasPosts: boolean;
  hasMoreHistory?: boolean;
} {
  const config = readConfig();
  let hasMoreHistory = false;
  try {
    hasMoreHistory = anyChannelHasMoreHistory(openDb());
  } catch {
    /* ignore */
  }
  return {
    ...current,
    lastSyncAt: config.lastSyncAt,
    hasPosts: countPosts(),
    hasMoreHistory,
  };
}

export type StartSyncOptions = {
  force?: boolean;
  /** Skip if last sync was recent (unless force) */
  skipIfFresh?: boolean;
};

function stopDeltaLoop() {
  if (deltaTimer) {
    clearInterval(deltaTimer);
    deltaTimer = null;
  }
}

async function runDeltaOnce() {
  if (running || deltaInFlight || backfillRunning) return;
  deltaInFlight = (async () => {
    try {
      const provider = getAuthProvider();
      const creds = provider.getCredentials();
      const client = provider.createClient();
      const db = openDb();
      const startedAt = Date.now();
      current = {
        phase: "delta",
        status: "running",
        channelsTotal: 0,
        channelsDone: 0,
        messagesIndexed: 0,
        startedAt,
      };
      const result = await syncWorkspace(client, db, creds.accessToken, {
        phase: "delta",
        sessionCookie: creds.sessionCookie,
        startedAt,
        onProgress: (p) => {
          current = { ...p, error: p.error ?? current.error };
        },
      });
      writeConfig({ ...readConfig(), lastSyncAt: Date.now() });
      current = {
        phase: "delta",
        status: "complete",
        channelsTotal: result.channels,
        channelsDone: result.channels,
        messagesIndexed: result.messages,
        startedAt,
        finishedAt: Date.now(),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn("Delta sync failed:", error);
      current = {
        ...current,
        phase: "delta",
        status: "error",
        error,
        finishedAt: Date.now(),
      };
    } finally {
      deltaInFlight = null;
    }
  })();
  await deltaInFlight;
}

export function startDeltaLoop(): void {
  if (deltaTimer) return;
  deltaTimer = setInterval(() => {
    void runDeltaOnce();
  }, DELTA_INTERVAL_MS);
  // Unref so CLI process can exit when not serving; Next keeps process alive anyway
  if (typeof deltaTimer === "object" && "unref" in deltaTimer) {
    (deltaTimer as NodeJS.Timeout).unref?.();
  }
}

/**
 * Start fast-forward boot sync, then background delta loop.
 * No-op (returns current status) if already running.
 */
export function startSync(opts: StartSyncOptions = {}): SyncProgress & {
  lastSyncAt?: number;
  hasPosts: boolean;
  started: boolean;
  hasMoreHistory?: boolean;
} {
  if (running) {
    return { ...getSyncStatus(), started: false };
  }

  const config = readConfig();
  const hasPosts = countPosts();
  if (
    opts.skipIfFresh &&
    !opts.force &&
    hasPosts &&
    config.lastSyncAt &&
    Date.now() - config.lastSyncAt < SYNC_TTL_MS
  ) {
    current = {
      ...idleProgress(),
      status: "complete",
      finishedAt: config.lastSyncAt,
    };
    startDeltaLoop();
    return { ...getSyncStatus(), started: false };
  }

  const startedAt = Date.now();
  current = {
    phase: "fast_forward",
    status: "starting",
    channelsTotal: 0,
    channelsDone: 0,
    messagesIndexed: 0,
    startedAt,
  };

  running = (async () => {
    try {
      const provider = getAuthProvider();
      const perms = await checkPermissions(provider);
      if (!perms.ok) {
        current = {
          phase: "fast_forward",
          status: "error",
          channelsTotal: 0,
          channelsDone: 0,
          messagesIndexed: 0,
          startedAt,
          finishedAt: Date.now(),
          error: perms.error ?? "Permission check failed",
        };
        return;
      }

      const creds = provider.getCredentials();
      const client = provider.createClient();
      const db = openDb();

      const onProgress = (p: SyncProgress) => {
        current = { ...p, error: p.error ?? current.error };
      };

      console.log("Fast-forward sync (last 36h)…");
      const ff = await syncWorkspace(client, db, creds.accessToken, {
        force: opts.force,
        phase: "fast_forward",
        sessionCookie: creds.sessionCookie,
        startedAt,
        onProgress,
      });

      current = {
        phase: "fast_forward",
        status: "fast_forward_done",
        channelsTotal: ff.channels,
        channelsDone: ff.channels,
        messagesIndexed: ff.messages,
        startedAt,
      };

      writeConfig({ ...readConfig(), lastSyncAt: Date.now() });
      current = {
        phase: "fast_forward",
        status: "complete",
        channelsTotal: ff.channels,
        channelsDone: ff.channels,
        messagesIndexed: ff.messages,
        startedAt,
        finishedAt: Date.now(),
      };
      console.log(`\nBoot done. ${ff.channels} channels · ${ff.messages} messages indexed.`);

      startDeltaLoop();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn("Sync failed:", error);
      current = {
        ...current,
        status: "error",
        error,
        finishedAt: Date.now(),
        startedAt: current.startedAt ?? startedAt,
      };
    } finally {
      running = null;
    }
  })();

  void running;

  return { ...getSyncStatus(), started: true };
}

export type BackfillResult = SyncProgress & {
  started: boolean;
  hasMoreHistory: boolean;
  messagesIndexed: number;
};

/** On-demand older history when the feed scrolls past local data. */
export function startBackfill(): BackfillResult {
  if (running || backfillRunning) {
    return {
      ...getSyncStatus(),
      started: false,
      hasMoreHistory: getSyncStatus().hasMoreHistory ?? false,
      messagesIndexed: current.messagesIndexed,
    };
  }

  const startedAt = Date.now();
  current = {
    phase: "backfill",
    status: "starting",
    channelsTotal: 0,
    channelsDone: 0,
    messagesIndexed: 0,
    startedAt,
  };

  let hasMoreHistory = true;
  let messagesIndexed = 0;

  backfillRunning = (async () => {
    try {
      const provider = getAuthProvider();
      const creds = provider.getCredentials();
      const client = provider.createClient();
      const db = openDb();

      const result = await backfillWorkspace(client, db, creds.accessToken, {
        phase: "backfill",
        sessionCookie: creds.sessionCookie,
        startedAt,
        backfillPages: 2,
        onProgress: (p) => {
          current = { ...p, error: p.error ?? current.error };
        },
      });

      hasMoreHistory = result.hasMoreHistory;
      messagesIndexed = result.messages;
      current = {
        phase: "backfill",
        status: "complete",
        channelsTotal: result.channels,
        channelsDone: result.channels,
        messagesIndexed: result.messages,
        startedAt,
        finishedAt: Date.now(),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn("Backfill failed:", error);
      current = {
        ...current,
        phase: "backfill",
        status: "error",
        error,
        finishedAt: Date.now(),
      };
      hasMoreHistory = anyChannelHasMoreHistory(openDb());
    } finally {
      backfillRunning = null;
    }
  })();

  void backfillRunning;

  return {
    ...current,
    started: true,
    hasMoreHistory,
    messagesIndexed,
    hasPosts: countPosts(),
  };
}

/** Await in-flight backfill (for API callers that want to wait). */
export async function runBackfillAndWait(): Promise<BackfillResult> {
  const started = startBackfill();
  if (backfillRunning) await backfillRunning;
  return {
    ...getSyncStatus(),
    started: started.started,
    hasMoreHistory: getSyncStatus().hasMoreHistory ?? false,
    messagesIndexed: current.messagesIndexed,
  };
}

/** Await the in-flight sync (CLI). Starts one if needed. */
export async function runSyncAndWait(opts: StartSyncOptions = {}): Promise<SyncProgress> {
  const result = startSync(opts);
  if (running) await running;
  return getSyncStatus();
}

export function isSyncRunning(): boolean {
  return running !== null || backfillRunning !== null || deltaInFlight !== null;
}

export function stopSyncBackground(): void {
  stopDeltaLoop();
}
