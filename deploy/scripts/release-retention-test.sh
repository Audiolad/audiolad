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
  local keep="${2:-3}"
  local dry_run="${3:-0}"

  DEPLOY_ROOT="$root" \
    RELEASE_RETENTION_KEEP_EXTRA="$keep" \
    RELEASE_RETENTION_DRY_RUN="$dry_run" \
    RELEASE_RETENTION_MIN_AGE_SECONDS=0 \
    PM2_APP_NAME="__missing_app__" \
    bash -c '
      source "$1/lib/common.sh"
      prune_old_releases "$2"
    ' _ "$SCRIPT_DIR" "$keep" 2>&1
}

setup_fixture() {
  local root="$TEST_ROOT/deploy"
  mkdir -p "$root/releases"

  mkrelease "$root" "20260722-120000-aaaaaaaa" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" "2026-07-22 12:00:00"
  mkrelease "$root" "20260722-110000-bbbbbbbb" "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" "2026-07-22 11:00:00"
  mkrelease "$root" "20260722-100000-cccccccc" "cccccccccccccccccccccccccccccccccccccccc" "2026-07-22 10:00:00"
  mkrelease "$root" "20260722-090000-dddddddd" "dddddddddddddddddddddddddddddddddddddddd" "2026-07-22 09:00:00"
  mkrelease "$root" "20260722-080000-eeeeeeee" "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" "2026-07-22 08:00:00"
  mkrelease "$root" "20260722-070000-ffffffffff" "ffffffffffffffffffffffffffffffffffffffff" "2026-07-22 07:00:00"
  mkrelease "$root" "20260722-060000-no-commit" "" "2026-07-22 06:00:00"

  ln -sfn "$root/releases/20260722-120000-aaaaaaaa" "$root/current"
  ln -sfn "$root/releases/20260722-110000-bbbbbbbb" "$root/previous"
}

setup_fixture
dry_output="$(run_prune "$TEST_ROOT/deploy" 3 1)"
assert_contains "$dry_output" "DRY-RUN would remove release" "dry-run logs candidate"
assert_not_contains "$dry_output" "Removing old release" "dry-run performs no removal"

setup_fixture
output="$(run_prune "$TEST_ROOT/deploy" 3 0)"

assert_dir_exists "$TEST_ROOT/deploy/releases/20260722-120000-aaaaaaaa" "current release kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/20260722-110000-bbbbbbbb" "previous release kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/20260722-100000-cccccccc" "extra release 1 kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/20260722-090000-dddddddd" "extra release 2 kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/20260722-080000-eeeeeeee" "extra release 3 kept"
assert_dir_missing "$TEST_ROOT/deploy/releases/20260722-070000-ffffffffff" "oldest eligible release removed"
assert_dir_exists "$TEST_ROOT/deploy/releases/20260722-060000-no-commit" "release without commit kept"
assert_contains "$output" "KEEP release (symlink target): $TEST_ROOT/deploy/releases/20260722-120000-aaaaaaaa" "log current keep"
assert_contains "$output" "Removing old release" "log removal"

setup_fixture
run_prune "$TEST_ROOT/deploy" 3 0 >/dev/null
second_output="$(run_prune "$TEST_ROOT/deploy" 3 0)"
assert_not_contains "$second_output" "Removing old release" "second run is idempotent"

echo "---"
echo "release retention tests: pass=$pass fail=$fail"
if (( fail > 0 )); then
  exit 1
fi
