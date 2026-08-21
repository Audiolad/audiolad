#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_TMP="$(mktemp -d /tmp/audiolad-dbmig-unit.XXXXXX)"
DEPLOY_ROOT="$ROOT_TMP/deploy"
DEPLOY_LOG_DIR="$DEPLOY_ROOT/logs"
FAKE_BIN="$ROOT_TMP/fake-bin"
FAKE_STATE="$ROOT_TMP/fake-state"
SECRET_DB_URL="postgresql://secret-user:super-secret-pass@db.example/postgres"
SERVICE_ROLE="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.unit-test-signature"

export DEPLOY_ROOT DEPLOY_LOG_DIR
export FAKE_DOCKER_STATE="$FAKE_STATE"
export AUDIOLAD_DOCKER_BIN="$FAKE_BIN/docker"
export AUDIOLAD_SUPABASE_DB_CONTAINER="supabase-db"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

LOCK_CALLS=0
acquire_deploy_lock() {
  LOCK_CALLS=$((LOCK_CALLS + 1))
  printf 'UNEXPECTED_ACQUIRE_DEPLOY_LOCK\n'
  return 1
}

# shellcheck source=lib/database-migrations.sh
source "$SCRIPT_DIR/lib/database-migrations.sh"

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

assert_not_contains() {
  local name="$1"
  local needle="$2"
  local haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "FAIL: $name (found forbidden '$needle')"
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
  "$FAKE_BIN" "$FAKE_STATE"

cat >"$FAKE_BIN/docker" <<EOF
#!/usr/bin/env bash
exec node "$SCRIPT_DIR/test-support/fake-docker.mjs" "\$@"
EOF
chmod +x "$FAKE_BIN/docker"

write_env() {
  local path="$1"
  cat >"$path" <<ENV
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=pub-test
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE}
# SUPABASE_DB_URL is intentionally absent for self-hosted docker-exec.
ENV
}

reset_state() {
  rm -rf "$FAKE_STATE"
  mkdir -p "$FAKE_STATE"
  : >"$FAKE_STATE/calls"
  : >"$FAKE_STATE/sql_log"
  : >"$FAKE_STATE/remote"
  echo running >"$FAKE_STATE/container_status"
  echo ok >"$FAKE_STATE/select1"
  echo missing >"$FAKE_STATE/table_status"
  echo 0 >"$FAKE_STATE/apply_count"
  echo 0 >"$FAKE_STATE/history_inserts"
  echo supabase-db >"$FAKE_STATE/container_name"
  unset FAKE_PUSH_FAIL
}

apply_count() {
  tr -d '[:space:]' <"$FAKE_STATE/apply_count" 2>/dev/null || echo 0
}

history_inserts() {
  tr -d '[:space:]' <"$FAKE_STATE/history_inserts" 2>/dev/null || echo 0
}

make_release() {
  local name="$1"
  shift
  local dir="$DEPLOY_ROOT/releases/$name"
  mkdir -p "$dir/supabase/migrations"
  local version
  for version in "$@"; do
    cat >"$dir/supabase/migrations/${version}_fixture.sql" <<SQL
BEGIN;
-- $version
SELECT 1;
COMMIT;
SQL
  done
  printf '%s\n' "$dir"
}

