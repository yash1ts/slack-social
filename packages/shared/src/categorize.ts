/** Canonical feed tags used by the UI and auto-tagger. */
export const FEED_CONTENT_TAGS = [
  "engineering",
  "design",
  "culture",
  "productivity",
  "wins",
  "events",
  "announcement",
] as const;

export type FeedContentTag = (typeof FEED_CONTENT_TAGS)[number];

const CHANNEL_RULES: Array<{ pattern: RegExp; tag: FeedContentTag }> = [
  { pattern: /(eng|tech|dev|code|backend|frontend|infra|platform|sre|k8s)/i, tag: "engineering" },
  { pattern: /(design|figma|brand|ux|ui|creative)/i, tag: "design" },
  { pattern: /(watercooler|social|random|culture|fun|pets|memes)/i, tag: "culture" },
  { pattern: /(productiv|focus|habits|tools)/i, tag: "productivity" },
  { pattern: /(win|shipped|kudos|celebration|celebrate)/i, tag: "wins" },
  { pattern: /(event|meetup|conference|townhall|all-hands)/i, tag: "events" },
  { pattern: /(announce|launch|release|news)/i, tag: "announcement" },
];

const KEYWORD_RULES: Array<{ pattern: RegExp; tag: FeedContentTag }> = [
  {
    pattern: /\b(pull request|pull-request|\bpr\b|merge|deploy|k8s|kubernetes|typescript|python|rust|api|bug|ci\/cd)\b/i,
    tag: "engineering",
  },
  {
    pattern: /\b(figma|prototype|wireframe|typography|palette|mockup|design system)\b/i,
    tag: "design",
  },
  {
    pattern: /\b(coffee|lunch|happy hour|weekend|pet|meme|joke)\b/i,
    tag: "culture",
  },
  {
    pattern: /\b(standup|focus time|calendar|notion|todo|productivity)\b/i,
    tag: "productivity",
  },
  {
    pattern: /\b(shipped|launch day|milestone|congrats|congratulations|woohoo)\b/i,
    tag: "wins",
  },
  {
    pattern: /\b(meetup|conference|webinar|rsvp|all-?hands|town ?hall)\b/i,
    tag: "events",
  },
  {
    pattern: /\b(announcement|please read|fyi|breaking change|policy)\b/i,
    tag: "announcement",
  },
];

const EMOJI_TAG_RULES: Array<{ pattern: RegExp; tag: FeedContentTag }> = [
  { pattern: /^(python|javascript|typescript|rust|golang|docker|kubernetes|k8s|bug|robot_face)$/i, tag: "engineering" },
  { pattern: /^(palette|art|figma|paintbrush|crayon|lower_left_paintbrush)$/i, tag: "design" },
  { pattern: /^(coffee|pizza|tada|party_parrot|blob-dance|joy|smile)$/i, tag: "culture" },
  { pattern: /^(muscle|rocket|trophy|medal|star|sparkles)$/i, tag: "wins" },
  { pattern: /^(calendar|mega|loudspeaker|speaker)$/i, tag: "events" },
  { pattern: /^(fire|100|heart|heart_eyes)$/i, tag: "wins" },
];

/** Tier 1: map a Slack channel name to a default feed tag (or null). */
export function defaultTagForChannel(channelName: string): FeedContentTag | null {
  const name = channelName.replace(/^#/, "").toLowerCase();
  for (const rule of CHANNEL_RULES) {
    if (rule.pattern.test(name)) return rule.tag;
  }
  return null;
}

function extractHashtags(text: string): string[] {
  return (
    text.match(/#([a-zA-Z0-9_-]+)/g)?.map((t) => t.slice(1).toLowerCase()) ?? []
  );
}

function tagsFromKeywords(text: string): FeedContentTag[] {
  const out: FeedContentTag[] = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text) && !out.includes(rule.tag)) out.push(rule.tag);
  }
  return out;
}

function tagsFromEmojis(reactionNames: string[]): FeedContentTag[] {
  const out: FeedContentTag[] = [];
  for (const name of reactionNames) {
    const base = name.split("::")[0] ?? name;
    for (const rule of EMOJI_TAG_RULES) {
      if (rule.pattern.test(base) && !out.includes(rule.tag)) out.push(rule.tag);
    }
  }
  return out;
}

export type CategorizeInput = {
  channelName?: string | null;
  channelDefaultTag?: string | null;
  text?: string | null;
  reactionNames?: string[];
};

/**
 * 3-tier heuristic: channel mapping → keywords/hashtags → emoji signals.
 * Returns a de-duplicated list of lowercase tag names.
 */
export function categorizePost(input: CategorizeInput): string[] {
  const tags = new Set<string>();

  // Tier 1 — channel mapping
  const channelTag =
    input.channelDefaultTag ??
    (input.channelName ? defaultTagForChannel(input.channelName) : null);
  if (channelTag) tags.add(channelTag.toLowerCase());

  // Tier 2 — hashtags + domain keywords
  const text = input.text ?? "";
  if (text) {
    for (const h of extractHashtags(text)) {
      // Prefer canonical content tags when hashtag matches one
      const canonical = FEED_CONTENT_TAGS.find((t) => t === h);
      tags.add(canonical ?? h);
    }
    for (const t of tagsFromKeywords(text)) tags.add(t);
  }

  // Tier 3 — emoji / reaction signals
  for (const t of tagsFromEmojis(input.reactionNames ?? [])) tags.add(t);

  return [...tags];
}
