import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, chmodSync, existsSync } from "node:fs";

export const DATA_DIR = join(homedir(), ".slack-social");
export const DB_PATH = join(DATA_DIR, "db.sqlite");
export const MEDIA_DIR = join(DATA_DIR, "media");
export const EMOJI_DIR = join(DATA_DIR, "emoji");
export const CONFIG_PATH = join(DATA_DIR, "config.json");
export const CREDENTIALS_PATH = join(DATA_DIR, "credentials.json");

export function ensureDataDirs(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(MEDIA_DIR, { recursive: true });
  mkdirSync(EMOJI_DIR, { recursive: true });
  try {
    if (existsSync(DATA_DIR)) chmodSync(DATA_DIR, 0o700);
  } catch {
    // best-effort on platforms that ignore chmod
  }
}
