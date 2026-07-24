#!/usr/bin/env bash
# Publish slack-social (and optionally @slack-social/shared) to the npm registry.
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

version_already_published() {
  local name="$1"
  local version="$2"
  local published
  published="$(npm view "${name}@${version}" version 2>/dev/null || true)"
  [[ "$published" == "$version" ]]
}

publish_one() {
  local dir="$1"
  local name version
  name="$(jq -r .name "$dir/package.json")"
  version="$(jq -r .version "$dir/package.json")"

  if version_already_published "$name" "$version"; then
    echo "==> Skip ${name}@${version} (already on npm). Bump version in ${dir}/package.json first." >&2
    return 1
  fi

  echo "==> Publishing ${name}@${version} from $dir"
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
# Set PUBLISH_SHARED=1 to also publish @slack-social/shared.
failed=0
if [[ "${PUBLISH_SHARED:-0}" == "1" ]]; then
  publish_one "$ROOT/packages/shared" || failed=1
fi
publish_one "$ROOT/packages/cli" || failed=1

if [[ "$failed" -ne 0 ]]; then
  echo "Publish aborted. Bump versions and retry." >&2
  exit 1
fi

CLI_VER="$(jq -r .version "$ROOT/packages/cli/package.json")"
echo "==> Published. Try: npx slack-social@${CLI_VER} demo"
