# Author partner activation email outbox worker

Automatic processing of `author_partner_activation_email_outbox` when a
referred listener first becomes an author.

Same shape as `deploy/docs/AUTHOR_SALE_EMAIL_OUTBOX.md`. This file does not
install or enable anything on the host.

## Semantics

- One durable outbox row per referral (idempotent enqueue in the activation transaction)
- At-least-once worker delivery
- Stable `Message-ID` derived from `referral_id`
- Best-effort duplicate protection (`flock` + DB lease / `FOR UPDATE SKIP LOCKED`)
- SMTP is not exactly-once: a rare duplicate is possible if the process dies
  after SMTP accepts the message but before `sent_at` is written

Enqueue does not swallow database errors. If the outbox row cannot be
inserted, activation rolls back. SMTP runs only in this worker, so a delivery
failure does not roll activation back.

A failed row stays `failed` with `next_attempt_at`. The timer below claims it
when that time is due. Another activation request is not required. The inline
drain in the app is only a best-effort fast path after the first activation.

Listener registration (`status = attributed`, `activated_at` still null) does
not enqueue a row.

## Files

| Path | Role |
|------|------|
| `deploy/scripts/run-author-partner-activation-email-outbox.sh` | Canonical wrapper (repo) |
| `/usr/local/lib/audiolad/run-author-partner-activation-email-outbox.sh` | Installed wrapper |
| `deploy/systemd/audiolad-author-partner-activation-email-outbox.{service,timer}` | Unit templates |
| `/etc/systemd/system/audiolad-author-partner-activation-email-outbox.{service,timer}` | Installed units |
| `deploy/logrotate/audiolad-author-partner-activation-email-outbox` | Logrotate template |
| `/etc/logrotate.d/audiolad-author-partner-activation-email-outbox` | Installed logrotate |
| `/var/log/audiolad/author-partner-activation-email-outbox.log` | Structured run log |

## Schedule

Every **2 minutes** via systemd timer `audiolad-author-partner-activation-email-outbox.timer` (`OnUnitActiveSec=2min`).

## Command

Resolved every run from the active release symlink:

```bash
/usr/local/lib/audiolad/run-author-partner-activation-email-outbox.sh
# → cd "$(readlink -f /var/www/audiolad-deploy/current)"
# → source /var/www/audiolad-deploy/shared/.env.production
# → timeout 90s npm run run:author-partner-activation-email
```

## Locks

| Layer | Mechanism |
|-------|-----------|
| Infra | `flock` on `/run/audiolad-author-partner-activation-email-outbox.lock` |
| DB | `claim_author_partner_activation_email_outbox` lease + `FOR UPDATE SKIP LOCKED` |

## Install / update

One-time host install, same as the sale outbox timer. Not run by this change.
After that install, retries do not need a manual script.

```bash
install -d -m 0755 /usr/local/lib/audiolad /var/log/audiolad
install -m 0755 deploy/scripts/run-author-partner-activation-email-outbox.sh \
  /usr/local/lib/audiolad/run-author-partner-activation-email-outbox.sh
install -m 0644 deploy/systemd/audiolad-author-partner-activation-email-outbox.service \
  /etc/systemd/system/audiolad-author-partner-activation-email-outbox.service
install -m 0644 deploy/systemd/audiolad-author-partner-activation-email-outbox.timer \
  /etc/systemd/system/audiolad-author-partner-activation-email-outbox.timer
install -m 0644 deploy/logrotate/audiolad-author-partner-activation-email-outbox \
  /etc/logrotate.d/audiolad-author-partner-activation-email-outbox
systemctl daemon-reload
systemctl enable --now audiolad-author-partner-activation-email-outbox.timer
```

Does **not** restart the Next.js PM2 process.

This document describes the deployment shape only. It has not been installed
or enabled on the production host as part of this change (no systemd
install, no PM2 restart). MERGE=NO, DEPLOY=NO.
