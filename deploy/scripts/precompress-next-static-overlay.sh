#!/usr/bin/env bash
# Precompress text files in the hashed static overlay.
# Always invoked from the CANDIDATE release tree after git archive, so a
# stale GIT_WORKDIR copy of common.sh still creates .gz siblings.
set -euo pipefail

NEXT_STATIC_OVERLAY_DIR="${NEXT_STATIC_OVERLAY_DIR:-/var/www/audiolad-deploy/shared/next-static}"

log() {
  if declare -F log_info >/dev/null 2>&1; then
    log_info "$*"
  else
    printf '[INFO] %s\n' "$*"
  fi
}

warn() {
  if declare -F log_warn >/dev/null 2>&1; then
    log_warn "$*"
  else
    printf '[WARN] %s\n' "$*" >&2
  fi
}

if ! command -v gzip >/dev/null 2>&1; then
  warn "gzip not found; skip overlay precompress"
  exit 0
fi

if [[ ! -d "$NEXT_STATIC_OVERLAY_DIR" ]]; then
  warn "overlay dir missing: $NEXT_STATIC_OVERLAY_DIR"
  exit 0
fi

log "Precompressing text static in $NEXT_STATIC_OVERLAY_DIR"

while IFS= read -r -d '' file; do
  gz="${file}.gz"
  if [[ -f "$gz" && ! "$file" -nt "$gz" ]]; then
    continue
  fi
  tmp="${gz}.tmp.$$"
  if gzip -9 -n -c "$file" >"$tmp"; then
    mv -f "$tmp" "$gz"
  else
    rm -f "$tmp"
    warn "gzip failed for $file"
  fi
done < <(find "$NEXT_STATIC_OVERLAY_DIR" -type f \( \
  -name '*.js' -o -name '*.css' -o -name '*.svg' -o \
  -name '*.json' -o -name '*.txt' -o -name '*.map' \) -print0)

while IFS= read -r -d '' gz; do
  orig="${gz%.gz}"
  if [[ ! -f "$orig" ]]; then
    rm -f "$gz"
  fi
done < <(find "$NEXT_STATIC_OVERLAY_DIR" -type f -name '*.gz' -print0)
