#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for f in \
  deploy/scripts/run-seo-reservation-5d-reminder.sh \
  deploy/scripts/ensure-seo-reservation-5d-reminder.sh \
  deploy/systemd/audiolad-seo-reservation-5d-reminder.service \
  deploy/systemd/audiolad-seo-reservation-5d-reminder.timer \
  deploy/logrotate/audiolad-seo-reservation-5d-reminder \
  deploy/docs/SEO_RESERVATION_5D_REMINDER.md \
  supabase/migrations/20261220130000_seo_reservation_5d_reminder.sql
 do
  test -f "$ROOT/$f" || { echo "missing $f"; exit 1; }
done
test -x "$ROOT/deploy/scripts/run-seo-reservation-5d-reminder.sh"
test -x "$ROOT/deploy/scripts/ensure-seo-reservation-5d-reminder.sh"
grep -q 'OnUnitActiveSec=45min' "$ROOT/deploy/systemd/audiolad-seo-reservation-5d-reminder.timer"
grep -q 'run:seo-reservation-5d-reminder' "$ROOT/deploy/scripts/run-seo-reservation-5d-reminder.sh"
grep -q 'ensure-seo-reservation-5d-reminder.sh' "$ROOT/deploy/scripts/deploy.sh"
grep -q 'clock_timestamp()' "$ROOT/supabase/migrations/20261220130000_seo_reservation_5d_reminder.sql"
grep -q "interval '5 days'" "$ROOT/supabase/migrations/20261220130000_seo_reservation_5d_reminder.sql"
# Expiry logic must not be rewritten here
if grep -q 'CREATE OR REPLACE FUNCTION public.expire_seo_query_reservation' \
  "$ROOT/supabase/migrations/20261220130000_seo_reservation_5d_reminder.sql"; then
  echo "must not redefine expire_seo_query_reservation"
  exit 1
fi
echo "seo-reservation-5d-reminder-timer-unit: ok"
