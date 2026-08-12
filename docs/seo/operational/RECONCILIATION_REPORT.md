# SEO operational reconciliation report

## Scope
- Production-compatible registry: `81d1f64dc0d834297b364ac00426a104c68c832d` (`20260812-083852-81d1f64`)
- Historic metadata snapshot: `1a5694f9b2be97d2f5727f7c293dad73c8f63024` via `refs/stash`
- Studio worktree was not read or used.

## Result
- Articles reconstructed from registry: **55**
- New editorial operational entries published: **2**
- PUBLISHED entries: **57**
- Confirmed historical Article IDs: **40**
- `ID_PENDING_RECONCILIATION`: **15**
- Confirmed primary queries: **27**
- Confirmed frequencies: **7**
- Next Queue: **0** planned articles
- Practice Forecast: **12** practice keys, all with **0** remaining queue
  dependencies.

## Validation
- Registry slugs are unique and each operational article has one canonical production URL.
- Next Queue contains no published registry article.
- Historical publication/queue/forecast statuses were intentionally not copied: the snapshot is from 2026-07-29 and contains 39 published rows, while the production-compatible registry contains 55.
- Historical published audit entries remain `RECONSTRUCTED_FROM_PRODUCTION`,
  not `VALIDATE PASS`; both new divorce articles have explicit production-smoke
  `VALIDATE PASS`.

## Current divorce articles
No committed operational-master or semantic-map entry was found for “Ребёнок и
развод родителей”. It was therefore added as a new editorially approved
operational entry rather than a reconstruction:

- Article ID: `ART_new_20260812_rebenok-i-razvod-roditeley`
- Status: `PUBLISHED`
- Frequency: `UNVERIFIED`; research candidate `3015` is not a verified Master
  frequency.
- Hub: pending; there is no existing divorce/relationships Topic Hub in the
  production-compatible registry.
- Practice: `Развод: ясность и спокойствие`, `STRONG`; canonical public URL
  `https://audiolad.ru/practice/sergey-and-zoya/razvod-yasnost-i-spokoystvie`.
- Production smoke: `VALIDATE PASS` on release
  `20260812-142911-2588cc01` (BUILD_ID `is8Cnf-VY9yL9w-cRnOKw`).

The decision-support article was also absent from committed historical planning
artifacts and was added as a new editorial operational entry:

- Article ID: `ART_new_20260812_kak-reshitsya-na-razvod`
- Status: `PUBLISHED`
- Frequency: `UNVERIFIED`; no committed verified frequency source exists.
- Hub: pending; no new divorce/relationships Topic Hub was created.
- Practice: `Развод: ясность и спокойствие`, `DIRECT`; canonical public URL
  `https://audiolad.ru/practice/sergey-and-zoya/razvod-yasnost-i-spokoystvie`.
- Production smoke: `VALIDATE PASS` on release
  `20260812-145406-c7460ef6` (BUILD_ID `vTE5BgziLHEFskAhXaqAz`).

## Required later reconciliation
Reconcile the 15 pending IDs and any historical un-published candidates using only future committed planning artifacts. A new article may enter Next Queue only after an explicit plan record with primary query, frequency evidence, hub, practice mapping, and stable Article ID is committed.
