#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
DEPLOY_LOG_DIR="${DEPLOY_LOG_DIR:-$DEPLOY_ROOT/logs}"
DEPLOY_SCRIPTS_DIR="${DEPLOY_SCRIPTS_DIR:-$DEPLOY_ROOT/scripts}"
GIT_REPO="${GIT_REPO:-git@github-audiolad:Audiolad/audiolad.git}"
GIT_WORKDIR="${GIT_WORKDIR:-/var/www/audiolad}"
PRODUCTION_PORT="${PRODUCTION_PORT:-3000}"
CANDIDATE_PORT="${CANDIDATE_PORT:-3001}"
PM2_APP_NAME="${PM2_APP_NAME:-audiolad}"
HEALTH_PATH="${HEALTH_PATH:-/api/health/build}"
SMOKE_TIMEOUT_MS="${SMOKE_TIMEOUT_MS:-120000}"

log() {
  local level="$1"
  shift
  printf '[%s] [%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$level" "$*"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }

ensure_dirs() {
  mkdir -p "$DEPLOY_ROOT/releases" "$DEPLOY_ROOT/shared" "$DEPLOY_LOG_DIR"
}

atomic_symlink() {
  local target="$1"
  local link_path="$2"
  local tmp_link="${link_path}.tmp.$$"

  ln -sfn "$target" "$tmp_link"
  mv -Tf "$tmp_link" "$link_path"
}

read_build_id() {
  local release_dir="$1"
  if [[ -f "$release_dir/.next/BUILD_ID" ]]; then
    tr -d '\n' < "$release_dir/.next/BUILD_ID"
  else
    echo "missing"
  fi
}

wait_for_health() {
  local base_url="$1"
  local attempts="${2:-30}"
  local delay="${3:-2}"

  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "${base_url}${HEALTH_PATH}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

send_deploy_alert() {
  local subject="$1"
  local message="$2"
  local log_file="$DEPLOY_LOG_DIR/deploy-alerts.log"

  {
    echo "-----"
    echo "time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "subject: $subject"
    echo "$message"
  } >>"$log_file"

  if [[ -n "${DEPLOY_ALERT_WEBHOOK_URL:-}" ]]; then
    curl -fsS -X POST "$DEPLOY_ALERT_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"${subject}: ${message}\"}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${DEPLOY_ALERT_EMAIL:-}" ]]; then
    if command -v mail >/dev/null 2>&1; then
      printf '%s\n' "$message" | mail -s "$subject" "$DEPLOY_ALERT_EMAIL" >/dev/null 2>&1 || true
    fi
  fi
}

require_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    log_error "Required command not found: $cmd"
    exit 1
  }
}

check_disk_space() {
  local min_mb="${1:-2048}"
  local avail_kb
  avail_kb="$(df -Pk "$DEPLOY_ROOT" | awk 'NR==2 {print $4}')"
  local avail_mb=$((avail_kb / 1024))

  if (( avail_mb < min_mb )); then
    log_error "Insufficient disk space: ${avail_mb}MB available, need at least ${min_mb}MB"
    exit 1
  fi
}

get_short_commit() {
  local commit="$1"
  git -C "$GIT_WORKDIR" rev-parse --short "$commit"
}

get_release_name() {
  local commit="$1"
  local short
  short="$(get_short_commit "$commit")"
  date -u +"%Y%m%d-%H%M%S-${short}"
}

prune_old_releases() {
  local keep="${1:-3}"
  mapfile -t releases < <(ls -1dt "$DEPLOY_ROOT/releases"/* 2>/dev/null || true)
  local current_target previous_target
  current_target="$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || true)"
  previous_target="$(readlink -f "$DEPLOY_ROOT/previous" 2>/dev/null || true)"

  local count=0
  for release in "${releases[@]}"; do
    [[ -d "$release" ]] || continue
    if [[ "$release" == "$current_target" || "$release" == "$previous_target" ]]; then
      continue
    fi
    count=$((count + 1))
    if (( count > keep )); then
      log_info "Removing old release: $release"
      rm -rf "$release"
    fi
  done
}
