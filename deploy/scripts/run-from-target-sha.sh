#!/usr/bin/env bash
# Canonical deploy launcher: run the target SHA's deploy/scripts, not this worktree.
#
# Safe to pipe from git objects so a stale controlling checkout is irrelevant:
#   git -C "$GIT_WORKDIR" fetch origin main
#   git -C "$GIT_WORKDIR" show "<sha>:deploy/scripts/run-from-target-sha.sh" | bash -s -- "<sha>"
#
# Never exec via /var/www/audiolad-deploy/current. Never git reset --hard.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
GIT_WORKDIR="${GIT_WORKDIR:-/var/www/audiolad}"
AUDIOLAD_DEPLOY_SCRIPTS_STORE="${AUDIOLAD_DEPLOY_SCRIPTS_STORE:-$DEPLOY_ROOT/shared/deploy-scripts}"

pin_log() {
  printf '[%s] [INFO] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

pin_error() {
  printf '[%s] [ERROR] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >&2
}

usage() {
  cat <<'EOF'
Usage: run-from-target-sha.sh <commit-sha>

Fetch git objects, extract that SHA's deploy/scripts via git archive, then exec
that deploy.sh. Policy gates, flock lock, ancestry, and zero-downtime cutover
still run inside deploy.sh.

GIT_WORKDIR is used only as a git object store. Worktree HEAD is not updated.
Do not launch via /var/www/audiolad-deploy/current.
EOF
}

COMMIT_REF="${1:-}"
if [[ -z "$COMMIT_REF" ]]; then
  pin_error "Deploy commit SHA is required."
  usage
  exit 1
fi
if [[ "$COMMIT_REF" == "-h" || "$COMMIT_REF" == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -gt 1 ]]; then
  pin_error "Too many arguments. Usage: run-from-target-sha.sh <commit-sha>"
  exit 1
fi

if git -C "$GIT_WORKDIR" remote get-url origin >/dev/null 2>&1; then
  pin_log "Fetching origin main (objects only; worktree HEAD unchanged)"
  git -C "$GIT_WORKDIR" fetch origin main
else
  pin_log "Skipping origin fetch (no origin remote configured in GIT_WORKDIR)"
fi

FULL_COMMIT="$(git -C "$GIT_WORKDIR" rev-parse --verify "${COMMIT_REF}^{commit}")"
if [[ ! "$FULL_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  pin_error "Could not resolve a full commit SHA from ${COMMIT_REF}"
  exit 1
fi

STORE="$AUDIOLAD_DEPLOY_SCRIPTS_STORE"
DEST="${STORE}/${FULL_COMMIT}"
case "$STORE" in
  */shared/deploy-scripts)
    ;;
  *)
    pin_error "refusing unexpected deploy-scripts store: ${STORE}"
    exit 1
    ;;
esac
if [[ "$DEST" != "${STORE}/${FULL_COMMIT}" ]]; then
  pin_error "refusing unexpected deploy-scripts dest: ${DEST}"
  exit 1
fi

mkdir -p "$STORE"
if [[ -f "$DEST/deploy/scripts/deploy.sh" && -f "$DEST/deploy/scripts/.pinned-commit" \
  && "$(tr -d '\n' < "$DEST/deploy/scripts/.pinned-commit")" == "$FULL_COMMIT" ]]; then
  pin_log "Reusing pinned deploy scripts at ${DEST}"
else
  TMP="$(mktemp -d "${STORE}/.tmp.${FULL_COMMIT}.XXXXXX")"
  if ! git -C "$GIT_WORKDIR" archive "$FULL_COMMIT" deploy/scripts | tar -x -C "$TMP"; then
    pin_error "git archive of deploy/scripts failed for ${FULL_COMMIT}"
    rm -rf "$TMP"
    exit 1
  fi
  if [[ ! -f "$TMP/deploy/scripts/deploy.sh" ]]; then
    pin_error "target SHA ${FULL_COMMIT} is missing deploy/scripts/deploy.sh"
    rm -rf "$TMP"
    exit 1
  fi
  printf '%s\n' "$FULL_COMMIT" > "$TMP/deploy/scripts/.pinned-commit"
  chmod +x "$TMP/deploy/scripts/deploy.sh" 2>/dev/null || true
  rm -rf "$DEST"
  mv "$TMP" "$DEST"
fi

DEPLOY_SH="${DEST}/deploy/scripts/deploy.sh"
case "$DEPLOY_SH" in
  */current/*|*/current)
    pin_error "refusing to exec deploy.sh via /current symlink"
    exit 1
    ;;
esac

pin_log "Pinned deploy scripts to ${FULL_COMMIT} at ${DEST}"
export AUDIOLAD_DEPLOY_SCRIPTS_PINNED=1
export AUDIOLAD_DEPLOY_SCRIPTS_PINNED_SHA="$FULL_COMMIT"
export GIT_WORKDIR DEPLOY_ROOT
exec "$DEPLOY_SH" "$FULL_COMMIT"
