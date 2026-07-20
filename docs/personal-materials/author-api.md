# Personal Materials — Author API

Backend vertical slice for author-managed personal diagnostics (personal materials).
No React UI in this phase — server routes and helpers only.

## Scope

Implemented:

- Author CRUD lifecycle for drafts (create, read, update, soft-delete)
- MP3 upload/replace/delete for draft materials
- Activation with one-time access URL
- Token rotation and revoke
- Guest metadata lookup by secret token
- Short-lived signed audio URL for guests
- Rate limiting on guest endpoints
- Safe DTOs (no storage paths, no token hash, no raw token persistence)

Not implemented yet:

- Author dashboard React UI
- Guest page `/d/[token]`
- PDF upload
- Claim flow from guest page
- Owner `/my-materials` UI
- Production migration deploy

## Authentication and membership

All `/api/author/personal-materials/*` routes require an authenticated Supabase session.

Membership is verified via `author_members` (roles `owner` or `editor`) for the material's author workspace. Non-members receive `403 forbidden`. Unauthenticated requests receive `401 unauthorized`.

## Routes

| Route | Method | Auth | Description |
| ----- | ------ | ---- | ----------- |
| `/api/author/personal-materials` | GET | yes | List materials for `?author_id=` |
| `/api/author/personal-materials` | POST | yes | Create draft |
| `/api/author/personal-materials/[id]` | GET | yes | Read one material (+ optional author notes) |
| `/api/author/personal-materials/[id]` | PATCH | yes | Update draft fields |
| `/api/author/personal-materials/[id]` | DELETE | yes | Soft delete + storage cleanup |
| `/api/author/personal-materials/[id]/audio` | POST | yes | Upload/replace MP3 (draft only) |
| `/api/author/personal-materials/[id]/audio` | DELETE | yes | Remove draft audio |
| `/api/author/personal-materials/[id]/activate` | POST | yes | Activate draft, return one-time URL |
| `/api/author/personal-materials/[id]/rotate` | POST | yes | Rotate access token |
| `/api/author/personal-materials/[id]/revoke` | POST | yes | Revoke guest access |
| `/api/d/[token]` | GET | no | Guest metadata (neutral 404 if unavailable) |
| `/api/d/[token]/audio` | GET | no | Short-lived signed audio URL JSON |

## Safe author DTO

```ts
{
  id: string
  authorId: string
  materialType: string
  title: string | null
  clientFirstName: string
  clientLastName: string
  materialDate: string
  description: string | null
  personalRecommendation: string | null
  status: "draft" | "active" | "revoked" | "deleted"
  guestAccessEnabled: boolean
  claimed: boolean
  hasAudio: boolean
  hasPdf: boolean
  durationSeconds: number | null
  audioOriginalFilename: string | null
  pdfOriginalFilename: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  authorNotes?: string | null  // GET /[id] only
}
```

Deleted materials are excluded from list responses.

## Safe guest DTO

Public metadata intentionally omits client last name, storage paths, token hash, author notes, and internal IDs beyond author public profile.

## Upload lifecycle

1. Author uploads MP3 via `POST .../audio` (`multipart/form-data`, field `file`).
2. Server validates MIME (`audio/mpeg`), size (≤ 50 MiB), and MP3 duration.
3. Object is written to private bucket `personal-materials` using service role.
4. Storage path is `{authorId}/{materialId}/audio/{sanitized-filename}`.
5. On replace: upload new → update DB → delete old object.
6. On DB failure after upload: new object is removed.
7. Draft audio can be cleared via `DELETE .../audio` (RPC `clear_personal_material_draft_audio` + storage delete).

## Token lifecycle

- Drafts have no access token.
- On activation/rotation: server generates 256-bit random token, stores **SHA-256 hash only** in DB.
- Raw token is returned once in `accessUrl`: `https://audiolad.ru/d/{rawToken}`.
- Responses for activate/rotate use `Cache-Control: private, no-store`.
- Server cannot recover raw token from DB after response.
- Rotation invalidates the previous token immediately.
- Revoke disables guest access; claimed owner access remains per P1 foundation rules.

## Guest lookup

`GET /api/d/[token]` hashes the token server-side and loads material via service role.

Available only when material is `active`, guest access enabled, not expired, not claimed, not revoked, not deleted.

Invalid states return neutral:

```json
{ "error": "MATERIAL_NOT_AVAILABLE" }
```

HTTP 404 with privacy headers:

- `Cache-Control: private, no-store`
- `Referrer-Policy: no-referrer`
- `X-Robots-Tag: noindex, nofollow, noarchive`

## Signed audio URL

`GET /api/d/[token]/audio` re-validates token availability, then returns:

```json
{
  "url": "https://...",
  "expiresAt": "2026-07-20T18:00:00.000Z"
}
```

TTL: **900 seconds** (15 minutes), from `PERSONAL_MATERIAL_LIMITS.signedUrlTtlSeconds`.

Bucket remains private; only short-lived signed URLs are exposed.

## Rate limiting

Guest endpoints use in-memory rate limits keyed by **hashed client IP + route**, never raw token:

- Metadata: 60 req/min/IP
- Audio: 30 req/min/IP

429 responses include `Retry-After: 60`.

## Soft delete storage policy

`DELETE /api/author/personal-materials/[id]` calls soft-delete RPC, then **immediately removes** audio/PDF objects from private storage via service role. Orphan cleanup for failed deletes is best-effort logged server-side.

## Logging and analytics

- Guest route logging uses `redactTokenFromPath()` — tokens appear as `[redacted:{sha256-prefix}]`.
- Raw tokens must not appear in application logs, Sentry payloads, or analytics events.
- API routes do not invoke Yandex.Metrica.

### Known production logging risk

Nginx access logs may record full request paths including `/api/d/{token}` if guest URLs are routed through Nginx to Next.js. **Do not change production Nginx in this phase.** Mitigation options for a future ops task:

- Log `$uri` with a `map` rewrite for `/api/d/` prefix
- Or terminate guest API on a separate log format

## Migrations

| File | Purpose |
| ---- | ------- |
| `20260715143000_personal_materials_foundation.sql` | P1 tables, RPC, RLS, bucket |
| `20260720143000_personal_materials_clear_draft_audio.sql` | Draft audio metadata clear RPC |

Production DB does **not** include these migrations yet.

## Tests

```bash
export AUDIOLAD_TEST_DATABASE=1
export AUDIOLAD_PERSONAL_MATERIALS_P1_TEST=1
node scripts/personal-materials-p1-setup-test-db.mjs

node scripts/stage-p1-personal-materials-unit.mjs
node scripts/stage-p1-personal-materials-db.mjs

export AUDIOLAD_PERSONAL_MATERIALS_API_TEST=1
node scripts/stage-p2-personal-materials-api-unit.mjs
node scripts/stage-p2-personal-materials-api-db.mjs
```

Tests use isolated database `audiolad_personal_materials_test` only.

## Server module layout

```
src/lib/personal-materials/server/
  auth.ts          — membership + draft guards
  repository.ts    — RPC wrappers, list/get
  uploads.ts       — MP3 upload/replace/delete
  delivery.ts      — guest lookup, signed URLs
  dto.ts           — safe response mappers
  errors.ts        — API error normalization
  validation.ts    — request body parsing
  rate-limit.ts    — guest endpoint throttling
```
