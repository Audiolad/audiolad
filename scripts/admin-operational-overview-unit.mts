import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  calculateNetRevenueMinor,
  countDistinctOwnerUsers,
  countDistinctOwnerWorkspaces,
  countPublishedPracticePrograms,
  createOperationalTimeRange,
} from "../src/lib/admin/operational-overview";

const snapshotNow = new Date("2026-08-28T14:00:00.000Z");
const range = createOperationalTimeRange(snapshotNow);

assert.equal(range.snapshotNowIso, "2026-08-28T14:00:00.000Z");
assert.equal(range.sevenDaysAgoIso, "2026-08-21T14:00:00.000Z");
assert.equal(range.thirtyDaysAgoIso, "2026-07-29T14:00:00.000Z");

const owners = [
  { user_id: "owner-a", author_id: "workspace-a" },
  { user_id: "owner-a", author_id: "workspace-b" },
  { user_id: "owner-a", author_id: "workspace-b" },
  { user_id: "owner-b", author_id: "workspace-c" },
];

assert.equal(countDistinctOwnerUsers(owners), 2);
assert.equal(countDistinctOwnerWorkspaces(owners), 3);

assert.equal(
  countPublishedPracticePrograms([
    { id: "track-1", practice_id: "program-a" },
    { id: "track-2", practice_id: "program-a" },
    { id: "track-2", practice_id: "program-a" },
    { id: "track-3", practice_id: "single-a" },
  ]),
  1,
);

assert.equal(
  calculateNetRevenueMinor(
    [{ amount_minor: 199_250 }, { amount_minor: 50 }],
    [{ amount_minor: 50 }],
  ),
  199_250,
);

const queries = readFileSync("src/lib/admin/queries.ts", "utf8");

for (const expected of [
  'createOperationalTimeRange()',
  '.gte("created_at", timeRange.sevenDaysAgoIso)',
  '.lt("created_at", timeRange.snapshotNowIso)',
  '.gte("submitted_at", timeRange.sevenDaysAgoIso)',
  '.eq("role", "owner")',
  '.not("authors.access_status", "in", "(suspended,terminated)")',
  '.eq("product_kind", "practice")',
  '.is("deleted_at", null)',
  '.eq("event_name", "audio_play_started")',
  '.eq("event_name", "audio_completed")',
  '.eq("is_bot", false)',
  '.eq("is_staff", false)',
  '.eq("is_test", false)',
  '.from("payment_refunds")',
  '.not("confirmed_at", "is", null)',
  'key: "author_workspaces_total"',
  'key: "applications_submitted_7d"',
  'key: "applications_awaiting_review"',
  'label: "Запусков прослушивания"',
  'label: "Дослушиваний"',
]) {
  assert.ok(queries.includes(expected), `missing operational KPI contract: ${expected}`);
}

assert.ok(!queries.includes('.from("practice_audio_progress")'));

console.log("admin-operational-overview-unit: ok");
