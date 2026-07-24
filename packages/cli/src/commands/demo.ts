import { readConfig, readCredentials, writeConfig, writeCredentials } from "../config";
import { openDb } from "../db/migrate";
import {
  applyPostTags,
  followUser,
  recomputeScores,
  replaceReactions,
  upsertChannel,
  upsertChannelSync,
  upsertPost,
  upsertUser,
} from "../db/queries";
import { runServe } from "./serve";

const DEMO_TEAM = "T_DEMO";
const DEMO_YOU = "U_DEMO_YOU";

type SeedUser = {
  id: string;
  displayName: string;
  realName: string;
  title: string;
  about?: string;
};

type SeedChannel = {
  id: string;
  name: string;
  topic: string;
  defaultTag: string;
  memberCount: number;
};

type SeedPost = {
  channelId: string;
  userId: string;
  text: string;
  hoursAgo: number;
  reactions: Array<{ name: string; count: number }>;
  replies?: Array<{ userId: string; text: string; minutesAfter: number }>;
};

function avatar(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}`;
}

function tsFromMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const frac = String(ms % 1000).padStart(3, "0");
  return `${sec}.${frac}00`;
}

const USERS: SeedUser[] = [
  {
    id: DEMO_YOU,
    displayName: "You",
    realName: "Demo Visitor",
    title: "Trying slack-social",
    about: "Local trial profile — connect Slack anytime with `slack-social auth`.",
  },
  {
    id: "U_DEMO_MAYA",
    displayName: "Maya Chen",
    realName: "Maya Chen",
    title: "Product Design",
    about: "Pixels, prototypes, and coffee.",
  },
  {
    id: "U_DEMO_JORDAN",
    displayName: "Jordan Blake",
    realName: "Jordan Blake",
    title: "Engineering",
    about: "Shipping small PRs, big vibes.",
  },
  {
    id: "U_DEMO_PRIYA",
    displayName: "Priya Nair",
    realName: "Priya Nair",
    title: "People Ops",
    about: "Here for the humans.",
  },
  {
    id: "U_DEMO_SAM",
    displayName: "Sam Okonkwo",
    realName: "Sam Okonkwo",
    title: "Customer Success",
    about: "Wins > tickets.",
  },
  {
    id: "U_DEMO_RILEY",
    displayName: "Riley Park",
    realName: "Riley Park",
    title: "Marketing",
    about: "Story > noise.",
  },
  {
    id: "U_DEMO_ALEX",
    displayName: "Alex Rivera",
    realName: "Alex Rivera",
    title: "Platform",
    about: "Make the boring parts disappear.",
  },
];

const CHANNELS: SeedChannel[] = [
  {
    id: "C_DEMO_ENG",
    name: "engineering",
    topic: "Ship it, then celebrate it",
    defaultTag: "engineering",
    memberCount: 48,
  },
  {
    id: "C_DEMO_DESIGN",
    name: "design",
    topic: "Craft and critique",
    defaultTag: "design",
    memberCount: 22,
  },
  {
    id: "C_DEMO_WATER",
    name: "watercooler",
    topic: "Memes, pets, weekend plans",
    defaultTag: "culture",
    memberCount: 120,
  },
  {
    id: "C_DEMO_WINS",
    name: "wins",
    topic: "Shoutouts and shipped moments",
    defaultTag: "wins",
    memberCount: 95,
  },
];

const POSTS: SeedPost[] = [
  {
    channelId: "C_DEMO_WINS",
    userId: "U_DEMO_PRIYA",
    text: "Huge shoutout to <@U_DEMO_MAYA> for the onboarding polish — new hires actually smiled in the survey :tada:",
    hoursAgo: 1.2,
    reactions: [
      { name: "tada", count: 14 },
      { name: "heart", count: 9 },
      { name: "clap", count: 6 },
    ],
    replies: [
      {
        userId: "U_DEMO_MAYA",
        text: "Team effort — <@U_DEMO_JORDAN> unblocked the last edge case overnight.",
        minutesAfter: 18,
      },
      {
        userId: DEMO_YOU,
        text: "This is exactly why I wanted a feed instead of buried channel scroll.",
        minutesAfter: 42,
      },
    ],
  },
  {
    channelId: "C_DEMO_ENG",
    userId: "U_DEMO_JORDAN",
    text: "Feed ranking v2 is live locally. Trending now weights replies + freshness so quiet gems still surface :rocket:",
    hoursAgo: 2.5,
    reactions: [
      { name: "fire", count: 11 },
      { name: "rocket", count: 7 },
      { name: "+1", count: 5 },
    ],
    replies: [
      {
        userId: "U_DEMO_ALEX",
        text: "Nice — scores feel less “loud channel wins everything.”",
        minutesAfter: 25,
      },
    ],
  },
  {
    channelId: "C_DEMO_DESIGN",
    userId: "U_DEMO_MAYA",
    text: "Exploring a softer story ring for people who posted in the last day. Less dashboard, more hangout.",
    hoursAgo: 3.1,
    reactions: [
      { name: "eyes", count: 8 },
      { name: "heart", count: 6 },
      { name: "sparkles", count: 4 },
    ],
  },
  {
    channelId: "C_DEMO_WATER",
    userId: "U_DEMO_SAM",
    text: "Office plant update: the monstera survived another sprint. Naming suggestions welcome.",
    hoursAgo: 4.4,
    reactions: [
      { name: "seedling", count: 12 },
      { name: "joy", count: 7 },
    ],
    replies: [
      {
        userId: "U_DEMO_RILEY",
        text: "Call it `main` and never force-push near it.",
        minutesAfter: 12,
      },
    ],
  },
  {
    channelId: "C_DEMO_ENG",
    userId: "U_DEMO_ALEX",
    text: "Reminder: public channels only get indexed. Private gossip stays private — as it should.",
    hoursAgo: 5.0,
    reactions: [
      { name: "+1", count: 16 },
      { name: "lock", count: 3 },
    ],
  },
  {
    channelId: "C_DEMO_WINS",
    userId: "U_DEMO_RILEY",
    text: "Customer quote of the week: “Work finally feels like hanging out with the team again.”",
    hoursAgo: 6.2,
    reactions: [
      { name: "heart", count: 18 },
      { name: "star", count: 5 },
    ],
  },
  {
    channelId: "C_DEMO_DESIGN",
    userId: "U_DEMO_MAYA",
    text: "Dropped a calmer login screen — brand first, fewer form fields fighting for attention.",
    hoursAgo: 8.5,
    reactions: [
      { name: "art", count: 9 },
      { name: "clap", count: 4 },
    ],
  },
  {
    channelId: "C_DEMO_WATER",
    userId: "U_DEMO_JORDAN",
    text: "Anyone else context-switching between 14 channels and forgetting who the funny people are? Asking for a friend.",
    hoursAgo: 10.0,
    reactions: [
      { name: "raised_hands", count: 21 },
      { name: "joy", count: 10 },
    ],
  },
  {
    channelId: "C_DEMO_ENG",
    userId: DEMO_YOU,
    text: "Trying the demo feed before connecting my real workspace. So far: vibes > inbox.",
    hoursAgo: 0.5,
    reactions: [
      { name: "wave", count: 3 },
      { name: "thumbsup", count: 2 },
    ],
  },
  {
    channelId: "C_DEMO_WINS",
    userId: "U_DEMO_SAM",
    text: "Closed three renewals after folks found each other in #wins instead of hunting threads. Small product, big culture.",
    hoursAgo: 14,
    reactions: [
      { name: "tada", count: 10 },
      { name: "muscle", count: 4 },
    ],
  },
  {
    channelId: "C_DEMO_DESIGN",
    userId: "U_DEMO_RILEY",
    text: "Moodboard for “Instagram for Slack” — less purple glow, more actual workplace warmth.",
    hoursAgo: 18,
    reactions: [
      { name: "heart", count: 7 },
      { name: "camera", count: 3 },
    ],
  },
  {
    channelId: "C_DEMO_ENG",
    userId: "U_DEMO_ALEX",
    text: "SQLite on your laptop. Zero cloud drama. That’s the whole pitch.",
    hoursAgo: 22,
    reactions: [
      { name: "fire", count: 13 },
      { name: "+1", count: 8 },
    ],
  },
];

function clearPreviousDemoData(db: ReturnType<typeof openDb>): void {
  const demoPosts = db
    .query(`SELECT id FROM posts WHERE id LIKE 'C_DEMO_%' OR channel_id LIKE 'C_DEMO_%'`)
    .all() as Array<{ id: string }>;
  for (const { id } of demoPosts) {
    db.run("DELETE FROM reactions WHERE post_id = ?", [id]);
    db.run("DELETE FROM attachments WHERE post_id = ?", [id]);
    db.run("DELETE FROM post_tags WHERE post_id = ?", [id]);
    db.run("DELETE FROM posts WHERE id = ?", [id]);
  }
  db.run("DELETE FROM channel_sync WHERE channel_id LIKE 'C_DEMO_%'");
  db.run("DELETE FROM channels WHERE id LIKE 'C_DEMO_%'");
  db.run("DELETE FROM follows WHERE followee_id LIKE 'U_DEMO_%'");
  // Keep demo users if referenced elsewhere; wipe & recreate for a clean trial
  db.run("DELETE FROM users WHERE id LIKE 'U_DEMO_%'");
  db.run(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM post_tags)`);
}

