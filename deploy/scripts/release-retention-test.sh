#!/usr/bin/env bash
# Policy tests for deploy release retention logic.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

TEST_ROOT="$(mktemp -d /tmp/audiolad-release-retention-test.XXXXXX)"
pass=0
fail=0

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

assert_dir_exists() {
  local dir="$1"
  local label="$2"
  if [[ -d "$dir" ]]; then
    echo "PASS: $label"
    pass=$((pass + 1))
  else
    echo "FAIL: $label ($dir missing)"
    fail=$((fail + 1))
  fi
}

assert_dir_missing() {
  local dir="$1"
  local label="$2"
  if [[ ! -e "$dir" ]]; then
    echo "PASS: $label"
    pass=$((pass + 1))
  else
    echo "FAIL: $label ($dir still exists)"
    fail=$((fail + 1))
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"
  if grep -Fq "$needle" <<<"$haystack"; then
    echo "PASS: $label"
    pass=$((pass + 1))
  else
    echo "FAIL: $label (missing: $needle)"
    fail=$((fail + 1))
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local label="$3"
  if grep -Fq "$needle" <<<"$haystack"; then
    echo "FAIL: $label (unexpected: $needle)"
    fail=$((fail + 1))
  else
    echo "PASS: $label"
    pass=$((pass + 1))
  fi
}

mkrelease() {
  local root="$1"
  local name="$2"
  local commit="$3"
  local mtime="${4:-2026-07-19 08:00:00}"

  mkdir -p "$root/releases/$name"
  if [[ -n "$commit" ]]; then
    printf '%s\n' "$commit" >"$root/releases/$name/.deploy-commit"
  fi
  echo "payload-$name" >"$root/releases/$name/marker.txt"
  touch -d "$mtime" "$root/releases/$name"
}

run_prune() {
  local root="$1"
  local keep="${2:-1}"
  local dry_run="${3:-0}"

  DEPLOY_ROOT="$root" \
    RELEASE_RETENTION_KEEP_EXTRA="$keep" \
    RELEASE_RETENTION_DRY_RUN="$dry_run" \
    RELEASE_RETENTION_MIN_AGE_SECONDS=0 \
    RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS=0 \
    RELEASE_RETENTION_SKIP_LSOF=1 \
    PM2_APP_NAME="__missing_app__" \
    bash -c '
      source "$1/lib/common.sh"
      prune_old_releases "$2"
    ' _ "$SCRIPT_DIR" "$keep" 2>&1
}

setup_fixture() {
  local root="$TEST_ROOT/deploy"
  rm -rf "$root"
  mkdir -p "$root/releases"

  mkrelease "$root" "20260722-120000-aaaaaaaa" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "2026-07-22 12:00:00"
  mkrelease "$root" "20260722-110000-bbbbbbbb" "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" "2026-07-22 11:00:00"
  mkrelease "$root" "20260722-100000-cccccccc" "cccccccccccccccccccccccccccccccccccccccc" "2026-07-22 10:00:00"
  mkrelease "$root" "20260722-090000-dddddddd" "dddddddddddddddddddddddddddddddddddddddd" "2026-07-22 09:00:00"
  mkrelease "$root" "20260722-080000-eeeeeeee" "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" "2026-07-22 08:00:00"
  mkrelease "$root" "20260722-070000-ffffffffff" "ffffffffffffffffffffffffffffffffffffffff" "2026-07-22 07:00:00"
  mkrelease "$root" "20260722-060000-0000000000000000000000000000000000000000" "" "2026-07-22 06:00:00"

  ln -sfn "$root/releases/20260722-120000-aaaaaaaa" "$root/current"
  ln -sfn "$root/releases/20260722-110000-bbbbbbbb" "$root/previous"
}

setup_fixture
dry_output="$(run_prune "$TEST_ROOT/deploy" 1 1)"
assert_contains "$dry_output" "DRY-RUN would remove" "dry-run logs candidate"
assert_not_contains "$dry_output" "Removing successful release" "dry-run performs no successful removal"
assert_not_contains "$dry_output" "Removing incomplete release" "dry-run performs no incomplete removal log variant checked via DRY-RUN"

setup_fixture
output="$(run_prune "$TEST_ROOT/deploy" 1 0)"

assert_dir_exists "$TEST_ROOT/deploy/releases/20260722-120000-aaaaaaaa" "current release kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/20260722-110000-bbbbbbbb" "previous release kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/20260722-100000-cccccccc" "extra release kept"
assert_dir_missing "$TEST_ROOT/deploy/releases/20260722-090000-dddddddd" "non-extra successful removed"
assert_dir_missing "$TEST_ROOT/deploy/releases/20260722-070000-ffffffffff" "oldest eligible release removed"
assert_dir_missing "$TEST_ROOT/deploy/releases/20260722-060000-0000000000000000000000000000000000000000" "incomplete without commit removed when aged"
assert_contains "$output" "KEEP release (current): name=20260722-120000-aaaaaaaa path=$TEST_ROOT/deploy/releases/20260722-120000-aaaaaaaa" "log current keep"
assert_contains "$output" "Removing successful release" "log successful removal"

