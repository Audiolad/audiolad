import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AI_COMPANY_LIVE_REFRESH_MS,
  startScopedPageRefresh,
} from "../src/lib/admin/ai-company-live-refresh";
import {
  ADMIN_OVERVIEW_SECTION_ERRORS,
  adminOverviewRetryHref,
  loadAdminOverviewSections,
} from "../src/lib/admin/overview-blocks";

const page = readFileSync("src/app/(platform)/admin/page.tsx", "utf8");
const aiCompanyPage = readFileSync(
  "src/app/(platform)/admin/ai-company/page.tsx",
  "utf8",
);
const liveRefresh = readFileSync(
  "src/components/admin/AiCompanyLiveRefresh.tsx",
  "utf8",
);
const analyticsQueries = readFileSync("src/lib/admin/analytics-queries.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261221120000_admin_overview_analytics_timeout.sql",
  "utf8",
);
const nav = readFileSync("src/lib/admin/nav.ts", "utf8");

function testIndependentSectionFailure() {
  return loadAdminOverviewSections({
    stats: async () => ({ cards: [{ key: "users_total", value: 12 }] }),
    analytics: async () => {
      throw new Error("admin_analytics_dashboard_failed");
    },
    commercial: async () => ({ newCount: 2 }),
    authors: async () => {
      throw new Error("admin_author_application_attention_load_failed");
    },
    rethrow: () => {},
  }).then((loaded) => {
    assert.equal(loaded.stats.status, "ready");
    if (loaded.stats.status === "ready") {
      assert.equal(loaded.stats.value.cards[0]?.value, 12);
    }
    assert.equal(loaded.analytics.status, "failed");
    assert.equal(loaded.commercial.status, "ready");
    assert.equal(loaded.authors.status, "failed");
    assert.equal("value" in loaded.analytics, false);
    assert.equal("value" in loaded.authors, false);
  });
}

function testStatsFailureKeepsAnalytics() {
  return loadAdminOverviewSections({
    stats: async () => {
      throw new Error("admin_overview_stats_load_failed");
    },
    analytics: async () => ({ period: "7d", visitors: 4 }),
    commercial: null,
    authors: null,
    rethrow: () => {},
  }).then((loaded) => {
    assert.equal(loaded.stats.status, "failed");
    assert.equal(loaded.analytics.status, "ready");
    if (loaded.analytics.status === "ready") {
      assert.equal(loaded.analytics.value.visitors, 4);
    }
    assert.equal(loaded.commercial.status, "skipped");
    assert.equal(loaded.authors.status, "skipped");
  });
}

function testControlFlowIsNotSwallowed() {
  class RedirectSentinel extends Error {}

  return assert.rejects(
    () =>
      loadAdminOverviewSections({
        stats: async () => {
          throw new RedirectSentinel("redirect");
        },
        analytics: async () => ({ ok: true }),
        commercial: null,
        authors: null,
        rethrow: (error) => {
          if (error instanceof RedirectSentinel) {
            throw error;
          }
        },
      }),
    RedirectSentinel,
  );
}

function testRetryHrefKeepsFilters() {
  assert.equal(adminOverviewRetryHref({}), "/admin");
  assert.equal(
    adminOverviewRetryHref({
      period: "7d",
      includeTest: "1",
      authorId: "a1111111-1111-1111-1111-111111111111",
    }),
    "/admin?period=7d&includeTest=1&authorId=a1111111-1111-1111-1111-111111111111",
  );
}

function testScopedRefreshDoesNotFireAfterLeave() {
  let calls = 0;
  const queued: Array<() => void> = [];
  let cancelled = false;
  const stop = startScopedPageRefresh(
    () => {
      calls += 1;
    },
    AI_COMPANY_LIVE_REFRESH_MS,
    (callback, intervalMs) => {
      assert.equal(intervalMs, 45_000);
      queued.push(callback);
      return 17;
    },
    (timerId) => {
      assert.equal(timerId, 17);
      cancelled = true;
    },
  );

  const fire = queued[0];
  if (!fire) {
    throw new Error("timer was not scheduled");
  }
  fire();
  assert.equal(calls, 1);
  stop();
  assert.equal(cancelled, true);
  fire();
  assert.equal(calls, 1);
}

