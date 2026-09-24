#!/usr/bin/env bash
# Read-only host disk check. Never deletes files.
# Push URLs come from the environment (root-only EnvironmentFile). A missing
# URL is logged and does not change the host.
set -Eeuo pipefail

DISK_HEALTH_WARNING_PCT="${DISK_HEALTH_WARNING_PCT:-85}"
DISK_HEALTH_CRITICAL_PCT="${DISK_HEALTH_CRITICAL_PCT:-90}"
DISK_HEALTH_TAG="${DISK_HEALTH_TAG:-audiolad-disk-health}"

classify_disk_used_pct() {
  local used_pct="$1"
  local warning_pct="${2:-$DISK_HEALTH_WARNING_PCT}"
  local critical_pct="${3:-$DISK_HEALTH_CRITICAL_PCT}"

  if (( used_pct >= critical_pct )); then
    printf 'critical\n'
    return 0
  fi

  if (( used_pct >= warning_pct )); then
    printf 'warning\n'
    return 0
  fi

  printf 'ok\n'
}

read_root_used_pct() {
  df -P / | awk 'NR==2 { gsub(/%/, "", $5); print $5 }'
}

kuma_push_status_for_level() {
  local state="$1"
  local level="$2"

  case "$level" in
    warning)
      if [[ "$state" == "warning" || "$state" == "critical" ]]; then
        printf 'down\n'
      else
        printf 'up\n'
      fi
      ;;
    critical)
      if [[ "$state" == "critical" ]]; then
        printf 'down\n'
      else
        printf 'up\n'
      fi
      ;;
    *)
      printf 'up\n'
      ;;
  esac
}

notify_kuma_push() {
  local level="$1"
  local push_status="$2"
  local url="${3:-}"

  if [[ -z "$url" ]]; then
    logger -t "$DISK_HEALTH_TAG" "notification config missing level=${level}"
    return 0
  fi

  # Do not log the URL: a Kuma push URL contains the monitor token.
  if curl -fsS --max-time 10 -o /dev/null -G "$url" \
    --data-urlencode "status=${push_status}" \
    --data-urlencode "msg=${level}:${push_status}"; then
    logger -t "$DISK_HEALTH_TAG" "push sent level=${level} status=${push_status}"
  else
    logger -t "$DISK_HEALTH_TAG" "push failed level=${level} status=${push_status}"
  fi
}

run_disk_health_check() {
  local used_pct state warning_push critical_push

  used_pct="$(read_root_used_pct)"
  state="$(classify_disk_used_pct "$used_pct")"
  logger -t "$DISK_HEALTH_TAG" "state=${state} used_pct=${used_pct} warning_pct=${DISK_HEALTH_WARNING_PCT} critical_pct=${DISK_HEALTH_CRITICAL_PCT}"

  warning_push="$(kuma_push_status_for_level "$state" warning)"
  critical_push="$(kuma_push_status_for_level "$state" critical)"

  notify_kuma_push warning "$warning_push" "${AUDIOLAD_DISK_WARNING_PUSH_URL:-}"
  notify_kuma_push critical "$critical_push" "${AUDIOLAD_DISK_CRITICAL_PUSH_URL:-}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  run_disk_health_check
fi