# Candidate / in-flight marker must never be pruned.
inflight_root="$TEST_ROOT/inflight"
mkdir -p "$inflight_root/releases"
mkrelease "$inflight_root" "20260725-130000-aaaaaaaa" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "2026-07-22 12:00:00"
mkrelease "$inflight_root" "20260725-120000-bbbbbbbb" "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" "2026-07-22 11:00:00"
mkrelease "$inflight_root" "20260725-110000-cccccccc" "" "2026-07-22 10:00:00"
mkdir -p "$inflight_root/releases/20260725-110000-cccccccc/.next"
echo "build-candidate" >"$inflight_root/releases/20260725-110000-cccccccc/.next/BUILD_ID"
printf 'started_at=test\n' >"$inflight_root/releases/20260725-110000-cccccccc/.deploy-inflight"
ln -sfn "$inflight_root/releases/20260725-130000-aaaaaaaa" "$inflight_root/current"
ln -sfn "$inflight_root/releases/20260725-120000-bbbbbbbb" "$inflight_root/previous"
inflight_output="$(
  DEPLOY_ROOT="$inflight_root" \
    CANDIDATE_RELEASE_DIR="$inflight_root/releases/20260725-110000-cccccccc" \
    RELEASE_RETENTION_KEEP_EXTRA=0 \
    RELEASE_RETENTION_DRY_RUN=0 \
    RELEASE_RETENTION_MIN_AGE_SECONDS=0 \
    RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS=0 \
    RELEASE_RETENTION_SKIP_LSOF=1 \
    PM2_APP_NAME="__missing_app__" \
    bash -c 'source "$1/lib/common.sh"; prune_old_releases 0' _ "$SCRIPT_DIR" 2>&1
)"
assert_dir_exists "$inflight_root/releases/20260725-110000-cccccccc" "candidate/inflight release kept"
assert_contains "$inflight_output" "KEEP release (candidate/inflight)" "candidate protect logged"

# Path outside releases must never be deleted by safe_to_delete.
outside_check="$(
  DEPLOY_ROOT="$TEST_ROOT/deploy" \
    RELEASE_RETENTION_SKIP_LSOF=1 \
    PM2_APP_NAME="__missing_app__" \
    bash -c '
      source "$1/lib/common.sh"
      release_retention_resolve_paths
      if release_retention_safe_to_delete "/tmp"; then
        echo SAFE_OK
      else
        echo SAFE_BLOCKED
      fi
      if release_retention_safe_to_delete "$DEPLOY_ROOT/shared"; then
        echo SHARED_OK
      else
        echo SHARED_BLOCKED
      fi
    ' _ "$SCRIPT_DIR" 2>&1
)"
assert_contains "$outside_check" "SAFE_BLOCKED" "outside path blocked"
assert_contains "$outside_check" "SHARED_BLOCKED" "shared path blocked"

setup_fixture
run_prune "$TEST_ROOT/deploy" 1 0 >/dev/null
second_output="$(run_prune "$TEST_ROOT/deploy" 1 0)"
assert_not_contains "$second_output" "Removing successful release" "second run is idempotent"

# Young successful (<30m) protected even with keep_extra=0
young_root="$TEST_ROOT/young"
mkdir -p "$young_root/releases"
mkrelease "$young_root" "20260725-120000-aaaaaaaa" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "$(date -d '2 hours ago' '+%Y-%m-%d %H:%M:%S')"
mkrelease "$young_root" "20260725-110000-bbbbbbbb" "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" "$(date -d '90 minutes ago' '+%Y-%m-%d %H:%M:%S')"
mkrelease "$young_root" "20260725-100000-cccccccc" "cccccccccccccccccccccccccccccccccccccccc" "$(date -d '10 minutes ago' '+%Y-%m-%d %H:%M:%S')"
ln -sfn "$young_root/releases/20260725-120000-aaaaaaaa" "$young_root/current"
ln -sfn "$young_root/releases/20260725-110000-bbbbbbbb" "$young_root/previous"
young_output="$(
  DEPLOY_ROOT="$young_root" \
    RELEASE_RETENTION_KEEP_EXTRA=0 \
    RELEASE_RETENTION_DRY_RUN=0 \
    RELEASE_RETENTION_MIN_AGE_SECONDS=1800 \
    RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS=7200 \
    RELEASE_RETENTION_SKIP_LSOF=1 \
    PM2_APP_NAME="__missing_app__" \
    bash -c 'source "$1/lib/common.sh"; prune_old_releases 0' _ "$SCRIPT_DIR" 2>&1
)"
assert_dir_exists "$young_root/releases/20260725-100000-cccccccc" "young successful kept by 30m window"
assert_contains "$young_output" "KEEP successful release" "young keep logged"

echo "---"
echo "release retention tests: pass=$pass fail=$fail"
if (( fail > 0 )); then
  exit 1
fi
