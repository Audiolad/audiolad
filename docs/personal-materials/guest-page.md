# Personal material guest page

Route: `/d/[token]`

Standalone guest experience without listener shell, catalog, or global mini player.

## Metadata flow

Server component loads material via `findGuestMaterialByRawToken()` — no client-side DB access.

Unavailable states (invalid, expired, revoked, claimed, deleted, guest access disabled) return HTTP 404 with neutral `PersonalMaterialUnavailable` UI. No reason leakage.

Generic page metadata:

- title: «Персональный аудиоматериал — АудиоЛад»
- `robots: { index: false, follow: false, noarchive: true }`
- client first name is **not** included in metadata

## Privacy headers

Applied via `next.config.ts` for `/d/:path*`:

- `Cache-Control: private, no-store`
- `Referrer-Policy: no-referrer`
- `X-Robots-Tag: noindex, nofollow, noarchive`

`/d/` is in `robots.ts` disallow list and is not in sitemap.

## Audio delivery

`PersonalMaterialAudioPlayer` fetches signed URL lazily on first play:

- `GET /api/d/[token]/audio`
- `cache: no-store`
- signed URL kept in memory only
- refresh on expiry with position restore
- no autoplay
- 429 respects `Retry-After`

## Local progress

Key: `audiolad:personal-material-progress:{materialId}`

Stores `{ positionSeconds, durationSeconds?, updatedAt }` only. Never stores token, signed URL, or client metadata.

## Save CTA and claim

### Unauthenticated

1. `POST /api/d/[token]/claim-context` sets signed HttpOnly cookie `audiolad_pm_claim` (materialId only)
2. Redirect to `/auth/sign-up?next=/personal-materials/claim`
3. After auth, `/personal-materials/claim` verifies cookie and calls `claim_personal_material`
4. Redirect to `/my-materials/[id]`

Raw token is never placed in query, localStorage, or analytics.

### Authenticated

`POST /api/d/[token]/claim` calls RPC directly and shows success CTA.

## Return-to-chat CTA

Reuses `PersonalMaterialReturnChatCta` below save CTA. Secondary styling, `target="_blank"`, `rel="noopener noreferrer"`.

## Mobile

Single column, 16px padding, full-width CTAs, `break-words` on long text. Verified layouts: 320, 375, 390 widths.

## Current limitations

- `/my-materials/[id]` is a minimal post-claim confirmation (full owner library UI is next phase)
- No PDF viewer, playback analytics, or email delivery
- Production DB/bucket not deployed yet

## Tests

```bash
export AUDIOLAD_TEST_DATABASE=1 AUDIOLAD_PERSONAL_MATERIALS_P1_TEST=1 AUDIOLAD_PERSONAL_MATERIALS_API_TEST=1
node scripts/stage-p4-personal-materials-guest-page-unit.mjs
node scripts/stage-p4-personal-materials-guest-page-module-unit.mjs
```

Also run P1/P2/P3 personal materials tests when validating full stack.
