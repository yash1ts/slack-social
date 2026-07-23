import { Database } from "bun:sqlite";
import { DB_PATH, ensureDataDirs } from "../paths";
import { SCHEMA_SQL } from "./schema";

let dbInstance: Database | null = null;

export function openDb(readonly = false): Database {
  ensureDataDirs();
  if (!readonly) {
    if (dbInstance) return dbInstance;
    dbInstance = new Database(DB_PATH, { create: true });
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
    migrate(dbInstance);
    return dbInstance;
  }
  const db = new Database(DB_PATH, { readonly: true, create: false });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function hasColumn(db: Database, table: string, column: string): boolean {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function migrationApplied(db: Database, id: number): boolean {
  const row = db.query("SELECT id FROM schema_migrations WHERE id = ?").get(id) as
    | { id: number }
    | null;
  return Boolean(row);
}

function markMigration(db: Database, id: number): void {
  db.run("INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)", [
    id,
    Date.now(),
  ]);
}

export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL);
  if (!migrationApplied(db, 1)) {
    markMigration(db, 1);
  }

  if (!migrationApplied(db, 2)) {
    if (!hasColumn(db, "channels", "default_tag")) {
      try {
        db.exec("ALTER TABLE channels ADD COLUMN default_tag TEXT;");
      } catch {
        /* column may already exist */
      }
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS channel_sync (
        channel_id TEXT PRIMARY KEY REFERENCES channels(id),
        newest_synced_ts TEXT,
        oldest_synced_ts TEXT,
        has_more_history INTEGER NOT NULL DEFAULT 1,
        last_synced_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS posts_score_posted ON posts(score DESC, posted_at DESC);
      CREATE INDEX IF NOT EXISTS posts_posted ON posts(posted_at DESC);
      CREATE INDEX IF NOT EXISTS post_tags_tag ON post_tags(tag_id, post_id);
    `);

    const legacy = db
      .query("SELECT key, value FROM sync_state WHERE key LIKE 'channel:%'")
      .all() as Array<{ key: string; value: string }>;
    for (const row of legacy) {
      const channelId = row.key.slice("channel:".length);
      if (!channelId) continue;
      const channelExists = db.query("SELECT 1 FROM channels WHERE id = ?").get(channelId);
      if (!channelExists) continue;
      db.run(
        `INSERT INTO channel_sync (channel_id, newest_synced_ts, oldest_synced_ts, has_more_history, last_synced_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(channel_id) DO UPDATE SET
           newest_synced_ts = COALESCE(channel_sync.newest_synced_ts, excluded.newest_synced_ts)`,
        [channelId, row.value, row.value, Date.now()],
      );
    }

    markMigration(db, 2);
  }

  if (!migrationApplied(db, 3)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS emojis (
        name TEXT PRIMARY KEY,
        url TEXT,
        alias_of TEXT,
        local_path TEXT,
        updated_at INTEGER NOT NULL
      );
    `);
    markMigration(db, 3);
  }
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
