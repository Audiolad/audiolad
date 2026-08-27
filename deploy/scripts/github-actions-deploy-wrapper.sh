#!/usr/bin/env bash
# SOURCE template for the GitHub Actions production deploy wrapper.
#
# This file is NOT installed by merging to main. One-time server bootstrap
# copies it to /usr/local/sbin/audiolad-deploy (root:root, 0755). See
# docs/production-deploy-github-actions.md.
#
# Accepts exactly one argument: a 40-character lowercase hex SHA.
# Then runs the existing canonical launcher only:
#   git fetch origin main
#   git show <sha>:deploy/scripts/run-from-target-sha.sh | bash -s -- <sha>
#
# Never via /current. Do not reset the controlling checkout. No override flag.
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: audiolad-deploy <40-char-lowercase-hex-sha>

GitHub Actions / sudo wrapper. Rejects branch names, short SHAs, flags,
and extra arguments. Runs the canonical target-SHA launcher only.
EOF
}

if [[ $# -ne 1 ]]; then
  printf 'ERROR: exactly one argument required (40-char lowercase hex SHA).\n' >&2
  usage >&2
  exit 1
fi

SHA="$1"
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'ERROR: argument must be a 40-character lowercase hex SHA.\n' >&2
  usage >&2
  exit 1
fi

# Ignore caller env for these paths. Least-privilege SSH user must not redirect
# the object store or release root.
GIT_WORKDIR=/var/www/audiolad-clean
DEPLOY_ROOT=/var/www/audiolad-deploy
export GIT_WORKDIR DEPLOY_ROOT

# Actions must never take the emergency override path.
unset AUDIOLAD_DEPLOY_OVERRIDE
unset AUDIOLAD_DEPLOY_OVERRIDE_REASON

git -C "$GIT_WORKDIR" fetch origin main
ORIGIN_MAIN_SHA="$(git -C "$GIT_WORKDIR" rev-parse --verify origin/main)"

printf 'requested SHA: %s\n' "$SHA"
printf 'origin/main SHA: %s\n' "$ORIGIN_MAIN_SHA"

CURRENT_COMMIT_FILE="$DEPLOY_ROOT/current/.deploy-commit"
if [[ -r "$CURRENT_COMMIT_FILE" ]]; then
  printf 'current production .deploy-commit: %s\n' "$(tr -d '\n' < "$CURRENT_COMMIT_FILE")"
else
  printf 'current production .deploy-commit: (not readable)\n'
fi

# Existing canonical launch. Preserve the real exit code.
git -C "$GIT_WORKDIR" fetch origin main
git -C "$GIT_WORKDIR" show "${SHA}:deploy/scripts/run-from-target-sha.sh" \
  | GIT_WORKDIR="$GIT_WORKDIR" DEPLOY_ROOT="$DEPLOY_ROOT" bash -s -- "$SHA"
