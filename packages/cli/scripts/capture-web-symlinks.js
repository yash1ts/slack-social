#!/usr/bin/env node
/**
 * Record relative symlinks under web/ so postinstall can restore them.
 * npm/bun pack omit symlinks; Bun's Next standalone layout depends on them.
 */
import { lstatSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const webRoot = process.argv[2];
if (!webRoot) {
  console.error("Usage: capture-web-symlinks.js <web-root>");
  process.exit(1);
}

/** @type {{ from: string, to: string }[]} */
const links = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isSymbolicLink() || (ent.isFile() && lstatSync(full).isSymbolicLink())) {
      const target = readlinkSync(full);
      links.push({
        from: relative(webRoot, full).replaceAll("\\", "/"),
        to: target.replaceAll("\\", "/"),
      });
      continue;
    }
    if (ent.isDirectory()) walk(full);
  }
}

walk(webRoot);
links.sort((a, b) => a.from.localeCompare(b.from));
writeFileSync(join(webRoot, "symlink-manifest.json"), JSON.stringify(links, null, 2) + "\n");
console.log(`Recorded ${links.length} symlinks → symlink-manifest.json`);