function testPageSplitsFailuresAndKeepsGuards() {
  const redirectAt = page.indexOf("redirect(fallback)");
  const permissionAt = page.indexOf('await requireAdminPermission("dashboard.view")');
  const loadAt = page.indexOf("await loadAdminOverviewSections");
  assert.ok(redirectAt > 0 && permissionAt > redirectAt && loadAt > permissionAt);
  assert.match(page, /rethrow:\s*unstable_rethrow/);
  assert.doesNotMatch(page, /Не удалось загрузить показатели\. Попробуйте обновить страницу\./);
  assert.match(page, /ADMIN_OVERVIEW_SECTION_ERRORS\.stats/);
  assert.match(page, /ADMIN_OVERVIEW_SECTION_ERRORS\.analytics/);
  assert.match(page, /ADMIN_OVERVIEW_SECTION_ERRORS\.authors/);
  assert.match(page, /ADMIN_OVERVIEW_SECTION_ERRORS\.commercial/);
  assert.match(page, /includeTest: params\.includeTest/);
  assert.match(page, /canViewAnalytics/);
  assert.match(page, /canViewAuthors/);
  assert.equal(ADMIN_OVERVIEW_SECTION_ERRORS.stats.includes("0"), false);
  assert.match(nav, /href: "\/admin"/);
  assert.match(nav, /requiredPermission: "dashboard\.view"/);
  assert.match(nav, /href: "\/admin\/ai-company"/);
  assert.match(nav, /requiredPermission: "ai_company\.view"/);

  const bundleStart = analyticsQueries.indexOf("export async function getAdminAnalyticsSummaryBundle");
  const bundle = analyticsQueries.slice(bundleStart, analyticsQueries.indexOf("export async function getAdminAnalyticsBreakdownBundle"));
  const fatalAt = bundle.indexOf("admin_analytics_dashboard_failed");
  const listeningAt = bundle.indexOf('service.rpc("admin_analytics_listening_time"');
  assert.ok(fatalAt > 0 && listeningAt > fatalAt, "listening RPCs start only after summary/overview");
  assert.match(bundle, /summary: summaryRes\.error\?\.message/);
  assert.match(bundle, /overview: overviewRes\.error\?\.message/);
}

function testAiCompanyRefreshIsScoped() {
  assert.equal(AI_COMPANY_LIVE_REFRESH_MS, 45_000);
  assert.doesNotMatch(aiCompanyPage, /httpEquiv|http-equiv/i);
  assert.doesNotMatch(aiCompanyPage, /<meta/);
  assert.match(aiCompanyPage, /<AiCompanyLiveRefresh/);
  assert.match(aiCompanyPage, /requireAdminPermission\("ai_company\.view"\)/);
  assert.match(liveRefresh, /router\.refresh\(\)/);
  assert.match(liveRefresh, /startScopedPageRefresh/);
  assert.doesNotMatch(liveRefresh, /location\.reload|httpEquiv|http-equiv/i);
}

function testMigrationIsReadOnlyAndBounded() {
  assert.match(migration, /CREATE INDEX IF NOT EXISTS analytics_events_play_started_occurred_idx/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS analytics_events_play_started_anon_occurred_idx/);
  assert.match(migration, /analytics_overview_prior_play_start_keys/);
  assert.match(migration, /event_name = 'audio_play_started'/);
  assert.doesNotMatch(migration, /SET\s+statement_timeout/i);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO anon|GRANT EXECUTE[\s\S]*TO authenticated/);
  assert.match(migration, /TO service_role/);
  assert.doesNotMatch(
    migration,
    /analytics_overview_event_facts\(\s*NULL\s*,/,
  );
}

async function main() {
  await testIndependentSectionFailure();
  await testStatsFailureKeepsAnalytics();
  await testControlFlowIsNotSwallowed();
  testRetryHrefKeepsFilters();
  testScopedRefreshDoesNotFireAfterLeave();
  testPageSplitsFailuresAndKeepsGuards();
  testAiCompanyRefreshIsScoped();
  testMigrationIsReadOnlyAndBounded();
  console.log("admin-overview-incident-unit: ok");
}

await main();
