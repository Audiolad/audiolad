#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_TMP="$(mktemp -d /tmp/audiolad-zdt-unit.XXXXXX)"
DEPLOY_ROOT="$ROOT_TMP/deploy"
DEPLOY_LOG_DIR="$DEPLOY_ROOT/logs"
DEPLOY_SCRIPTS_DIR="$SCRIPT_DIR"
RUNTIME_STATE_FILE="$DEPLOY_ROOT/shared/active-upstream.env"
NGINX_UPSTREAM_CONF="$ROOT_TMP/nginx/audiolad-next-upstream.conf"
NGINX_SITE_CONF="$ROOT_TMP/nginx/audiolad.ru"
AUDIOLAD_NGINX_DRY_RUN=1

export DEPLOY_ROOT DEPLOY_LOG_DIR DEPLOY_SCRIPTS_DIR RUNTIME_STATE_FILE
export NGINX_UPSTREAM_CONF NGINX_SITE_CONF AUDIOLAD_NGINX_DRY_RUN
export READINESS_PROBE_SCRIPT="$SCRIPT_DIR/lib/readiness-check.mjs"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

PASS=0
FAIL=0

assert_eq() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected='$expected' actual='$actual')"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local name="$1"
  local needle="$2"
  local haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (missing '$needle')"
    FAIL=$((FAIL + 1))
  fi
}

