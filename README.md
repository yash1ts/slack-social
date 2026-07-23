# slack-social

Open-source, developer-first CLI that indexes **public Slack workspace activity** into a local SQLite database and serves an Instagram-inspired feed on `localhost:3000`.

100% local — zero cloud data storage.

## Quick start (~30 seconds)

```bash
bun install
bun run slack-social serve
```

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From an app manifest**
2. Paste [`app-manifest.json`](./app-manifest.json) and click **Create**
3. Open http://localhost:3000 — paste **Client ID** and **Client Secret** into the login fields
4. Click **Login with Slack** → authorize once → browse your feed

```bash
bun run slack-social sync   # index public channels (also runs on serve)
```

## App manifest

[`app-manifest.json`](./app-manifest.json) pre-configures redirect URLs and user scopes so you don’t set permissions by hand:

- Redirect: `http://localhost:3000/api/auth/callback`
- User scopes: `channels:history`, `channels:read`, `reactions:read`, `users:read`, `users.profile:read`, `files:read`

## Commands

| Command | Description |
|---------|-------------|
| `slack-social serve` | Start UI (Login with Slack) |
| `slack-social sync` | Index public channels |
| `slack-social auth` | CLI OAuth (uses saved Client ID/Secret) |
| `slack-social auth import-session` | Auto-read xoxc + cookie from Chrome/Slack Local Storage |
| `slack-social auth import-session --list` | List tokens found locally |
| `slack-social auth logout` | Clear stored user token |
| `slack-social debug top` | Print top trending posts |

## Data locations

- `~/.slack-social/db.sqlite` — indexed posts, reactions, follows
- `~/.slack-social/media/` — cached image attachments
- `~/.slack-social/credentials.json` — user OAuth token (after Login with Slack)

## Monorepo

```
app-manifest.json   Slack app manifest (Create from manifest)
packages/cli        Bun CLI (commander + @slack/web-api + bun:sqlite)
packages/shared     Types + trending score formula
packages/web        Next.js Instagram-style UI
```

## License

MIT
