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
printf 'not-text' >"$ROOT/releases/new/.next/static/chunks/icon.webp"
printf 'woff' >"$ROOT/releases/new/.next/static/chunks/font.woff2"

publish_next_static_overlay "$ROOT/releases/old"
old_gz_mtime="$(stat -c %Y "$NEXT_STATIC_OVERLAY_DIR/chunks/old.css.gz")"

if [[ ! -f "$NEXT_STATIC_OVERLAY_DIR/chunks/old.css.gz" ]]; then
  echo "FAIL: old.css.gz missing after first publish"
  exit 1
fi
if [[ -f "$ROOT/releases/old/.next/static/chunks/old.css.gz" ]]; then
  echo "FAIL: gzip sibling leaked into release tree"
  exit 1
fi

sleep 1
publish_next_static_overlay "$ROOT/releases/new"
new_old_gz_mtime="$(stat -c %Y "$NEXT_STATIC_OVERLAY_DIR/chunks/old.css.gz")"

if [[ "$(cat "$NEXT_STATIC_OVERLAY_DIR/chunks/new.css")" != "new-css" ]]; then
  echo "FAIL: new hash missing from overlay"
  exit 1
fi
if [[ "$(cat "$NEXT_STATIC_OVERLAY_DIR/chunks/old.css")" != "old-css" ]]; then
  echo "FAIL: previous hash was overwritten/removed"
  exit 1
fi
if [[ ! -f "$NEXT_STATIC_OVERLAY_DIR/chunks/new.css.gz" ]]; then
  echo "FAIL: new.css.gz missing"
  exit 1
fi
if [[ ! -f "$NEXT_STATIC_OVERLAY_DIR/chunks/old.css.gz" ]]; then
  echo "FAIL: old.css.gz lost on republish"
  exit 1
fi
if [[ "$new_old_gz_mtime" != "$old_gz_mtime" ]]; then
  echo "FAIL: republish refreshed old.css.gz mtime"
  exit 1
fi
if [[ -f "$NEXT_STATIC_OVERLAY_DIR/chunks/icon.webp.gz" ]]; then
  echo "FAIL: webp should not be precompressed"
  exit 1
fi
if [[ -f "$NEXT_STATIC_OVERLAY_DIR/chunks/font.woff2.gz" ]]; then
  echo "FAIL: woff2 should not be precompressed"
  exit 1
fi
if [[ -f "$ROOT/releases/new/.next/static/chunks/new.css.gz" ]]; then
  echo "FAIL: gzip sibling leaked into new release tree"
  exit 1
fi

echo "orphan" >"$NEXT_STATIC_OVERLAY_DIR/chunks/orphan.css.gz"
publish_next_static_overlay "$ROOT/releases/new"
if [[ -f "$NEXT_STATIC_OVERLAY_DIR/chunks/orphan.css.gz" ]]; then
  echo "FAIL: orphan gzip sibling was not pruned"
  exit 1
fi

# Stale GIT_WORKDIR: old publish is copy-only. Candidate hook still creates .gz.
STALE="$ROOT/stale-overlay"
CAND="$ROOT/releases/candidate-with-hook"
mkdir -p "$STALE/chunks" "$CAND/.next/static/chunks" "$CAND/deploy/scripts"
echo "stale-js" >"$CAND/.next/static/chunks/app.js"
echo "stale-css" >"$CAND/.next/static/chunks/app.css"
cp -a "$CAND/.next/static/." "$STALE/"
cp "$SCRIPT_DIR/precompress-next-static-overlay.sh" "$CAND/deploy/scripts/"
if [[ -f "$STALE/chunks/app.js.gz" ]]; then
  echo "FAIL: stale copy-only publish already had .gz"
  exit 1
fi
NEXT_STATIC_OVERLAY_DIR="$STALE" run_candidate_overlay_precompress "$CAND"
if [[ ! -f "$STALE/chunks/app.js.gz" || ! -f "$STALE/chunks/app.css.gz" ]]; then
  echo "FAIL: candidate hook did not create .gz on stale overlay"
  exit 1
fi
if [[ -f "$CAND/.next/static/chunks/app.js.gz" ]]; then
  echo "FAIL: candidate hook wrote .gz into release tree"
  exit 1
fi
NEXT_STATIC_OVERLAY_DIR="$STALE"
if ! assert_overlay_has_gzip_siblings; then
  echo "FAIL: assert_overlay_has_gzip_siblings rejected a good overlay"
  exit 1
fi

if ! grep -q 'run_candidate_overlay_precompress "$RELEASE_DIR"' "$SCRIPT_DIR/deploy.sh"; then
  echo "FAIL: deploy.sh does not invoke candidate overlay precompress"
  exit 1
fi
if ! grep -q 'assert_overlay_has_gzip_siblings' "$SCRIPT_DIR/deploy.sh"; then
  echo "FAIL: deploy.sh does not fail-closed on missing overlay .gz"
  exit 1
fi

echo "next-static-overlay-unit: ok"
