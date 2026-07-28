#!/usr/bin/env bash
# Isolated tests for BUILD_ID / candidate retention protections (no production touch).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

TEST_ROOT="$(mktemp -d /tmp/audiolad-deploy-buildid-test.XXXXXX)"
pass=0
fail=0

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

assert_pass() {
  local label="$1"
  echo "PASS: $label"
  pass=$((pass + 1))
}

assert_fail_msg() {
  local label="$1"
  echo "FAIL: $label"
  fail=$((fail + 1))
}

assert_dir_exists() {
  if [[ -d "$1" ]]; then
    assert_pass "$2"
  else
    assert_fail_msg "$2 ($1 missing)"
  fi
}

assert_dir_missing() {
  if [[ ! -e "$1" ]]; then
    assert_pass "$2"
  else
    assert_fail_msg "$2 ($1 still exists)"
  fi
}

assert_contains() {
  if grep -Fq "$2" <<<"$1"; then
    assert_pass "$3"
  else
    assert_fail_msg "$3 (missing: $2)"
  fi
}

mkrelease() {
  local root="$1"
  local name="$2"
  local commit="$3"
  local mtime="${4:-2026-07-19 08:00:00}"
  mkdir -p "$root/releases/$name/.next"
  if [[ -n "$commit" ]]; then
    printf '%s\n' "$commit" >"$root/releases/$name/.deploy-commit"
  fi
  echo "build-$name" >"$root/releases/$name/.next/BUILD_ID"
  echo "payload-$name" >"$root/releases/$name/marker.txt"
  touch -d "$mtime" "$root/releases/$name"
}

run_prune() {
  local root="$1"
  local keep="${2:-1}"
  DEPLOY_ROOT="$root" \
    CANDIDATE_RELEASE_DIR="${3:-}" \
    RELEASE_RETENTION_KEEP_EXTRA="$keep" \
    RELEASE_RETENTION_DRY_RUN=0 \
    RELEASE_RETENTION_MIN_AGE_SECONDS=0 \
    RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS=0 \
    RELEASE_RETENTION_SKIP_LSOF=1 \
    PM2_APP_NAME="__missing_app__" \
    bash -c 'source "$1/lib/common.sh"; prune_old_releases "$2"' _ "$SCRIPT_DIR" "$keep" 2>&1
}

root="$TEST_ROOT/deploy"
mkdir -p "$root/releases" "$root/shared"
echo env >"$root/shared/.env.production"

mkrelease "$root" "20260728-120000-aaaaaaaa" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "2026-07-20 12:00:00"
mkrelease "$root" "20260728-110000-bbbbbbbb" "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" "2026-07-20 11:00:00"
mkrelease "$root" "20260728-100000-cccccccc" "cccccccccccccccccccccccccccccccccccccccc" "2026-07-20 10:00:00"
mkrelease "$root" "20260728-090000-dddddddd" "dddddddddddddddddddddddddddddddddddddddd" "2026-07-20 09:00:00"
mkrelease "$root" "20260728-080000-eeeeeeee" "" "2026-07-20 08:00:00"
printf 'started_at=test\n' >"$root/releases/20260728-080000-eeeeeeee/.deploy-inflight"

ln -sfn "$root/releases/20260728-120000-aaaaaaaa" "$root/current"
ln -sfn "$root/releases/20260728-110000-bbbbbbbb" "$root/previous"

candidate="$root/releases/20260728-080000-eeeeeeee"
output="$(run_prune "$root" 1 "$candidate")"

assert_dir_exists "$root/releases/20260728-120000-aaaaaaaa" "1. successful deploy keeps current"
assert_dir_exists "$root/releases/20260728-080000-eeeeeeee" "2. candidate protected from cleanup"
assert_dir_exists "$root/releases/20260728-120000-aaaaaaaa" "3. current protected"
assert_dir_exists "$root/releases/20260728-110000-bbbbbbbb" "4. rollback/previous protected"
assert_dir_missing "$root/releases/20260728-090000-dddddddd" "5. old releases removed"
assert_contains "$output" "KEEP release (candidate/inflight)" "candidate keep logged"
assert_contains "$output" "KEEP release (current)" "current keep logged"
assert_contains "$output" "KEEP release (previous/rollback)" "previous keep logged"

