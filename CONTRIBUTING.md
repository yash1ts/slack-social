# Contributing to slack-social

Thanks for checking out the project — contributions of all sizes are welcome.

Whether you want to fix a bug, polish the UI, improve docs, or try a bigger idea: fork it, hack on it, and open a PR. You don’t need to ask permission first for small fixes.

## Quick start (from a checkout)

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
git clone https://github.com/yash1ts/slack-social.git
cd slack-social
bun install
bun run slack-social serve
```

Open [http://localhost:3000](http://localhost:3000), log in with Slack, and you’re in.

Useful scripts:

| Command | What it does |
|---------|----------------|
| `bun run slack-social demo` | Trial UI with seeded dummy data (no Slack) |
| `bun run slack-social serve` | Run CLI + local web UI |
| `bun run dev:web` | Next.js dev server only |
| `bun run sync` | Index public channels into local SQLite |
| `bun run build` | Build shared, CLI, and web |

Data and credentials stay under `~/.slack-social` on your machine.

## How to contribute

1. **Fork** the repo and create a branch from `master` (or the default branch).
2. **Make a focused change** — one concern per PR when you can.
3. **Test locally** with `bun run slack-social serve` (and exercise the path you touched).
4. **Open a pull request** with a short description of *why* the change helps.
5. Be kind in review — we’re building this together.

### Good first contributions

- Docs and README clarity
- UI polish and accessibility
- Bug fixes with a clear repro
- Small CLI / feed ranking improvements

### Bigger ideas

Open an issue first so we can align on design before a large PR.

## Project layout

```
packages/
  cli/      # Bun CLI, Slack indexing, SQLite
  shared/   # Shared types & helpers
  web/      # Next.js Instagram-style UI
docs/       # GitHub Pages showcase
```

## Code guidelines

- Match the style of nearby code; don’t drive-by reformat unrelated files.
- Prefer small, readable TypeScript. Avoid drive-by dependency adds.
- Keep the product **local-first** — no shipping user Slack data to third-party clouds.
- This project is licensed under **GPL-3.0**. By contributing, you agree your work is licensed under the same terms.

## Reporting bugs

Use [GitHub Issues](https://github.com/yash1ts/slack-social/issues). Include:

- What you expected vs what happened
- Steps to reproduce
- OS, Bun version (`bun --version`), and how you ran the app (`npx` vs git checkout)

## Community

Be respectful. Harassment and discrimination are not welcome. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

Questions? Open an issue or start a discussion on the PR — we’ll meet you there.

**Make work fun. Find friends on Slack. Ship something with us.**
