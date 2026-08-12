# SEO operational reconciliation report

## Scope
- Production-compatible registry: `81d1f64dc0d834297b364ac00426a104c68c832d` (`20260812-083852-81d1f64`)
- Historic metadata snapshot: `1a5694f9b2be97d2f5727f7c293dad73c8f63024` via `refs/stash`
- Studio worktree was not read or used.

## Result
- Articles reconstructed from registry: **55**
- PUBLISHED entries: **55**
- Confirmed historical Article IDs: **40**
- `ID_PENDING_RECONCILIATION`: **15**
- Confirmed primary queries: **27**
- Confirmed frequencies: **7**
- Next Queue: **0**
- Practice Forecast: **11** practice keys, all with **0** remaining queue dependencies.

## Validation
- Registry slugs are unique and each operational article has one canonical production URL.
- Next Queue is empty, so it contains no published registry article.
- Historical publication/queue/forecast statuses were intentionally not copied: the snapshot is from 2026-07-29 and contains 39 published rows, while the production-compatible registry contains 55.
- Every audit entry is `RECONSTRUCTED_FROM_PRODUCTION`, not `VALIDATE PASS`.

## Current divorce article
No committed operational-master or semantic-map entry was found for “Ребёнок и развод родителей”. It was not added to Next Queue and no Article ID was generated.

## Required later reconciliation
Reconcile the 15 pending IDs and any historical un-published candidates using only future committed planning artifacts. A new article may enter Next Queue only after an explicit plan record with primary query, frequency evidence, hub, practice mapping, and stable Article ID is committed.
