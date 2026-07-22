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
READINESS_ATTEMPTS="${READINESS_ATTEMPTS:-30}"
READINESS_DELAY="${READINESS_DELAY:-2}"
READINESS_PROBE_SCRIPT="${READINESS_PROBE_SCRIPT:-$DEPLOY_SCRIPTS_DIR/lib/readiness-check.mjs}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://audiolad.ru}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/run/audiolad-deploy.lock}"
DEPLOY_LOCK_FD="${DEPLOY_LOCK_FD:-9}"
__AUDIOLAD_DEPLOY_LOCK_ACQUIRED="${__AUDIOLAD_DEPLOY_LOCK_ACQUIRED:-0}"

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

acquire_deploy_lock() {
  if [[ "${AUDIOLAD_DEPLOY_LOCK_HELD:-}" == "1" ]]; then
    local parent_cmd=""
    parent_cmd="$(ps -o cmd= -p "${PPID:-0}" 2>/dev/null || true)"
    if [[ "$parent_cmd" == *deploy.sh* ]]; then
      log_info "Deploy lock bypass for trusted internal rollback (parent pid=${PPID})"
      return 0
    fi

    log_error "Deploy lock bypass rejected: AUDIOLAD_DEPLOY_LOCK_HELD without deploy.sh parent"
    log_error "Lock file: $DEPLOY_LOCK_FILE"
    log_error "Current pid: $$"
    exit 1
  fi

  if [[ "$__AUDIOLAD_DEPLOY_LOCK_ACQUIRED" == "1" ]]; then
    return 0
  fi

  require_command flock

  exec {DEPLOY_LOCK_FD}>>"$DEPLOY_LOCK_FILE"
  if ! flock -n "$DEPLOY_LOCK_FD"; then
    log_error "Another Audiolad deploy or rollback is already running."
    log_error "Lock file: $DEPLOY_LOCK_FILE"
    log_error "Current pid: $$"
    log_error "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    if command -v fuser >/dev/null 2>&1; then
      local holder_info=""
      holder_info="$(fuser -v "$DEPLOY_LOCK_FILE" 2>&1 || true)"
      if [[ -n "$holder_info" ]]; then
        log_error "Lock holders:"
        while IFS= read -r line; do
          [[ -n "$line" ]] && log_error "$line"
        done <<<"$holder_info"
      fi
    fi
    exit 1
  fi

  __AUDIOLAD_DEPLOY_LOCK_ACQUIRED=1
  log_info "Acquired deploy lock at $DEPLOY_LOCK_FILE (pid=$$)"
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

  wait_for_production_readiness "$base_url" "" "$attempts" "$delay" "$base_url"
}

probe_readiness_once() {
  local base_url="$1"
  local expected_build_id="${2:-}"
  local probe_args=(node "$READINESS_PROBE_SCRIPT" probe --url "${base_url}${HEALTH_PATH}")

  if [[ -n "$expected_build_id" ]]; then
    probe_args+=(--expected-build-id "$expected_build_id")
  fi

  local output=""
  if ! output="$("${probe_args[@]}" 2>/dev/null)"; then
    if [[ -z "$output" ]]; then
      printf '%s\n' '{"ready":false,"httpStatus":null,"reason":"probe_failed","buildId":null,"status":null}'
      return 1
    fi
  fi

  printf '%s\n' "$output"
}

wait_for_production_readiness() {
  local base_url="$1"
  local expected_build_id="${2:-}"
  local attempts="${3:-$READINESS_ATTEMPTS}"
  local delay="${4:-$READINESS_DELAY}"
  local label="${5:-$base_url}"
  local probe_json http_status reason build_id

  log_info "Waiting for production readiness at ${label} (max ${attempts} attempts, ${delay}s delay)"

  for ((i = 1; i <= attempts; i++)); do
    probe_json="$(probe_readiness_once "$base_url" "$expected_build_id" || true)"
    read -r http_status reason build_id <<<"$(
      printf '%s' "$probe_json" | node -e 'const input=require("fs").readFileSync(0,"utf8").trim()||"{}";
let payload={};
try { payload=JSON.parse(input); } catch {}
process.stdout.write(`${payload.httpStatus ?? "null"}\t${payload.reason ?? "unknown"}\t${payload.buildId ?? "null"}\n`);'
    )"

    if printf '%s' "$probe_json" | node -e 'const input=require("fs").readFileSync(0,"utf8").trim()||"{}";
