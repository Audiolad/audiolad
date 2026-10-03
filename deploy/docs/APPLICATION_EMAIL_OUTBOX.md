# Application email outbox worker

Automatic processing of `email_outbox` for manual author campaigns queued from
`/admin/mailings`.

This worker is separate from `author_sale_email_outbox`,
`author_partner_activation_email_outbox`, and the product-moderation outbox.
Those timers and wrappers are not changed by this unit.

## Semantics

- Durable outbox
- At-least-once processing
- Best-effort protection from duplicates (`flock` + DB lease / `FOR UPDATE SKIP LOCKED`)
- One recipient is one outbox row. There is no BCC.
- Each run claims at most 25 rows. The claim lease is 120 seconds.
- SMTP is not exactly-once: a rare duplicate is possible if the process dies
  after SMTP accepts the message but before `sent_at` is written

If `AUDIOLAD_SMTP_AUTHORS_USER` or `AUDIOLAD_SMTP_AUTHORS_PASS` is missing, the
worker exits with `authors_smtp_not_configured` and does not claim rows.

## Schedule

Every **2 minutes** via systemd timer (`OnBootSec=2min`, `OnUnitActiveSec=2min`).

The wrapper timeout is 90 seconds, with systemd `TimeoutStartSec=120`. That
stays inside the 120-second lease, so a killed run can be claimed again on the
next tick. If a tick starts while the previous wrapper still holds `flock`,
the new run logs `skip locked=1` and exits 0.

## Command

Resolved every run from the active release symlink:

```bash
/usr/local/lib/audiolad/run-application-email-outbox.sh
# → cd "$(readlink -f /var/www/audiolad-deploy/current)"
# → source /var/www/audiolad-deploy/shared/.env.production
# → timeout 90s npm run run:application-email-outbox
```

## Confirm after deploy

```bash
systemctl is-enabled audiolad-application-email-outbox.timer
systemctl is-active audiolad-application-email-outbox.timer
systemctl list-timers audiolad-application-email-outbox.timer
```

`is-enabled` should print `enabled`. `is-active` should print `active`.
Do not print SMTP passwords, the unsubscribe secret, or raw unsubscribe tokens
from the log.

## Install

Production Deploy calls `deploy/scripts/ensure-application-email-outbox.sh`
after cutover. A failed install or `systemctl enable --now` fails the deploy
result and does not roll back a healthy web release.
