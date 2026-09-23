# Author sale email outbox worker

Automatic processing of `author_sale_email_outbox` for author product-sold
notifications.

## Semantics

- Durable outbox
- At-least-once processing
- Best-effort protection from duplicates (`flock` + DB lease / `FOR UPDATE SKIP LOCKED`)
- SMTP is not exactly-once: a rare duplicate is possible if the process dies
  after SMTP accepts the message but before `sent_at` is written

Historical allowlist sales are never enqueued (`NOT is_historical_exception`).

## Files

| Path | Role |
|------|------|
| `deploy/scripts/run-author-sale-email-outbox.sh` | Canonical wrapper (repo) |
| `/usr/local/lib/audiolad/run-author-sale-email-outbox.sh` | Installed wrapper |
| `deploy/systemd/audiolad-author-sale-email-outbox.{service,timer}` | Unit templates |
| `/etc/systemd/system/audiolad-author-sale-email-outbox.{service,timer}` | Installed units |
| `deploy/logrotate/audiolad-author-sale-email-outbox` | Logrotate template |
| `/etc/logrotate.d/audiolad-author-sale-email-outbox` | Installed logrotate |
| `/var/log/audiolad/author-sale-email-outbox.log` | Structured run log |

## Schedule

Every **2 minutes** via systemd timer (`OnUnitActiveSec=2min`).

## Command

Resolved every run from the active release symlink:

```bash
/usr/local/lib/audiolad/run-author-sale-email-outbox.sh
# → cd "$(readlink -f /var/www/audiolad-deploy/current)"
# → source /var/www/audiolad-deploy/shared/.env.production
# → timeout 90s npm run run:author-sale-email-outbox
```

That npm script drains `author_sale_email_outbox` and, in the same process,
`author_partner_activation_email_outbox`. The installed timer and wrapper do
not change. A normal Production Deploy of the release is enough for the next
tick to retry partner rows. See `deploy/docs/AUTHOR_PARTNER_ACTIVATION_EMAIL_OUTBOX.md`.

The wrapper summary line stays the sale JSON object (`claimed`, `sent`,
`failed`). Partner lines are prefixed and are not that summary. A failure in
one queue does not skip the other.

## Locks

| Layer | Mechanism |
|-------|-----------|
| Infra | `flock` on `/run/audiolad-author-sale-email-outbox.lock` |
| DB | `claim_author_sale_email_outbox` lease + `FOR UPDATE SKIP LOCKED` |

## Install / update

```bash
install -d -m 0755 /usr/local/lib/audiolad /var/log/audiolad
install -m 0755 deploy/scripts/run-author-sale-email-outbox.sh \
  /usr/local/lib/audiolad/run-author-sale-email-outbox.sh
install -m 0644 deploy/systemd/audiolad-author-sale-email-outbox.service \
  /etc/systemd/system/audiolad-author-sale-email-outbox.service
install -m 0644 deploy/systemd/audiolad-author-sale-email-outbox.timer \
  /etc/systemd/system/audiolad-author-sale-email-outbox.timer
install -m 0644 deploy/logrotate/audiolad-author-sale-email-outbox \
  /etc/logrotate.d/audiolad-author-sale-email-outbox
systemctl daemon-reload
systemctl enable --now audiolad-author-sale-email-outbox.timer
```

Does **not** restart the Next.js PM2 process.
