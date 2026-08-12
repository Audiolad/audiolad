#!/usr/bin/env bash
# Isolated tests for hashed Next static overlay (no production touch).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

ROOT="$(mktemp -d /tmp/audiolad-static-overlay-XXXXXX)"
cleanup() { rm -rf "$ROOT"; }
trap cleanup EXIT

DEPLOY_ROOT="$ROOT"
NEXT_STATIC_OVERLAY_DIR="$ROOT/shared/next-static"
NEXT_STATIC_OVERLAY_MAX_AGE_DAYS=14

mkdir -p "$ROOT/releases/new/.next/static/chunks" "$ROOT/releases/old/.next/static/chunks"
echo "new-css" >"$ROOT/releases/new/.next/static/chunks/new.css"
echo "old-css" >"$ROOT/releases/old/.next/static/chunks/old.css"

publish_next_static_overlay "$ROOT/releases/old"
publish_next_static_overlay "$ROOT/releases/new"

if [[ "$(cat "$NEXT_STATIC_OVERLAY_DIR/chunks/new.css")" != "new-css" ]]; then
  echo "FAIL: new hash missing from overlay"
  exit 1
fi
if [[ "$(cat "$NEXT_STATIC_OVERLAY_DIR/chunks/old.css")" != "old-css" ]]; then
  echo "FAIL: previous hash was overwritten/removed"
  exit 1
fi

echo "next-static-overlay-unit: ok"
