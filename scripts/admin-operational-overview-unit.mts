import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createOperationalTimeRange,
} from "../src/lib/admin/operational-overview";

const snapshotNow = new Date("2026-08-28T14:00:00.000Z");
const range = createOperationalTimeRange(snapshotNow);

assert.equal(range.snapshotNowIso, "2026-08-28T14:00:00.000Z");
assert.equal(range.sevenDaysAgoIso, "2026-08-21T14:00:00.000Z");
assert.equal(range.thirtyDaysAgoIso, "2026-07-29T14:00:00.000Z");

const queries = readFileSync("src/lib/admin/queries.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260904120000_admin_operational_overview_snapshot.sql",
  "utf8",
);

for (const expected of [
  'createOperationalTimeRange()',
  'rpc("admin_operational_overview_snapshot"',
  'key: "author_workspaces_total"',
  'key: "applications_submitted_7d"',
  'key: "applications_awaiting_review"',
  'label: "Запусков прослушивания"',
  'label: "Дослушиваний"',
]) {
  assert.ok(queries.includes(expected), `missing operational KPI contract: ${expected}`);
}

assert.ok(!queries.includes('.from("practice_audio_progress")'));

for (const expected of [
  "p_snapshot_now - interval '7 days'",
  "p_snapshot_now - interval '30 days'",
  "count(DISTINCT user_id)",
  "count(DISTINCT author_id)",
  "am.role = 'owner'",
  "a.access_status NOT IN ('suspended', 'terminated')",
  "aa.submitted_at >= t.seven_days_ago",
  "aa.submitted_at < t.snapshot_now",
  "p.product_kind = 'practice'",
  "p.deleted_at IS NULL",
  "count(DISTINCT ai.id) >= 2",
  "event_name = 'audio_play_started'",
  "event_name = 'audio_completed'",
  "is_bot = false",
  "is_staff = false",
  "is_test = false",
  "count(DISTINCT order_id)",
  "r.confirmed_at IS NOT NULL",
]) {
  assert.ok(migration.includes(expected), `missing SQL aggregation contract: ${expected}`);
}

console.log("admin-operational-overview-unit: ok");
