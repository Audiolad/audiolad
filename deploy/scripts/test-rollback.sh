#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

TEST_PORT="${TEST_PORT:-3001}"
TEST_APP_NAME="${TEST_APP_NAME:-audiolad-rollback-test}"

require_command pm2
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
ln -sfn "$current_dir" "$tmp_current"

pm2 delete "$TEST_APP_NAME" >/dev/null 2>&1 || true
PORT="$TEST_PORT" NODE_ENV=production pm2 start "$tmp_current/npm" --name "$TEST_APP_NAME" -- start --cwd "$tmp_current" >/dev/null 2>&1 || {
  pm2 start npm --name "$TEST_APP_NAME" --cwd "$tmp_current" -- start --update-env --env production >/dev/null 2>&1
}

# PM2 start with cwd is cleaner via ecosystem temp file
cat > /tmp/audiolad-rollback-test.ecosystem.cjs <<EOF
module.exports = { apps: [{ name: "$TEST_APP_NAME", cwd: "$tmp_current", script: "npm", args: "start", env: { NODE_ENV: "production", PORT: "$TEST_PORT" } }] };
EOF
pm2 delete "$TEST_APP_NAME" >/dev/null 2>&1 || true
pm2 start /tmp/audiolad-rollback-test.ecosystem.cjs --only "$TEST_APP_NAME"

if ! wait_for_health "http://127.0.0.1:${TEST_PORT}" 30 2; then
  log_error "Rollback test candidate failed health"
  pm2 delete "$TEST_APP_NAME" >/dev/null 2>&1 || true
  rm -f "$tmp_current"
  exit 1
fi

export AUDIOLAD_SMOKE_BASE_URL="http://127.0.0.1:${TEST_PORT}"
export AUDIOLAD_SMOKE_AUTH_MODE="guest-only"
if ! "$SCRIPT_DIR/smoke-test.sh" "http://127.0.0.1:${TEST_PORT}"; then
  log_error "Rollback test smoke failed on current"
  pm2 delete "$TEST_APP_NAME" >/dev/null 2>&1 || true
  rm -f "$tmp_current"
  exit 1
fi

atomic_symlink "$previous_dir" "$tmp_current"
pm2 restart "$TEST_APP_NAME" --update-env

if ! wait_for_health "http://127.0.0.1:${TEST_PORT}" 30 2; then
  log_error "Rollback test failed after switching symlink"
  pm2 delete "$TEST_APP_NAME" >/dev/null 2>&1 || true
  rm -f "$tmp_current"
  exit 1
fi

if ! "$SCRIPT_DIR/smoke-test.sh" "http://127.0.0.1:${TEST_PORT}"; then
  log_error "Rollback test smoke failed on previous"
  pm2 delete "$TEST_APP_NAME" >/dev/null 2>&1 || true
  rm -f "$tmp_current"
  exit 1
fi

pm2 delete "$TEST_APP_NAME" >/dev/null 2>&1 || true
rm -f "$tmp_current" /tmp/audiolad-rollback-test.ecosystem.cjs
log_info "Rollback dry-run completed successfully"
