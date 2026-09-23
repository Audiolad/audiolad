# Author partner activation email outbox

Retries of `author_partner_activation_email_outbox` use the sale-email timer
that is already installed on the host. This change does not add a systemd
unit and does not require SSH or `systemctl enable`.

## Path after a normal Production Deploy

```text
audiolad-author-sale-email-outbox.timer
  every 2 minutes (already enabled)
    → /usr/local/lib/audiolad/run-author-sale-email-outbox.sh
      → cd /var/www/audiolad-deploy/current
      → npm run run:author-sale-email-outbox
        → scripts/process-author-sale-email-outbox.ts
          → runInstalledAuthorEmailOutboxCycle
            → processAuthorSaleEmailOutbox
            → processAuthorPartnerActivationEmailOutbox
```

The timer and the wrapper stay the ones installed for sale email. Production
Deploy replaces the current release. The next timer tick runs the new release
code, so a `failed` partner row whose `next_attempt_at` has passed is claimed
without another activation request and without a manual script.

## Isolation

The two queues run in one process and do not share a lease.

| Queue | Claim / complete / fail | Message-ID |
|-------|-------------------------|------------|
| Sale | `claim_author_sale_email_outbox` and its complete/fail | existing sale id |
| Partner activation | `claim_author_partner_activation_email_outbox` and its complete/fail | `referral_id` |

A thrown error in one queue is caught around that queue. The other queue
still runs. The process exit code follows the sale queue, matching the
installed wrapper. Partner SMTP failures are stored on the partner row
(`failed` + `next_attempt_at`) and do not mark the sale run failed.

The wrapper log parser still reads the last raw JSON line with `claimed`,
`sent`, and `failed`. That line is the sale summary. Partner output is
prefixed with `partner_activation_email_outbox` and does not replace it.

## Semantics

- One durable outbox row per referral
- At-least-once delivery
- Stable Message-ID from `referral_id`
- Best-effort duplicate protection (sale wrapper `flock` plus each queue's
  `FOR UPDATE SKIP LOCKED` lease)
- SMTP is not exactly-once

Enqueue stays in the activation transaction. SMTP stays in this worker.

An inline drain immediately after activation is only a fast path. It does
not retry a row whose `next_attempt_at` is still in the future.

## What is not installed

There is no `audiolad-author-partner-activation-email-outbox.timer`. A unit
file in the release would not be enabled by Production Deploy, so retries
would still depend on a manual host install. That path is not used.
