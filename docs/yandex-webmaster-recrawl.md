# Yandex Webmaster Recrawl — one-time production setup

Automatic priority recrawl for **public listed product pages** only
(`/practice/{author}/{product}`). It is independent of IndexNow and must never
block product publication.

Do **not** paste the OAuth token into GitHub issues, PRs, or chat. Enter the
secret only in the production environment.

## 1. Yandex OAuth application

Create or reuse a Yandex OAuth application with Webmaster API access.

## 2. OAuth token

Obtain an OAuth token for that application. Treat it as a secret.

## 3. User id

```http
GET https://api.webmaster.yandex.net/v4/user
Authorization: OAuth <token>
Accept: application/json
```

Use the returned user id as `YANDEX_WEBMASTER_USER_ID`.

## 4. Host id

```http
GET https://api.webmaster.yandex.net/v4/user/{user-id}/hosts
Authorization: OAuth <token>
Accept: application/json
```

Find the exact host for `audiolad.ru` and copy the `host_id` the API returns.
Do not guess the format.

## 5. Production env (names only)

Add on production later, then restart/redeploy through the standard process:

```text
YANDEX_WEBMASTER_RECRAWL_ENABLED=true
YANDEX_WEBMASTER_OAUTH_TOKEN=<secret, enter only on the server>
YANDEX_WEBMASTER_USER_ID=<id from GET /v4/user>
YANDEX_WEBMASTER_HOST_ID=<exact host_id from GET /v4/user/{id}/hosts>
```

Recrawl is allowed only when all of these are true:

- `YANDEX_WEBMASTER_RECRAWL_ENABLED=true`
- token, user id, and host id are present
- public SEO indexing is allowed
- app origin is production `https://audiolad.ru`

Preview, local, and test environments do not send real Webmaster requests
without an injected mock.

## 6. What this automation does

Publish and edit paths enqueue `https://audiolad.ru/...` into
`search_recrawl_queue`. They do not call Webmaster inline.

The queue is drained by a separate PM2 process, not by public page loads.
See the worker section below.

Before POST, the worker:

1. loads `GET /v4/user/{user-id}/hosts`;
2. keeps the host only when `ascii_host_url` or `unicode_host_url` is exactly
   `https://audiolad.ru/` (verified, one match) and its `host_id` equals
   `YANDEX_WEBMASTER_HOST_ID`;
3. otherwise does not send (fail closed). Another site's host id is never used;
4. checks GET `/recrawl/quota` on that host;
5. skips POST when the quota check succeeded and `quota_remainder <= 0`;
6. still POSTs when the quota check timed out or failed on the network;
7. POSTs `{ "url": "https://audiolad.ru/..." }` to that host's `/recrawl/queue`.

URLs whose origin is not exactly `https://audiolad.ru` are rejected and not sent.
`www`, preview hosts, and any other site are rejected.

Official documented success for the POST is **202 ACCEPTED** only.
Unexpected 200/201 are not treated as accepted.

Queue outcomes:

- `202` → `delivered`
- `409 URL_ALREADY_ADDED` → `delivered` (already added)
- `429 QUOTA_EXCEEDED` or remainder `0` → retry next day
- `5xx`, including `504`, timeout, network → exponential backoff from 5 minutes,
  capped at 6 hours, then `dead` after 20 attempts
- `400 INVALID_URL`, `401`, `403 INVALID_USER_ID`, `404 HOST_NOT_VERIFIED`,
  host mismatch → `dead` (no send to another host)
- host list timeout → retry with backoff, no POST

Yandex is enqueued for listed product publish, admin approve-and-publish,
scheduled first go-live, SEO/content/slug edits, unlisted→listed, public
playlist publish/update, and public author page updates. IndexNow still sends
immediately and is enqueued only when that send fails. `/listens` and SEO
articles stay unwired. The migration does not resend older URLs.

Log lines start with an ISO timestamp. If Yandex has no successful delivery for
more than 24 hours while rows are pending, the worker logs
`alert_no_success` and the admin overview shows a banner.

## 7. Production worker

Do not start this from a deploy script in the same change that only reviews
the code. After the migration is applied and production approval is given:

```text
pm2 start deploy/search-recrawl-worker.ecosystem.config.cjs
pm2 save
pm2 describe audiolad-search-recrawl-worker
```

The process is long-lived (`autorestart: true`, no `cron_restart`). It loads
`.env.production` from `/var/www/audiolad-deploy/current` and sleeps about
five minutes between cycles (`SEARCH_RECRAWL_INTERVAL_MS`, minimum 60 seconds).
Secrets stay in the env file, not in the ecosystem file and not in logs.

Until that process is running, new Yandex rows wait in `search_recrawl_queue`.
Public pages still stamp due `published_at`, but they no longer call Webmaster
or IndexNow for the scheduled-publish outbox.

## 8. Rollback

Application rollback does not roll back the database. To remove only this
queue after stopping the worker:

```sql
DROP FUNCTION IF EXISTS public.search_recrawl_yandex_health();
DROP FUNCTION IF EXISTS public.reject_search_recrawl(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.dead_letter_search_recrawl(uuid, uuid, integer, text, integer);
DROP FUNCTION IF EXISTS public.retry_search_recrawl(uuid, uuid, integer, text, integer, timestamptz);
DROP FUNCTION IF EXISTS public.complete_search_recrawl(uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.take_due_search_recrawl(integer);
DROP FUNCTION IF EXISTS public.enqueue_search_recrawl(text, text, text, text, uuid);
DROP TABLE IF EXISTS public.search_recrawl_queue;
```

Then stop the process: `pm2 delete audiolad-search-recrawl-worker` and
`pm2 save`. Do that only with a separate production approval.