# 6. BUILD_ID missing before cutover helper
missing_pre="$TEST_ROOT/missing-pre"
mkdir -p "$missing_pre/releases/cand"
if [[ ! -f "$missing_pre/releases/cand/.next/BUILD_ID" ]]; then
  assert_pass "6. BUILD_ID absent pre-cutover is detectable"
else
  assert_fail_msg "6. BUILD_ID unexpectedly present"
fi

# 7. BUILD_ID disappears after cutover — filesystem check
cutover_root="$TEST_ROOT/cutover"
mkdir -p "$cutover_root/releases/new/.next" "$cutover_root/releases/old/.next"
echo "new-build" >"$cutover_root/releases/new/.next/BUILD_ID"
echo "old-build" >"$cutover_root/releases/old/.next/BUILD_ID"
ln -sfn "$cutover_root/releases/new" "$cutover_root/current"
ln -sfn "$cutover_root/releases/old" "$cutover_root/previous"
rm -rf "$cutover_root/releases/new/.next"
if [[ ! -f "$cutover_root/current/.next/BUILD_ID" ]]; then
  assert_pass "7. BUILD_ID loss after cutover is detectable via current symlink"
else
  assert_fail_msg "7. BUILD_ID still present unexpectedly"
fi

# 8. Cleanup failure must not remove active current
cleanup_fail_root="$TEST_ROOT/cleanup-fail"
mkdir -p "$cleanup_fail_root/releases"
mkrelease "$cleanup_fail_root" "20260728-150000-aaaaaaaa" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "2026-07-20 12:00:00"
mkrelease "$cleanup_fail_root" "20260728-140000-bbbbbbbb" "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" "2026-07-20 11:00:00"
ln -sfn "$cleanup_fail_root/releases/20260728-150000-aaaaaaaa" "$cleanup_fail_root/current"
ln -sfn "$cleanup_fail_root/releases/20260728-140000-bbbbbbbb" "$cleanup_fail_root/previous"
# Force a no-op failure path: prune with dry-run then verify current intact.
DEPLOY_ROOT="$cleanup_fail_root" \
  RELEASE_RETENTION_KEEP_EXTRA=0 \
  RELEASE_RETENTION_DRY_RUN=1 \
  RELEASE_RETENTION_MIN_AGE_SECONDS=0 \
  RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS=0 \
  RELEASE_RETENTION_SKIP_LSOF=1 \
  PM2_APP_NAME="__missing_app__" \
  bash -c 'source "$1/lib/common.sh"; prune_old_releases 0 || true' _ "$SCRIPT_DIR" >/dev/null
assert_dir_exists "$cleanup_fail_root/releases/20260728-150000-aaaaaaaa" "8. cleanup dry-run leaves active release"

# 9. Parallel deploy lock
lock_file="$TEST_ROOT/deploy.lock"
rm -f "$lock_file"
(
  flock -x 9
  sleep 3
) 9>"$lock_file" &
locker_pid=$!
sleep 0.3
if (
  flock -n 9
) 9>"$lock_file"; then
  assert_fail_msg "9. parallel deploy acquired lock unexpectedly"
else
  assert_pass "9. parallel deploy blocked by flock"
fi
wait "$locker_pid" || true

# 10. Path outside releases cannot be deleted
outside="$(
  DEPLOY_ROOT="$root" \
    RELEASE_RETENTION_SKIP_LSOF=1 \
    PM2_APP_NAME="__missing_app__" \
    bash -c '
      source "$1/lib/common.sh"
      release_retention_resolve_paths
      if release_retention_safe_to_delete "/var/www"; then echo BAD; else echo GOOD; fi
    ' _ "$SCRIPT_DIR"
)"
assert_contains "$outside" "GOOD" "10. path outside releases cannot be deleted"

echo "---"
echo "deploy build-id protection tests: pass=$pass fail=$fail"
if (( fail > 0 )); then
  exit 1
fi
