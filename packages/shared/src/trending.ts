export type ReactionWeightInput = {
  name: string;
  count: number;
};

export type ScoreInput = {
  reactions?: ReactionWeightInput[];
  /** Fallback when per-emoji breakdown is unavailable */
  reactionCount?: number;
  replyCount: number;
  hasMedia: boolean;
  postedAtMs: number;
  nowMs?: number;
  gravity?: number;
};

/** High-signal social reactions */
const HIGH_WEIGHT = new Set([
  "fire",
  "rocket",
  "heart",
  "heart_eyes",
  "tada",
  "100",
  "star",
  "sparkles",
  "trophy",
  "raised_hands",
  "clap",
  "partying_face",
]);

/** Low-value administrative ticks */
const LOW_WEIGHT = new Set([
  "white_check_mark",
  "heavy_check_mark",
  "ballot_box_with_check",
  "eyes",
  "+1",
  "thumbsup",
  "ok_hand",
  "wave",
]);

export function reactionWeight(name: string): number {
  const base = (name.split("::")[0] ?? name).toLowerCase();
  if (HIGH_WEIGHT.has(base)) return 3;
  if (LOW_WEIGHT.has(base)) return 0.35;
  return 1;
}

export function weightedReactionPoints(reactions: ReactionWeightInput[]): number {
  return reactions.reduce((sum, r) => sum + r.count * reactionWeight(r.name), 0);
}

const REPLY_BONUS = 8;
const MEDIA_BONUS = 5;
const DEFAULT_GRAVITY = 1.5;

/**
 * Gravity time-decay engagement score:
 *   points = Σ(count * weight(emoji)) + replyCount * 8 + mediaBonus
 *   score  = points / (ageHours + 2) ^ gravity
 */
export function computeScore(input: ScoreInput): number {
  const now = input.nowMs ?? Date.now();
  const ageHours = Math.max(0, (now - input.postedAtMs) / 3_600_000);
  const gravity = input.gravity ?? DEFAULT_GRAVITY;

  let reactionPoints: number;
  if (input.reactions && input.reactions.length > 0) {
    reactionPoints = weightedReactionPoints(input.reactions);
  } else {
    reactionPoints = (input.reactionCount ?? 0) * 1;
  }

  const points =
    reactionPoints + input.replyCount * REPLY_BONUS + (input.hasMedia ? MEDIA_BONUS : 0);

  if (points <= 0) return 0;
  return points / Math.pow(ageHours + 2, gravity);
}

export function slackTsToMs(ts: string): number {
  const [sec] = ts.split(".");
  return Number(sec) * 1000;
}

/** Slack API timestamp string (seconds.fraction) from epoch milliseconds. */
export function msToSlackTs(ms: number): string {
  return Math.floor(ms / 1000).toString();
}

/** Fast-forward boot window: last 36 hours of messages. */
export const FAST_FORWARD_MS = 36 * 60 * 60 * 1000;

/** @deprecated Use FAST_FORWARD_MS for boot; history grows via lazy backfill. */
export const INDEX_LOOKBACK_MS = FAST_FORWARD_MS;

/** Minimum engagement score to count as "unread high-engagement" for caught-up. */
export const UNREAD_SCORE_FLOOR = 0.5;

/** Background delta sync interval. */
export const DELTA_INTERVAL_MS = 4 * 60_000;
