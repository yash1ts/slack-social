#!/usr/bin/env node
/**
 * npm omits directories named node_modules and all symlinks from tarballs.
 * build-npm.sh ships Next standalone deps as web/bundled_modules + a symlink
 * manifest; restore both after install so `slack-social serve` can boot the UI.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = join(root, "web");
const bundled = join(webRoot, "bundled_modules");
const nodeModules = join(webRoot, "node_modules");

if (existsSync(bundled) && !existsSync(nodeModules)) {
  renameSync(bundled, nodeModules);
}

const manifestPath = join(webRoot, "symlink-manifest.json");
if (!existsSync(manifestPath)) process.exit(0);

/** @type {{ from: string, to: string }[]} */
const links = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const { from, to } of links) {
  const dest = join(webRoot, from);
  mkdirSync(dirname(dest), { recursive: true });
  try {
    if (existsSync(dest) || lstatSync(dest).isSymbolicLink()) {
      unlinkSync(dest);
    }
  } catch {
    // dest does not exist
  }
  try {
    symlinkSync(to, dest);
  } catch (err) {
    console.warn(`slack-social: could not restore symlink ${from} → ${to}:`, err);
  }
}
