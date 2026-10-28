# AudioLad Business access reminder letters

Service letters to the owner account when business music access is about to
end. They are not marketing. Each letter links only to
`https://business.audiolad.ru/#dostup`.

The worker does not send anything until this migration is applied and the
timer is enabled. A deploy never enables the timer: it only installs the units.
Enabling is a separate step that Sergey approves (see «Install»).

## Migration

`supabase/migrations/20270207140000_business_access_reminder_emails.sql`

Additive tables `business_access_reminder_sends`, `business_access_renewal_choices`
and `business_access_renewal_notes`, plus claim, complete, fail and renewal-choice
functions. No column or data change to `access_grants`, `access_paid_periods` or
`paid_until`. One additive trigger `business_access_renewal_clear_no` on
`access_paid_periods` deletes an «Нет» answer when a payment covers that period
(for the payer and for accounts with the same paid email). Improvement notes are
not touched by payments. The 3-day grace stays computed, not stored.

## «Планируете дальше пользоваться сервисом?»

Shown in each letter (Да / Нет links to `#prodlenie?otvet=da|net`), on the owner
card on Главная and on the venue device, from 3 Moscow days before the end through
the grace (and on the card after an ended gift). «Нет» stops the remaining letters
for that period and hides the payment plate; the owner can change the answer.
An optional note «Что нам улучшить, чтобы вам понравилось и вы вернулись?» is
readable only with `admin_panel.access`. A payment clears «Нет».
Notes are an append-only history (`business_access_renewal_notes` has its own id):
a repeated «Нет», a «Да» or a payment never deletes an earlier note. Admins read
all of them through `admin_business_access_renewal_notes`. If saving a note fails,
the card shows an error with «Попробовать ещё раз» instead of «Спасибо».

Rollback comments are at the top of the migration and are not executed.

## When a letter is due

The contractual end is the later of the gift `ends_at` and `paid_until`.
Moscow calendar:

- `before_end` – 1, 2 or 3 calendar days before the end day, while access is still open. Once.
- `grace_start` – after the end instant and before the last-letter day. Once. A missed run on the end day still sends on a later grace day; the letter states the real days left (rounded, «ещё 2 дня») and the exact end time.
- `grace_last` – the Moscow day the grace ends. If the grace ends before 11:00 MSK (for example 00:30), the letter goes the previous day, inside its 10:00–20:00 window, so it is not missed. Once.

Letters are sent only **10:00–20:00 Europe/Moscow**. Outside that window
`claim_business_access_reminders` returns nothing (and the worker skips the claim),
so night runs send nothing and the letter goes in the next window.

A new `paid_until` is a new period, so the three letters can be sent again.
The same period never sends the same kind twice (`UNIQUE (user_id, period_end, reminder_kind)`).

## Service rules

Skipped, not sent, when:

- `email_preferences.service_notifications` is false
- `email_suppressions` has a live scope `all` or `all_non_critical`
- the address is missing or the account email is not confirmed

A marketing or `author_marketing` unsubscribe does not stop these letters.
The letter has no unsubscribe link.

SMTP is the listener service mailbox (`AUDIOLAD_SMTP_*`). The visible From
name is «АудиоЛад Бизнес». The letter uses the Business shell
(`src/lib/email/templates/business-layout.ts`): cream, espresso and coffee
brown, the leather mark from business.audiolad.ru. The purple AudioLad shell
is not used. Not the authors mailbox.

## Schedule

Every **45 minutes** via `audiolad-business-access-reminders.timer`.

## Install

Production Deploy calls `deploy/scripts/ensure-business-access-reminders.sh`
after the migration stage and after cutover. By default it only installs the
wrapper, units and logrotate and runs `daemon-reload`; it logs
`timer_state=not_enabled` and does **not** enable the timer. A timer that was
enabled earlier is left as is.

Enabling the timer (starts the letters) is a separate step, only after Sergey's
explicit OK, on the server from the current release:

```bash
BUSINESS_ACCESS_REMINDERS_TIMER_ENABLE=1 deploy/scripts/ensure-business-access-reminders.sh
```

The flag is off unless set to `1`. Stop again with
`sudo systemctl disable --now audiolad-business-access-reminders.timer`.
