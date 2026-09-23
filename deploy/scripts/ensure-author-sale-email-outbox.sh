#!/usr/bin/env bash
# Install the existing author-sale-email outbox wrapper from the candidate
# release. This intentionally does not create, enable, restart, or reload any
# systemd unit: the host timer is already installed and resolves this wrapper
# on each ordinary tick.
set -Eeuo pipefail

if [[ -z "${DEPLOY_TREE:-}" || ! -d "$DEPLOY_TREE" ]]; then
  printf '[%s] ERROR candidate_release_tree_missing\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >&2
  exit 1
fi
DEPLOY_TREE="$(cd "$DEPLOY_TREE" && pwd -P)"

WRAPPER_SRC="$DEPLOY_TREE/scripts/run-author-sale-email-outbox.sh"
WRAPPER_DIR="${WRAPPER_DIR:-/usr/local/lib/audiolad}"
WRAPPER_DEST="$WRAPPER_DIR/run-author-sale-email-outbox.sh"

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

as_root() {
  if [[ "${SKIP_AS_ROOT:-0}" == "1" ]]; then
    "$@"
  elif [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

if [[ ! -f "$WRAPPER_SRC" || ! -x "$WRAPPER_SRC" ]]; then
  log "ERROR canonical_wrapper_invalid path=$WRAPPER_SRC"
  exit 1
fi

as_root install -d -m 0755 "$WRAPPER_DIR"

if [[ -f "$WRAPPER_DEST" ]] && as_root cmp -s "$WRAPPER_SRC" "$WRAPPER_DEST" \
  && as_root test -x "$WRAPPER_DEST"; then
  log "author_sale_email_outbox_wrapper_unchanged path=$WRAPPER_DEST"
else
  as_root install -m 0755 "$WRAPPER_SRC" "$WRAPPER_DEST"
  log "author_sale_email_outbox_wrapper_installed path=$WRAPPER_DEST"
fi

if ! as_root test -f "$WRAPPER_DEST" \
  || ! as_root test -x "$WRAPPER_DEST" \
  || ! as_root cmp -s "$WRAPPER_SRC" "$WRAPPER_DEST"; then
  log "ERROR canonical_wrapper_verify_failed path=$WRAPPER_DEST"
  exit 1
fi

log "author_sale_email_outbox_wrapper_verified path=$WRAPPER_DEST"
