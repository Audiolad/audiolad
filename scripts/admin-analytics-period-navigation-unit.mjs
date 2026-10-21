import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Contract regression: a quick-period click must schedule a server navigation
// even when the requested period equals the rendered summary while another
// period is pending. A stale-summary effect alone cannot express that intent.
const source = readFileSync(new URL("../src/components/admin/AdminAnalyticsWorkbench.tsx", import.meta.url), "utf8");
assert.match(source, /patch\.period !== undefined[\s\S]*?router\.replace\(href, \{ scroll: false \}\)/);
// Execute the actual callback body with a router/history spy. No React or
// Next dependency is needed; URL parse/build round trips are covered in .mts.
const body = source.match(/const next = \{ \.\.\.urlState, \.\.\.patch \};([\s\S]*?)\n    },/);
assert.ok(body);
const run = new Function("patch", "urlState", "pathname", "router", "window",
  "buildAdminAnalyticsSearchParams", "statsQueryHref", "replaceStatsQuery", "startPeriodTransition",
  "const next = { ...urlState, ...patch };" + body[1]);
for (const sequence of [["7d", "30d"], ["all", "30d"], ["30d", "7d", "30d"],
  ["7d", "today", "yesterday", "all", "30d"]]) {
  const calls = [];
  const router = { replace: (href, options) => calls.push({ href, options }) };
  const state = { period: sequence[0] };
  // Keep rendered/URL state frozen to model clicks while navigation is pending.
  for (const period of sequence.slice(1)) {
    run({ period, drill: null }, state, "/admin", router, { history: {} },
      (next) => new URLSearchParams({ period: next.period }),
      (path, params) => `${path}?${params}`, () => assert.fail("period was shallow"), (callback) => callback());
  }
  assert.deepEqual(calls, sequence.slice(1).map((period) => ({
    href: `/admin?period=${period}`, options: { scroll: false },
  })));
}
const shallow = [];
run({ tab: "authors" }, { period: "30d" }, "/admin",
  { replace: () => assert.fail("table change navigated") }, { history: {} },
  (next) => new URLSearchParams({ period: next.period, tab: next.tab }),
  (path, params) => `${path}?${params}`, (href) => shallow.push(href), (callback) => callback());
assert.deepEqual(shallow, ["/admin?period=30d&tab=authors"]);
console.log("admin-analytics-period-navigation-unit: ok");
