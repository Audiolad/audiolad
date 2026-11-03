#!/usr/bin/env bash
# Downloads DB-IP Lite City (CC BY 4.0) for the admin «Подарочная неделя» city column
# (task 253821e0). The database is never committed: run this on the server once before
# turning AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED on, then monthly from cron.
# Official source: https://db-ip.com/db/download/ip-to-city-lite
# Usage: scripts/business-geoip-refresh.sh [target.mmdb]
# Default target: /var/www/audiolad-deploy/shared/geoip/dbip-city-lite.mmdb
# The app re-reads the file when its mtime changes (within 10 minutes), no restart needed.
set -euo pipefail

TARGET="${1:-/var/www/audiolad-deploy/shared/geoip/dbip-city-lite.mmdb}"
DIR="$(dirname "$TARGET")"
MIN_BYTES=$((50 * 1024 * 1024))
# Hard caps while writing, so a bad or huge response can never fill the shared disk.
MAX_GZ_BYTES=$((200 * 1024 * 1024))
MAX_BYTES=$((400 * 1024 * 1024))

mkdir -p "$DIR"
# One refresh at a time (cron and a manual run must not both pass the space check).
exec 9>"$DIR/.refresh.lock"
if ! flock -n 9; then
  echo "geoip_refresh: another refresh is running, skipped" >&2
  exit 0
fi

# Room for the download, the unpacked file and the .prev copy, plus 1 GB to spare.
CUR_KB=0
if [ -f "$TARGET" ]; then CUR_KB=$(( $(stat -c %s "$TARGET") / 1024 )); fi
NEED_KB=$(( (MAX_GZ_BYTES + MAX_BYTES) / 1024 + CUR_KB + 1024 * 1024 ))
FREE_KB="$(df -Pk "$DIR" | awk 'NR==2 {print $4}')"
if [ "${FREE_KB:-0}" -lt "$NEED_KB" ]; then
  echo "geoip_refresh: not enough free space in $DIR (need ${NEED_KB} KB), skipped" >&2
  exit 1
fi

TMP="$(mktemp -d "$DIR/.refresh.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

fetched=""
# DB-IP publishes on the 1st of the month; fall back to last month early in the month.
for month in "$(date -u +%Y-%m)" "$(date -u -d "$(date -u +%Y-%m-01) -1 day" +%Y-%m)"; do
  url="https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz"
  if curl -fsS --proto '=https' --max-time 900 --retry 2 --max-filesize "$MAX_GZ_BYTES" -o "$TMP/db.mmdb.gz" "$url"; then
    fetched="$month"
    break
  fi
done
if [ -z "$fetched" ]; then
  echo "geoip_refresh: download failed, current file kept" >&2
  exit 1
fi

if [ "$(stat -c %s "$TMP/db.mmdb.gz")" -gt "$MAX_GZ_BYTES" ]; then
  echo "geoip_refresh: download too large, current file kept" >&2
  exit 1
fi
if ! gunzip -t "$TMP/db.mmdb.gz"; then
  echo "geoip_refresh: broken archive, current file kept" >&2
  exit 1
fi
# Unpack at most MAX_BYTES + 1 bytes; a larger result is rejected below.
{ gunzip -c "$TMP/db.mmdb.gz" || true; } | head -c "$((MAX_BYTES + 1))" > "$TMP/db.mmdb"
rm -f "$TMP/db.mmdb.gz"
size="$(stat -c %s "$TMP/db.mmdb")"
if [ "$size" -gt "$MAX_BYTES" ]; then
  echo "geoip_refresh: unpacked file too large, current file kept" >&2
  exit 1
fi
if [ "$size" -lt "$MIN_BYTES" ]; then
  echo "geoip_refresh: file too small ($size bytes), current file kept" >&2
  exit 1
fi
# MaxMind DB metadata marker near the end of every valid .mmdb file.
if ! tail -c 200000 "$TMP/db.mmdb" | grep -aq 'MaxMind.com'; then
  echo "geoip_refresh: not an .mmdb file, current file kept" >&2
  exit 1
fi
if ! tail -c 200000 "$TMP/db.mmdb" | grep -aq 'DBIP-City-Lite'; then
  echo "geoip_refresh: not DB-IP City Lite, current file kept" >&2
  exit 1
fi

chmod 0644 "$TMP/db.mmdb"
if [ -f "$TARGET" ]; then cp -p "$TARGET" "$TARGET.prev"; fi
mv -f "$TMP/db.mmdb" "$TARGET"
echo "geoip_refresh: ok, DB-IP Lite City $fetched, $size bytes"
