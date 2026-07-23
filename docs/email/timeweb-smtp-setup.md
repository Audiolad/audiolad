# Timeweb SMTP setup for АудиоЛад

This document describes how to connect self-hosted GoTrue to Timeweb mail **when explicitly approved for production**. Do not apply these changes without a separate rollout command.

## Scope

- Configure real SMTP for GoTrue auth emails (signup confirmation, password recovery).
- Keep application transactional/marketing emails on the future `email_outbox` worker (not enabled yet).
- Do **not** commit passwords, API keys, or webhook secrets.

## Mailboxes and aliases to verify in Timeweb panel

Confirm these addresses exist on the primary mailbox or as dedicated mailboxes:

| Address | Purpose |
|---------|---------|
| `inbox@audiolad.ru` | Primary application SMTP (welcome, legacy operational mail) |
| `no-reply@audiolad.ru` | GoTrue auth sender (`MAIL_FROM`) when relay allows |
| `support@audiolad.ru` | Reply-To for auth/security messages |
| `info@audiolad.ru` | Future product/news sender |
| `authors@audiolad.ru` | **Dedicated mailbox** for author application emails |

### Timeweb SMTP constraint (verified 2026-07-22)

Timeweb SMTP **rewrites visible From to the authenticated mailbox**. Aliases do **not** work as SMTP send-as from third-party apps — alias send is only available in Timeweb.MAIL web UI.

Therefore:

- **Do not** rely on `MIME From: authors@` while authenticating as `inbox@`.
- **`authors@audiolad.ru` must be a full mailbox** with its own SMTP login/password.
- **`author_application_submitted`** and **`author_application_approved`** use the authors mailbox SMTP credentials.
- Welcome, recovery (GoTrue), and other general mail stay on `inbox@audiolad.ru`.

Do not create new Timeweb resources during code rollout without owner approval — verify/plan in panel first.

## GoTrue environment (self-hosted Supabase)

Update `/opt/supabase/docker/.env` (example keys only):

```env
# Site
SITE_URL=https://audiolad.ru
GOTRUE_SITE_URL=https://audiolad.ru

# SMTP (Timeweb)
GOTRUE_SMTP_HOST=smtp.timeweb.ru
GOTRUE_SMTP_PORT=465
GOTRUE_SMTP_USER=<primary-mailbox-login>
GOTRUE_SMTP_PASS=<mailbox-password>
GOTRUE_SMTP_ADMIN_EMAIL=no-reply@audiolad.ru
GOTRUE_SMTP_SENDER_NAME=АудиоЛад
GOTRUE_MAILER_AUTOCONFIRM=true

# Redirect allowlist (adjust to exact production URLs)
GOTRUE_URI_ALLOW_LIST=https://audiolad.ru/auth/callback,https://audiolad.ru/auth/reset-password
```

Replace fake/dev SMTP (`supabase-mail:2500`) only after test send succeeds.

### Sender identity mapping

| Setting | Value |
|---------|-------|
| Sender name | `АудиоЛад` |
| Sender address | `no-reply@audiolad.ru` |
| Reply-To (application config) | `support@audiolad.ru` |

Application sender identities (non-GoTrue) live in `src/lib/email/sender-identities.ts`.

## Redirect URLs and recovery flow

Recovery preserves the user's original `next` destination (for example after checkout):

```text
/auth/sign-in?next=/my-practices?purchased=<slug>
  → /auth/forgot-password?next=...
  → email link → /auth/callback?next=/auth/reset-password?next=...
  → /auth/reset-password?next=...
  → /auth/sign-in?reset=1&next=...
  → /my-practices?purchased=<slug>
```

1. User opens `/auth/forgot-password?next=...`.
2. App calls `resetPasswordForEmail` with `redirectTo`:
   `https://audiolad.ru/auth/callback?next=/auth/reset-password?next=<ultimate>`
3. GoTrue sends recovery email (when SMTP is real). Branded template: see `docs/email/gotrue-recovery-template-rollout.md`.
4. User opens link → `/auth/callback` exchanges code → `/auth/reset-password?next=...`.
5. User sets a new password via `updateUser`.
6. App redirects to `/auth/sign-in?reset=1&next=...`; sign-in completes the chain.

Ensure `GOTRUE_URI_ALLOW_LIST` includes callback and reset routes.

### Recommended production env (separate approval)

```env
GOTRUE_MAILER_EXTERNAL_HOSTS=audiolad.ru
SMTP_ADMIN_EMAIL=no-reply@audiolad.ru
```

Verify `no-reply@audiolad.ru` exists in Timeweb before switching sender. If relay is denied, keep `inbox@audiolad.ru`.

## DKIM (Timeweb panel)

Status as of 2026-07-20 audit:

- **VERIFIED** — public TXT at `dkim._domainkey.audiolad.ru` (TTL 21600)
- Selectors `default`, `mail`, `timeweb`, `s1` — not present

Confirm in Timeweb panel that outbound mail uses the `dkim` selector. If Timeweb rotates keys, update DNS from the panel value only.

## DNS checks (read-only)

Before production send, verify externally:

