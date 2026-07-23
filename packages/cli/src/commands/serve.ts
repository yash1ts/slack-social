import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";
import { openDb } from "../db/migrate";

function findWebDir(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidates = [
    join(here, "../../../web"),
    join(process.cwd(), "packages/web"),
    join(import.meta.dir, "../../../web"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "package.json"))) return c;
  }
  throw new Error("Could not locate packages/web");
}

export async function runServe(opts: {
  port?: number;
  noSync?: boolean;
  forceSync?: boolean;
}): Promise<void> {
  // Ensure DB exists; indexing is driven by the web UI so progress is visible
  openDb();

  if (opts.noSync) {
    console.log("Auto-sync disabled (--no-sync). Start indexing from the UI or run slack-social sync.");
  } else if (opts.forceSync) {
    console.log("Force sync will run from the web UI after login (progress shown in the feed).");
  } else {
    console.log("Workspace indexing starts from the web UI after login (with progress).");
  }

  const port = opts.port ?? 3000;
  const webDir = findWebDir();
  const url = `http://localhost:${port}`;

  console.log(`\nStarting slack-social UI on ${url}`);
  console.log(`Web package: ${webDir}\n`);

  const child = spawn("bun", ["--bun", "next", "dev", "-p", String(port)], {
    cwd: webDir,
    stdio: "inherit",
    env: { ...process.env, PORT: String(port) },
  });

  setTimeout(() => {
    void open(url);
  }, 2500);

  await new Promise<void>((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Web server exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