function seedDemoWorkspace(): { users: number; channels: number; posts: number } {
  const db = openDb();
  const now = Date.now();

  db.transaction(() => {
    clearPreviousDemoData(db);

    for (const u of USERS) {
      upsertUser(db, {
        id: u.id,
        displayName: u.displayName,
        realName: u.realName,
        avatarUrl: avatar(u.displayName),
        title: u.title,
        about: u.about ?? null,
        isBot: false,
      });
    }

    for (const ch of CHANNELS) {
      upsertChannel(db, {
        id: ch.id,
        name: ch.name,
        topic: ch.topic,
        defaultTag: ch.defaultTag,
        memberCount: ch.memberCount,
      });
      upsertChannelSync(db, {
        channelId: ch.id,
        newestSyncedTs: tsFromMs(now),
        oldestSyncedTs: tsFromMs(now - 7 * 24 * 3600_000),
        hasMoreHistory: false,
        lastSyncedAt: now,
      });
    }

    for (const post of POSTS) {
      const postedAt = now - Math.round(post.hoursAgo * 3600_000);
      const ts = tsFromMs(postedAt);
      const id = `${post.channelId}:${ts}`;
      const reactionCount = post.reactions.reduce((n, r) => n + r.count, 0);
      const replyCount = post.replies?.length ?? 0;
      const channel = CHANNELS.find((c) => c.id === post.channelId);

      upsertPost(db, {
        id,
        channelId: post.channelId,
        userId: post.userId,
        ts,
        threadTs: ts,
        text: post.text,
        permalink: `https://demo.slack-social.local/archives/${post.channelId}/p${ts.replace(".", "")}`,
        replyCount,
        reactionCount,
        hasMedia: false,
        postedAt,
      });
      replaceReactions(db, id, post.reactions);
      applyPostTags(db, id, {
        channelName: channel?.name,
        channelDefaultTag: channel?.defaultTag,
        text: post.text,
        reactionNames: post.reactions.map((r) => r.name),
      });

      for (const reply of post.replies ?? []) {
        const replyAt = postedAt + reply.minutesAfter * 60_000;
        const replyTs = tsFromMs(replyAt);
        const replyId = `${post.channelId}:${replyTs}`;
        upsertPost(db, {
          id: replyId,
          channelId: post.channelId,
          userId: reply.userId,
          ts: replyTs,
          threadTs: ts,
          text: reply.text,
          permalink: `https://demo.slack-social.local/archives/${post.channelId}/p${replyTs.replace(".", "")}`,
          replyCount: 0,
          reactionCount: 0,
          hasMedia: false,
          postedAt: replyAt,
        });
      }
    }

    for (const followee of ["U_DEMO_MAYA", "U_DEMO_JORDAN", "U_DEMO_PRIYA", "U_DEMO_SAM"]) {
      followUser(db, followee);
    }
  })();

  recomputeScores(db);

  const posts = db
    .query(`SELECT COUNT(*) AS c FROM posts WHERE channel_id LIKE 'C_DEMO_%' AND thread_ts = ts`)
    .get() as { c: number };

  return {
    users: USERS.length,
    channels: CHANNELS.length,
    posts: posts.c,
  };
}

