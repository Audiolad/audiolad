#!/usr/bin/env bash
# t1578u: one-time (idempotent) setup of the evidence tool («Сверка записей»):
# pinned Python venv (PDF + audfprint matcher), pinned Olaf binary (second algorithm,
# sha256-checked), the control set of foreign music (sha256-checked) and the data folders. Lives outside releases so
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
VERSION="$("$VENV_DIR/bin/python" -c 'from importlib.metadata import version; print(version("reportlab"), version("numpy"), version("scipy"))')"

# Olaf v3.3.3 (AGPL-3.0, unmodified upstream CLI, run as a separate program).
OLAF_URL="https://github.com/JorenSix/Olaf/releases/download/v3.3.3/olaf_cli-linux-x86_64.tar.gz"
OLAF_SHA256="a9c2c38aa9076cf3a7eeb3ecfeb51a493d54d1c6f740bb49aa0ae71166209946"
mkdir -p "$ROOT/bin" "$ROOT/control" "$ROOT/index" "$ROOT/jobs" "$ROOT/locks"
chmod 700 "$ROOT/bin" "$ROOT/control" "$ROOT/index" "$ROOT/jobs" "$ROOT/locks"
if [[ ! -x "$ROOT/bin/olaf" ]]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  "${THROTTLE[@]}" curl -fsSL --retry 3 -o "$TMP/olaf.tgz" "$OLAF_URL"
  echo "$OLAF_SHA256  $TMP/olaf.tgz" | sha256sum -c --quiet - || { log "evidence_setup_olaf_sha256_mismatch"; exit 1; }
  tar -xzf "$TMP/olaf.tgz" -C "$TMP" olaf
  install -m 0755 "$TMP/olaf" "$ROOT/bin/olaf"
  log "evidence_setup_olaf_installed"
fi

# Control set: foreign music (CC BY 4.0), each file checked against the pinned sha256.
CONTROL_JSON="$REPO_ROOT/scripts/evidence/control-set.json"
"$VENV_DIR/bin/python" - "$CONTROL_JSON" "$ROOT/control" <<'PY'
import hashlib, json, os, sys, urllib.request
src, dest = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding="utf-8"))
out = []
for t in data["tracks"]:
    name = t["code"] + ".mp3"
    path = os.path.join(dest, name)
    ok = os.path.exists(path) and hashlib.sha256(open(path, "rb").read()).hexdigest() == t["sha256"]
    if not ok:
        req = urllib.request.Request(t["url"], headers={"User-Agent": "AudioLad-evidence-setup/1"})
        body = urllib.request.urlopen(req, timeout=300).read()
        if hashlib.sha256(body).hexdigest() != t["sha256"]:
            sys.exit("evidence_setup_control_sha256_mismatch " + t["code"])
        with open(path + ".tmp", "wb") as fh:
            fh.write(body)
        os.replace(path + ".tmp", path)
    out.append({"code": t["code"], "title": t["title"], "sha256": t["sha256"], "file": name})
with open(os.path.join(dest, "control.json.tmp"), "w", encoding="utf-8") as fh:
    json.dump({"license": data.get("license"), "tracks": out}, fh, ensure_ascii=False, indent=1)
os.replace(os.path.join(dest, "control.json.tmp"), os.path.join(dest, "control.json"))
print("control_tracks=%d" % len(out))
PY
"${THROTTLE[@]}" "$VENV_DIR/bin/python" "$REPO_ROOT/scripts/evidence/evidence_match.py" selftest --olaf "$ROOT/bin/olaf" >/dev/null \
  || { log "evidence_setup_selftest_failed"; exit 1; }
log "evidence_setup_ok python=$VENV_DIR/bin/python versions=$VERSION olaf=$ROOT/bin/olaf root=$ROOT"
