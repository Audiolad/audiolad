# GoTrue `before-user-created` Auth Hook

This project uses GoTrue **v2.189.0+**, which supports the [`before-user-created`](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) hook.

The hook endpoint validates signup emails against the same domain policy as the signup server action.

## Endpoint

```
POST https://audiolad.ru/api/auth/hooks/before-user-created
```

Implementation: `src/app/api/auth/hooks/before-user-created/route.ts`

## Enable in self-hosted Supabase (do not apply on production without approval)

1. Generate a Standard Webhooks secret, for example:

   ```bash
   openssl rand -base64 32
   ```

2. Set the application secret (not committed):

   ```env
   AUDIOLAD_AUTH_HOOK_SECRET=v1,whsec_<base64-secret>
   ```

3. Add to `/opt/supabase/docker/.env` (example only — do not commit):

   ```env
   GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED=true
   GOTRUE_HOOK_BEFORE_USER_CREATED_URI=https://audiolad.ru/api/auth/hooks/before-user-created
   GOTRUE_HOOK_BEFORE_USER_CREATED_SECRETS=v1,whsec_<same-base64-secret>
   ```

4. Restart the `supabase-auth` container after updating env and redeploying the Next.js app.

5. Verify with a blocked domain:

   ```bash
   curl -s -X POST 'https://<supabase-url>/auth/v1/signup' \
     -H 'apikey: <anon-key>' \
     -H 'Content-Type: application/json' \
     -d '{"email":"test@gmail.com","password":"TestPass123"}'
   ```

   Expected: signup rejected when hook is enabled.

6. Verify allowed domain still works for new registration.

## Domain policy source of truth

Personal domains: `config/email-domain-policy.json`

Corporate domains (server only): `AUDIOLAD_CORPORATE_EMAIL_DOMAINS=audiolad.ru`

The hook and server action both call `validateEmailForRegistrationServer()`.

Run `node scripts/email-policy-unit.mjs` after changing the JSON policy.

## Rollback

Set:

```env
GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED=false
```

Restart `supabase-auth`. Signup will rely on server action validation only until the hook is re-enabled.

## Notes

- Existing users can still sign in with any email already in `auth.users`.
- The hook applies only to **new user creation**.
- Do not enable without `AUDIOLAD_AUTH_HOOK_SECRET` configured in the Next.js app.
