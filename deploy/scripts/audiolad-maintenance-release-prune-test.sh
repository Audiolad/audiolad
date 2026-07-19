#!/usr/bin/env bash
# Integration test for release retention logic using a temp deploy root.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAINTENANCE_SCRIPT="${SCRIPT_DIR}/audiolad-maintenance.sh"
TEST_ROOT="$(mktemp -d /tmp/audiolad-maintenance-test.XXXXXX)"

pass=0
fail=0

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

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

setup_fixture() {
  local root="$TEST_ROOT/deploy"
  mkdir -p "$root/releases"

  mkrelease() {
    local name="$1"
    local commit="${2:-}"
    mkdir -p "$root/releases/$name"
    if [[ -n "$commit" ]]; then
      printf '%s\n' "$commit" >"$root/releases/$name/.deploy-commit"
    fi
    echo "payload-$name" >"$root/releases/$name/marker.txt"
  }

  mkrelease active-release "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  mkrelease previous-release "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  mkrelease extra-backup "cccccccccccccccccccccccccccccccccccccccc"
  mkrelease old-release-1 "dddddddddddddddddddddddddddddddddddddddd"
  mkrelease old-release-2 "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  mkrelease no-commit-release ""

  # Newest first for ls -1dt retention ordering.
  touch -d "2026-07-19 10:00" "$root/releases/active-release"
  touch -d "2026-07-19 09:00" "$root/releases/previous-release"
  touch -d "2026-07-19 08:00" "$root/releases/extra-backup"
  touch -d "2026-07-19 07:00" "$root/releases/old-release-1"
  touch -d "2026-07-19 06:00" "$root/releases/old-release-2"
  touch -d "2026-07-19 05:00" "$root/releases/no-commit-release"

  ln -sfn "$root/releases/active-release" "$root/current"
  ln -sfn "$root/releases/previous-release" "$root/previous"
}

run_prune() {
  DEPLOY_ROOT="$TEST_ROOT/deploy" \
  RELEASE_PRUNE_ENABLED=1 \
  KEEP_EXTRA_RELEASES=1 \
  DRY_RUN=0 \
  LOCK_FILE="$TEST_ROOT/lock" \
  bash "$MAINTENANCE_SCRIPT" 2>&1
}

setup_fixture
output="$(run_prune)"

assert_dir_exists "$TEST_ROOT/deploy/releases/active-release" "active release kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/previous-release" "previous release kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/extra-backup" "one extra backup kept"
assert_dir_missing "$TEST_ROOT/deploy/releases/old-release-1" "old release 1 removed"
assert_dir_missing "$TEST_ROOT/deploy/releases/old-release-2" "old release 2 removed"
assert_dir_exists "$TEST_ROOT/deploy/releases/no-commit-release" "release without .deploy-commit kept"
assert_contains "$output" "KEEP release (symlink target): $TEST_ROOT/deploy/releases/active-release" "log keep active"
assert_contains "$output" "SKIP release without .deploy-commit" "log skip no commit"

# Symlink target protection
outside="$TEST_ROOT/outside-release"
mkdir -p "$outside"
printf 'ffffffffffffffffffffffffffffffffffffffff\n' >"$outside/.deploy-commit"
ln -sfn "$outside" "$TEST_ROOT/deploy/releases/outside-link"
output2="$(DEPLOY_ROOT="$TEST_ROOT/deploy" RELEASE_PRUNE_ENABLED=1 KEEP_EXTRA_RELEASES=0 DRY_RUN=0 LOCK_FILE="$TEST_ROOT/lock2" bash "$MAINTENANCE_SCRIPT" 2>&1 || true)"
assert_dir_exists "$outside" "outside symlink target not deleted"
assert_contains "$output2" "SKIP release outside releases dir" "outside path skipped"

# Empty deploy root guard (explicit empty string must not fall back to default).
empty_guard_output="$(
  DEPLOY_ROOT="" RELEASE_PRUNE_ENABLED=1 LOCK_FILE="$TEST_ROOT/lock3" bash "$MAINTENANCE_SCRIPT" 2>&1 || true
)"
assert_contains "$empty_guard_output" "ERROR DEPLOY_ROOT must be an absolute path" "empty DEPLOY_ROOT aborts"

# Idempotent second run
setup_fixture
run_prune >/dev/null
second_output="$(run_prune)"
assert_not_contains "$second_output" "REMOVE old release" "second run removes nothing else"

echo "---"
echo "release prune tests: pass=$pass fail=$fail"
if (( fail > 0 )); then
  exit 1
fi
