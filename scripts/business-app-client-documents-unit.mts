import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CLIENT_DOCUMENTS,
  CLIENT_DOCUMENT_DRAFT_LABEL,
  buildPlaybackReport,
  clampWindowMinutes,
  venueLocalToUtc,
} from "../src/lib/business-app/client-documents";
import { queryPlaybackFacts } from "../src/lib/business-app/playback-facts-query";

// Every listed document is a draft pending legal review.
assert.ok(CLIENT_DOCUMENTS.length >= 4);
for (const d of CLIENT_DOCUMENTS) {
  assert.equal(d.status, "draft_pending_legal_review");
  assert.match(d.version, /draft/);
}
assert.equal(CLIENT_DOCUMENT_DRAFT_LABEL, "Черновик, требует проверки юриста");
// No "without RAO/VOIS" promise anywhere in client copy.
const page = readFileSync("src/app/business-app/documents/page.tsx", "utf8");
const allCopy = page + JSON.stringify(CLIENT_DOCUMENTS);
assert.doesNotMatch(allCopy, /без\s+(РАО|ВОИС)/i);
assert.doesNotMatch(page, /BusinessEmptySection/);
assert.match(page, /CLIENT_DOCUMENT_DRAFT_LABEL/);

// Timezone conversion.
assert.equal(venueLocalToUtc("2026-10-16T15:00", "Europe/Moscow")?.toISOString(), "2026-10-16T12:00:00.000Z");
assert.equal(venueLocalToUtc("2026-10-16T15:00", "Asia/Yekaterinburg")?.toISOString(), "2026-10-16T10:00:00.000Z");
assert.equal(venueLocalToUtc("bad", "Europe/Moscow"), null);
assert.equal(venueLocalToUtc("2026-13-01T00:00", "Europe/Moscow"), null);
assert.equal(clampWindowMinutes("999"), 180);
assert.equal(clampWindowMinutes("x"), 30);

// Report grouping.
const at = new Date("2026-10-16T12:00:00Z");
const report = buildPlaybackReport({
  at,
  windowMinutes: 10,
  timezone: "Europe/Moscow",
  titles: new Map([["a", "Трек A"], ["b", "Трек B"]]),
  facts: [
    { occurred_at: "2026-10-16T11:58:00Z", audio_item_id: "a", location_id: "l", player_id: "p", listened_ms: 60000 },
    { occurred_at: "2026-10-16T12:00:30Z", audio_item_id: "a", location_id: "l", player_id: "p", listened_ms: 90000 },
    { occurred_at: "2026-10-16T12:03:00Z", audio_item_id: "b", location_id: "l", player_id: "p", listened_ms: "120000" },
    { occurred_at: "2026-10-16T13:00:00Z", audio_item_id: "c", location_id: "l", player_id: "p", listened_ms: 1000 },
  ],
});
assert.equal(report.factCount, 3);
assert.deepEqual(report.tracks.map((t) => t.title), ["Трек A", "Трек B"]);
assert.equal(report.tracks[0].listenedMs, 150000);
assert.equal(report.tracks[0].coversT, true);
assert.equal(report.tracks[1].coversT, false);

// Loader query: filters must match the partial indexes on playback_usage_facts.
{
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "gte", "lte", "order"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.limit = (n: number) => {
    calls.push(["limit", n]);
    return Promise.resolve({ data: [], error: null });
  };
  let table = "";
  const mockClient = {
    from(t: "playback_usage_facts") {
      table = t;
      return builder;
    },
  };
  const res = await queryPlaybackFacts(mockClient, {
    organizationId: "org-1",
    locationId: "loc-1",
    from: "2026-10-16T11:30:00.000Z",
    to: "2026-10-16T12:30:00.000Z",
    limit: 2000,
  });
  assert.deepEqual(res, { data: [], error: null });
  assert.equal(table, "playback_usage_facts");
  const has = (...c: unknown[]) =>
    assert.ok(calls.some((x) => JSON.stringify(x) === JSON.stringify(c)), `missing ${JSON.stringify(c)}`);
  has("eq", "usage_kind", "business");
  has("eq", "organization_id", "org-1");
  has("eq", "location_id", "loc-1");
  has("gt", "listened_ms", 0);
  has("gte", "occurred_at", "2026-10-16T11:30:00.000Z");
  has("lte", "occurred_at", "2026-10-16T12:30:00.000Z");
  has("limit", 2000);
  // The loader must go through this query helper.
  const loader = readFileSync("src/lib/business-app/load-playback-report.ts", "utf8");
  assert.match(loader, /queryPlaybackFacts\(service/);
  assert.doesNotMatch(loader, /from\("playback_usage_facts"\)/);
}
console.log("business-app-client-documents-unit OK");
