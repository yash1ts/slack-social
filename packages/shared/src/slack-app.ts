/**
 * Optional env override for Slack OAuth app credentials.
 * Prefer pasting Client ID / Secret on the login page (saved to ~/.slack-social/config.json).
 */
export function getSlackAppCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.SLACK_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
