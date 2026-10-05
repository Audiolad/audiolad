# SEO reservation day-5 reminder worker

Sends at most one author reminder email for each active SEO query booking
(`public.seo_query_reservations`) once five full days have passed since
`reserved_at`, while the booking is still active, not expired, not released,
and the linked product (if any) is not published and not submitted to
moderation.

Uses the existing authors SMTP identity (`authors@audiolad.ru`). Regular bookings
and sprint/marathon bookings share this table; there is no second mechanism.

## Semantics

- Atomic claim: `claim_seo_reservation_5d_reminders` sets a lease with
  `clock_timestamp()`
- Success: `complete_seo_reservation_5d_reminder` sets `reminder_5d_sent_at`
- Missing email: permanent fail (sets `reminder_5d_sent_at`, no mail)
- Transient SMTP failure: lease released, may retry; never double-send after complete
- 7-day expiry (`expire_seo_query_reservation` / `expires_at`) is unchanged

## Schedule

Every **45 minutes** via systemd timer.

## Install

Production Deploy calls `deploy/scripts/ensure-seo-reservation-5d-reminder.sh`
after cutover.
