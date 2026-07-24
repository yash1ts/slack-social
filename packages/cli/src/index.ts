#!/usr/bin/env bun
import { Command } from "commander";
import { authLogin, authLogout } from "./commands/auth";
import { authImportSession } from "./commands/import-session";
import { runSync } from "./commands/sync";
import { runServe } from "./commands/serve";
import { runDemo } from "./commands/demo";
import { openDb } from "./db/migrate";
import { getFeed } from "./db/queries";

// Trust OS CA store (corporate proxies / SSL inspection). Opt out with NODE_USE_SYSTEM_CA=0.
if (process.env.NODE_USE_SYSTEM_CA === undefined) {
  process.env.NODE_USE_SYSTEM_CA = "1";
}

const program = new Command();

program
  .name("slack-social")
  .description("Index public Slack activity into a local Instagram-style feed")
  .version("0.1.4");

const auth = program.command("auth").description("Authenticate with Slack");

auth
  .command("logout")
  .description("Remove stored Slack user token")
  .action(async () => {
    await authLogout();
  });

auth
  .command("import-session")
  .description("Import xoxc + cookie from Chrome/Slack app Local Storage")
  .option("--list", "Only list tokens found in Local Storage", false)
  .option("--no-launch-chrome", "Do not launch a debug Chrome to read the d cookie")
  .action(async (opts: { list?: boolean; launchChrome?: boolean }) => {
    await authImportSession({
      listOnly: Boolean(opts.list),
      launchChrome: opts.launchChrome !== false,
    });
  });

auth.action(async () => {
  await authLogin();
});

program
  .command("sync")
  .description("Index public channels into local SQLite")
  .option("-f, --force", "Force a deeper re-sync", false)
  .option("-c, --channels <list>", "Comma-separated channel names or IDs")
  .action(async (opts: { force?: boolean; channels?: string }) => {
    await runSync({
      force: Boolean(opts.force),
      channels: opts.channels?.split(",").map((s) => s.trim()).filter(Boolean),
    });
  });

program
  .command("serve")
  .description("Start the local Instagram-style web UI")
  .option("-p, --port <port>", "Port", "3000")
  .option("--no-sync", "Do not sync before serving")
  .option("-f, --force", "Force sync before serving", false)
  .action(async (opts: { port?: string; sync?: boolean; force?: boolean }) => {
    await runServe({
      port: Number(opts.port ?? 3000),
      noSync: opts.sync === false,
      forceSync: Boolean(opts.force),
    });
  });

program
  .command("demo")
  .description("Try slack-social with local dummy data (no Slack login)")
  .option("-p, --port <port>", "Port", "3000")
  .option("--no-serve", "Only seed demo data; do not start the UI")
  .action(async (opts: { port?: string; serve?: boolean }) => {
    await runDemo({
      port: Number(opts.port ?? 3000),
      serve: opts.serve !== false,
    });
  });

const debug = program.command("debug").description("Developer helpers");

debug
  .command("top")
  .description("Print top trending posts from local DB")
  .action(() => {
    const db = openDb();
    const posts = getFeed(db, { sort: "trending", limit: 10 });
    if (!posts.length) {
      console.log("No posts yet. Run `slack-social sync` first.");
      return;
    }
    for (const p of posts) {
      console.log(
        `[${p.score.toFixed(2)}] #${p.channelName} @${p.displayName} · ${p.reactionCount} reactions · ${p.replyCount} replies`,
      );
      console.log(`  ${(p.text ?? "").slice(0, 120).replace(/\n/g, " ")}`);
    }
  });

program.action(async () => {
  // Default: sync (if fresh skipped) + serve
  await runServe({ port: 3000 });
});

await program.parseAsync(process.argv);
