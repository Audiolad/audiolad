#!/usr/bin/env bash
# One entrypoint for operators: status / start / stop / pause / resume.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCH="${AUDIOLAD_MUSIC_STORAGE_BULK_ORCH:-/usr/local/lib/audiolad/audiolad-music-storage-bulk-orchestrator.sh}"
if [[ ! -x "$ORCH" && -x "${SCRIPT_DIR}/audiolad-music-storage-bulk-orchestrator.sh" ]]; then
  ORCH="${SCRIPT_DIR}/audiolad-music-storage-bulk-orchestrator.sh"
fi

CMD="${1:-}"
STAGE="${2:-copy}"
EXTRA=()
if [[ "${3:-}" == "--reset-cursor" ]]; then
  EXTRA+=(--reset-cursor)
fi

case "$CMD" in
  status|start|stop|pause|resume|tick) ;;
  *)
    printf '%s\n' \
      "usage: audiolad-music-storage-bulk-ctl.sh <status|start|stop|pause|resume|tick> [copy|cutover|release-local] [--reset-cursor]" >&2
    exit 2
    ;;
esac

case "$STAGE" in
  copy|cutover|release-local) ;;
  *)
    printf '%s\n' "invalid stage: $STAGE" >&2
    exit 2
    ;;
esac

exec "$ORCH" "$STAGE" "$CMD" "${EXTRA[@]}"