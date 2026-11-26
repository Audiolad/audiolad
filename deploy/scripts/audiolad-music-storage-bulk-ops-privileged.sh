#!/usr/bin/env bash
# Privileged on-host ops (root via /usr/local/sbin). Hardcoded actions only.
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
    ENABLE_ENV="/usr/local/lib/audiolad/audiolad-music-storage-bulk-enable-copy-env.sh"
    if [[ ! -x "$ENABLE_ENV" ]]; then
      printf '%s\n' '{"error":"enable_copy_env_helper_missing"}' >&2
      exit 1
    fi
    "$ENABLE_ENV"
    "$CTL" start copy
    systemctl enable --now audiolad-music-storage-bulk-copy.timer
    systemctl status audiolad-music-storage-bulk-copy.timer --no-pager || true
    ;;
  pause)
    "$CTL" pause copy
    ;;
  resume)
    "$CTL" resume copy
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