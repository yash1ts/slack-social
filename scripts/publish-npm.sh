#!/usr/bin/env bash
# Publish @slack-social/shared then slack-social to the npm registry.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null; then
  echo "bun is required" >&2
  exit 1
fi

bash "$ROOT/scripts/build-npm.sh"

TAG="${NPM_TAG:-latest}"
DRY_RUN="${NPM_DRY_RUN:-0}"

publish_one() {
  local dir="$1"
  local name
  name="$(jq -r .name "$dir/package.json")"
  echo "==> Publishing ${name} from $dir"
  (
    cd "$dir"
    if [[ "$DRY_RUN" == "1" ]]; then
      bun pm pack
      echo "(dry-run) packed ${name}; not uploading"
    else
      bun publish --access public --tag "$TAG"
    fi
  )
}

# Default: publish the app package only (unscoped `slack-social`).
# Set PUBLISH_SHARED=1 to also publish @slack-social/shared (requires the
# @slack-social npm org on first publish).
if [[ "${PUBLISH_SHARED:-0}" == "1" ]]; then
  publish_one "$ROOT/packages/shared"
fi
publish_one "$ROOT/packages/cli"

echo "==> Published. Try: npx slack-social --help"
