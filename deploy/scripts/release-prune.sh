#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
Usage: release-prune.sh [--dry-run] [keep-extra]

Safely prune old Audiolad production releases under deploy lock.
Always keeps current, previous, and the newest extra releases (default: 3).
EOF
}

KEEP_EXTRA="${RELEASE_RETENTION_KEEP_EXTRA:-3}"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      KEEP_EXTRA="$1"
      shift
      ;;
  esac
done

main() {
  require_command flock
  ensure_dirs
  acquire_deploy_lock

  export RELEASE_RETENTION_DRY_RUN="$DRY_RUN"
  export RELEASE_RETENTION_KEEP_EXTRA="$KEEP_EXTRA"

  if ! prune_old_releases "$KEEP_EXTRA"; then
    log_error "Release prune failed"
    exit 1
  fi
}

main "$@"
