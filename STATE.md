# STATE – admin-dynamics-dates (t1373u)
Sergey t1373u (2026-11-11): «Статистика → Обзор → Динамика» – a date under every day/point, not only the first and last.
Done: src/lib/admin/timeseries-axis.ts (layout + «dd.MM» labels, «dd.MM.yy» across years) + AdminAnalyticsTimeseriesChart renders tick + date under each point inside the SVG (same x as the lines); old first/last row removed. ≤15 points horizontal, more – rotated; >33 points the chart widens and scrolls. Tooltip: full date / «неделя с …».
Test: npm run test:admin-timeseries-dates. Draft PR only; not merged/deployed.
