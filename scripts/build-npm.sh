#!/usr/bin/env bash
# Build artifacts required to publish slack-social + @slack-social/shared to npm.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null; then
  echo "bun is required" >&2
  exit 1
fi

CLI_PKG="$ROOT/packages/cli"
SHARED_PKG="$ROOT/packages/shared"
STANDALONE_SRC="$ROOT/packages/web/.next/standalone"
WEB_OUT="$CLI_PKG/web"

echo "==> Building @slack-social/shared"
bun run --filter @slack-social/shared build

echo "==> Building slack-social CLI bundle"
bun run --filter slack-social build

echo "==> Building web (Next.js standalone)"
bun run --filter @slack-social/web build

echo "==> Assembling standalone web into packages/cli/web"
rm -rf "$STANDALONE_SRC/packages/web/.next/static" "$STANDALONE_SRC/packages/web/public"
mkdir -p "$STANDALONE_SRC/packages/web/.next"
cp -R "$ROOT/packages/web/.next/static" "$STANDALONE_SRC/packages/web/.next/static"
cp -R "$ROOT/packages/web/public" "$STANDALONE_SRC/packages/web/public"

rm -rf "$WEB_OUT"
cp -R "$STANDALONE_SRC" "$WEB_OUT"

# npm omits node_modules dirs and all symlinks from tarballs. Capture symlink
# targets, then rename node_modules → bundled_modules for packing.
node "$CLI_PKG/scripts/capture-web-symlinks.js" "$WEB_OUT"
if [[ -d "$WEB_OUT/node_modules" ]]; then
  rm -rf "$WEB_OUT/bundled_modules"
  mv "$WEB_OUT/node_modules" "$WEB_OUT/bundled_modules"
fi

# LICENSE into publishable packages (npm includes package-local LICENSE)
cp "$ROOT/LICENSE" "$CLI_PKG/LICENSE"
cp "$ROOT/LICENSE" "$SHARED_PKG/LICENSE"

echo "==> npm pack dry-run (shared)"
(
  cd "$SHARED_PKG"
  bun pm pack --dry-run
)

echo "==> npm pack dry-run (slack-social)"
(
  cd "$CLI_PKG"
  bun pm pack --dry-run
)

echo "==> Done. Publish with: bun run publish:npm"