assert_true() {
  local name="$1"
  shift
  if "$@"; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

assert_false() {
  local name="$1"
  shift
  if "$@"; then
    echo "FAIL: $name (expected failure)"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: $name"
    PASS=$((PASS + 1))
  fi
}

cleanup() {
  rm -rf "$ROOT_TMP"
}
trap cleanup EXIT

mkdir -p "$DEPLOY_ROOT/shared" "$DEPLOY_ROOT/logs" "$DEPLOY_ROOT/releases" \
  "$(dirname "$NGINX_UPSTREAM_CONF")" 

cat >"$NGINX_SITE_CONF" <<'EOF'
server {
    location /api/author/personal-materials/x/audio {
        proxy_pass http://127.0.0.1:3000;
    }
    location /api/author/products/x/audio/y/upload {
        proxy_pass http://127.0.0.1:3000;
    }
    location /api/author/products/x/cover {
        proxy_pass http://127.0.0.1:3000;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
    }
    location /rest/v1/ {
        proxy_pass http://127.0.0.1:8000;
    }
}
EOF

echo "=== zero-downtime cutover unit tests ==="

assert_eq "standby from blue" "3001" "$(standby_port_for 3000)"
assert_eq "standby from green" "3000" "$(standby_port_for 3001)"
assert_eq "pm2 app name for 3001" "audiolad-p3001" "$(pm2_app_for_port 3001)"

save_runtime_state 3000 audiolad
load_runtime_state
assert_eq "loaded ACTIVE_PORT" "3000" "$ACTIVE_PORT"
assert_eq "loaded ACTIVE_PM2_APP" "audiolad" "$ACTIVE_PM2_APP"
assert_eq "loaded STANDBY_PORT" "3001" "$STANDBY_PORT"

upstream_body="$(render_nginx_upstream_conf 3001)"
assert_contains "upstream mentions port 3001" "server 127.0.0.1:3001;" "$upstream_body"
assert_contains "upstream name" "upstream audiolad_next" "$upstream_body"

# Site migration without sudo: exercise sed logic via temporary copy helper.
site_tmp="$ROOT_TMP/nginx/site-migrated.ru"
sed 's#proxy_pass http://127\.0\.0\.1:3000;#proxy_pass http://audiolad_next;#g' \
  "$NGINX_SITE_CONF" >"$site_tmp"
assert_contains "site migrated next locations" "proxy_pass http://audiolad_next;" "$(cat "$site_tmp")"
assert_contains "supabase upstream untouched" "proxy_pass http://127.0.0.1:8000;" "$(cat "$site_tmp")"
assert_false "no leftover :3000 next proxy" grep -q 'proxy_pass http://127.0.0.1:3000;' "$site_tmp"

assert_false "legacy sync_pm2_audiolad disabled" sync_pm2_audiolad

# Consecutive readiness: mock probe via temporary wrapper.
MOCK_PROBE_DIR="$ROOT_TMP/mock-probe"
mkdir -p "$MOCK_PROBE_DIR"
cat >"$MOCK_PROBE_DIR/readiness-check.mjs" <<'EOF'
#!/usr/bin/env node
import fs from "node:fs";
const stateFile = process.env.MOCK_PROBE_STATE;
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const idx = state.calls;
state.calls += 1;
fs.writeFileSync(stateFile, JSON.stringify(state));
const ok = state.pattern[idx] === true;
const payload = ok
  ? { ready: true, httpStatus: 200, reason: "ok", buildId: "build-a", status: "ok" }
  : { ready: false, httpStatus: 500, reason: "http_500", buildId: null, status: null };
process.stdout.write(JSON.stringify(payload));
process.exit(ok ? 0 : 1);
EOF
chmod +x "$MOCK_PROBE_DIR/readiness-check.mjs"

READINESS_PROBE_SCRIPT="$MOCK_PROBE_DIR/readiness-check.mjs"
export READINESS_PROBE_SCRIPT

MOCK_PROBE_STATE="$ROOT_TMP/probe-state-flaky.json"
export MOCK_PROBE_STATE
printf '%s\n' '{"calls":0,"pattern":[true,false,true,true,true]}' >"$MOCK_PROBE_STATE"
assert_true "flaky then 3 consecutive readiness" \
  wait_for_production_readiness "http://127.0.0.1:3999" "build-a" 10 0 "mock-flaky" 3

MOCK_PROBE_STATE="$ROOT_TMP/probe-state-wrong-build.json"
export MOCK_PROBE_STATE
# evaluateReadiness in real probe checks build id; our mock ignores expected and always returns build-a when ok.
# Simulate persistent failure:
printf '%s\n' '{"calls":0,"pattern":[false,false,false,false,false]}' >"$MOCK_PROBE_STATE"
assert_false "persistent failure times out" \
  wait_for_production_readiness "http://127.0.0.1:3999" "build-a" 5 0 "mock-fail" 3

MOCK_PROBE_STATE="$ROOT_TMP/probe-state-single.json"
export MOCK_PROBE_STATE
printf '%s\n' '{"calls":0,"pattern":[true,false,false,false,false]}' >"$MOCK_PROBE_STATE"
assert_false "single success is not enough" \
  wait_for_production_readiness "http://127.0.0.1:3999" "build-a" 5 0 "mock-single" 3

# Lock test: acquire twice in child must fail.
LOCK_TEST_FILE="$ROOT_TMP/deploy.lock"
DEPLOY_LOCK_FILE="$LOCK_TEST_FILE"
__AUDIOLAD_DEPLOY_LOCK_ACQUIRED=0
acquire_deploy_lock
assert_true "first lock acquired" test "$__AUDIOLAD_DEPLOY_LOCK_ACQUIRED" = "1"
if (
  DEPLOY_LOCK_FILE="$LOCK_TEST_FILE"
  __AUDIOLAD_DEPLOY_LOCK_ACQUIRED=0
  # shellcheck source=lib/common.sh
  source "$SCRIPT_DIR/lib/common.sh"
  acquire_deploy_lock
); then
  echo "FAIL: second lock should have failed"
  FAIL=$((FAIL + 1))
else
  echo "PASS: second lock rejected"
  PASS=$((PASS + 1))
fi

# Cleanup must not delete active/previous.
mkdir -p \
  "$DEPLOY_ROOT/releases/20260724-100000-aaaaaaa" \
  "$DEPLOY_ROOT/releases/20260724-110000-bbbbbbb" \
  "$DEPLOY_ROOT/releases/20260724-120000-ccccccc" \
  "$DEPLOY_ROOT/releases/20260724-130000-ddddddd"
: >"$DEPLOY_ROOT/releases/20260724-100000-aaaaaaa/.deploy-commit"
: >"$DEPLOY_ROOT/releases/20260724-110000-bbbbbbb/.deploy-commit"
: >"$DEPLOY_ROOT/releases/20260724-120000-ccccccc/.deploy-commit"
: >"$DEPLOY_ROOT/releases/20260724-130000-ddddddd/.deploy-commit"
ln -sfn "$DEPLOY_ROOT/releases/20260724-130000-ddddddd" "$DEPLOY_ROOT/current"
ln -sfn "$DEPLOY_ROOT/releases/20260724-120000-ccccccc" "$DEPLOY_ROOT/previous"
RELEASE_RETENTION_MIN_AGE_SECONDS=0
prune_old_releases 1
assert_true "current release kept" test -d "$DEPLOY_ROOT/releases/20260724-130000-ddddddd"
assert_true "previous release kept" test -d "$DEPLOY_ROOT/releases/20260724-120000-ccccccc"

# Ensure deploy/rollback still parse.
assert_true "deploy.sh syntax" bash -n "$SCRIPT_DIR/deploy.sh"
assert_true "rollback.sh syntax" bash -n "$SCRIPT_DIR/rollback.sh"
assert_true "zero-downtime.sh syntax" bash -n "$SCRIPT_DIR/lib/zero-downtime.sh"
assert_true "common.sh syntax" bash -n "$SCRIPT_DIR/lib/common.sh"
assert_true "health-watch.sh syntax" bash -n "$SCRIPT_DIR/health-watch.sh"

# Static guarantee: deploy no longer calls sync_pm2 / ensure_production_port_ready.
assert_false "deploy.sh must not call sync_pm2_audiolad" \
  grep -q 'sync_pm2_audiolad' "$SCRIPT_DIR/deploy.sh"
assert_false "deploy.sh must not call ensure_production_port_ready" \
  grep -q 'ensure_production_port_ready' "$SCRIPT_DIR/deploy.sh"
assert_false "rollback.sh must not call sync_pm2_audiolad" \
  grep -q 'sync_pm2_audiolad' "$SCRIPT_DIR/rollback.sh"
assert_true "deploy.sh uses cutover_nginx_to_port" \
  grep -q 'cutover_nginx_to_port' "$SCRIPT_DIR/deploy.sh"
assert_true "rollback.sh uses cutover_nginx_to_port" \
  grep -q 'cutover_nginx_to_port' "$SCRIPT_DIR/rollback.sh"
assert_true "deploy keeps old process until after smoke" \
  grep -q 'previous_process_stopped' "$SCRIPT_DIR/deploy.sh"
assert_true "candidate ecosystem uses *.config.cjs name" \
  grep -q 'ecosystem.candidate.config.cjs' "$SCRIPT_DIR/lib/zero-downtime.sh"
assert_false "candidate must not assign ecosystem-<app>.cjs path" \
  grep -q 'eco_file="$DEPLOY_ROOT/shared/ecosystem-${app_name}.cjs"' "$SCRIPT_DIR/lib/zero-downtime.sh"

echo "=== results: pass=${PASS} fail=${FAIL} ==="
if (( FAIL > 0 )); then
  exit 1
fi
exit 0
