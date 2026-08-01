# Author product moderation email outbox worker

Automatic processing of `practice_moderation_email_outbox` for mandatory
author moderation notifications.

## Scope

Only two moderation outcomes ever enqueue an email (enqueue happens inside
`log_practice_moderation_event`):

- `changes_requested` — product is **not** published yet; author must edit
  and resubmit. Subject: `Требуются изменения в продукте – АудиоЛад`.
- `approved_and_published` — product is now live. Subject:
  `Ваш продукт опубликован – АудиоЛад`.

No other lifecycle action (`submitted`, `resubmitted`, `submission_withdrawn`,
`unpublished`, `republished`, `edit_mode_started`, `deleted`) ever enqueues an
email, and this worker never sends admin alerts — it is author-facing only.

## Semantics

- Durable outbox
- At-least-once processing
- Best-effort protection from duplicates (`flock` + DB lease /
  `FOR UPDATE SKIP LOCKED`)
- SMTP is not exactly-once: a rare duplicate is possible if the process dies
  after SMTP accepts the message but before `sent_at` is written
- Recipient is always `author_members.role = owner` (editors never receive
  this mail); a missing/invalid owner email lands the row as
  `failed_permanent` / `recipient_missing` without blocking the moderation
  event itself
- Deliveries can go stale before they are sent (author resubmitted, product
  unpublished/deleted, etc.) — `claim_practice_moderation_email_outbox`
  cancels these instead of sending an outdated message

## Files

| Path | Role |
|------|------|
| `deploy/scripts/run-author-product-moderation-email-outbox.sh` | Canonical wrapper (repo) |
| `/usr/local/lib/audiolad/run-author-product-moderation-email-outbox.sh` | Installed wrapper |
| `deploy/systemd/audiolad-author-product-moderation-email-outbox.{service,timer}` | Unit templates |
| `/etc/systemd/system/audiolad-author-product-moderation-email-outbox.{service,timer}` | Installed units |
| `deploy/logrotate/audiolad-author-product-moderation-email-outbox` | Logrotate template |
| `/etc/logrotate.d/audiolad-author-product-moderation-email-outbox` | Installed logrotate |
| `/var/log/audiolad/author-product-moderation-email-outbox.log` | Structured run log |

## Schedule

Every **2 minutes** via systemd timer (`OnUnitActiveSec=2min`).

## Command

Resolved every run from the active release symlink:

```bash
/usr/local/lib/audiolad/run-author-product-moderation-email-outbox.sh
# → cd "$(readlink -f /var/www/audiolad-deploy/current)"
# → source /var/www/audiolad-deploy/shared/.env.production
# → timeout 90s npm run run:author-product-moderation-email-outbox
```

## Locks

| Layer | Mechanism |
|-------|-----------|
| Infra | `flock` on `/run/audiolad-author-product-moderation-email-outbox.lock` |
| DB | `claim_practice_moderation_email_outbox` lease + `FOR UPDATE SKIP LOCKED` |

## Install / update

```bash
install -d -m 0755 /usr/local/lib/audiolad /var/log/audiolad
install -m 0755 deploy/scripts/run-author-product-moderation-email-outbox.sh \
  /usr/local/lib/audiolad/run-author-product-moderation-email-outbox.sh
install -m 0644 deploy/systemd/audiolad-author-product-moderation-email-outbox.service \
  /etc/systemd/system/audiolad-author-product-moderation-email-outbox.service
install -m 0644 deploy/systemd/audiolad-author-product-moderation-email-outbox.timer \
  /etc/systemd/system/audiolad-author-product-moderation-email-outbox.timer
install -m 0644 deploy/logrotate/audiolad-author-product-moderation-email-outbox \
  /etc/logrotate.d/audiolad-author-product-moderation-email-outbox
systemctl daemon-reload
systemctl enable --now audiolad-author-product-moderation-email-outbox.timer
```

Does **not** restart the Next.js PM2 process.

This document describes the deployment shape only; it has not been installed
or enabled on the production host as part of this change (no systemd
install, no PM2 restart).
