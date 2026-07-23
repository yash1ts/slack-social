#!/usr/bin/env bash
# Build macOS CLI + Next standalone UI, zip per arch, publish cli-latest.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null; then
  echo "bun is required" >&2
  exit 1
fi
if ! command -v gh >/dev/null; then
  echo "GitHub CLI (gh) is required — https://cli.github.com" >&2
  exit 1
fi
if ! command -v zip >/dev/null; then
  echo "zip is required" >&2
  exit 1
fi

VERSION="$(jq -r .version packages/cli/package.json)"
SHORT_SHA="$(git rev-parse --short HEAD)"
DIST="$ROOT/dist/release"
STANDALONE_SRC="$ROOT/packages/web/.next/standalone"
rm -rf "$DIST"
mkdir -p "$DIST"

echo "==> Building web (Next.js standalone)"
bun run --filter @slack-social/web build

echo "==> Assembling standalone web assets"
rm -rf "$STANDALONE_SRC/packages/web/.next/static" "$STANDALONE_SRC/packages/web/public"
mkdir -p "$STANDALONE_SRC/packages/web/.next"
cp -R "$ROOT/packages/web/.next/static" "$STANDALONE_SRC/packages/web/.next/static"
cp -R "$ROOT/packages/web/public" "$STANDALONE_SRC/packages/web/public"

pack_arch() {
  local target="$1"
  local arch_label="$2"
  local dir_name="slack-social-darwin-${arch_label}"
  local stage="$DIST/${dir_name}"

  echo "==> Compiling ${dir_name} (${target})"
  mkdir -p "$stage"
  bun build --compile --minify --target="${target}" \
    ./packages/cli/src/index.ts \
    --outfile "${stage}/slack-social"
  chmod +x "${stage}/slack-social"

  cp -R "$STANDALONE_SRC" "${stage}/web"

  cat > "${stage}/README.txt" <<EOF
slack-social ${VERSION} (${SHORT_SHA}) — macOS ${arch_label}

Requirements
  - Bun (https://bun.sh) — needed to run the web UI
    curl -fsSL https://bun.sh/install | bash

Setup (Gatekeeper)
  xattr -dr com.apple.quarantine .
  chmod +x ./slack-social

Run
  ./slack-social serve

  # Corporate networks (SSL inspection / custom CA) — enabled by default.
  # To force explicitly: NODE_USE_SYSTEM_CA=1 ./slack-social serve

Open http://localhost:3000
EOF

  echo "==> Zipping ${dir_name}.zip"
  (
    cd "$DIST"
    zip -qr "${dir_name}.zip" "${dir_name}"
  )
}

pack_arch bun-darwin-arm64 arm64
pack_arch bun-darwin-x64 x64

ls -lh "$DIST"/*.zip

BUN_VER="$(bun --version)"
NOTES="$(mktemp)"
trap 'rm -f "$NOTES"' EXIT
cat > "$NOTES" <<EOF
macOS CLI + web UI release.

- Version: ${VERSION}
- Commit: ${SHORT_SHA}
- Built with Bun ${BUN_VER}

### Downloads

Download the **zip** for your Mac (not a bare binary):

| Mac | Asset |
|-----|-------|
| Apple Silicon M1-M4 | slack-social-darwin-arm64.zip |
| Intel | slack-social-darwin-x64.zip |

### Install

1. Install Bun (required for the UI): https://bun.sh
2. Unzip the release
3. Clear Gatekeeper quarantine and run:

\`\`\`bash
cd slack-social-darwin-arm64
xattr -dr com.apple.quarantine .
chmod +x ./slack-social
./slack-social serve
\`\`\`

Opens http://localhost:3000
EOF

echo "==> Publishing GitHub release cli-latest"
if gh release view cli-latest >/dev/null 2>&1; then
  gh release delete cli-latest --yes --cleanup-tag
fi

gh release create cli-latest \
  "$DIST"/slack-social-darwin-arm64.zip \
  "$DIST"/slack-social-darwin-x64.zip \
  --title "CLI v${VERSION} (${SHORT_SHA})" \
  --notes-file "$NOTES" \
  --latest

echo "==> Done: $(gh release view cli-latest --json url -q .url)"
