#!/usr/bin/env bash
# Прогон манифеста. Без аргументов берёт tracks.json и ищет аудио в той же папке.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
has_manifest=0
light=0
for arg in "$@"; do
  if [[ "$arg" == "--manifest" ]]; then
    has_manifest=1
  fi
  if [[ "$arg" == "--dry-run" || "$arg" == "--cpu-smoke" ]]; then
    light=1
  fi
done
if [[ "$has_manifest" -eq 0 ]]; then
  set -- --manifest "$ROOT/tracks.json" "$@"
fi

if [[ "$light" -eq 1 ]]; then
  PY="${MOSS_PYTHON:-python3}"
else
  PY="$ROOT/var/venv/bin/python"
  if [[ ! -x "$PY" ]]; then
    printf 'нет %s. Сначала ./setup.sh\n' "$PY" >&2
    exit 2
  fi
fi

exec "$PY" -u "$ROOT/run.py" "$@"
