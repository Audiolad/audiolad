# Author Terms versions runbook

## Model

- Approved document text lives in `src/lib/author-terms/approved-content.ts`.
- Metadata + `is_current` live in `public.author_terms_versions`.
- Acceptances live in `public.author_terms_acceptances` (append-only, unique per author+version).
- Partial unique index enforces at most one `is_current = true`.

## Add a new edition

1. Extract the approved DOCX into a new content module (do not edit old legal wording in place).
2. Compute SHA-256 of the canonical UTF-8 text (same normalization as the generator).
3. Insert a new `author_terms_versions` row with a new UUID, `version`, `content_hash`, `published_at`, `effective_at`.
4. Set previous row `is_current = false`, new row `is_current = true` in one transaction.
5. Deploy application code that serves the new text module and matches the hash.
6. Authors who accepted only the previous version must accept again (`acceptedCurrent` becomes false).

## Never

- Mutate text of an already accepted edition without a new version row.
- Backfill `author_terms_acceptances` without a real user action.
- Allow two `is_current = true` rows.

## Notes

The first seeded edition is official version `1.0` (`published_at` / `effective_at` = `2026-07-28T00:00:00+03:00`). The current edition in application code is official version `1.1` (`published_at` / `effective_at` = `2026-09-02T00:00:00+03:00`). UI shows the marketing version label, not the content hash. Applying `20260914120000_author_terms_v1_1.sql` is required together with the code deploy so that `author_terms_versions.is_current` matches the served text. Production apply remains a separate decision.
