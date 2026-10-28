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
  supabase/migrations/20270207140000_business_access_reminder_emails.sql
 do
  test -f "$ROOT/$f" || { echo "missing $f"; exit 1; }
done
test -x "$ROOT/deploy/scripts/run-business-access-reminders.sh"
test -x "$ROOT/deploy/scripts/ensure-business-access-reminders.sh"
grep -q 'OnUnitActiveSec=45min' "$ROOT/deploy/systemd/audiolad-business-access-reminders.timer"
grep -q 'run:business-access-reminders' "$ROOT/deploy/scripts/run-business-access-reminders.sh"
grep -q 'ensure-business-access-reminders.sh' "$ROOT/deploy/scripts/deploy.sh"
grep -q 'business_access_service' "$ROOT/supabase/migrations/20270207140000_business_access_reminder_emails.sql"
grep -q 'service_notifications IS FALSE' "$ROOT/supabase/migrations/20270207140000_business_access_reminder_emails.sql"
grep -q "scope IN ('all', 'all_non_critical')" "$ROOT/supabase/migrations/20270207140000_business_access_reminder_emails.sql"
if grep -q 'DROP TABLE public.access_paid_periods' \
  "$ROOT/supabase/migrations/20270207140000_business_access_reminder_emails.sql"; then
  echo "must not drop access periods"
  exit 1
fi

# The timer must not auto-enable on deploy: only an explicit flag enables it.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat >"$TMP/systemctl" <<'SH'
#!/usr/bin/env bash
echo "$*" >>"$FAKE_SYSTEMCTL_LOG"
if [[ "$1" == "is-enabled" || "$1" == "is-active" ]]; then
  grep -q '^enable ' "$FAKE_SYSTEMCTL_LOG"
fi
SH
chmod +x "$TMP/systemctl"
run_ensure() {
  WRAPPER_DIR="$TMP/lib" SYSTEMD_DIR="$TMP/systemd" LOGROTATE_DIR="$TMP/logrotate" LOG_DIR="$TMP/log" \
    SYSTEMCTL="$TMP/systemctl" SKIP_AS_ROOT=1 FAKE_SYSTEMCTL_LOG="$TMP/calls" \
    DEPLOY_TREE="$ROOT/deploy" "$@" "$ROOT/deploy/scripts/ensure-business-access-reminders.sh" >"$TMP/out" 2>&1
}
: >"$TMP/calls"
run_ensure env -u BUSINESS_ACCESS_REMINDERS_TIMER_ENABLE
test -f "$TMP/systemd/audiolad-business-access-reminders.timer"
if grep -q '^enable' "$TMP/calls"; then echo "timer must not auto-enable"; exit 1; fi
grep -q 'timer_state=not_enabled' "$TMP/out"
: >"$TMP/calls"
run_ensure env BUSINESS_ACCESS_REMINDERS_TIMER_ENABLE=1
grep -q '^enable --now audiolad-business-access-reminders.timer' "$TMP/calls"
grep -q 'business_access_reminders_timer_enabled' "$TMP/out"
grep -q 'BUSINESS_ACCESS_REMINDERS_TIMER_ENABLE' "$ROOT/deploy/docs/BUSINESS_ACCESS_REMINDERS.md"
echo "business-access-reminder-timer-unit: ok"
