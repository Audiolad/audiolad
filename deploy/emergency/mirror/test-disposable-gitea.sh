#!/usr/bin/env bash
# Disposable local Gitea: private repo, full heads/tags/history, promotion, resync.
# Requires EMERGENCY_GITEA_BIN. Does not touch production or Timeweb.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${EMERGENCY_GITEA_BIN:?EMERGENCY_GITEA_BIN is required}"
[[ -x "$EMERGENCY_GITEA_BIN" ]] || { printf 'ERROR: gitea binary is not executable\n' >&2; exit 1; }

ROOT="$(mktemp -d /tmp/audiolad-gitea-test.XXXXXX)"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
GITEA_PID=""
cleanup() {
  if [[ -n "$GITEA_PID" ]]; then
    kill "$GITEA_PID" >/dev/null 2>&1 || true
    wait "$GITEA_PID" 2>/dev/null || true
  fi
  rm -rf "$ROOT"
}
trap cleanup EXIT

mkdir -p "$ROOT/gitea/custom/conf" "$ROOT/gitea/data" "$ROOT/gitea/log" "$ROOT/github/Audiolad" "$ROOT/state" "$ROOT/cache"
PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
cat >"$ROOT/gitea/custom/conf/app.ini" <<EOF
APP_NAME = Audiolad Emergency Test
RUN_MODE = prod
WORK_PATH = $ROOT/gitea

[database]
DB_TYPE = sqlite3
PATH = $ROOT/gitea/data/gitea.db

[server]
PROTOCOL = http
HTTP_ADDR = 127.0.0.1
HTTP_PORT = $PORT
DOMAIN = 127.0.0.1
ROOT_URL = http://127.0.0.1:${PORT}/
DISABLE_SSH = true
START_SSH_SERVER = false
OFFLINE_MODE = true
LFS_START_SERVER = false

[security]
INSTALL_LOCK = true
SECRET_KEY = audiolad-test-secret-key-0123456789
INTERNAL_TOKEN = audiolad-test-internal-token-0123456789abcd

[service]
DISABLE_REGISTRATION = true
REQUIRE_SIGNIN_VIEW = true

[repository]
DEFAULT_PRIVATE = private

[log]
MODE = file
LEVEL = Warn
ROOT_PATH = $ROOT/gitea/log

[picture]
DISABLE_GRAVATAR = true
EOF

"$EMERGENCY_GITEA_BIN" migrate --config "$ROOT/gitea/custom/conf/app.ini" --work-path "$ROOT/gitea" >/dev/null 2>&1
"$EMERGENCY_GITEA_BIN" admin user create \
  --config "$ROOT/gitea/custom/conf/app.ini" \
  --work-path "$ROOT/gitea" \
  --username audiolad-admin \
  --password "$PASSWORD" \
  --email audiolad-admin@example.local \
  --admin \
  --must-change-password=false >/dev/null
TOKEN="$("$EMERGENCY_GITEA_BIN" admin user generate-access-token \
  --config "$ROOT/gitea/custom/conf/app.ini" \
  --work-path "$ROOT/gitea" \
  --username audiolad-admin \
  --token-name emergency-test \
  --scopes all \
  --raw)"
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
[[ -n "$TOKEN" ]] || { printf 'ERROR: empty gitea token\n' >&2; exit 1; }

"$EMERGENCY_GITEA_BIN" web --config "$ROOT/gitea/custom/conf/app.ini" --work-path "$ROOT/gitea" >"$ROOT/gitea/web.log" 2>&1 &
GITEA_PID=$!

ready=0
for _ in $(seq 1 50); do
  if curl --silent --fail --max-time 1 "http://127.0.0.1:${PORT}/api/healthz" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.2
done
[[ "$ready" == "1" ]] || { printf 'ERROR: gitea did not become ready\n' >&2; cat "$ROOT/gitea/web.log" >&2 || true; exit 1; }

git init -q -b main "$ROOT/src"
git -C "$ROOT/src" config user.email "test@audiolad.local"
git -C "$ROOT/src" config user.name "Emergency Test"
echo base >"$ROOT/src/README.md"
git -C "$ROOT/src" add README.md
git -C "$ROOT/src" commit -q -m base
echo more >"$ROOT/src/README.md"
git -C "$ROOT/src" commit -aqm second
git -C "$ROOT/src" branch feature
git -C "$ROOT/src" tag -a v1 -m v1
git clone --bare -q "$ROOT/src" "$ROOT/github/Audiolad/audiolad.git"

