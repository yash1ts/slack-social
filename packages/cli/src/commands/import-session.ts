import {
  importBrowserSession,
  listValidBrowserSessionOptions,
  verifyAndStoreSession,
} from "../slack/extract-session";

export async function authImportSession(opts: { launchChrome?: boolean; listOnly?: boolean } = {}): Promise<void> {
  if (opts.listOnly) {
    console.log("Checking browser sessions with Slack…");
    const sessions = await listValidBrowserSessionOptions({
      launchChrome: opts.launchChrome !== false,
    });
    if (!sessions.length) {
      console.log("No valid sessions found (expired tokens are skipped).");
      return;
    }
    console.log(`Found ${sessions.length} valid session(s):\n`);
    for (const s of sessions) {
      console.log(`- ${s.teamName ?? "unknown"} (${s.teamId ?? "?"}) user=${s.userId ?? "?"}`);
      console.log(`  source: ${s.source}`);
      console.log(`  token:  ${s.tokenPreview}`);
    }
    return;
  }

  console.log("Reading Slack session from browser / Slack app Local Storage…");
  const imported = await importBrowserSession({ launchChrome: opts.launchChrome !== false });
  console.log(`Found token from ${imported.source}`);
  if (imported.teamName) console.log(`Team: ${imported.teamName}`);

  const saved = await verifyAndStoreSession(imported);
  console.log(`\nAuthenticated! User ${saved.userId} · Team ${saved.teamId}`);
  console.log("Saved to ~/.slack-social/credentials.json");
}
