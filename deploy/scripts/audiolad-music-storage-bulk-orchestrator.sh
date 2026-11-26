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

run_tsx() {
  npx tsx scripts/music-storage-bulk-orchestrator.mts "$@"
}

if [[ "$CMD" == "tick" ]]; then
  if ! command -v flock >/dev/null 2>&1; then
    printf '%s\n' '{"error":"flock_required_for_deploy_lock"}' >&2
    exit 1
  fi
  flock -n "$DEPLOY_LOCK_FILE" run_tsx "${ARGS[@]}"
  exit $?
fi

run_tsx "${ARGS[@]}"