#!/usr/bin/env bash
set -Eeuo pipefail

URL="${AUDIOLAD_IPV6_HEALTH_URL:-https://audiolad.ru/api/health/build}"
TIMEOUT="${AUDIOLAD_IPV6_HEALTH_TIMEOUT:-15}"
TAG="audiolad-ipv6-health"

if curl -6 -fsS --max-time "$TIMEOUT" "$URL" | grep -q '"status":"ok"'; then
  logger -t "$TAG" "OK $URL"
  exit 0
fi

logger -t "$TAG" "FAIL $URL"
exit 1
