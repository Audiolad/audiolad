# GoTrue recovery email template rollout

This document describes how to apply the branded Russian recovery template for self-hosted GoTrue **v2.189.0** on АудиоЛад production.

Do **not** apply without an explicit rollout command. No secrets in this file.

Shared layout documentation: `docs/email/brand-email-templates.md`.

## Template source in repository

| File | Purpose |
|------|---------|
| `src/lib/email/templates/brand-layout.ts` | Shared design source |
| `src/lib/email/templates/recovery.ts` | Recovery content + GoTrue export |
| `supabase/templates/recovery.html` | Generated HTML body (Go template syntax) |

Regenerate before rollout:

```bash
npx tsx scripts/build-gotrue-email-templates.ts
```

## GoTrue variables (v2.189.0)

| Variable | Usage |
|----------|--------|
| `{{ .TokenHash }}` | Recovery bearer used only in the first-party URL fragment |
| `{{ .RedirectTo }}` | GoTrue allow-list-validated first-party `/auth/recovery` URL |
| `{{ .SiteURL }}` | `https://audiolad.ru` |
| `{{ .Email }}` | Recipient (avoid exposing in UI copy) |

Subject env var:

```env
GOTRUE_MAILER_SUBJECTS_RECOVERY=Восстановление пароля в АудиоЛаде
```

Template URL env var:

```env
GOTRUE_MAILER_TEMPLATES_RECOVERY=http://templates-server/recovery.html
```

GoTrue fetches templates over HTTP from inside the Docker network ([Supabase self-hosting docs](https://supabase.com/docs/guides/self-hosting/custom-email-templates)).

## docker-compose addition (example)

Add to `/opt/supabase/docker/docker-compose.yml`:

```yaml
  auth:
    depends_on:
      templates-server:
        condition: service_started
    environment:
      GOTRUE_MAILER_TEMPLATES_RECOVERY: "http://templates-server/recovery.html"
      GOTRUE_MAILER_SUBJECTS_RECOVERY: "Восстановление пароля в АудиоЛаде"

  templates-server:
    image: caddy:2-alpine
    command: ["caddy", "file-server", "-r", "/templates", "--listen", ":80"]
    volumes:
      - ./volumes/templates:/templates
    restart: unless-stopped
```

Copy `supabase/templates/recovery.html` from this repo to:

```text
/opt/supabase/docker/volumes/templates/recovery.html
```

## Recommended companion env (separate approval)

```env
GOTRUE_MAILER_EXTERNAL_HOSTS=audiolad.ru
SMTP_ADMIN_EMAIL=no-reply@audiolad.ru
```

**Blocker check before switching sender:** verify `no-reply@audiolad.ru` exists as a Timeweb alias and relay is allowed. If not, keep `inbox@audiolad.ru`.

## Recovery redirect chain (app)

After this app deploy, `resetPasswordForEmail` uses:

```text
redirectTo=https://audiolad.ru/auth/recovery?next=<safe-ultimate>
```

The recovery template must use exactly:

```html
{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=recovery
```

It must not use `{{ .ConfirmationURL }}` as a link or fallback. GoTrue
v2.189.0 was verified to expose both `TokenHash` and allow-list-validated
`RedirectTo`. The token is deliberately in the URL fragment: it is not sent
to Audiolad, Nginx, application access logs or Referer headers. The app clears
the fragment, stores it briefly in an HttpOnly staging cookie, and only
`POST` after the user presses «Продолжить» calls
`verifyOtp({ token_hash, type: "recovery" })`.

Ensure `GOTRUE_URI_ALLOW_LIST` includes `https://audiolad.ru/auth/recovery`
(or the already approved `https://audiolad.ru/**`). This is a separate
production configuration check; do not change it as part of app deployment.
The existing production wildcard covers this route, so no GoTrue allow-list
change is expected if it remains active.

## Required application secret before a future deploy

Before deploying this recovery flow, separately set a strong random
`PASSWORD_RECOVERY_INTENT_SECRET` in the **application** production
environment. It signs the short-lived recovery-intent cookie and is required:
the app fails closed when it is absent. Do not reuse `MAX_BOT_TOKEN`, a public
Supabase key, or any other secret. Do not commit the value. This is not a
GoTrue setting and does not require a GoTrue configuration change.

## Rollout steps (controlled)

1. Backup `/opt/supabase/docker/.env` and `docker-compose.yml`.
2. Run `npx tsx scripts/build-gotrue-email-templates.ts`.
3. Copy `recovery.html` into `volumes/templates/`.
4. Confirm `templates-server` serves the replaced file. GoTrue fetches this
   template by URL for each send; a GoTrue restart is not normally required
   for a content-only template replacement. Restarting either service is an
   infrastructure operation and requires separate approval.
5. If template-server caching prevents the new file being served, reload only
   that service under a separately approved production change.
6. Health: `docker ps`, `curl -fsS http://127.0.0.1:3000/api/health/build`
7. One recovery E2E on an approved test mailbox (Yandex/Mail.ru).
8. Check `docker logs supabase-auth` for SMTP/template fetch errors (no tokens).

## Rollback

1. Remove `GOTRUE_MAILER_TEMPLATES_RECOVERY` / `GOTRUE_MAILER_SUBJECTS_RECOVERY` from auth env.
2. `docker compose up -d --force-recreate --no-deps auth`
3. GoTrue falls back to built-in English template.

## Status

| Item | Production state |
|------|------------------|
| Template in repo | Prepared |
| templates-server | **NOT DEPLOYED** |
| Template applied in GoTrue | **NOT APPLIED** |
