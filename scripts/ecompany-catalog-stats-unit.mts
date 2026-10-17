/** c353a4b5: periods in Moscow time, composition, no double counting in the UI layer, honest history. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  catalogCountPoints,
  catalogPeriods,
  composeCatalogStats,
  formatSigned,
  mskDateKey,
  parseCounts,
  parseSnapshot,
  type CatalogCounts,
} from "../src/lib/admin/ecompany-catalog-stats";

const c = (n: number): CatalogCounts => ({
  authors_total: n,
  authors_with_published: n,
  spaces_with_published: n,
  published_products: n,
  published_tracks: n,
});

// 1. Periods: 2026-10-16 18:20 MSK = 15:20Z.
const now = new Date("2026-10-16T15:20:00Z");
const [yesterday, week, month] = catalogPeriods(now);
assert.equal(yesterday.from.toISOString(), "2026-10-14T21:00:00.000Z", "yesterday starts 15.10 00:00 MSK");
assert.equal(yesterday.to.toISOString(), "2026-10-15T21:00:00.000Z", "yesterday ends 16.10 00:00 MSK");
assert.equal(yesterday.boundsLabel, "15.10.2026, 00:00–24:00 МСК");
assert.equal(week.from.toISOString(), "2026-10-09T15:20:00.000Z");
assert.equal(month.from.toISOString(), "2026-09-16T15:20:00.000Z", "calendar month back, same Moscow time");
assert.match(month.boundsLabel, /16\.09\.2026 18:20 – 16\.10\.2026 18:20 МСК/);
// Near Moscow midnight (00:30 MSK on 16.10 = 21:30Z on 15.10): yesterday is 15.10, not 14.10.
const late = catalogPeriods(new Date("2026-10-15T21:30:00Z"))[0];
assert.equal(late.from.toISOString(), "2026-10-14T21:00:00.000Z");
assert.equal(mskDateKey(new Date("2026-10-15T21:30:00Z")), "2026-10-16");
// Month clamp: 31 March → 28/29 Feb.
assert.equal(catalogPeriods(new Date("2026-03-31T09:00:00Z"))[2].from.toISOString(), "2026-02-28T09:00:00.000Z");
assert.equal(catalogPeriods(new Date("2026-01-15T09:00:00Z"))[2].from.toISOString(), "2025-12-15T09:00:00.000Z");

// 2. Points are de-duplicated (yesterday.to never equals now, but week/month 'to' do).
const points = catalogCountPoints(now, catalogPeriods(now));
assert.equal(points.length, 5);
assert.equal(points[0].getTime(), now.getTime());

// 3. Composition: growth = end - start; totals from "now".
const countsAt = new Map<number, CatalogCounts>([
  [now.getTime(), c(100)],
  [yesterday.from.getTime(), c(90)],
  [yesterday.to.getTime(), c(95)],
  [week.from.getTime(), c(80)],
  [month.from.getTime(), c(40)],
]);
const model = composeCatalogStats(now, countsAt, [])!;
assert.equal(model.totals.published_tracks, 100);
assert.deepEqual(model.periods.map((p) => p.growth.published_products), [5, 20, 60]);
assert.equal(model.historyStartedLabel, null, "no snapshots → no invented history");
assert.equal(model.history.length, 0);
assert.equal(model.generatedLabel, "16.10.2026 18:20 МСК");
assert.equal(composeCatalogStats(now, new Map(), []), null, "missing data is not shown as zeros");

// 4. Snapshot history: newest first, change only between consecutive days, start label from first row.
const snap = (date: string, n: number) =>
  parseSnapshot({ snapshot_date: date, captured_at: `${date}T20:00:00+00:00`, first_captured_at: `${date}T15:24:00+00:00`, ...c(n) })!;
const withHistory = composeCatalogStats(now, countsAt, [snap("2026-10-15", 95), snap("2026-10-13", 88), snap("2026-10-14", 91)], "2026-10-13T15:24:00+00:00")!;
const noStart = composeCatalogStats(now, countsAt, [snap("2026-10-15", 95)], null)!;
assert.equal(noStart.historyStartedLabel, null, "start is not guessed from the limited list");
assert.equal(noStart.historyStartUnknown, true);
assert.deepEqual(withHistory.history.map((h) => h.snapshotDate), ["2026-10-15", "2026-10-14", "2026-10-13"]);
assert.equal(withHistory.history[0].change?.published_products, 4);
assert.equal(withHistory.history[2].change, null, "first day has no previous snapshot");
assert.equal(withHistory.historyStartedLabel, "13.10.2026 18:24 МСК");
assert.equal(withHistory.periods[0].snapshotChange?.published_products, 4, "yesterday net change from snapshots 14→15.10");
const limited = composeCatalogStats(now, countsAt, [snap("2026-10-15", 95)], "2025-01-01T09:00:00+00:00")!;
assert.equal(limited.historyStartedLabel, "01.01.2025 12:00 МСК", "start comes from the true first snapshot, not the limited list");
const gap = composeCatalogStats(now, countsAt, [snap("2026-10-15", 95), snap("2026-10-12", 80)])!;
assert.equal(gap.history[0].change, null, "a gap is not bridged with invented daily change");
// Withdrawal: snapshot decreases are shown with a minus sign.
const down = composeCatalogStats(now, countsAt, [snap("2026-10-14", 91), snap("2026-10-15", 89)])!;
assert.equal(down.history[0].change?.published_products, -2);
assert.equal(formatSigned(-2), "−2");
assert.equal(formatSigned(3), "+3");
assert.equal(formatSigned(0), "0");

// 5. Parsing is strict: negatives / missing fields rejected.
assert.equal(parseCounts({ ...c(1), published_tracks: -1 }), null);
assert.equal(parseCounts({ authors_total: 1 }), null);
assert.deepEqual(parseCounts({ ...c(2), published_tracks: "7" })?.published_tracks, 7);

// 6. SQL contract (static): real model, dedupe by track id, service_role only, additive only.
const sql = readFileSync(new URL("../supabase/migrations/20270104120000_ecompany_catalog_stats.sql", import.meta.url), "utf8");
assert.match(sql, /practice_affects_public_surface\(/, "reuses the platform's public-availability rule");
assert.match(sql, /GROUP BY ai\.id/, "a track is counted once");
assert.match(sql, /count\(DISTINCT|GROUP BY m\.user_id/i, "authors are people, not spaces");
assert.match(sql, /AT TIME ZONE 'Europe\/Moscow'/);
assert.doesNotMatch(sql, /\b(DROP|ALTER\s+TABLE\s+public\.(practices|authors|audio_items|author_members)|DELETE|TRUNCATE)\b/i, "additive only");
assert.doesNotMatch(sql, /GRANT[^;]*TO\s+(anon|authenticated)/i);

// Placement: the block lives in the admin statistics section (/admin «Обзор»), never on the ИИ-компания board.
const overviewPage = readFileSync("src/app/(platform)/admin/page.tsx", "utf8");
const aiCompanyPage = readFileSync("src/app/(platform)/admin/ai-company/page.tsx", "utf8");
assert.match(overviewPage, /<Suspense fallback=\{<EcompanyCatalogStatsFallback \/>\}>\s*<EcompanyCatalogStatsSection \/>/, "stats render on /admin inside Suspense");
assert.doesNotMatch(aiCompanyPage, /EcompanyCatalogStats/, "stats are not rendered on the ИИ-компания board");
const pagesUsingStats = ["src/app/(platform)/admin/page.tsx", "src/app/(platform)/admin/ai-company/page.tsx"].filter((f) =>
  /<EcompanyCatalogStatsSection/.test(readFileSync(f, "utf8")),
);
assert.deepEqual(pagesUsingStats, ["src/app/(platform)/admin/page.tsx"], "rendered exactly once, no duplication");

console.log("ecompany catalog stats unit: OK");