baseline_remote() {
  printf '%s\n' "$@" >"$FAKE_STATE/remote"
  if [[ $# -eq 0 ]]; then
    echo empty >"$FAKE_STATE/table_status"
  else
    echo ready >"$FAKE_STATE/table_status"
  fi
}

run_stage() {
  local release_dir="$1"
  local output=""
  local status=0
  set +e
  output="$(run_database_migration_stage "$release_dir" 2>&1)"
  status=$?
  set -e
  STAGE_OUTPUT="$output"
  STAGE_STATUS="$status"
}

echo "=== database migrations unit tests (self-hosted docker-exec) ==="

# --- no pending ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_noop="$(make_release "rel-noop" 20260819183000)"
baseline_remote 20260819183000
run_stage "$rel_noop"
assert_eq "no pending stage status" "0" "$STAGE_STATUS"
assert_eq "no pending apply count" "0" "$(apply_count)"
assert_eq "no pending history inserts" "0" "$(history_inserts)"
assert_contains "no pending logs pending=0" "database_migrations_pending=0" "$STAGE_OUTPUT"
assert_contains "no pending preflight" "database_migration_preflight_started" "$STAGE_OUTPUT"

# --- one pending apply exactly once ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_one="$(make_release "rel-one" 20260819183000 20260821140000)"
baseline_remote 20260819183000
run_stage "$rel_one"
assert_eq "one pending stage status" "0" "$STAGE_STATUS"
assert_eq "one pending apply count" "1" "$(apply_count)"
assert_eq "one pending history inserts" "1" "$(history_inserts)"
assert_contains "one pending logs pending=1" "database_migrations_pending=1" "$STAGE_OUTPUT"
assert_contains "one pending apply started" "database_migration_apply_started" "$STAGE_OUTPUT"
assert_contains "one pending apply succeeded" "database_migration_apply_succeeded" "$STAGE_OUTPUT"
assert_contains "one pending pending_after=0" "database_migrations_pending_after=0" "$STAGE_OUTPUT"
assert_contains "applied Olga version once" "20260821140000" "$(cat "$FAKE_STATE/remote")"

# --- second stage run does not apply again ---
run_stage "$rel_one"
assert_eq "second run stage status" "0" "$STAGE_STATUS"
assert_eq "second run apply count still 1" "1" "$(apply_count)"
assert_eq "second run inserts still 1" "1" "$(history_inserts)"
assert_contains "second run logs pending=0" "database_migrations_pending=0" "$STAGE_OUTPUT"

# --- apply non-zero fails ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_fail="$(make_release "rel-fail" 20260819183000 20260821140000)"
baseline_remote 20260819183000
echo 1 >"$FAKE_STATE/apply_fail"
run_stage "$rel_fail"
assert_eq "apply fail stage status" "1" "$STAGE_STATUS"
assert_contains "apply fail logs failed" "database_migration_failed" "$STAGE_OUTPUT"
assert_eq "apply fail does not insert history" "0" "$(history_inserts)"

# --- missing SUPABASE_DB_URL is OK ---
reset_state
cat >"$DEPLOY_ROOT/shared/.env.production" <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE}
EOF
rel_nourl="$(make_release "rel-nourl" 20260819183000)"
baseline_remote 20260819183000
run_stage "$rel_nourl"
assert_eq "no db url stage status" "0" "$STAGE_STATUS"
assert_not_contains "no db url credential error" "database_migration_credentials_missing" "$STAGE_OUTPUT"

# --- secrets never appear ---
reset_state
cat >"$DEPLOY_ROOT/shared/.env.production" <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE}
SUPABASE_DB_URL=${SECRET_DB_URL}
EOF
rel_secret="$(make_release "rel-secret" 20260819183000 20260821140000)"
baseline_remote 20260819183000
run_stage "$rel_secret"
assert_not_contains "no raw postgres url" "$SECRET_DB_URL" "$STAGE_OUTPUT"
assert_not_contains "no secret password" "super-secret-pass" "$STAGE_OUTPUT"
assert_not_contains "no secret user" "secret-user" "$STAGE_OUTPUT"
assert_not_contains "no service role jwt" "$SERVICE_ROLE" "$STAGE_OUTPUT"

# --- no nested flock ---
assert_eq "acquire_deploy_lock not called" "0" "$LOCK_CALLS"
assert_not_contains "stage output has no lock surprise" "UNEXPECTED_ACQUIRE_DEPLOY_LOCK" "$STAGE_OUTPUT"
if grep -Eq 'acquire_deploy_lock|[[:space:]]flock([[:space:]]|$)' "$SCRIPT_DIR/lib/database-migrations.sh" "$SCRIPT_DIR/lib/self-hosted-db.sh"; then
  echo "FAIL: migration helpers must not call flock/acquire_deploy_lock"
  FAIL=$((FAIL + 1))
else
  echo "PASS: library does not flock or acquire_deploy_lock"
  PASS=$((PASS + 1))
fi

# --- uses RELEASE_DIR migrations, not stale current ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
current_rel="$(make_release "rel-current-stale" 20260819183000)"
fresh_rel="$(make_release "rel-fresh" 20260819183000 20260821140000)"
ln -sfn "$current_rel" "$DEPLOY_ROOT/current"
baseline_remote 20260819183000
run_stage "$fresh_rel"
assert_eq "release-not-current stage status" "0" "$STAGE_STATUS"
assert_eq "release-not-current apply once" "1" "$(apply_count)"
assert_contains "applied Olga version from release dir" "20260821140000" "$(cat "$FAKE_STATE/remote")"
run_stage "$DEPLOY_ROOT/current"
assert_eq "current symlink path rejected" "1" "$STAGE_STATUS"
assert_contains "current symlink abort" "current symlink" "$STAGE_OUTPUT"

