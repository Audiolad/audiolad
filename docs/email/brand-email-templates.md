# Brand email templates

Shared HTML layout for all АудиоЛад transactional emails.

## Source of truth

| File | Purpose |
|------|---------|
| `src/lib/email/templates/brand-layout.ts` | Shared shell, styles, logo, button, footer, dividers |
| `src/lib/email/templates/welcome.ts` | Welcome email content |
| `src/lib/email/templates/recovery.ts` | Password recovery content |
| `src/lib/email/templates/renderer.ts` | Application template renderer |

## Where to change the common design

Edit **`src/lib/email/templates/brand-layout.ts`** when you need to update design for all branded emails at once:

- colors and typography
- card shell and spacing
- logo block
- CTA button styling
- footer typography
- responsive `@media` rules

Then:

1. Regenerate GoTrue recovery template:

```bash
npx tsx scripts/build-gotrue-email-templates.ts
```

2. Deploy updated `supabase/templates/recovery.html` to the GoTrue templates-server (see `docs/email/gotrue-recovery-template-rollout.md`).

3. Redeploy the Next.js app so application-sent welcome emails pick up the same layout changes.

## Welcome email

- Sent from `src/app/auth/sign-up/actions.ts` after successful registration only.
- Renderer: `welcome` template key.
- Subject: `Добро пожаловать в АудиоЛад 🎉`
- SMTP env (server-only):

```env
AUDIOLAD_SMTP_HOST=smtp.timeweb.ru
AUDIOLAD_SMTP_PORT=465
AUDIOLAD_SMTP_USER=<mailbox-login>
AUDIOLAD_SMTP_PASS=<mailbox-password>
AUDIOLAD_SMTP_SECURE=true
```

If SMTP is not configured, signup still succeeds; the failure is logged as `signup_welcome_email_failed`.

Site links use `getAppOrigin()` (`NEXT_PUBLIC_APP_URL` with fallback `https://audiolad.ru`).

## Recovery email

- Still sent by GoTrue via `supabase/templates/recovery.html`.
- Generated from the same shared layout; do not edit `recovery.html` manually.
- Password reset flow in the app is unchanged.

## Tests

```bash
node scripts/email-template-unit.mjs
npx tsx scripts/build-gotrue-email-templates.ts
node scripts/email-policy-unit.mjs
```
