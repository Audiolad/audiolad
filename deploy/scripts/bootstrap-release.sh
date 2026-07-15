#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

RELEASE_NAME="${1:-$(date -u +"%Y%m%d-%H%M%S")-bootstrap}"
SOURCE_DIR="${2:-/var/www/audiolad}"
RELEASE_DIR="$DEPLOY_ROOT/releases/$RELEASE_NAME"

ensure_dirs

if [[ -e "$RELEASE_DIR" ]]; then
  log_error "Release already exists: $RELEASE_DIR"
  exit 1
fi

log_info "Bootstrapping release $RELEASE_NAME from $SOURCE_DIR"

mkdir -p "$RELEASE_DIR"
rsync -a \
  --exclude '.git' \
  --exclude 'backups' \
  --exclude 'screenshots' \
  --exclude 'test-results' \
  --exclude 'audiolad/tmp' \
  "$SOURCE_DIR/" "$RELEASE_DIR/"

if [[ ! -f "$DEPLOY_ROOT/shared/.env.production" ]]; then
  if [[ -f "$SOURCE_DIR/.env.local" ]]; then
    cp "$SOURCE_DIR/.env.local" "$DEPLOY_ROOT/shared/.env.production"
    chmod 600 "$DEPLOY_ROOT/shared/.env.production"
    log_info "Copied shared/.env.production from source .env.local"
  else
    log_error "Missing shared/.env.production and source .env.local"
    exit 1
  fi
fi

ln -sfn "$DEPLOY_ROOT/shared/.env.production" "$RELEASE_DIR/.env.local"
ln -sfn "$DEPLOY_ROOT/shared/.env.production" "$RELEASE_DIR/.env.production"

if [[ -f "$SOURCE_DIR/.git/HEAD" ]]; then
  git -C "$SOURCE_DIR" rev-parse HEAD > "$RELEASE_DIR/.deploy-commit" 2>/dev/null || true
fi

if [[ ! -f "$RELEASE_DIR/.next/BUILD_ID" ]]; then
  log_error "Bootstrap source is missing .next/BUILD_ID"
  exit 1
fi

log_info "Bootstrap release ready: $RELEASE_DIR"
log_info "BUILD_ID: $(read_build_id "$RELEASE_DIR")"