# --- abort-before-cutover harness ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
old_rel="$(make_release "rel-old-live" 20260819183000)"
new_rel="$(make_release "rel-new-abort" 20260819183000 20260821140000)"
ln -sfn "$old_rel" "$DEPLOY_ROOT/current"
baseline_remote 20260819183000
echo 1 >"$FAKE_STATE/apply_fail"
CUTOVER=0
if run_database_migration_stage "$new_rel" >/tmp/audiolad-dbmig-cutover-out.$$ 2>&1; then
  CUTOVER=1
  ln -sfn "$new_rel" "$DEPLOY_ROOT/current"
fi
cutover_out="$(cat /tmp/audiolad-dbmig-cutover-out.$$)"
rm -f /tmp/audiolad-dbmig-cutover-out.$$
assert_eq "abort-before-cutover CUTOVER stays 0" "0" "$CUTOVER"
assert_eq "abort-before-cutover current remains old" "$(readlink -f "$old_rel")" "$(readlink -f "$DEPLOY_ROOT/current")"
assert_contains "abort-before-cutover failed" "database_migration_failed" "$cutover_out"

# --- missing history table ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_missing="$(make_release "rel-missing-table" 20260710115506 20260819183000 20260821140000)"
echo missing >"$FAKE_STATE/table_status"
: >"$FAKE_STATE/remote"
run_stage "$rel_missing"
assert_eq "missing table stage status" "1" "$STAGE_STATUS"
assert_contains "missing table uninitialized" "database_migration_history_uninitialized" "$STAGE_OUTPUT"
assert_eq "missing table apply count" "0" "$(apply_count)"

# --- empty history table ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_empty="$(make_release "rel-empty-table" 20260710115506 20260819183000 20260821140000)"
echo empty >"$FAKE_STATE/table_status"
: >"$FAKE_STATE/remote"
run_stage "$rel_empty"
assert_eq "empty table stage status" "1" "$STAGE_STATUS"
assert_contains "empty table uninitialized" "database_migration_history_uninitialized" "$STAGE_OUTPUT"
assert_eq "empty table apply count" "0" "$(apply_count)"

# --- holes / partial unsafe history ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_holes="$(make_release "rel-holes" 20260818180000 20260819183000 20260821140000)"
baseline_remote 20260819183000
run_stage "$rel_holes"
assert_eq "holes stage status" "1" "$STAGE_STATUS"
assert_contains "holes drift" "database_migration_history_drift" "$STAGE_OUTPUT"
assert_eq "holes apply count" "0" "$(apply_count)"

# --- self-hosted container preflight fail ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_pre="$(make_release "rel-preflight" 20260819183000)"
echo missing >"$FAKE_STATE/container_status"
baseline_remote 20260819183000
run_stage "$rel_pre"
assert_eq "preflight missing container status" "1" "$STAGE_STATUS"
assert_contains "preflight unavailable" "database_migration_target_unavailable" "$STAGE_OUTPUT"
assert_eq "preflight apply count" "0" "$(apply_count)"

reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
echo exited >"$FAKE_STATE/container_status"
run_stage "$rel_pre"
assert_eq "preflight exited container status" "1" "$STAGE_STATUS"
assert_contains "preflight exited unavailable" "database_migration_target_unavailable" "$STAGE_OUTPUT"

reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
echo fail >"$FAKE_STATE/select1"
echo running >"$FAKE_STATE/container_status"
baseline_remote 20260819183000
run_stage "$rel_pre"
assert_eq "preflight select1 fail status" "1" "$STAGE_STATUS"
assert_contains "preflight select1 unavailable" "database_migration_target_unavailable" "$STAGE_OUTPUT"

assert_not_contains "last output no secret url" "$SECRET_DB_URL" "$STAGE_OUTPUT"
assert_not_contains "last output no secret pass" "super-secret-pass" "$STAGE_OUTPUT"

echo "=== results: pass=${PASS} fail=${FAIL} ==="
if (( FAIL > 0 )); then
  exit 1
fi
exit 0
