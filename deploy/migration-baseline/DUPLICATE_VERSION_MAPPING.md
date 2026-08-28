# Duplicate migration version mapping

Supabase CLI and `supabase_migrations.schema_migrations` key history by the
timestamp prefix of each filename (`YYYYMMDDHHMMSS`). Several Audiolad files
originally shared a prefix even though each file has a distinct schema effect.

SQL content is unchanged. Only filenames were renamed so that **1 file = 1 version**.
Chronological order versus neighboring files is preserved.

## Mapping

| Old filename | New filename | Action |
|---|---|---|
| `20260716180000_author_applications_wants_training.sql` | `20260716180000_author_applications_wants_training.sql` | KEEP |
| `20260716180000_per_track_covers.sql` | `20260716181000_per_track_covers.sql` | RENAME |
| `20260716180000_promotion_campaigns.sql` | `20260716182000_promotion_campaigns.sql` | RENAME |
| `20260716190000_author_applications_interested_in_school.sql` | `20260716190000_author_applications_interested_in_school.sql` | KEEP |
| `20260716190000_claim_promo_practice_by_id.sql` | `20260716191000_claim_promo_practice_by_id.sql` | RENAME |
| `20260728120000_author_payout_profiles.sql` | `20260728120000_author_payout_profiles.sql` | KEEP |
| `20260728120000_practice_content_sale_lock.sql` | `20260728121000_practice_content_sale_lock.sql` | RENAME |

## Why these new timestamps

The kept file stays on the original stamp (it is the first sibling in the
collision). Renamed siblings take the next free `+10m` / `+20m` slots so they
remain after the kept file and before the next unrelated neighbor.

- `20260716180000` (kept) → `20260716181000` → `20260716182000` → then `20260716190000`
- `20260716190000` (kept) → `20260716191000` → then `20260716200000`
- `20260728120000` (kept) → `20260728121000` → then `20260728140000`

Do not invent a parallel history table. After a one-time baseline, ordinary
deploy applies pending files by these unique versions.

Catalog visibility `20260830120100`–`20400` is a later **forward restamp**
(not a same-day duplicate prefix). See
`deploy/migration-baseline/CATALOG_VISIBILITY_FORWARD_REVERSION.md`.
