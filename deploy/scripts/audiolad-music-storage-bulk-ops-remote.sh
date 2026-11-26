#!/usr/bin/env bash
# Remote ops entry for GHA production-deploy music-storage bulk controls.
# Never invokes audiolad-deploy. Hardcoded actions only; uses narrow sudo wrappers.
set -Eeuo pipefail

ACTION="${1:-status}"

sbin_for_action() {
  case "$1" in
    status) printf '%s\n' /usr/local/sbin/audiolad-music-storage-bulk-ops-status ;;
    start_copy) printf '%s\n' /usr/local/sbin/audiolad-music-storage-bulk-ops-start-copy ;;
    pause) printf '%s\n' /usr/local/sbin/audiolad-music-storage-bulk-ops-pause ;;
    resume) printf '%s\n' /usr/local/sbin/audiolad-music-storage-bulk-ops-resume ;;
    stop) printf '%s\n' /usr/local/sbin/audiolad-music-storage-bulk-ops-stop ;;
    *) return 1 ;;
  esac
}

case "$ACTION" in
  status|start_copy|pause|resume|stop) ;;
  *)
    printf '%s\n' '{"error":"unknown_action"}' >&2
    exit 2
    ;;
esac

SBIN="$(sbin_for_action "$ACTION")"
if ! sudo -n test -x "$SBIN" 2>/dev/null; then
  if sudo -n /usr/local/sbin/audiolad-music-storage-bulk-sudo-bootstrap 2>/dev/null; then
    :
  else
    CURRENT="$(readlink -f /var/www/audiolad-deploy/current)"
    BOOT="${CURRENT}/deploy/scripts/audiolad-music-storage-bulk-sudo-bootstrap.sh"
    if [[ -f "$BOOT" ]]; then
      sudo -n "$BOOT" || true
    fi
  fi
fi

if ! sudo -n test -x "$SBIN" 2>/dev/null; then
  printf '%s\n' '{"error":"privileged_ops_sbin_missing"}' >&2
  exit 1
fi

exec sudo -n "$SBIN"