#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

TEST_PORT="${TEST_PORT:-3001}"

require_command npm
require_command curl
ensure_dirs

if [[ ! -L "$DEPLOY_ROOT/current" || ! -L "$DEPLOY_ROOT/previous" ]]; then
  log_error "current/previous symlinks are required"
  exit 1
fi

current_dir="$(readlink -f "$DEPLOY_ROOT/current")"
previous_dir="$(readlink -f "$DEPLOY_ROOT/previous")"

log_info "Rollback dry-run between identical releases"
log_info "current=$current_dir"
log_info "previous=$previous_dir"

tmp_current="$DEPLOY_ROOT/current.rollback-test.$$"
candidate_pid=""
candidate_log="/tmp/audiolad-rollback-test.log"

cleanup() {
  if [[ -n "$candidate_pid" ]] && kill -0 "$candidate_pid" 2>/dev/null; then
    kill "$candidate_pid" 2>/dev/null || true
    wait "$candidate_pid" 2>/dev/null || true
  fi
  rm -f "$tmp_current"
}

trap cleanup EXIT

start_candidate() {
  local release_dir="$1"
  ln -sfn "$release_dir" "$tmp_current"
  cd "$tmp_current"
  PORT="$TEST_PORT" NODE_ENV=production npm start >"$candidate_log" 2>&1 &
  candidate_pid=$!
}

start_candidate "$current_dir"

if ! wait_for_health "http://127.0.0.1:${TEST_PORT}" 40 2; then
  log_error "Rollback test candidate failed health on current"
  tail -n 40 "$candidate_log" || true
  exit 1
fi

export AUDIOLAD_SMOKE_AUTH_MODE="guest-only"
if ! "$SCRIPT_DIR/smoke-test.sh" "http://127.0.0.1:${TEST_PORT}"; then
  log_error "Rollback test smoke failed on current"
  exit 1
fi

if [[ -n "$candidate_pid" ]] && kill -0 "$candidate_pid" 2>/dev/null; then
  kill "$candidate_pid" 2>/dev/null || true
  wait "$candidate_pid" 2>/dev/null || true
  candidate_pid=""
fi

start_candidate "$previous_dir"

if ! wait_for_health "http://127.0.0.1:${TEST_PORT}" 40 2; then
  log_error "Rollback test failed after switching to previous"
  tail -n 40 "$candidate_log" || true
  exit 1
fi

if ! "$SCRIPT_DIR/smoke-test.sh" "http://127.0.0.1:${TEST_PORT}"; then
  log_error "Rollback test smoke failed on previous"
  exit 1
fi

trap - EXIT
cleanup
log_info "Rollback dry-run completed successfully"
