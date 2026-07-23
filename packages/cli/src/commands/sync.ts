import type { SyncOptions } from "../slack/indexer";
import { runSyncAndWait } from "../slack/sync-runner";

export async function runSync(opts: SyncOptions & { skipIfFresh?: boolean } = {}): Promise<void> {
  const status = await runSyncAndWait({
    force: opts.force,
    skipIfFresh: opts.skipIfFresh,
  });
  if (status.status === "error") {
    throw new Error(status.error ?? "Sync failed");
  }
}
