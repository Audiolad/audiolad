#!/usr/bin/env bash
# Timeweb S3 bulk migration orchestrator tick/control (production).
# Install: copy to /usr/local/lib/audiolad/ on VPS; never invoke audiolad-deploy.
set -Eeuo pipefail

usage() {
  printf '%s\n' \
    "usage: audiolad-music-storage-bulk-orchestrator.sh <copy|cutover|release-local> <status|start|stop|pause|resume|tick>" \
    "control alias: audiolad-music-storage-bulk-ctl.sh <command> [stage]"
}

STAGE="${1:-}"
CMD="${2:-}"
if [[ -z "${STAGE}" || -z "${CMD}" ]]; then
  usage
  exit 2
fi

case "$STAGE" in
  copy|cutover|release-local) ;;
  *)
    usage
    exit 2
    ;;
esac

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/run/audiolad-deploy.lock}"
ENV_FILE="${AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_ENV:-/etc/audiolad/music-storage-bulk-${STAGE}.env}"

if [[ "$CMD" == "tick" ]]; then
  exec {AUDIOLAD_DEPLOY_LOCK_PROBE_FD}>>"$DEPLOY_LOCK_FILE"
  if ! flock -n "$AUDIOLAD_DEPLOY_LOCK_PROBE_FD"; then
    printf '%s\n' '{"outcome":"skipped_deploy_lock","reason":"deploy_in_progress"}'
    exit 0
  fi
fi

if [[ ! -L "$CURRENT_LINK" ]]; then
  printf '%s\n' '{"error":"current_release_missing"}' >&2
  exit 1
fi

CURRENT_DIR="$(readlink -f "$CURRENT_LINK")"
cd "$CURRENT_DIR"

export NODE_ENV=production
export AUDIOLAD_DEPLOY_SHARED="${DEPLOY_ROOT}/shared"
export AUDIOLAD_DEPLOY_COMMIT_FILE="${CURRENT_DIR}/.deploy-commit"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export NODE_OPTIONS="${NODE_OPTIONS:---require ./scripts/cjs-stub-server-only.cjs}"

ARGS=("$STAGE" "$CMD")
if [[ "${3:-}" == "--reset-cursor" ]]; then
  ARGS+=("--reset-cursor")
fi

exec npx tsx scripts/music-storage-bulk-orchestrator.mts "${ARGS[@]}"