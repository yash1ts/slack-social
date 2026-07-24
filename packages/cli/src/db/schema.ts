export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  real_name TEXT,
  avatar_url TEXT,
  title TEXT,
  email TEXT,
  about TEXT,
  phone TEXT,
  is_bot INTEGER DEFAULT 0,
  reactions_earned INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  topic TEXT,
  is_archived INTEGER DEFAULT 0,
  member_count INTEGER,
  default_tag TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  user_id TEXT REFERENCES users(id),
  ts TEXT NOT NULL,
  thread_ts TEXT,
  text TEXT,
  permalink TEXT,
  reply_count INTEGER DEFAULT 0,
  reaction_count INTEGER DEFAULT 0,
  has_media INTEGER DEFAULT 0,
  score REAL DEFAULT 0,
  posted_at INTEGER NOT NULL,
  synced_at INTEGER NOT NULL,
  UNIQUE(channel_id, ts)
);

CREATE INDEX IF NOT EXISTS posts_score ON posts(score DESC);
CREATE INDEX IF NOT EXISTS posts_score_posted ON posts(score DESC, posted_at DESC);
CREATE INDEX IF NOT EXISTS posts_posted ON posts(posted_at DESC);
CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS posts_channel ON posts(channel_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS posts_thread ON posts(channel_id, thread_ts);

CREATE TABLE IF NOT EXISTS reactions (
  post_id TEXT NOT NULL REFERENCES posts(id),
  name TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (post_id, name)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  mimetype TEXT,
  title TEXT,
  url_private TEXT,
  local_path TEXT,
  width INTEGER,
  height INTEGER,
  thumb_url TEXT
);

CREATE INDEX IF NOT EXISTS attachments_post ON attachments(post_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS post_tags_tag ON post_tags(tag_id, post_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  followee_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_sync (
  channel_id TEXT PRIMARY KEY REFERENCES channels(id),
  newest_synced_ts TEXT,
  oldest_synced_ts TEXT,
  has_more_history INTEGER NOT NULL DEFAULT 1,
  last_synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS emojis (
  name TEXT PRIMARY KEY,
  url TEXT,
  alias_of TEXT,
  local_path TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
`;
