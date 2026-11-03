/**
 * Gift-week activity recording (task 253821e0, PR 2): config, aggregation, «нет данных» while off,
 * flag gates on every writer, migration and rollback shape.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminBusinessTrials from "../src/components/admin/AdminBusinessTrials";
import {
  BUSINESS_TRIAL_NO_DATA,
  buildBusinessTrialStats,
  moscowDay,
  summarizeBusinessTrialActivity,
  type BusinessTrialFacts,
} from "../src/lib/admin/business-trials";
import {
  BUSINESS_TRIAL_ACTIVITY_DEFAULTS,
  businessStartHost,
  businessTrialActivityConfig,
} from "../src/lib/business-trial-activity/config";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const count = (text: string, needle: string) => text.split(needle).length - 1;

// Config: OFF by default, 180 days, 60 minutes, bounded overrides.
const off = businessTrialActivityConfig({});
assert.equal(off.enabled, false);
assert.equal(off.retentionDays, 180);
assert.equal(off.activeMinutes, 60);
assert.equal(BUSINESS_TRIAL_ACTIVITY_DEFAULTS.visitGapSeconds, 1800);
assert.equal(businessTrialActivityConfig({ AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_ENABLED: "true" }).enabled, false);
const on = businessTrialActivityConfig({
  AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_ENABLED: "1",
  AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_RETENTION_DAYS: "90",
  AUDIOLAD_BUSINESS_TRIAL_ACTIVE_MINUTES: "45",
});
assert.deepEqual([on.enabled, on.retentionDays, on.activeMinutes], [true, 90, 45]);
const wild = businessTrialActivityConfig({
  AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_RETENTION_DAYS: "99999",
  AUDIOLAD_BUSINESS_TRIAL_ACTIVE_MINUTES: "abc",
});
assert.deepEqual([wild.retentionDays, wild.activeMinutes], [730, 60]);

// Start host: only our two hosts.
assert.equal(businessStartHost("coffee.audiolad.ru"), "coffee");
assert.equal(businessStartHost("Business.AudioLad.ru:443"), "business");
assert.equal(businessStartHost("audiolad.ru"), null);
assert.equal(businessStartHost("evil.example"), null);
assert.equal(businessStartHost(null), null);

// Moscow day boundary: 21:30 UTC is already the next day in Moscow.
assert.equal(moscowDay("2026-11-02T21:30:00.000Z"), "2026-11-03");
assert.equal(moscowDay("2026-11-02T20:59:00.000Z"), "2026-11-02");

// Summary: only days since the start, a music day needs a full minute, duplicates ignored.
const summary = summarizeBusinessTrialActivity(
  [
    { day: "2026-11-01", listenedSeconds: 9000, cabinetVisits: 9 },
    { day: "2026-11-03", listenedSeconds: 1830, cabinetVisits: 2 },
    { day: "2026-11-03", listenedSeconds: 9999, cabinetVisits: 9 },
    { day: "2026-11-04", listenedSeconds: 59, cabinetVisits: 1 },
    { day: "2026-11-05", listenedSeconds: 2400, cabinetVisits: 0 },
    { day: "bad", listenedSeconds: 100, cabinetVisits: 1 },
    { day: "2026-11-06", listenedSeconds: Number.NaN, cabinetVisits: -3 },
  ],
  "2026-11-02T21:30:00.000Z",
);
assert.deepEqual(summary, { listenedMinutes: 71, musicDays: 2, cabinetVisits: 3 });

// Stats: off → activity null and «нет данных»; on → numbers and the ≥ N minutes total.
const now = new Date("2026-11-06T12:00:00.000Z");
const KIND = "business_new_client";
const grants = [
  { userId: "11111111-aaaa-4bbb-8ccc-dddddddddddd", hasEmail: false, kind: KIND, startsAt: "2026-11-03T09:00:00.000Z", endsAt: "2026-11-10T09:00:00.000Z" },
  { userId: "22222222-aaaa-4bbb-8ccc-dddddddddddd", hasEmail: true, kind: KIND, startsAt: "2026-11-04T09:00:00.000Z", endsAt: "2026-11-11T09:00:00.000Z" },
];
const facts = new Map<string, BusinessTrialFacts>([
  [grants[0].userId, {
    organizationName: "Кофейня",
    guestStart: true,
    startHost: "coffee",
    activityDays: [
      { day: "2026-11-03", listenedSeconds: 3000, cabinetVisits: 1 },
      { day: "2026-11-04", listenedSeconds: 900, cabinetVisits: 2 },
    ],
  }],
  [grants[1].userId, { organizationName: "Бар", activityDays: [{ day: "2026-11-04", listenedSeconds: 600, cabinetVisits: 1 }] }],
]);

const statsOff = buildBusinessTrialStats({ now, grants, facts });
assert.equal(statsOff.activityEnabled, false);
assert.equal(statsOff.totals.activeEnough, null);
assert.ok(statsOff.rows.every((row) => row.activity === null && row.startHost === null));
const htmlOff = renderToStaticMarkup(createElement(AdminBusinessTrials, { data: statsOff }));
for (const header of ["Минуты музыки", "Дни с музыкой", "Заходы в кабинет"]) assert.ok(htmlOff.includes(header), header);
// 3 activity + 2 attribution columns x 2 rows, plus 4 stages x 3 channels of the funnel (attribution off).
assert.equal(count(htmlOff, `>${BUSINESS_TRIAL_NO_DATA}<`), 3 * 2 + 2 * 2 + 4 * 3, "columns x rows show «нет данных»");
assert.ok(htmlOff.includes(`Слушали не меньше 60 минут: ${BUSINESS_TRIAL_NO_DATA}.`));
assert.ok(htmlOff.includes("data-trial-activity-off"));
assert.ok(!htmlOff.includes("старт: coffee"), "host hidden while off");

const statsOn = buildBusinessTrialStats({ now, grants, facts, activity: { enabled: true, activeMinutes: 60 } });
assert.equal(statsOn.totals.activeEnough, 1);
const guestRow = statsOn.rows.find((row) => row.userId === grants[0].userId)!;
assert.deepEqual(guestRow.activity, { listenedMinutes: 65, musicDays: 2, cabinetVisits: 3 });
assert.equal(guestRow.startHost, "coffee");
const htmlOn = renderToStaticMarkup(createElement(AdminBusinessTrials, { data: statsOn }));
// Activity columns filled; only the attribution columns and funnel (attribution off here) stay empty.
assert.equal(count(htmlOn, `>${BUSINESS_TRIAL_NO_DATA}<`), 2 * 2 + 4 * 3);
assert.ok(htmlOn.includes("Слушали не меньше 60 минут: 1."));
assert.ok(htmlOn.includes("старт: coffee"));
assert.ok(!htmlOn.includes("data-trial-activity-off"));
assert.equal(buildBusinessTrialStats({ now, grants, facts, activity: { enabled: true, activeMinutes: 120 } }).totals.activeEnough, 0);
for (const html of [htmlOff, htmlOn]) assert.ok(!html.includes("\u2014"), "en dash only");
if (process.env.BUSINESS_TRIALS_RENDER_OUT) writeFileSync(process.env.BUSINESS_TRIALS_RENDER_OUT, htmlOff);

// Every writer is behind the flag; the admin loader never writes and reads new columns only with it on.
const record = read("src/lib/business-trial-activity/record.server.ts");
assert.ok(record.startsWith('import "server-only";'));
assert.equal(count(record, "cfg.enabled) return;") + count(record, "!config().enabled) return;"), 3, "every write path returns early while off");
assert.equal(count(record, "console."), 1, "one console call, in warn()");
assert.ok(!/\bwarn\([^"]/.test(record.replace("function warn(code: string)", "").replace("console.warn(code)", "")), "logs only fixed codes");
for (const [file, call] of [
  ["src/app/api/business/workspace/state/route.ts", "recordBusinessTrialListen("],
  ["src/app/api/business/point/route.ts", "recordBusinessTrialPointListen("],
  ["src/app/business-app/page.tsx", "recordBusinessTrialVisit("],
] as const) {
  const src = read(file);
  assert.ok(src.includes(call), `${file} calls ${call}`);
  assert.ok(src.includes("businessTrialActivityConfig(process.env).enabled"), `${file} gated by flag`);
  assert.ok(src.includes("after(() =>"), `${file} records after the response`);
}
const point = read("src/app/api/business/point/route.ts");
assert.ok(/!error && report\?\.state === "playing" && report\.playingConfirmed/.test(point), "point counts confirmed playback only");
assert.ok(read("src/app/api/business/guest-start/route.ts").includes("recordBusinessGuestStartHost(input.userId, businessStartHost("));
const queries = read("src/lib/admin/business-trials-queries.ts");
assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(queries));
assert.ok(/config\.enabled \? ", start_host" : ""/.test(queries));
assert.ok(/config\.enabled && earliestDay\s*\?\s*selectIn\(db, "business_trial_activity_days"/.test(queries));

// Migration: not applied, service_role only, no personal data, rollback alongside.
const migration = read("supabase/migrations/20270213120000_business_trial_activity_days.sql");
assert.ok(migration.includes("-- NOT APPLIED."));
assert.ok(/^BEGIN;$/m.test(migration) && /^COMMIT;$/m.test(migration));
assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
assert.ok(migration.includes("REVOKE ALL ON public.business_trial_activity_days FROM PUBLIC, anon, authenticated;"));
assert.equal(count(migration, "SECURITY DEFINER\nSET search_path = public, pg_temp"), 3);
assert.equal(count(migration, "FROM PUBLIC, anon, authenticated;"), 4);
assert.equal(count(migration, "TO service_role;"), 4);
assert.ok(!/\b(email|ip|user_agent|network_hash)\b\s+(text|inet|bytea)/i.test(migration), "no personal columns");
assert.ok(migration.includes("p_retention_days integer DEFAULT 180"));
assert.ok(migration.includes("CHECK (start_host IS NULL OR start_host IN ('coffee', 'business'))"));
const rollbackPath = "supabase/rollbacks/20270213120000_business_trial_activity_days.rollback.sql";
assert.ok(existsSync(path.join(ROOT, rollbackPath)));
const rollback = read(rollbackPath);
for (const needle of [
  "DROP TABLE IF EXISTS public.business_trial_activity_days;",
  "DROP COLUMN IF EXISTS start_host;",
  "DROP FUNCTION IF EXISTS public.record_business_trial_activity(uuid, text, integer, integer, integer);",
  "DROP FUNCTION IF EXISTS public.record_business_trial_point_listen(text, integer, integer);",
  "DROP FUNCTION IF EXISTS public.purge_business_trial_activity_days(integer);",
]) assert.ok(rollback.includes(needle), needle);
assert.ok(!/DROP TABLE IF EXISTS public\.business_guest_starts/.test(rollback));
for (const text of [migration, rollback, record]) assert.ok(!text.includes("\u2014"));

console.log("business-trial-activity-unit: ok");