```bash
dig MX audiolad.ru +short
dig TXT audiolad.ru +short
dig TXT _dmarc.audiolad.ru +short
dig TXT default._domainkey.audiolad.ru +short
```

Expected state today:

- MX → Timeweb
- SPF present for Timeweb
- DKIM present at `dkim._domainkey.audiolad.ru` (verify selector matches Timeweb outbound signing)
- DMARC `p=none` (monitoring mode)

Do not change DNS during application rollout.

## Safe test send

1. Staging/local with copied env — never commit secrets.
2. Create a test user with allowed domain or corporate `@audiolad.ru`.
3. Trigger `/auth/forgot-password` for that account.
4. Confirm message arrives, link opens callback, password reset succeeds.
5. Check GoTrue/auth logs for SMTP errors (do not log tokens).

Rollback: restore previous SMTP env values and restart `supabase-auth`.

## Auth Hook (domain allowlist anti-bypass)

When enabling signup domain enforcement at infrastructure level, see:

`docs/email/gotrue-before-user-created-hook.example.md`

Requires:

```env
AUDIOLAD_AUTH_HOOK_SECRET=v1,whsec_<base64>
GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED=true
GOTRUE_HOOK_BEFORE_USER_CREATED_URI=https://audiolad.ru/api/auth/hooks/before-user-created
GOTRUE_HOOK_BEFORE_USER_CREATED_SECRETS=v1,whsec_<same-secret>
```

## AUTOCONFIRM remains true (for now)

`GOTRUE_MAILER_AUTOCONFIRM=true` stays enabled until product enables email confirmation UX.

Why:

- MVP signup should not block first login on undelivered mail while SMTP is fake/unverified.
- Application architecture (`email_contacts`, future confirmation state) already supports later switch.

### Future switch to confirmation

Separate approved step:

1. Configure real SMTP and verify delivery.
2. Set `GOTRUE_MAILER_AUTOCONFIRM=false`.
3. Add confirmation UX (pending state, resend, blocked login until verified).
4. Keep `before-user-created` hook enabled.
5. Monitor signup funnel and support volume.

## Secrets — never commit

- `GOTRUE_SMTP_PASS`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUDIOLAD_AUTH_HOOK_SECRET`
- Any mailbox passwords

## Application env (server only)

```env
AUDIOLAD_CORPORATE_EMAIL_DOMAINS=audiolad.ru
```

Optional sender overrides:

```env
AUDIOLAD_EMAIL_AUTH_SECURITY_FROM=
AUDIOLAD_EMAIL_AUTH_SECURITY_REPLY_TO=
```

Optional sender overrides:

```env
AUDIOLAD_EMAIL_AUTH_SECURITY_FROM=
AUDIOLAD_EMAIL_AUTH_SECURITY_REPLY_TO=
```

Application welcome email (sent after signup, not via GoTrue):

```env
AUDIOLAD_SMTP_HOST=smtp.timeweb.ru
AUDIOLAD_SMTP_PORT=465
AUDIOLAD_SMTP_USER=<primary-mailbox-login>
AUDIOLAD_SMTP_PASS=<mailbox-password>
AUDIOLAD_SMTP_SECURE=true
```

Author application emails (`author_application_submitted`, `author_application_approved`):

```env
# Required — dedicated authors mailbox credentials (no fallback to inbox@)
AUDIOLAD_SMTP_AUTHORS_USER=authors@audiolad.ru
AUDIOLAD_SMTP_AUTHORS_PASS=<authors-mailbox-password>

# Optional overrides; inherit primary SMTP when omitted
AUDIOLAD_SMTP_AUTHORS_HOST=smtp.timeweb.ru
AUDIOLAD_SMTP_AUTHORS_PORT=465
AUDIOLAD_SMTP_AUTHORS_SECURE=true
```

If `AUDIOLAD_SMTP_AUTHORS_USER` / `AUDIOLAD_SMTP_AUTHORS_PASS` are missing, author emails fail with `authors_smtp_not_configured` (approve is **not** rolled back; delivery row is marked `failed`).

### Author email smoke (after env + deploy)

1. Set production env with authors mailbox credentials (password entered manually by owner; never commit).
2. Send **one** controlled message to owner inbox with subject prefix `[SMOKE]`.
3. In Yandex Mail (or target client) verify:
   - display name: `АудиоЛад для авторов`
   - From address: `authors@audiolad.ru` (not `inbox@`)
   - Reply-To: `authors@audiolad.ru`
4. Do not smoke-test on real applicant addresses.

See `docs/email/brand-email-templates.md`.


## Production rollout checklist (separate command)

1. Apply DB migrations (`20260717150000`, `20260717151000`, `20260717152000`).
2. Deploy Next.js build with auth/profile changes.
3. Configure Timeweb SMTP in GoTrue env.
4. Optionally enable `before-user-created` hook.
5. Smoke-test signup, recovery, avatar upload, RLS.
6. Keep worker/cron disabled until outbox sender is implemented.

## Rollback

1. Revert GoTrue SMTP env to previous values.
2. Disable hook env flags.
3. Redeploy previous app release if needed.
4. Do **not** drop new email tables — they are forward-only foundation.
