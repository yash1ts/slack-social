#!/usr/bin/env bash
# Publish slack-social (and optionally @slack-social/shared) to the npm registry.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null; then
  echo "bun is required" >&2
  exit 1
fi
if ! command -v npm >/dev/null; then
  echo "npm is required for publish" >&2
  exit 1
fi

bash "$ROOT/scripts/build-npm.sh"

TAG="${NPM_TAG:-latest}"
DRY_RUN="${NPM_DRY_RUN:-0}"

version_already_published() {
  local name="$1"
  local version="$2"
  # Only treat as published if the tarball actually downloads (0.1.1 was a broken metadata-only publish).
  local tarball
  tarball="$(npm view "${name}@${version}" dist.tarball 2>/dev/null || true)"
  [[ -z "$tarball" ]] && return 1
  local code
  code="$(curl -sI -o /dev/null -w '%{http_code}' "$tarball" || true)"
  [[ "$code" == "200" ]]
}

verify_published() {
  local name="$1"
  local version="$2"
  echo "==> Verifying ${name}@${version} tarball…"
  local tarball="" code="000" attempt
  for attempt in 1 2 3 4 5 6 7 8; do
    tarball="$(npm view "${name}@${version}" dist.tarball 2>/dev/null || true)"
    if [[ -n "$tarball" ]]; then
      code="$(curl -sI -o /dev/null -w '%{http_code}' "$tarball" || true)"
      if [[ "$code" == "200" ]]; then
        echo "    OK ${tarball}"
        return 0
      fi
    fi
    echo "    waiting for registry (attempt ${attempt}/8)…"
    sleep $((attempt * 2))
  done
  echo "ERROR: ${name}@${version} not downloadable yet (last HTTP ${code})." >&2
  echo "Check: npm view ${name}@${version} dist.tarball" >&2
  echo "If metadata exists but the tarball 404s, unpublish and bump:" >&2
  echo "  npm unpublish ${name}@${version} --force" >&2
  return 1
}

publish_one() {
  local dir="$1"
  local name version
  name="$(jq -r .name "$dir/package.json")"
  version="$(jq -r .version "$dir/package.json")"

  if version_already_published "$name" "$version"; then
    echo "==> Skip ${name}@${version} (already on npm with a real tarball). Bump version to publish again." >&2
    return 1
  fi

  echo "==> Publishing ${name}@${version} from $dir"
  (
    cd "$dir"
    if [[ "$DRY_RUN" == "1" ]]; then
      bun pm pack
      echo "(dry-run) packed ${name}; not uploading"
      return 0
    fi
    # npm publish is more reliable for large tarballs than bun publish.
    npm publish --access public --tag "$TAG"
  )

  if [[ "$DRY_RUN" != "1" ]]; then
    verify_published "$name" "$version"
  fi
}

# Default: publish the app package only (unscoped `slack-social`).
# Set PUBLISH_SHARED=1 to also publish @slack-social/shared.
failed=0
if [[ "${PUBLISH_SHARED:-0}" == "1" ]]; then
  publish_one "$ROOT/packages/shared" || failed=1
fi
publish_one "$ROOT/packages/cli" || failed=1

if [[ "$failed" -ne 0 ]]; then
  echo "Publish aborted." >&2
  exit 1
fi

CLI_VER="$(jq -r .version "$ROOT/packages/cli/package.json")"
echo "==> Published. Try: npx slack-social@${CLI_VER} demo"
