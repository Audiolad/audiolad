# SEO operational reconciliation report

## Scope
- Production-compatible registry: `81d1f64dc0d834297b364ac00426a104c68c832d` (`20260812-083852-81d1f64`)
- Historic metadata snapshot: `1a5694f9b2be97d2f5727f7c293dad73c8f63024` via `refs/stash`
- Studio worktree was not read or used.

## Result
- Articles reconstructed from registry: **55**
- New planned operational entries: **1**
- PUBLISHED entries: **55**
- Confirmed historical Article IDs: **40**
- `ID_PENDING_RECONCILIATION`: **15**
- Confirmed primary queries: **27**
- Confirmed frequencies: **7**
- Next Queue: **1** planned article
- Practice Forecast: **12** practice keys; one published practice supports one
  planned article.

## Validation
- Registry slugs are unique and each operational article has one canonical production URL.
- Next Queue contains only the planned article and no published registry article.
- Historical publication/queue/forecast statuses were intentionally not copied: the snapshot is from 2026-07-29 and contains 39 published rows, while the production-compatible registry contains 55.
- Published audit entries are `RECONSTRUCTED_FROM_PRODUCTION`, not
  `VALIDATE PASS`; the new planned entry is explicitly `PLANNED`.

## Current divorce article
No committed operational-master or semantic-map entry was found for “Ребёнок и
развод родителей”. It was therefore added as a new editorially approved
operational entry rather than a reconstruction:

- Article ID: `ART_new_20260812_rebenok-i-razvod-roditeley`
- Status: `PLANNED`
- Frequency: `UNVERIFIED`; research candidate `3015` is not a verified Master
  frequency.
- Hub: pending; there is no existing divorce/relationships Topic Hub in the
  production-compatible registry.
- Practice: `Развод: ясность и спокойствие`, `STRONG`; the linked public
  practice is already live and is not treated as awaiting publication.

## Required later reconciliation
Reconcile the 15 pending IDs and any historical un-published candidates using only future committed planning artifacts. A new article may enter Next Queue only after an explicit plan record with primary query, frequency evidence, hub, practice mapping, and stable Article ID is committed.
