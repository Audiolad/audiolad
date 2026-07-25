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
  rm -rf "$root"
  mkdir -p "$root/releases" "$TEST_ROOT/git"
  git -C "$TEST_ROOT/git" init -q >/dev/null 2>&1 || true

  mkrelease() {
    local name="$1"
    local commit="${2:-}"
    mkdir -p "$root/releases/$name"
    if [[ -n "$commit" ]]; then
      printf '%s\n' "$commit" >"$root/releases/$name/.deploy-commit"
    fi
    echo "payload-$name" >"$root/releases/$name/marker.txt"
  }

  mkrelease 20260719-100000-aaaaaaaa "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  mkrelease 20260719-090000-bbbbbbbb "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  mkrelease 20260719-080000-cccccccc "cccccccccccccccccccccccccccccccccccccccc"
  mkrelease 20260719-070000-dddddddd "dddddddddddddddddddddddddddddddddddddddd"
  mkrelease 20260719-060000-eeeeeeee "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  mkrelease 20260719-050000-0000000000000000000000000000000000000000 ""

  touch -d "2026-07-19 10:00" "$root/releases/20260719-100000-aaaaaaaa"
  touch -d "2026-07-19 09:00" "$root/releases/20260719-090000-bbbbbbbb"
  touch -d "2026-07-19 08:00" "$root/releases/20260719-080000-cccccccc"
  touch -d "2026-07-19 07:00" "$root/releases/20260719-070000-dddddddd"
  touch -d "2026-07-19 06:00" "$root/releases/20260719-060000-eeeeeeee"
  # Incomplete older than 2h → removable
  touch -d "2026-07-19 05:00" "$root/releases/20260719-050000-0000000000000000000000000000000000000000"

  ln -sfn "$root/releases/20260719-100000-aaaaaaaa" "$root/current"
  ln -sfn "$root/releases/20260719-090000-bbbbbbbb" "$root/previous"
}

run_prune() {
  DEPLOY_ROOT="$TEST_ROOT/deploy" \
  GIT_WORKDIR="$TEST_ROOT/git" \
  RELEASE_PRUNE_ENABLED=1 \
  KEEP_EXTRA_RELEASES=1 \
  WORKTREE_PRUNE_ENABLED=0 \
  DRY_RUN=0 \
  LOCK_FILE="$TEST_ROOT/lock" \
  CLEANUP_LOCK_FILE="$TEST_ROOT/lock" \
  DEPLOY_LOCK_FILE="$TEST_ROOT/deploy.lock" \
  RELEASE_RETENTION_SKIP_LSOF=1 \
  TMP_CLEANUP_ENABLED=0 \
  HOST_CACHE_CLEANUP_ENABLED=0 \
  bash "$MAINTENANCE_SCRIPT" --apply 2>&1
}

setup_fixture
output="$(run_prune)"

assert_dir_exists "$TEST_ROOT/deploy/releases/20260719-100000-aaaaaaaa" "active release kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/20260719-090000-bbbbbbbb" "previous release kept"
assert_dir_exists "$TEST_ROOT/deploy/releases/20260719-080000-cccccccc" "one extra backup kept"
assert_dir_missing "$TEST_ROOT/deploy/releases/20260719-070000-dddddddd" "old release 1 removed"
assert_dir_missing "$TEST_ROOT/deploy/releases/20260719-060000-eeeeeeee" "old release 2 removed"
assert_dir_missing "$TEST_ROOT/deploy/releases/20260719-050000-0000000000000000000000000000000000000000" "old incomplete removed"
assert_contains "$output" "KEEP release (current): $TEST_ROOT/deploy/releases/20260719-100000-aaaaaaaa" "log keep active"
assert_contains "$output" "Removing incomplete release" "log remove incomplete"

# Symlink target protection
outside="$TEST_ROOT/outside-release"
mkdir -p "$outside"
printf 'ffffffffffffffffffffffffffffffffffffffff\n' >"$outside/.deploy-commit"
ln -sfn "$outside" "$TEST_ROOT/deploy/releases/20260719-040000-outsider"
output2="$(
  DEPLOY_ROOT="$TEST_ROOT/deploy" \
  GIT_WORKDIR="$TEST_ROOT/git" \
  RELEASE_PRUNE_ENABLED=1 \
  KEEP_EXTRA_RELEASES=0 \
  WORKTREE_PRUNE_ENABLED=0 \
  LOCK_FILE="$TEST_ROOT/lock2" \
  CLEANUP_LOCK_FILE="$TEST_ROOT/lock2" \
  DEPLOY_LOCK_FILE="$TEST_ROOT/deploy2.lock" \
  RELEASE_RETENTION_SKIP_LSOF=1 \
  bash "$MAINTENANCE_SCRIPT" --apply 2>&1 || true
)"
assert_dir_exists "$outside" "outside symlink target not deleted"
assert_contains "$output2" "SKIP release outside releases dir" "outside path skipped"

# Empty deploy root guard
empty_guard_output="$(
  DEPLOY_ROOT="" RELEASE_PRUNE_ENABLED=1 \
  LOCK_FILE="$TEST_ROOT/lock3" CLEANUP_LOCK_FILE="$TEST_ROOT/lock3" \
  DEPLOY_LOCK_FILE="$TEST_ROOT/deploy3.lock" \
  bash "$MAINTENANCE_SCRIPT" --apply 2>&1 || true
)"
assert_contains "$empty_guard_output" "DEPLOY_ROOT must be an absolute path" "empty DEPLOY_ROOT aborts"

# Idempotent second run
setup_fixture
run_prune >/dev/null
second_output="$(run_prune)"
assert_not_contains "$second_output" "Removing successful release" "second run removes nothing else"

echo "---"
echo "release prune tests: pass=$pass fail=$fail"
if (( fail > 0 )); then
  exit 1
fi
