#!/usr/bin/env bash
# Remote ops entry for GHA production-deploy music-storage bulk controls.
# Never invokes audiolad-deploy. Hardcoded actions only.
set -Eeuo pipefail

ACTION="${1:-status}"
CTL="/usr/local/lib/audiolad/audiolad-music-storage-bulk-ctl.sh"

if [[ ! -x "$CTL" ]]; then
  printf '%s\n' '{"error":"ctl_not_installed"}' >&2
  exit 1
fi

case "$ACTION" in
  status)
    "$CTL" status copy
    ;;
  start_copy)
    "$CTL" start copy
    systemctl enable --now audiolad-music-storage-bulk-copy.timer
    systemctl status audiolad-music-storage-bulk-copy.timer --no-pager || true
    ;;
  pause)
    "$CTL" pause copy
    ;;
  stop)
    "$CTL" stop copy
    systemctl disable --now audiolad-music-storage-bulk-copy.timer 2>/dev/null || true
    systemctl disable --now audiolad-music-storage-bulk-cutover.timer 2>/dev/null || true
    systemctl disable --now audiolad-music-storage-bulk-release-local.timer 2>/dev/null || true
    ;;
  *)
    printf '%s\n' '{"error":"unknown_action"}' >&2
    exit 2
    ;;
esac