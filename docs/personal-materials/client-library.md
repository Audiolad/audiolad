# Personal materials client library

Routes:

- `/my-materials` — list of claimed materials
- `/my-materials/[id]` — detail player and content
- `GET /api/my-materials`
- `GET /api/my-materials/[id]`
- `GET /api/my-materials/[id]/audio`
- `GET|PUT /api/my-materials/[id]/progress`

## Ownership

Access is based on `claimed_by_user_id = auth.uid()`.

After claim:

- `guest_access_enabled = false`
- guest `/d/[token]` stops working
- owner library continues via session auth (no guest token)

### Revoke / rotate

- **Revoke** disables guest link only; claimed owner keeps access.
- **Rotate** invalidates old guest token; claimed owner keeps access.
- Soft **delete** removes material from owner list/detail (`not_found`).

## DTOs

List and detail never return:

- `access_token_hash`
- storage paths
- signed URLs (audio endpoint only)
- guest tokens

Detail includes `returnUrl` / `returnButtonLabel` for chat CTA.

## Audio

`GET /api/my-materials/[id]/audio` issues a private signed URL (TTL 900s).

Ownership checked via `get_claimed_personal_material` before signing.

## Progress

Server table `personal_material_progress` via RPCs.

Completed when:

```text
position >= max(duration - 15, ceil(duration * 0.95))
```

Upsert never regresses position or completed flag.

Client player:

- throttle ~12s
- force save on pause / seek / ended / visibilitychange / pagehide
- silent autosave failures

### Guest → account migration

On first detail open after claim:

1. read server progress
2. read local `audiolad:personal-material-progress:{materialId}`
3. take max position / completed OR
4. upsert to server
5. clear local key

## Navigation

- Desktop sidebar: **Мои материалы**
- Profile quick links (mobile)
- BottomNav stays 5 tabs (no sixth icon)

## Migration

`supabase/migrations/20260720190000_personal_materials_owner_library.sql` — additive owner RPC v2.

Not applied to production yet.

## Tests

```bash
export AUDIOLAD_TEST_DATABASE=1 AUDIOLAD_PERSONAL_MATERIALS_P1_TEST=1 AUDIOLAD_PERSONAL_MATERIALS_API_TEST=1
node scripts/stage-p5-personal-materials-client-library-unit.mjs
```
