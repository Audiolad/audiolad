#!/usr/bin/env bash
# Report whether a commit can be built without contacting western endpoints.
# Reads git objects and an optional local npm cache. Does not run curl or wget.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

usage() {
  cat <<'EOF'
Usage: emergency-build-ready.sh --git-dir DIR --sha SHA [--cache DIR] [--inventory]

--inventory prints the lockfile closure and always exits 0 after a local parse.
The default mode exits 0 only when the commit is emergency-build-ready:
  Node.js 22 or newer is on PATH,
  deploy.sh exports PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1,
  every lockfile tarball is already in the npm cache (or is a file: dep in the tree).

This command does not contact npm, GitHub, or any other network host.
EOF
}

GIT_DIR=""
SHA=""
CACHE="${EMERGENCY_NPM_CACHE:-}"
INVENTORY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --inventory) INVENTORY=1; shift ;;
    --git-dir) GIT_DIR="${2:-}"; shift 2 ;;
    --sha) SHA="${2:-}"; shift 2 ;;
    --cache) CACHE="${2:-}"; shift 2 ;;
    *) emergency_die "unknown argument: $1" ;;
  esac
done

: "${GIT_DIR:?--git-dir is required}"
: "${SHA:?--sha is required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || emergency_die "SHA must be 40 lowercase hex"
git -C "$GIT_DIR" cat-file -e "${SHA}^{commit}" || emergency_die "commit missing"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/deploy/scripts"
git -C "$GIT_DIR" show "${SHA}:package-lock.json" >"$tmp/package-lock.json"
git -C "$GIT_DIR" show "${SHA}:deploy/scripts/deploy.sh" >"$tmp/deploy/scripts/deploy.sh"

summary="$(node "$SCRIPT_DIR/inventory-lockfile.mjs" --lockfile "$tmp/package-lock.json" --cache "$CACHE")"
file_deps="$(printf '%s' "$summary" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); process.stdout.write(String(j.resolvedFile||0))})')"
if [[ "$file_deps" != "0" ]]; then
  git -C "$GIT_DIR" archive "$SHA" | tar -x -C "$tmp"
  summary="$(node "$SCRIPT_DIR/inventory-lockfile.mjs" --lockfile "$tmp/package-lock.json" --package-root "$tmp" --cache "$CACHE")"
fi
printf '%s\n' "$summary"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
ffmpeg_state="missing"
ffprobe_state="missing"
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg_state="present"
fi
if command -v ffprobe >/dev/null 2>&1; then
  ffprobe_state="present"
fi
playwright_skip="no"
if grep -q -F 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' "$tmp/deploy/scripts/deploy.sh"; then
  playwright_skip="yes"
fi

ready="yes"
reasons=()
if [[ "$node_major" -lt 22 ]]; then
  ready="no"
  reasons+=("node_major=${node_major}")
fi
if [[ "$playwright_skip" != "yes" ]]; then
  ready="no"
  reasons+=("playwright_postinstall_would_contact_cdn")
fi
ready_npm="$(printf '%s' "$summary" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); process.stdout.write(j.readyNpm?"yes":"no")})')"
if [[ "$ready_npm" != "yes" ]]; then
  ready="no"
  reasons+=("npm_cache_incomplete")
fi

printf 'node_major=%s\n' "$node_major"
printf 'ffmpeg=%s\n' "$ffmpeg_state"
printf 'ffprobe=%s\n' "$ffprobe_state"
printf 'playwright_skip_in_deploy_sh=%s\n' "$playwright_skip"
printf 'worker_tools_ready=%s\n' "$([[ "$ffmpeg_state" == present && "$ffprobe_state" == present ]] && printf yes || printf no)"
if [[ "$INVENTORY" == "1" ]]; then
  printf 'emergency_build_ready=inventory\n'
  exit 0
fi
printf 'emergency_build_ready=%s\n' "$ready"
if [[ ${#reasons[@]} -gt 0 ]]; then
  printf 'reason=%s\n' "$(IFS=,; printf '%s' "${reasons[*]}")"
fi
[[ "$ready" == "yes" ]]
