import { homedir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { migrate } from "../../../cli/src/db/migrate";
import {
  followUser,
  getAttachment,
  getEmojiAliases,
  getEmojiCatalog,
  getExplore,
  getFeed,
  getFeedPage,
  getMentionMaps,
  getPost,
  getStories,
  getThreadReplies,
  getUserPosts,
  getUserProfile,
  listTags,
  listIndexedChannels,
  markFeedViewed,
  searchPosts,
  unfollowUser,
} from "../../../cli/src/db/queries";

const DB_PATH = join(homedir(), ".slack-social", "db.sqlite");

let cached: Database | null = null;

export function getDb(): Database {
  if (cached) return cached;
  cached = new Database(DB_PATH, { create: true });
  cached.exec("PRAGMA journal_mode = WAL;");
  cached.exec("PRAGMA foreign_keys = ON;");
  migrate(cached);
  return cached;
}

export const dbApi = {
  getFeed,
  getFeedPage,
  getExplore,
  getPost,
  getThreadReplies,
  getStories,
  getUserProfile,
  getUserPosts,
  followUser,
  unfollowUser,
  searchPosts,
  listTags,
  listIndexedChannels,
  getAttachment,
  markFeedViewed,
  getMentionMaps,
  getEmojiCatalog,
  getEmojiAliases,
};
