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
export FAKE_SUPABASE_STATE="$FAKE_STATE"
export AUDIOLAD_SUPABASE_CLI="$FAKE_BIN/supabase"
unset FAKE_PUSH_FAIL

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

cat >"$FAKE_BIN/supabase" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STATE="${FAKE_SUPABASE_STATE:?}"
mkdir -p "$STATE"
record=()
for arg in "$@"; do
  if [[ "$arg" == postgres://* || "$arg" == postgresql://* ]]; then
    record+=("[redacted-db-url]")
  else
    record+=("$arg")
  fi
done
printf '%s\n' "${record[*]}" >>"$STATE/calls"

local_versions() {
  local dir="supabase/migrations"
  if [[ ! -d "$dir" ]]; then
    return 0
  fi
  local f base
  shopt -s nullglob
  for f in "$dir"/*.sql; do
    base="$(basename -- "$f")"
    if [[ "$base" =~ ^([0-9]{8,}) ]]; then
      printf '%s\n' "${BASH_REMATCH[1]}"
    fi
  done
  shopt -u nullglob
}

remote_versions() {
  if [[ -f "$STATE/remote" ]]; then
    cat "$STATE/remote"
  fi
}

if [[ "${1:-}" == "migration" && "${2:-}" == "list" ]]; then
  mapfile -t locals < <(local_versions | sort -u)
  mapfile -t remotes < <(remote_versions | sort -u)
  declare -A seen=()
  versions=()
  for v in "${locals[@]:-}" "${remotes[@]:-}"; do
    [[ -n "$v" ]] || continue
    if [[ -z "${seen[$v]:-}" ]]; then
      seen[$v]=1
      versions+=("$v")
    fi
  done
  IFS=$'\n' sorted=($(printf '%s\n' "${versions[@]:-}" | sort))
  unset IFS
  echo "   LOCAL   |   REMOTE   |   TIME (UTC)"
  echo "-----------|------------|-------------"
  for v in "${sorted[@]:-}"; do
    [[ -n "$v" ]] || continue
    local_cell=""
    remote_cell=""
    for lv in "${locals[@]:-}"; do
      if [[ "$lv" == "$v" ]]; then
        local_cell="$v"
        break
      fi
    done
    for rv in "${remotes[@]:-}"; do
      if [[ "$rv" == "$v" ]]; then
        remote_cell="$v"
        break
      fi
    done
    printf '%s | %s | %s\n' "$local_cell" "$remote_cell" "$v"
  done
  exit 0
fi

if [[ "${1:-}" == "db" && "${2:-}" == "push" ]]; then
  if [[ "${FAKE_PUSH_FAIL:-}" == "1" ]]; then
    echo "fake db push failed" >&2
    exit 1
  fi
  count=0
  if [[ -f "$STATE/apply_count" ]]; then
    count="$(cat "$STATE/apply_count")"
  fi
  echo $((count + 1)) >"$STATE/apply_count"
  mapfile -t locals < <(local_versions | sort -u)
  mapfile -t remotes < <(remote_versions | sort -u)
  declare -A remote_set=()
  for rv in "${remotes[@]:-}"; do
    [[ -n "$rv" ]] || continue
    remote_set[$rv]=1
  done
  for lv in "${locals[@]:-}"; do
    [[ -n "$lv" ]] || continue
    if [[ -z "${remote_set[$lv]:-}" ]]; then
      printf '%s\n' "$lv" >>"$STATE/remote"
    fi
  done
  echo "fake db push applied"
  exit 0
fi

echo "unknown fake supabase command: $*" >&2
exit 2
EOF
chmod +x "$FAKE_BIN/supabase"

write_env() {
  local path="$1"
  cat >"$path" <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=pub-test
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE}
SUPABASE_DB_URL=${SECRET_DB_URL}
EOF
}

reset_state() {
  rm -rf "$FAKE_STATE"
  mkdir -p "$FAKE_STATE"
  : >"$FAKE_STATE/calls"
  echo 0 >"$FAKE_STATE/apply_count"
  : >"$FAKE_STATE/remote"
  unset FAKE_PUSH_FAIL
}

apply_count() {
  if [[ -f "$FAKE_STATE/apply_count" ]]; then
    cat "$FAKE_STATE/apply_count"
  else
    echo 0
  fi
}

push_call_count() {
  if [[ ! -f "$FAKE_STATE/calls" ]]; then
    echo 0
    return
  fi
  grep -c 'db push' "$FAKE_STATE/calls" || true
}

make_release() {
  local name="$1"
  shift
  local dir="$DEPLOY_ROOT/releases/$name"
  mkdir -p "$dir/supabase/migrations"
  local version
  for version in "$@"; do
    printf '%s\n' "-- $version" >"$dir/supabase/migrations/${version}_fixture.sql"
  done
  printf '%s\n' "$dir"
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

echo "=== database migrations unit tests ==="

# --- no pending ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_noop="$(make_release "rel-noop" 20260819183000)"
printf '%s\n' "20260819183000" >"$FAKE_STATE/remote"
run_stage "$rel_noop"
assert_eq "no pending stage status" "0" "$STAGE_STATUS"
assert_eq "no pending apply count" "0" "$(apply_count)"
assert_eq "no pending push calls" "0" "$(push_call_count)"
assert_contains "no pending logs pending=0" "database_migrations_pending=0" "$STAGE_OUTPUT"
assert_contains "no pending preflight" "database_migration_preflight_started" "$STAGE_OUTPUT"

# --- one pending apply exactly once ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_one="$(make_release "rel-one" 20260819183000 20260821140000)"
printf '%s\n' "20260819183000" >"$FAKE_STATE/remote"
run_stage "$rel_one"
assert_eq "one pending stage status" "0" "$STAGE_STATUS"
assert_eq "one pending apply count" "1" "$(apply_count)"
assert_eq "one pending push calls" "1" "$(push_call_count)"
assert_contains "one pending logs pending=1" "database_migrations_pending=1" "$STAGE_OUTPUT"
assert_contains "one pending apply started" "database_migration_apply_started" "$STAGE_OUTPUT"
assert_contains "one pending apply succeeded" "database_migration_apply_succeeded" "$STAGE_OUTPUT"
assert_contains "one pending pending_after=0" "database_migrations_pending_after=0" "$STAGE_OUTPUT"

# --- second stage run does not apply again ---
run_stage "$rel_one"
assert_eq "second run stage status" "0" "$STAGE_STATUS"
assert_eq "second run apply count still 1" "1" "$(apply_count)"
assert_eq "second run push calls still 1" "1" "$(push_call_count)"
assert_contains "second run logs pending=0" "database_migrations_pending=0" "$STAGE_OUTPUT"

# --- push non-zero fails ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_fail="$(make_release "rel-fail" 20260819183000 20260821140000)"
printf '%s\n' "20260819183000" >"$FAKE_STATE/remote"
export FAKE_PUSH_FAIL=1
run_stage "$rel_fail"
unset FAKE_PUSH_FAIL
assert_eq "push fail stage status" "1" "$STAGE_STATUS"
assert_contains "push fail logs failed" "database_migration_failed" "$STAGE_OUTPUT"

# --- missing SUPABASE_DB_URL ---
reset_state
cat >"$DEPLOY_ROOT/shared/.env.production" <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE}
EOF
rel_creds="$(make_release "rel-creds" 20260819183000)"
printf '%s\n' "20260819183000" >"$FAKE_STATE/remote"
run_stage "$rel_creds"
assert_eq "missing url stage status" "1" "$STAGE_STATUS"
assert_contains "missing url code" "database_migration_credentials_missing" "$STAGE_OUTPUT"
assert_eq "missing url apply count" "0" "$(apply_count)"
assert_eq "missing url push calls" "0" "$(push_call_count)"

# --- secrets never appear in stage output ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_secret="$(make_release "rel-secret" 20260819183000 20260821140000)"
printf '%s\n' "20260819183000" >"$FAKE_STATE/remote"
run_stage "$rel_secret"
assert_not_contains "no raw postgres url" "$SECRET_DB_URL" "$STAGE_OUTPUT"
assert_not_contains "no secret password" "super-secret-pass" "$STAGE_OUTPUT"
assert_not_contains "no secret user" "secret-user" "$STAGE_OUTPUT"
assert_not_contains "no service role jwt" "$SERVICE_ROLE" "$STAGE_OUTPUT"

# --- no nested flock / acquire_deploy_lock ---
assert_eq "acquire_deploy_lock not called" "0" "$LOCK_CALLS"
assert_not_contains "stage output has no lock surprise" "UNEXPECTED_ACQUIRE_DEPLOY_LOCK" "$STAGE_OUTPUT"
if grep -Eq 'acquire_deploy_lock|[[:space:]]flock([[:space:]]|$)' "$SCRIPT_DIR/lib/database-migrations.sh"; then
  echo "FAIL: database-migrations.sh must not call flock/acquire_deploy_lock"
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
printf '%s\n' "20260819183000" >"$FAKE_STATE/remote"
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
printf '%s\n' "20260819183000" >"$FAKE_STATE/remote"
export FAKE_PUSH_FAIL=1
CUTOVER=0
if run_database_migration_stage "$new_rel" >/tmp/audiolad-dbmig-cutover-out.$$ 2>&1; then
  CUTOVER=1
  ln -sfn "$new_rel" "$DEPLOY_ROOT/current"
fi
unset FAKE_PUSH_FAIL
cutover_out="$(cat /tmp/audiolad-dbmig-cutover-out.$$)"
rm -f /tmp/audiolad-dbmig-cutover-out.$$
assert_eq "abort-before-cutover CUTOVER stays 0" "0" "$CUTOVER"
assert_eq "abort-before-cutover current remains old" "$(readlink -f "$old_rel")" "$(readlink -f "$DEPLOY_ROOT/current")"
assert_contains "abort-before-cutover failed" "database_migration_failed" "$cutover_out"

# --- empty remote history with many local files ---
reset_state
write_env "$DEPLOY_ROOT/shared/.env.production"
rel_empty="$(make_release "rel-empty-remote" \
  20260710115506 20260713120000 20260819183000 20260821140000)"
: >"$FAKE_STATE/remote"
run_stage "$rel_empty"
assert_eq "empty remote stage status" "1" "$STAGE_STATUS"
assert_contains "empty remote uninitialized" "database_migration_history_uninitialized" "$STAGE_OUTPUT"
assert_contains "empty remote failed" "database_migration_failed" "$STAGE_OUTPUT"
assert_eq "empty remote apply count" "0" "$(apply_count)"
assert_eq "empty remote push calls" "0" "$(push_call_count)"

# Final secret sweep across captured outputs from this process is implicit
# in per-case STAGE_OUTPUT checks. Re-check last uninitialized output too.
assert_not_contains "empty remote no secret url" "$SECRET_DB_URL" "$STAGE_OUTPUT"
assert_not_contains "empty remote no secret pass" "super-secret-pass" "$STAGE_OUTPUT"

echo "=== results: pass=${PASS} fail=${FAIL} ==="
if (( FAIL > 0 )); then
  exit 1
fi
exit 0
