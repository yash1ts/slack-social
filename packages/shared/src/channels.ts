/**
 * Keywords that exclude a public Slack channel from fetching / indexing / feed.
 *
 * If a channel name (without `#`, case-insensitive) contains any of these
 * keywords, it is skipped during sync and hidden from the feed.
 *
 * Tuned for common corporate Slack noise: tickets, alerts, deploys, bots, digests.
 * Prefer specific tokens — avoid short stems that hit real rooms (e.g. "log" → blog).
 *
 * Add or remove entries here to change what gets indexed.
 */
export const SKIP_FEED_CHANNEL_KEYWORDS = [
  // Support / tickets / inbound
  "support",
  "contact",
  "helpdesk",
  "help-desk",
  "servicedesk",
  "service-desk",
  "it-help",
  "it-support",
  "ticket",
  "tickets",
  "triage",
  "escalation",
  "zendesk",
  "freshdesk",
  "intercom",

  // Notifications / alerts / paging
  "notification",
  "notifications",
  "alert",
  "alerts",
  "paging",
  "pagerduty",
  "opsgenie",
  "statuspage",
  "outage",
  "downtime",

  // Errors / logs / observability spam
  "error",
  "errors",
  "exception",
  "exceptions",
  "sentry",
  "datadog",
  "newrelic",
  "new-relic",
  "grafana",
  "prometheus",
  "cloudwatch",
  "monitoring",
  "observability",
  "logging",
  "logs-",
  "-logs",
  "_logs",

  // Deploy / CI noise rooms
  "deploy",
  "deployment",
  "deployments",
  "jenkins",
  "circleci",
  "buildkite",
  "github-actions",
  "ci-cd",
  "cicd",
  "pipeline-alert",
  "release-alert",

  // Bots / automation / digests
  "bot-",
  "-bot",
  "_bot",
  "bots-",
  "automated",
  "automation-alert",
  "webhook",
  "webhooks",
  "newsletter",
  "digest",
  "digests",
  "daily-update",
  "weekly-update",
  "spam",

  // Vendor / inbox dump channels
  "inbound",
  "noreply",
  "no-reply",
  "mailer",
  "email-alert",
  "emails-",
] as const;

/** @deprecated Use SKIP_FEED_CHANNEL_KEYWORDS */
export const SKIP_FEED_CHANNEL_PREFIXES = SKIP_FEED_CHANNEL_KEYWORDS;

function normalizeChannelName(channelName: string): string {
  return channelName.replace(/^#/, "").trim().toLowerCase();
}

/** True if this channel should be skipped when fetching / indexing. */
export function shouldSkipFeedChannel(channelName: string | null | undefined): boolean {
  if (!channelName) return false;
  const name = normalizeChannelName(channelName);
  if (!name) return false;
  return SKIP_FEED_CHANNEL_KEYWORDS.some((keyword) => name.includes(keyword));
}

/**
 * SQLite predicate fragment (no leading AND) that excludes skipped channel names.
 * Alias must point at the channels table (e.g. `c`).
 */
export function skipFeedChannelSql(alias = "c"): string {
  return SKIP_FEED_CHANNEL_KEYWORDS.map(
    (keyword) => `lower(${alias}.name) NOT LIKE ${sqlString("%" + keyword + "%")}`,
  ).join(" AND ");
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
