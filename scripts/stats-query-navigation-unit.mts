/**
 * Sort/filter URL updates must not start an App Router navigation.
 * router.replace defaults to scrolling to the top; admin/loading.tsx then
 * makes production snap back after the server round trip. These checks lock
 * the History API path and the "keep the table mounted" rule.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adminSummaryNeedsRefresh,
  adminSummaryQueryKey,
  applyAuthorStatsSearchPatch,
  isPlainPrimaryClick,
  pushStatsQuery,
  replaceStatsQuery,
  shouldReplaceStatsTableWithLoading,
  statsQueryHref,
  type StatsQueryHistory,
} from "../src/lib/navigation/stats-query-navigation";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function fakeHistory(): StatsQueryHistory & {
  calls: Array<{ method: "replace" | "push"; url: string | URL | null | undefined }>;
} {
  const calls: Array<{
    method: "replace" | "push";
    url: string | URL | null | undefined;
  }> = [];
  return {
    calls,
    replaceState(data, _unused, url) {
      assert.equal(data, null);
      calls.push({ method: "replace", url });
    },
    pushState(data, _unused, url) {
      assert.equal(data, null);
      calls.push({ method: "push", url });
    },
  };
}

function testHistoryDoesNotScroll() {
  const history = fakeHistory();
  replaceStatsQuery("/author-dashboard/stats?sort=plays&order=asc", history);
  assert.deepEqual(history.calls, [
    { method: "replace", url: "/author-dashboard/stats?sort=plays&order=asc" },
  ]);

  pushStatsQuery("/admin?authorId=author-1", history);
  assert.equal(history.calls[1]?.method, "push");
  assert.equal(history.calls[1]?.url, "/admin?authorId=author-1");
  assert.equal("scrollTo" in history, false);
}

function testHrefAndAuthorPatch() {
  assert.equal(statsQueryHref("/admin", new URLSearchParams()), "/admin");
  const params = applyAuthorStatsSearchPatch(new URLSearchParams("period=30d&sort=views"), {
    sort: "plays",
    order: "asc",
  });
  assert.equal(params.get("period"), "30d");
  assert.equal(params.get("sort"), "plays");
  assert.equal(params.get("order"), "asc");

  const defaults = applyAuthorStatsSearchPatch(params, {
    sort: null,
    order: null,
  });
  assert.equal(defaults.get("sort"), null);
  assert.equal(defaults.get("order"), null);
  assert.equal(
    statsQueryHref("/author-dashboard/stats", defaults),
    "/author-dashboard/stats?period=30d",
  );
}

function testSummaryRefreshIgnoresSort() {
  const rendered = {
    period: "30d",
    includeTest: false,
    authorId: null,
    practiceId: null,
    utmSource: null,
    deviceType: null,
  };
  assert.equal(
    adminSummaryNeedsRefresh(rendered, { ...rendered, authorId: "" }),
    false,
  );
  assert.equal(
    adminSummaryNeedsRefresh(rendered, { ...rendered, period: "7d" }),
    true,
  );
  assert.equal(
    adminSummaryNeedsRefresh(rendered, {
      ...rendered,
      authorId: "11111111-1111-4111-8111-111111111111",
    }),
    true,
  );
}

function testSummaryKeyMirrorsServerNormalisation() {
  const base = {
    period: "7d",
    includeTest: false,
    authorId: null,
    practiceId: null,
    utmSource: null,
    deviceType: null,
  };
  // Junk filters are dropped by the server (asOptionalUuid/Device/Utm), so
  // the rendered summary never echoes them. They must not look stale forever.
  for (const junk of [
    { authorId: "not-a-uuid" },
    { practiceId: "123" },
    { deviceType: "fridge" },
    { utmSource: "x".repeat(121) },
  ]) {
    assert.equal(adminSummaryNeedsRefresh(base, { ...base, ...junk }), false);
  }
  const uuid = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    adminSummaryNeedsRefresh(base, { ...base, deviceType: "mobile" }),
    true,
  );
  assert.equal(
    adminSummaryNeedsRefresh(base, { ...base, utmSource: " vk " }),
    true,
  );
  assert.equal(
    adminSummaryQueryKey({ ...base, authorId: ` ${uuid} ` }),
    adminSummaryQueryKey({ ...base, authorId: uuid }),
  );
}

function testRefreshEffectIsKeyedByQueryNotBoolean() {
  // Regression: the effect was keyed by the `summaryStale` boolean. Pressing
  // «30» then «Все» before the first refresh landed kept the boolean `true`,
  // the effect never re-ran, and the page showed the old period's data while
  // the URL and the active button said «Все».
  const workbench = read("src/components/admin/AdminAnalyticsWorkbench.tsx");
  assert.match(
    workbench,
    /\[router, renderedSummaryKey, urlSummaryKey\]/,
  );
  assert.doesNotMatch(workbench, /\[router, summaryStale\]/);
  assert.match(workbench, /admin-analytics-refreshing/);
}

function testTableStaysMounted() {
  assert.equal(shouldReplaceStatsTableWithLoading(false), true);
  assert.equal(shouldReplaceStatsTableWithLoading(true), false);
  assert.equal(
    isPlainPrimaryClick({
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }),
    true,
  );
  assert.equal(
    isPlainPrimaryClick({
      button: 0,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }),
    false,
  );
}

function testCallSites() {
  const author = read("src/components/author-dashboard/AuthorStatsClient.tsx");
  const workbench = read("src/components/admin/AdminAnalyticsWorkbench.tsx");
  const filters = read("src/components/admin/AdminAnalyticsFilters.tsx");
  const traffic = read("src/components/admin/AdminAnalyticsTestTrafficControls.tsx");

  assert.match(author, /replaceStatsQuery\(/);
  assert.match(author, /shouldReplaceStatsTableWithLoading\(/);
  assert.match(author, /aria-label="Сортировка продуктов"/);
  assert.doesNotMatch(author, /router\.(replace|push)\(/);

  assert.match(workbench, /replaceStatsQuery\(/);
  assert.match(workbench, /shouldReplaceStatsTableWithLoading\(/);
  assert.match(workbench, /adminSummaryNeedsRefresh\(/);
  assert.match(workbench, /router\.refresh\(\)/);
  assert.doesNotMatch(workbench, /router\.(replace|push)\(/);
  assert.doesNotMatch(workbench, /scroll:\s*true/);

  assert.match(filters, /pushStatsQuery\(/);
  assert.doesNotMatch(filters, /router\.(replace|push)\(/);
  assert.match(traffic, /pushStatsQuery\(/);
  assert.doesNotMatch(traffic, /from "next\/link"/);
}

function main() {
  testHistoryDoesNotScroll();
  testHrefAndAuthorPatch();
  testSummaryRefreshIgnoresSort();
  testSummaryKeyMirrorsServerNormalisation();
  testRefreshEffectIsKeyedByQueryNotBoolean();
  testTableStaysMounted();
  testCallSites();
  console.log("stats-query-navigation-unit: ok");
}

main();