function writeDemoSession(): void {
  const existing = readCredentials();
  if (existing && existing.authKind !== "demo") {
    console.log(
      "Note: replacing your Slack login with a demo session.\n" +
        "Reconnect later with: slack-social auth\n",
    );
  }

  writeCredentials({
    accessToken: "xoxdemo-local-trial-not-a-real-token",
    teamId: DEMO_TEAM,
    userId: DEMO_YOU,
    clientId: "demo",
    obtainedAt: Date.now(),
    authKind: "demo",
    teamName: "Demo Workspace",
    scopes: ["demo"],
  });

  writeConfig({
    ...readConfig(),
    lastSyncAt: Date.now(),
  });
}

export async function runDemo(opts: {
  port?: number;
  serve?: boolean;
}): Promise<void> {
  console.log("Seeding demo workspace (dummy data, no Slack calls)…");
  const counts = seedDemoWorkspace();
  writeDemoSession();

  console.log(
    `Ready: ${counts.users} people · ${counts.channels} channels · ${counts.posts} posts\n` +
      "This is a local trial — nothing is uploaded anywhere.\n" +
      "When you’re ready for your real workspace: slack-social auth && slack-social sync\n",
  );

  if (opts.serve === false) {
    console.log("Seed only. Start the UI with: slack-social serve");
    return;
  }

  await runServe({
    port: opts.port ?? 3000,
    noSync: true,
  });
}