let payload={};
try { payload=JSON.parse(input); } catch {}
process.exit(payload.ready===true?0:1);'; then
      log_info "Production readiness confirmed at ${label} on attempt ${i} (http=${http_status}, buildId=${build_id})"
      return 0
    fi

    log_warn "Readiness attempt ${i}/${attempts} at ${label}: http=${http_status}, reason=${reason}, buildId=${build_id}"
    sleep "$delay"
  done

  log_error "Production readiness timeout at ${label} after ${attempts} attempts (last http=${http_status}, reason=${reason})"
  return 1
}

wait_for_release_readiness() {
  local release_dir="$1"
  local expected_build_id

  expected_build_id="$(read_build_id "$release_dir")"
  if [[ "$expected_build_id" == "missing" ]]; then
    log_error "Release BUILD_ID missing: $release_dir/.next/BUILD_ID"
    return 1
  fi

  if ! wait_for_production_readiness "http://127.0.0.1:${PRODUCTION_PORT}" "$expected_build_id"; then
    return 1
  fi

  wait_for_production_readiness "$PUBLIC_BASE_URL" "$expected_build_id"
}

port_has_listener() {
  local port="$1"
  ss -lntp 2>/dev/null | grep -q ":${port} "
}

wait_for_port_free() {
  local port="$1"
  local attempts="${2:-30}"
  local delay="${3:-1}"

  for ((i = 1; i <= attempts; i++)); do
    if ! port_has_listener "$port"; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

cleanup_orphan_next_servers() {
  local keep_port="${1:-$PRODUCTION_PORT}"
  local keep_pid=""

  if port_has_listener "$keep_port"; then
    keep_pid="$(ss -lntp 2>/dev/null | awk -v port=":${keep_port}" '
      $0 ~ port && match($0, /pid=([0-9]+)/, m) { print m[1]; exit }
    ')"
  fi

  while read -r pid; do
    [[ -n "$pid" ]] || continue
    if [[ -n "$keep_pid" && "$pid" == "$keep_pid" ]]; then
      continue
    fi

    local ppid cmd
    ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
    cmd="$(ps -o cmd= -p "$pid" 2>/dev/null || true)"
    [[ "$cmd" == *"next-server"* ]] || continue

    if [[ "$ppid" == "1" ]]; then
      log_warn "Stopping orphaned next-server pid=$pid"
      kill "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        log_warn "Force-stopping stubborn orphaned next-server pid=$pid"
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
  done < <(pgrep -f 'next-server' 2>/dev/null || true)
}

ensure_production_port_ready() {
  log_info "Preparing port ${PRODUCTION_PORT} for PM2 sync"
  pm2 stop "$PM2_APP_NAME" >/dev/null 2>&1 || true

  if ! wait_for_port_free "$PRODUCTION_PORT" 20 1; then
    log_warn "Port ${PRODUCTION_PORT} still busy after PM2 stop; clearing stale listeners"
    fuser -k "${PRODUCTION_PORT}/tcp" >/dev/null 2>&1 || true
    sleep 2
    wait_for_port_free "$PRODUCTION_PORT" 10 1 || {
      log_error "Port ${PRODUCTION_PORT} is still in use"
      ss -lntp 2>/dev/null | grep ":${PRODUCTION_PORT} " || true
      return 1
    }
  fi

  cleanup_orphan_next_servers "$PRODUCTION_PORT"
  sleep 1
}

sync_pm2_audiolad() {
  ensure_production_port_ready || return 1

  if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    pm2 startOrReload "$DEPLOY_ROOT/ecosystem.config.cjs" --only "$PM2_APP_NAME" --update-env
  else
    pm2 start "$DEPLOY_ROOT/ecosystem.config.cjs" --only "$PM2_APP_NAME"
  fi
  pm2 save
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

# shellcheck source=release-retention.sh
source "$(dirname "${BASH_SOURCE[0]}")/release-retention.sh"
