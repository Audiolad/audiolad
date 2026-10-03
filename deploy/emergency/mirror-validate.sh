#!/usr/bin/env bash
# Compare two git repositories. Exit 0 only when every branch and tag SHA
# matches and every commit reachable from the source is present in the target.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

SOURCE=""
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE="${2:-}"
      shift 2
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    *)
      emergency_die "unknown argument: $1"
      ;;
  esac
done

[[ -n "$SOURCE" && -n "$TARGET" ]] || emergency_die "--source and --target are required"
[[ -d "$SOURCE" && -d "$TARGET" ]] || emergency_die "source and target must be local git directories"

refs_of() {
  local dir="$1"
  git -C "$dir" for-each-ref --format='%(objectname) %(refname)' refs/heads refs/tags | sort
}

commits_of() {
  local dir="$1"
  git -C "$dir" rev-list --all | sort
}

source_refs="$(mktemp)"
target_refs="$(mktemp)"
source_commits="$(mktemp)"
target_commits="$(mktemp)"
trap 'rm -f "$source_refs" "$target_refs" "$source_commits" "$target_commits"' EXIT

refs_of "$SOURCE" >"$source_refs"
refs_of "$TARGET" >"$target_refs"
if ! diff -u "$source_refs" "$target_refs"; then
  emergency_die "branch or tag refs differ"
fi

commits_of "$SOURCE" >"$source_commits"
commits_of "$TARGET" >"$target_commits"
if ! comm -23 "$source_commits" "$target_commits" | grep -q .; then
  source_count="$(wc -l <"$source_commits" | tr -d ' ')"
  target_count="$(wc -l <"$target_commits" | tr -d ' ')"
  emergency_log "refs_match=yes source_commits=${source_count} target_commits=${target_count}"
  exit 0
fi
emergency_die "target is missing commits that are reachable from the source"
