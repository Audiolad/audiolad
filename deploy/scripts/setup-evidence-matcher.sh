#!/usr/bin/env bash
# t1578u: one-time (idempotent) setup of the evidence tool («Сверка записей»):
# pinned Python venv for the play-log PDF and the data folders. Lives outside releases so
# deploys never rebuild it. Throttled: nice + ionice, never competes with hall streaming.
# Usage (root on the prod host): bash deploy/scripts/setup-evidence-matcher.sh
# No secrets. The seal key is created by the app on first use (0600) and never printed.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
ROOT="${AUDIOLAD_EVIDENCE_ROOT:-/var/lib/audiolad/evidence-matcher}"
VENV_DIR="$ROOT/.venv"
REQUIREMENTS="${EVIDENCE_REQUIREMENTS:-$REPO_ROOT/scripts/evidence/requirements.txt}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
FONT_DIR="/usr/share/fonts/truetype/dejavu"
THROTTLE=(nice -n 15)
command -v ionice >/dev/null && THROTTLE=(nice -n 15 ionice -c3)

log() { printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"; }

"$PYTHON_BIN" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
  || { log "evidence_setup_python_too_old"; exit 1; }
[[ -f "$REQUIREMENTS" ]] || { log "evidence_setup_requirements_missing path=$REQUIREMENTS"; exit 1; }
[[ -f "$FONT_DIR/DejaVuSans.ttf" && -f "$FONT_DIR/DejaVuSans-Bold.ttf" && -f "$FONT_DIR/DejaVuSansMono.ttf" ]] \
  || { log "evidence_setup_fonts_missing path=$FONT_DIR"; exit 1; }

umask 077
mkdir -p "$ROOT" "$ROOT/extracts" "$ROOT/keys"
chmod 700 "$ROOT" "$ROOT/extracts" "$ROOT/keys"
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  log "evidence_setup_create_venv path=$VENV_DIR"
  "${THROTTLE[@]}" "$PYTHON_BIN" -m venv "$VENV_DIR"
fi
"${THROTTLE[@]}" "$VENV_DIR/bin/python" -m pip install --quiet --disable-pip-version-check --upgrade pip
"${THROTTLE[@]}" "$VENV_DIR/bin/python" -m pip install --quiet --disable-pip-version-check -r "$REQUIREMENTS"
VERSION="$("$VENV_DIR/bin/python" -c 'from importlib.metadata import version; print(version("reportlab"))')"
log "evidence_setup_ok python=$VENV_DIR/bin/python reportlab=$VERSION root=$ROOT"
