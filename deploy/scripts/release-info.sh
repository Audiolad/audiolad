#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

ensure_dirs

current_dir="missing"
previous_dir="missing"
current_build="missing"
previous_build="missing"
current_commit="unknown"
git_tag="none"
pm2_status="unknown"
pm2_pid="unknown"
pm2_cwd="unknown"
pm2_uptime="unknown"

if [[ -L "$DEPLOY_ROOT/current" ]]; then
  current_dir="$(readlink -f "$DEPLOY_ROOT/current")"
  current_build="$(read_build_id "$current_dir")"
  if [[ -f "$current_dir/.deploy-commit" ]]; then
    current_commit="$(tr -d '\n' < "$current_dir/.deploy-commit")"
  fi
fi

if [[ -L "$DEPLOY_ROOT/previous" ]]; then
  previous_dir="$(readlink -f "$DEPLOY_ROOT/previous")"
  previous_build="$(read_build_id "$previous_dir")"
fi

if git -C "$GIT_WORKDIR" describe --tags --exact-match >/dev/null 2>&1; then
  git_tag="$(git -C "$GIT_WORKDIR" describe --tags --exact-match)"
fi

if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  pm2_status="$(pm2 jlist 2>/dev/null | python3 -c 'import json,sys
raw=sys.stdin.read().strip()
apps=json.loads(raw) if raw else []
for app in apps:
    if app.get("name")=="audiolad":
        print(app.get("pm2_env",{}).get("status","unknown"))
        break
else:
    print("unknown")
' 2>/dev/null || echo unknown)"
  pm2_pid="$(pm2 pid "$PM2_APP_NAME" 2>/dev/null || echo unknown)"
  pm2_cwd="$(pm2 jlist 2>/dev/null | python3 -c 'import json,sys
raw=sys.stdin.read().strip()
apps=json.loads(raw) if raw else []
for app in apps:
    if app.get("name")=="audiolad":
        print(app.get("pm2_env",{}).get("pm_cwd","unknown"))
        break
else:
    print("unknown")
' 2>/dev/null || echo unknown)"
  pm2_uptime="$(pm2 jlist 2>/dev/null | python3 -c 'import json,sys
raw=sys.stdin.read().strip()
apps=json.loads(raw) if raw else []
for app in apps:
    if app.get("name")=="audiolad":
        print(app.get("pm2_env",{}).get("pm_uptime",0))
        break
else:
    print(0)
' 2>/dev/null || echo 0)"
fi

cat <<EOF
Audiolad release info
=====================
current_release: $current_dir
previous_release: $previous_dir
current_build_id: $current_build
previous_build_id: $previous_build
deploy_commit: $current_commit
git_tag: $git_tag
pm2_app: $PM2_APP_NAME
pm2_status: $pm2_status
pm2_pid: $pm2_pid
pm2_cwd: $pm2_cwd
pm2_uptime: $pm2_uptime
production_port: $PRODUCTION_PORT
health_endpoint: http://127.0.0.1:${PRODUCTION_PORT}${HEALTH_PATH}
EOF
