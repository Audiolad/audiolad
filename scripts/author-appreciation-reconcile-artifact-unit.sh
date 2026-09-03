#!/usr/bin/env bash
# Regression: the production pin/release archive must contain reconcile
# systemd + logrotate files, and ensure must resolve those paths.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/audiolad-reconcile-artifact.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

REQUIRED=(
  deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.service
  deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.timer
  deploy/logrotate/audiolad-author-appreciation-getcourse-reconcile
)

for rel in "${REQUIRED[@]}"; do
  if [[ ! -f "$ROOT/$rel" ]]; then
    echo "FAIL working tree missing $rel" >&2
    exit 1
  fi
  if ! git -C "$ROOT" ls-files --error-unmatch "$rel" >/dev/null; then
    echo "FAIL $rel is not tracked; git archive would omit it" >&2
    exit 1
  fi
done

SHA="$(git -C "$ROOT" rev-parse HEAD)"
PIN="$TMP/pin"
RELEASE="$TMP/release"
INSTALL="$TMP/install"
mkdir -p "$PIN" "$RELEASE" "$INSTALL/wrapper" "$INSTALL/systemd" "$INSTALL/logrotate"

# Same paths as run-from-target-sha.sh / pin-target-deploy-scripts.sh
git -C "$ROOT" archive "$SHA" deploy/scripts deploy/systemd deploy/logrotate | tar -x -C "$PIN"
# Same full-commit extract as deploy.sh
git -C "$ROOT" archive "$SHA" | tar -x -C "$RELEASE"

for rel in "${REQUIRED[@]}"; do
  if [[ ! -f "$PIN/$rel" ]]; then
    echo "FAIL pin archive missing $rel" >&2
    exit 1
  fi
  if [[ ! -f "$RELEASE/$rel" ]]; then
    echo "FAIL full release archive missing $rel" >&2
    exit 1
  fi
done

# Installer + deploy.sh under test are the working tree (next production SHA).
cp -a "$ROOT/deploy/scripts/." "$PIN/deploy/scripts/"
cp -a "$ROOT/deploy/scripts/." "$RELEASE/deploy/scripts/"

if ! grep -q 'author_appreciation_getcourse_reconcile_ensure_failed' "$PIN/deploy/scripts/deploy.sh"; then
  echo "FAIL pin deploy.sh does not fail loudly on reconcile ensure" >&2
  exit 1
fi
if grep -q 'ensure_nonfatal' "$PIN/deploy/scripts/deploy.sh" "$RELEASE/deploy/scripts/deploy.sh"; then
  echo "FAIL deploy.sh still swallows reconcile ensure as nonfatal" >&2
  exit 1
fi
if ! grep -q 'DEPLOY_TREE="$RELEASE_DIR/deploy"' "$RELEASE/deploy/scripts/deploy.sh"; then
  echo "FAIL release deploy.sh does not point ensure at RELEASE_DIR/deploy" >&2
  exit 1
fi
if ! grep -q 'assert_author_appreciation_reconcile_release_tree' "$RELEASE/deploy/scripts/deploy.sh"; then
  echo "FAIL release deploy.sh does not preflight the reconcile artifact" >&2
  exit 1
fi

SKIP_SYSTEMCTL=1 \
SKIP_AS_ROOT=1 \
DEPLOY_TREE="$PIN/deploy" \
WRAPPER_DIR="$INSTALL/wrapper" \
SYSTEMD_DIR="$INSTALL/systemd" \
LOGROTATE_DIR="$INSTALL/logrotate" \
LOG_DIR="$INSTALL/log" \
STATE_DIR="$INSTALL/state" \
"$PIN/deploy/scripts/ensure-author-appreciation-getcourse-reconcile.sh"

test -f "$INSTALL/systemd/audiolad-author-appreciation-getcourse-reconcile.service"
test -f "$INSTALL/systemd/audiolad-author-appreciation-getcourse-reconcile.timer"
test -f "$INSTALL/logrotate/audiolad-author-appreciation-getcourse-reconcile"
test -x "$INSTALL/wrapper/run-author-appreciation-getcourse-reconcile.sh"

SCRIPTS_ONLY="$TMP/scripts-only"
mkdir -p "$SCRIPTS_ONLY"
git -C "$ROOT" archive "$SHA" deploy/scripts | tar -x -C "$SCRIPTS_ONLY"
cp -a "$ROOT/deploy/scripts/ensure-author-appreciation-getcourse-reconcile.sh" \
  "$SCRIPTS_ONLY/deploy/scripts/ensure-author-appreciation-getcourse-reconcile.sh"
if SKIP_SYSTEMCTL=1 \
  SKIP_AS_ROOT=1 \
  DEPLOY_TREE="$SCRIPTS_ONLY/deploy" \
  WRAPPER_DIR="$TMP/bad-wrapper" \
  SYSTEMD_DIR="$TMP/bad-systemd" \
  LOGROTATE_DIR="$TMP/bad-logrotate" \
  "$SCRIPTS_ONLY/deploy/scripts/ensure-author-appreciation-getcourse-reconcile.sh"; then
  echo "FAIL scripts-only pin tree must not satisfy ensure" >&2
  exit 1
fi

echo "author-appreciation-reconcile-artifact-unit: ok"
