/**
 * Filters for Slack bots / corporate integrations so the feed indexes real people only.
 */

/** Exact Slack usernames / bot handles (lowercase, no @). */
const EXACT_BOT_NAMES = new Set([
  "slackbot",
  "slack-bot",
  "github",
  "github-bot",
  "githubbot",
  "dependabot",
  "dependabot[bot]",
  "renovate",
  "renovate[bot]",
  "jira",
  "jira-cloud",
  "confluence",
  "bitbucket",
  "trello",
  "atlassian",
  "opsgenie",
  "statuspage",
  "linear",
  "notion",
  "asana",
  "monday",
  "clickup",
  "todoist",
  "pagerduty",
  "datadog",
  "sentry",
  "newrelic",
  "grafana",
  "prometheus",
  "circleci",
  "travis-ci",
  "travisci",
  "jenkins",
  "buildkite",
  "gitlab",
  "gitlab-bot",
  "azure-pipelines",
  "aws",
  "amazon-q",
  "okta",
  "auth0",
  "zoom",
  "loom",
  "calendly",
  "gcalendar",
  "google-calendar",
  "outlook-calendar",
  "intercom",
  "zendesk",
  "hubspot",
  "salesforce",
  "zapier",
  "ifttt",
  "hubot",
  "giphy",
  "gif",
  "poll",
  "simplepoll",
  "donut",
  "standuply",
  "geekbot",
  "dailybot",
  "range",
  "cultureamp",
  "lattice",
  "lever",
  "greenhouse",
  "figma",
  "figjam",
  "miro",
  "lucid",
  "vercel",
  "netlify",
  "heroku",
  "railway",
  "codecov",
  "sonarcloud",
  "sonarqube",
  "snyk",
  "crowdstrike",
  "1password",
  "lastpass",
  "duo",
  "incident",
  "firehydrant",
  "rootly",
  "shortcut",
  "clubhouse",
  "airtable",
  "coda",
  "dropbox",
  "box",
  "drive",
  "google_drive",
  "outgoing-webhook",
  "incoming-webhook",
]);

/**
 * Substrings matched against username / display / real name.
 * Keep these specific enough to avoid blocking humans named e.g. "Alex Git".
 */
const BOT_NAME_PATTERNS: RegExp[] = [
  /\bgithub[-_ ]?(app|bot|actions?)?\b/i,
  /\bdependabot\b/i,
  /\brenovate\b/i,
  /\bjira([-_ ]?(cloud|server|bot|app))?\b/i,
  /\batlassian\b/i,
  /\bconfluence\b/i,
  /\bbitbucket\b/i,
  /\bslackbot\b/i,
  /\bslack[-_ ]?bot\b/i,
  /\bpagerduty\b/i,
  /\bdatadog\b/i,
  /\bsentry[-_ ]?bot\b/i,
  /\bnew[-_ ]?relic\b/i,
  /\bcircle[-_ ]?ci\b/i,
  /\bjenkins\b/i,
  /\bbuildkite\b/i,
  /\bgitlab[-_ ]?bot\b/i,
  /\bazure[-_ ]?(devops|pipelines)\b/i,
  /\bopsgenie\b/i,
  /\bzapier\b/i,
  /\bhubot\b/i,
  /\bwebhook\b/i,
  /\bincoming[-_ ]?webhook\b/i,
  /\boutgoing[-_ ]?webhook\b/i,
  /\[bot\]$/i,
  /[-_]bot$/i,
  /^bot[-_]/i,
];

/** Slack message subtypes that are never human posts. */
const SKIP_SUBTYPES = new Set([
  "bot_message",
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "channel_archive",
  "channel_unarchive",
  "group_join",
  "group_leave",
  "group_topic",
  "group_purpose",
  "group_name",
  "group_archive",
  "group_unarchive",
  "file_comment",
  "pinned_item",
  "unpinned_item",
  "ekm_access_denied",
  "channel_posting_permissions",
  "reminder_add",
  "thread_broadcast", // keep? These are human — do NOT skip
]);

// thread_broadcast is a human sharing a thread reply to channel — allow it
SKIP_SUBTYPES.delete("thread_broadcast");

export type BotFilterUser = {
  id?: string | null;
  name?: string | null;
  real_name?: string | null;
  is_bot?: boolean | null;
  is_app_user?: boolean | null;
  profile?: {
    display_name?: string | null;
    real_name?: string | null;
    bot_id?: string | null;
  } | null;
};

export type BotFilterMessage = {
  user?: string | null;
  bot_id?: string | null;
  subtype?: string | null;
  username?: string | null;
  /** Some app messages set this */
  app_id?: string | null;
};

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/^@/, "");
}

/** True if a username / display name looks like a known corporate bot or generic bot. */
export function isCorporateBotName(...names: Array<string | null | undefined>): boolean {
  for (const raw of names) {
    const name = normalizeName(raw);
    if (!name) continue;
    if (EXACT_BOT_NAMES.has(name)) return true;
    // Strip common Slack app suffixes for exact match
    const stripped = name.replace(/(\[bot\]|-bot|_bot)$/i, "");
    if (stripped && EXACT_BOT_NAMES.has(stripped)) return true;
    for (const pattern of BOT_NAME_PATTERNS) {
      if (pattern.test(name)) return true;
    }
  }
  return false;
}

/** True if Slack user object is a bot / app / known integration. */
export function isBotUser(user: BotFilterUser | null | undefined): boolean {
  if (!user) return false;
  if (user.is_bot) return true;
  if (user.profile?.bot_id) return true;
  return isCorporateBotName(
    user.name,
    user.real_name,
    user.profile?.display_name,
    user.profile?.real_name,
  );
}

/**
 * True if this Slack message should be skipped during indexing
 * (bots, apps, system events). Pass resolved user when available.
 */
export function shouldSkipMessage(
  message: BotFilterMessage,
  user?: BotFilterUser | null,
): boolean {
  if (message.bot_id) return true;
  if (message.app_id && !message.user) return true;
  if (message.subtype && SKIP_SUBTYPES.has(message.subtype)) return true;
  if (message.username && isCorporateBotName(message.username)) return true;
  if (user && isBotUser(user)) return true;
  return false;
}
