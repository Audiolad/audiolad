#!/usr/bin/env bash
# Fixed repository checks for the emergency runner. No arbitrary commands.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

bash -n "$ROOT/lib.sh"
bash -n "$ROOT/mirror-sync.sh"
bash -n "$ROOT/mirror-validate.sh"
bash -n "$ROOT/promote-mirror.sh"
bash -n "$ROOT/resync-to-github.sh"
bash -n "$ROOT/retarget-origin.sh"
bash -n "$ROOT/emergency-deploy.sh"
bash -n "$ROOT/emergency-rollback.sh"
bash -n "$ROOT/ci-runner.sh"
bash -n "$ROOT/repository-checks.sh"
bash -n "$REPO_ROOT/deploy/scripts/lib/npm-ci-flags.sh"
node --check "$ROOT/manifest.mjs"
node --check "$ROOT/emergency-build-ready.mjs"
node --check "$ROOT/seed-npm-cache.mjs"
node --check "$ROOT/inventory-build-deps.mjs"

grep -q 'run_deploy_policy_gate' "$ROOT/emergency-deploy.sh"
grep -q '/usr/local/sbin/audiolad-deploy' "$ROOT/emergency-deploy.sh"
grep -q 'canonical-deploy-policy.sh' "$ROOT/emergency-deploy.sh"
if grep -Eq 'bash -c|eval |npm ci|nginx -s' "$ROOT/emergency-deploy.sh"; then
  emergency_die "emergency-deploy.sh must not grow a second deploy engine"
fi
if grep -Eq 'bash -c|eval ' "$ROOT/emergency-rollback.sh"; then
  emergency_die "emergency-rollback.sh must not evaluate a shell string"
fi
grep -q 'sudo -n /usr/local/sbin/audiolad-deploy' "$REPO_ROOT/.github/workflows/production-deploy.yml"
if grep -q 'deploy/emergency' "$REPO_ROOT/.github/workflows/production-deploy.yml"; then
  emergency_die "production-deploy.yml must stay independent of the emergency contour"
fi
grep -q 'NPM_CI_ARGV' "$REPO_ROOT/deploy/scripts/deploy.sh"
grep -q 'read_npm_ci_argv' "$REPO_ROOT/deploy/scripts/deploy.sh"

emergency_log "repository_checks=ok"
