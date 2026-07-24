#!/usr/bin/env node
/**
 * npm/npx entrypoint. Re-executes the CLI with Bun (required for bun:sqlite).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "dist", "cli.js");

if (!existsSync(cli)) {
  console.error(
    "slack-social is not built. From a git checkout run:\n  bun run --filter slack-social build",
  );
  process.exit(1);
}

function resolveBun() {
  if (process.env.BUN_INSTALL) {
    const candidate = join(process.env.BUN_INSTALL, "bin", "bun");
    if (existsSync(candidate)) return candidate;
  }
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["bun"], {
    encoding: "utf8",
  });
  if (which.status === 0) {
    const path = which.stdout.trim().split(/\r?\n/)[0];
    if (path) return path;
  }
  return null;
}

const bun = resolveBun();
if (!bun) {
  console.error(
    "Bun is required to run slack-social.\n" +
      "Install: curl -fsSL https://bun.sh/install | bash\n" +
      "Then re-run: npx slack-social serve",
  );
  process.exit(1);
}

const result = spawnSync(bun, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
