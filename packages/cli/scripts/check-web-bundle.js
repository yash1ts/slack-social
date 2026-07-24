#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = join(root, "web", "bundled_modules");
const nodeModules = join(root, "web", "node_modules");
const server = join(root, "web", "packages", "web", "server.js");
const manifest = join(root, "web", "symlink-manifest.json");

if (
  !existsSync(server) ||
  !existsSync(manifest) ||
  (!existsSync(bundled) && !existsSync(nodeModules))
) {
  console.error(
    "Missing packages/cli/web standalone bundle.\n" +
      "From the repo root run: bun run build:npm\n" +
      "Then publish with: bun run publish:npm",
  );
  process.exit(1);
}
