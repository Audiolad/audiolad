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

`yandex-webmaster-2026-08-29.xlsx` is the production Yandex Webmaster export
that failed preview with a duplicate normalized query. It is query-level only:
Query, Dates range, Impressions, Clicks, CTR %, Avg. position, Avg. click
position, and positional breakdown columns. It has no URL column and no
credentials. 2 701 source rows collapse to 2 681 normalized queries (19 groups)
and still total 26 549 impressions and 948 clicks. The source row «шум воды»
is 2 219 impressions and 55 clicks; «шум воды.» adds 11 impressions, so the
stored metric is 2 230 / 55. «музыка для отелей и ресторанов» and «шум фена»
have no punctuation twin.
