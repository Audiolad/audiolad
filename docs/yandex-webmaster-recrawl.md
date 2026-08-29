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

After a public listed product is published or republished, or after a
search-significant content/SEO/slug change, the app:

1. checks GET `/recrawl/quota`;
2. skips POST if `quota_remainder <= 0`;
3. otherwise POSTs `{ "url": "https://audiolad.ru/practice/..." }` to
   `/recrawl/queue`.

Official documented success for the POST is **202 ACCEPTED** only.
Unexpected 200/201 are not treated as accepted.

Idempotent and terminal API outcomes (no retry):

- `409 URL_ALREADY_ADDED` → `already_queued`
- `429 QUOTA_EXCEEDED` → `quota_exhausted`
- `400 INVALID_URL` → `failed`
- `401` → `auth_failed`
- `403 INVALID_USER_ID` → `invalid_user_id`
- `404 HOST_NOT_VERIFIED` → `host_not_verified`

At most one retry is used for true transient `5xx` / network / timeout.
Quota-check auth and host-config errors stay distinct and are not collapsed
into a generic `quota_check_failed`. Publication is fail-open.

This automation is **not** wired to `/listens` or SEO articles.
