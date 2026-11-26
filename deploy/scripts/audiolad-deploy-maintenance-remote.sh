#!/usr/bin/env bash
# GHA trusted helper: audiolad-maintenance.sh via narrow sudo (no deploy.sh).
set -Eeuo pipefail

MODE="${1:-dry-run}"
case "$MODE" in
  dry-run|apply) ;;
  *)
    printf '%s\n' '{"error":"usage","hint":"dry-run|apply"}' >&2
    exit 2
    ;;
esac

MAINT="/usr/local/sbin/audiolad-maintenance.sh"
if [[ ! -x "$MAINT" ]]; then
  printf '%s\n' '{"error":"audiolad_maintenance_missing","path":"'"$MAINT"'"}' >&2
  exit 1
fi

printf '%s\n' "confirm=OPS_DEPLOY_MAINTENANCE_${MODE//-/_}"
printf '%s\n' "mode=$MODE"

case "$MODE" in
  dry-run)
    if ! sudo -n "$MAINT" --dry-run; then
      printf '%s\n' "OPS_DEPLOY_MAINTENANCE_END=failed" >&2
      exit 1
    fi
    ;;
  apply)
    if ! sudo -n "$MAINT" --apply; then
      printf '%s\n' "OPS_DEPLOY_MAINTENANCE_END=failed" >&2
      exit 1
    fi
    ;;
esac

df -P -h / /var/www /var/www/audiolad-deploy 2>/dev/null | head -10 || df -P -h / | head -3
printf '%s\n' "OPS_DEPLOY_MAINTENANCE_END=ok"