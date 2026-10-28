#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for f in \
  deploy/scripts/run-business-access-reminders.sh \
  deploy/scripts/ensure-business-access-reminders.sh \
  deploy/systemd/audiolad-business-access-reminders.service \
  deploy/systemd/audiolad-business-access-reminders.timer \
  deploy/logrotate/audiolad-business-access-reminders \
  deploy/docs/BUSINESS_ACCESS_REMINDERS.md \
  supabase/migrations/20270207120000_business_access_reminder_emails.sql
 do
  test -f "$ROOT/$f" || { echo "missing $f"; exit 1; }
done
test -x "$ROOT/deploy/scripts/run-business-access-reminders.sh"
test -x "$ROOT/deploy/scripts/ensure-business-access-reminders.sh"
grep -q 'OnUnitActiveSec=45min' "$ROOT/deploy/systemd/audiolad-business-access-reminders.timer"
grep -q 'run:business-access-reminders' "$ROOT/deploy/scripts/run-business-access-reminders.sh"
grep -q 'ensure-business-access-reminders.sh' "$ROOT/deploy/scripts/deploy.sh"
grep -q 'business_access_service' "$ROOT/supabase/migrations/20270207120000_business_access_reminder_emails.sql"
grep -q 'service_notifications IS FALSE' "$ROOT/supabase/migrations/20270207120000_business_access_reminder_emails.sql"
grep -q "scope IN ('all', 'all_non_critical')" "$ROOT/supabase/migrations/20270207120000_business_access_reminder_emails.sql"
if grep -q 'DROP TABLE public.access_paid_periods' \
  "$ROOT/supabase/migrations/20270207120000_business_access_reminder_emails.sql"; then
  echo "must not drop access periods"
  exit 1
fi
echo "business-access-reminder-timer-unit: ok"