printf 'Audiolad/audiolad|Audiolad|audiolad|yes\n' >"$ROOT/repos.list"
LOG="$ROOT/sync.log"
set +e
EMERGENCY_MIRROR_ROOT="$ROOT/cache" \
EMERGENCY_STATE_DIR="$ROOT/state" \
EMERGENCY_MIRROR_BASE="http://127.0.0.1:${PORT}" \
EMERGENCY_GITHUB_BASE="file://${ROOT}/github" \
EMERGENCY_REPO_LIST="$ROOT/repos.list" \
EMERGENCY_MIRROR_BACKEND=gitea \
GITEA_BASE_URL="http://127.0.0.1:${PORT}" \
GITEA_USERNAME=audiolad-admin \
GITEA_TOKEN="$TOKEN" \
ALLOW_FILE_MIRROR=1 \
ALLOW_HTTP_MIRROR=1 \
  "$SCRIPT_DIR/sync-from-github.sh" --verify-history >"$LOG" 2>&1
status=$?
set -e
if [[ "$status" -ne 0 ]]; then
  printf 'ERROR: gitea sync failed\n' >&2
  cat "$LOG" >&2
  exit 1
fi
if grep -q -F "$TOKEN" "$LOG"; then
  printf 'ERROR: gitea token leaked into sync output\n' >&2
  exit 1
fi

EMERGENCY_MIRROR_ROOT="$ROOT/cache" \
EMERGENCY_STATE_DIR="$ROOT/state" \
EMERGENCY_MIRROR_BASE="http://127.0.0.1:${PORT}" \
EMERGENCY_REPO_LIST="$ROOT/repos.list" \
ALLOW_HTTP_MIRROR=1 \
GITEA_USERNAME=audiolad-admin \
GITEA_TOKEN="$TOKEN" \
  "$SCRIPT_DIR/promote-to-primary.sh" PROMOTE_MIRROR_TO_PRIMARY

set +e
EMERGENCY_MIRROR_ROOT="$ROOT/cache" \
EMERGENCY_STATE_DIR="$ROOT/state" \
EMERGENCY_MIRROR_BASE="http://127.0.0.1:${PORT}" \
EMERGENCY_GITHUB_BASE="file://${ROOT}/github" \
EMERGENCY_REPO_LIST="$ROOT/repos.list" \
EMERGENCY_MIRROR_BACKEND=gitea \
GITEA_BASE_URL="http://127.0.0.1:${PORT}" \
GITEA_USERNAME=audiolad-admin \
GITEA_TOKEN="$TOKEN" \
ALLOW_FILE_MIRROR=1 \
ALLOW_HTTP_MIRROR=1 \
  "$SCRIPT_DIR/sync-from-github.sh" >"$ROOT/sync-refused.log" 2>&1
status=$?
set -e
[[ "$status" -ne 0 ]] || { printf 'ERROR: sync ran after promotion\n' >&2; exit 1; }

ASK="$ROOT/askpass"
cat >"$ASK" <<'EOF'
#!/bin/sh
case "$1" in
  Username*) printf '%s\n' "${GIT_ASKPASS_USERNAME}" ;;
  *) printf '%s\n' "${GIT_ASKPASS_PASSWORD}" ;;
esac
EOF
chmod 0700 "$ASK"
GIT_ASKPASS="$ASK" GIT_ASKPASS_USERNAME=audiolad-admin GIT_ASKPASS_PASSWORD="$TOKEN" GIT_TERMINAL_PROMPT=0 \
  git clone -q "http://127.0.0.1:${PORT}/Audiolad/audiolad.git" "$ROOT/checkout"
git -C "$ROOT/checkout" config user.email "test@audiolad.local"
git -C "$ROOT/checkout" config user.name "Emergency Test"
echo emergency >"$ROOT/checkout/EMERGENCY.txt"
git -C "$ROOT/checkout" add EMERGENCY.txt
git -C "$ROOT/checkout" commit -q -m "emergency commit"
GIT_ASKPASS="$ASK" GIT_ASKPASS_USERNAME=audiolad-admin GIT_ASKPASS_PASSWORD="$TOKEN" GIT_TERMINAL_PROMPT=0 \
  git -C "$ROOT/checkout" push -q origin HEAD:main
emergency_sha="$(git -C "$ROOT/checkout" rev-parse HEAD)"

EMERGENCY_MIRROR_ROOT="$ROOT/cache" \
EMERGENCY_STATE_DIR="$ROOT/state" \
EMERGENCY_MIRROR_BASE="http://127.0.0.1:${PORT}" \
EMERGENCY_GITHUB_BASE="file://${ROOT}/github" \
EMERGENCY_REPO_LIST="$ROOT/repos.list" \
ALLOW_FILE_MIRROR=1 \
ALLOW_HTTP_MIRROR=1 \
GITEA_USERNAME=audiolad-admin \
GITEA_TOKEN="$TOKEN" \
  "$SCRIPT_DIR/resync-to-github.sh" RESTORE_GITHUB_PRIMARY

github_main="$(git --git-dir="$ROOT/github/Audiolad/audiolad.git" rev-parse refs/heads/main)"
[[ "$github_main" == "$emergency_sha" ]] || {
  printf 'ERROR: github main %s != emergency %s\n' "$github_main" "$emergency_sha" >&2
  exit 1
}
printf 'disposable_gitea=ok sha=%s port=%s\n' "$emergency_sha" "$PORT"
