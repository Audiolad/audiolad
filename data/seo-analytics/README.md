# SEO analytics control fixture

`yandex-webmaster-control.xlsx` is derived from the control values published in
GitHub issue #735. It is not a live Yandex Webmaster export.

The file uses the issue's query-level columns (`Query`, `Dates range`,
`Impressions`, `Clicks`, `CTR %`, `Avg. position`) plus an optional position
breakdown column. It contains no URL column. The three named queries use the
published impressions, clicks, and average positions. The other rows exist only
so the workbook totals match the issue:

- 2 701 queries
- 26 549 impressions
- 948 clicks
- 21 579 impressions with average position > 3 and <= 10
- 3 732 impressions with average position > 10 and <= 20
- 14 119 impressions on queries with 0 clicks

Period: 2026-08-29 — 2026-09-29.
