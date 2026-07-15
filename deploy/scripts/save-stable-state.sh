#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
STABLE_BUILD_ID="${1:-unknown}"
STABLE_COMMIT="${2:-unknown}"
STABLE_BRANCH="${3:-unknown}"
STABLE_TAG="${4:-unknown}"

mkdir -p /root/audiolad-state

NODE_VERSION="$(node -v)"
NPM_VERSION="$(npm -v)"
PM2_VERSION="$(pm2 -v 2>/dev/null || echo unknown)"
PM2_CMD="$(pm2 describe audiolad 2>/dev/null | awk -F'│' '/script path|script args/ {gsub(/ /,""); print $2}' | paste -sd' ' - || echo 'npm start')"
PM2_CWD="$(pm2 describe audiolad 2>/dev/null | awk -F'│' '/exec cwd/ {gsub(/ /,"",$2); print $2; exit}' || echo /var/www/audiolad)"

STATE_FILE="/root/audiolad-state/stable-2026-07-15.txt"

cat >"$STATE_FILE" <<EOF
stable_state_recorded_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
commit_hash: $STABLE_COMMIT
branch: $STABLE_BRANCH
tag: $STABLE_TAG
build_id: $STABLE_BUILD_ID
node_version: $NODE_VERSION
npm_version: $NPM_VERSION
pm2_version: $PM2_VERSION
pm2_command: $PM2_CMD
pm2_cwd: $PM2_CWD
deploy_root: $DEPLOY_ROOT
notes: Stable production snapshot before release-based deployment cutover
EOF

chmod 600 "$STATE_FILE"
echo "State saved to $STATE_FILE"
