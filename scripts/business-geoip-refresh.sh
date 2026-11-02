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
MIN_FREE_KB=$((1024 * 1024))

mkdir -p "$DIR"
FREE_KB="$(df -Pk "$DIR" | awk 'NR==2 {print $4}')"
if [ "${FREE_KB:-0}" -lt "$MIN_FREE_KB" ]; then
  echo "geoip_refresh: less than 1 GB free in $DIR, skipped" >&2
  exit 1
fi

TMP="$(mktemp -d "$DIR/.refresh.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

fetched=""
# DB-IP publishes on the 1st of the month; fall back to last month early in the month.
for month in "$(date -u +%Y-%m)" "$(date -u -d "$(date -u +%Y-%m-01) -1 day" +%Y-%m)"; do
  url="https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz"
  if curl -fsS --proto '=https' --max-time 900 --retry 2 -o "$TMP/db.mmdb.gz" "$url"; then
    fetched="$month"
    break
  fi
done
if [ -z "$fetched" ]; then
  echo "geoip_refresh: download failed, current file kept" >&2
  exit 1
fi

gunzip -c "$TMP/db.mmdb.gz" > "$TMP/db.mmdb"
rm -f "$TMP/db.mmdb.gz"
size="$(stat -c %s "$TMP/db.mmdb")"
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
