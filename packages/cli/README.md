# slack-social

Make work fun. Find friends on Slack — a local Instagram-style feed for public Slack activity.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 (CLI uses `bun:sqlite`)

## Run

```bash
npx slack-social serve
```

Open http://localhost:3000 and log in with Slack.

## Commands

```bash
npx slack-social serve          # start the local web UI
npx slack-social auth           # log in with Slack
npx slack-social sync           # index public channels into local SQLite
npx slack-social auth logout
```

Data is stored under `~/.slack-social`. Nothing is uploaded to a third-party cloud.

## License

[GPL-3.0](https://github.com/yash1ts/slack-social/blob/master/LICENSE) — contributions welcome via [CONTRIBUTING.md](https://github.com/yash1ts/slack-social/blob/master/CONTRIBUTING.md).

## Links

- [GitHub](https://github.com/yash1ts/slack-social)
- [Live showcase](https://yash1ts.github.io/slack-social/)
