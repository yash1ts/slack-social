import { writeFileSync } from "node:fs";
import { join } from "node:path";
import data from "emoji-datasource/emoji.json";

function unifiedToUnicode(unified: string): string {
  return unified
    .split("-")
    .map((h) => String.fromCodePoint(parseInt(h, 16)))
    .join("");
}

const map: Record<string, string> = {};
for (const e of data as Array<{ unified: string; short_name: string; short_names?: string[] }>) {
  if (!e.unified) continue;
  const unicode = unifiedToUnicode(e.unified);
  for (const name of new Set([e.short_name, ...(e.short_names ?? [])])) {
    if (name) map[name] = unicode;
  }
}

Object.assign(map, {
  thumbsup: map["+1"] ?? "👍",
  thumbsdown: map["-1"] ?? "👎",
  simple_smile: map.slightly_smiling_face ?? "🙂",
  white_square: map.white_large_square ?? "⬜",
  black_square: map.black_large_square ?? "⬛",
  shipit: map.chipmunk ?? "🐿️",
  squirrel: map.chipmunk ?? "🐿️",
});

const out = join(import.meta.dir, "../src/emoji-map.json");
writeFileSync(out, JSON.stringify(map));
console.log(`Wrote ${Object.keys(map).length} emoji → ${out}`);
