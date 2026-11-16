#!/usr/bin/env bash
# t1485u: one-time (idempotent) setup of the pinned shazamio venv for
# audiolad-business-shazam-worker. Lives outside releases so deploys never rebuild it.
# Usage (root on the prod host): nice -n 10 bash deploy/scripts/setup-business-shazam-venv.sh
# Needs python3 >= 3.10 with venv, ffmpeg/ffprobe already on PATH. No secrets.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
VENV_DIR="${BUSINESS_SHAZAM_VENV_DIR:-/var/lib/audiolad/business-shazam/.venv}"
REQUIREMENTS="${BUSINESS_SHAZAM_REQUIREMENTS:-$REPO_ROOT/scripts/business-shazam/requirements.txt}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

log() { printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"; }

command -v ffmpeg >/dev/null || { log "business_shazam_setup_ffmpeg_missing"; exit 1; }
command -v ffprobe >/dev/null || { log "business_shazam_setup_ffprobe_missing"; exit 1; }
"$PYTHON_BIN" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
  || { log "business_shazam_setup_python_too_old"; exit 1; }
[[ -f "$REQUIREMENTS" ]] || { log "business_shazam_setup_requirements_missing path=$REQUIREMENTS"; exit 1; }

mkdir -p "$(dirname "$VENV_DIR")"
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  log "business_shazam_setup_create_venv path=$VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi
nice -n 10 "$VENV_DIR/bin/python" -m pip install --quiet --disable-pip-version-check --upgrade pip
nice -n 10 "$VENV_DIR/bin/python" -m pip install --quiet --disable-pip-version-check -r "$REQUIREMENTS"
VERSION="$("$VENV_DIR/bin/python" -c 'from importlib.metadata import version; import shazamio; print(version("shazamio"))')"
log "business_shazam_setup_ok python=$VENV_DIR/bin/python shazamio=$VERSION"
