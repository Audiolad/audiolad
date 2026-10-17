#!/usr/bin/env node
/**
 * Admin «Оценки → Слушатели» (task 612f9c76): RBAC matrix on real role
 * bundles, parsing, DTO whitelist (no HMAC/IP leakage), neutral wording,
 * safe links, and source contracts (guard first, no-store, no export,
 * no public exposure). Isolated SQL smoke is the companion:
 * scripts/admin-ratings-listeners-sql-unit.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  ADMIN_RATINGS_LISTENER_NO_NAME,
  describeAdminRatingsListenerSignals,
  evaluateRatingsListenersAccess,
  formatAdminRatingsListenedMs,
  formatAdminRatingsListenerName,
  formatAdminRatingsStars,
  isAdminRatingsListenerUuid,
  normalizeAdminRatingsListenerDetailRpc,
  normalizeAdminRatingsListenerSearch,
  normalizeAdminRatingsListenersRpc,
  parseAdminRatingsListenerOffset,
  parseAdminRatingsListenerSort,
  parseAdminRatingsListenerSortDir,
  safeInternalHref,
} from "../src/lib/admin/analytics-ratings-listeners";
import {
  PLATFORM_TEAM_ROLES,
  resolvePermissionsForRoles,
} from "../src/lib/auth/platform-permissions";
import { parseAdminAnalyticsUrlState } from "../src/lib/admin/analytics-url-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// --- RBAC matrix on the real default role bundles -------------------------
function decide(roles: string[], userId: string | null = "u1") {
  const perms = resolvePermissionsForRoles(roles);
  return evaluateRatingsListenersAccess({
    userId,
    hasPermission: (p) => roles.includes("owner") || perms.has(p),
  });
}

assert.deepEqual(decide(["owner"]), { ok: true }, "owner allowed");
assert.deepEqual(decide(["admin"]), { ok: true }, "admin allowed");
assert.deepEqual(decide(["analyst"]), { ok: false, status: 403, error: "forbidden" }, "analyst lacks users.view");
assert.deepEqual(decide(["support"]), { ok: false, status: 403, error: "forbidden" }, "support lacks analytics.view");
assert.deepEqual(decide(["analyst", "support"]), { ok: true }, "analyst+support together have all three");
assert.deepEqual(decide([]), { ok: false, status: 403, error: "forbidden" }, "plain listener / author refused");
assert.deepEqual(decide(["owner"], null), { ok: false, status: 401, error: "unauthorized" }, "anonymous refused");
for (const role of PLATFORM_TEAM_ROLES) {
  if (role === "owner" || role === "admin") continue;
  assert.equal(decide([role]).ok, false, `role ${role} alone must not see listener PII`);
}

// --- parsing ---------------------------------------------------------------
assert.equal(parseAdminRatingsListenerSort("rating_count"), "rating_count");
assert.equal(parseAdminRatingsListenerSort("registered_at"), "registered_at");
assert.equal(parseAdminRatingsListenerSort("average"), "average");
assert.equal(parseAdminRatingsListenerSort("email; drop"), "last_activity");
assert.equal(parseAdminRatingsListenerSort(null), "last_activity");
assert.equal(parseAdminRatingsListenerSortDir("asc"), "asc");
assert.equal(parseAdminRatingsListenerSortDir("ASC"), "desc");
assert.equal(parseAdminRatingsListenerOffset("50"), 50);
assert.equal(parseAdminRatingsListenerOffset("-1"), 0);
assert.equal(parseAdminRatingsListenerOffset("9999999"), 0);
assert.equal(parseAdminRatingsListenerOffset("1e3"), 0);
assert.equal(normalizeAdminRatingsListenerSearch("   "), null);
assert.equal(normalizeAdminRatingsListenerSearch("  anna "), "anna");
assert.equal(normalizeAdminRatingsListenerSearch("x".repeat(500))?.length, 120);
assert.ok(isAdminRatingsListenerUuid("c0000000-0000-4000-8000-000000000001"));
assert.ok(!isAdminRatingsListenerUuid("../../etc"));
assert.ok(!isAdminRatingsListenerUuid("c0000000-0000-4000-8000-00000000000"));
assert.equal(parseAdminAnalyticsUrlState(new URLSearchParams("ratingsTab=listeners")).ratingsTab, "listeners");
assert.equal(parseAdminAnalyticsUrlState(new URLSearchParams("ratingsTab=evil")).ratingsTab, "products");

// --- formatting / honesty about missing names ------------------------------
assert.equal(formatAdminRatingsListenerName(null), ADMIN_RATINGS_LISTENER_NO_NAME);
assert.equal(formatAdminRatingsListenerName("   "), ADMIN_RATINGS_LISTENER_NO_NAME);
assert.equal(formatAdminRatingsListenerName(" Анна "), "Анна");
assert.equal(formatAdminRatingsStars(4), "★★★★☆");
assert.equal(formatAdminRatingsStars(9), "★★★★★");
assert.equal(formatAdminRatingsListenedMs(45000), "45 с");
assert.equal(formatAdminRatingsListenedMs(605000), "10 мин 5 с");
assert.equal(formatAdminRatingsListenedMs(null), "—");

// --- DTO whitelist: unknown keys such as HMACs are dropped -----------------
const list = normalizeAdminRatingsListenersRpc({
  total: 1,
  limit: 50,
  offset: 0,
  sort: "rating_count",
  sort_dir: "asc",
  rows: [
    {
      user_id: "u-1",
      full_name: "  ",
      email: "a@mail.ru",
      registered_at: "2026-10-01T00:00:00Z",
      rating_count: "3",
      active_count: 2,
      excluded_count: 1,
      average: "4.5",
      is_test: true,
      vote_ip_hmac: "v1:secret",
      device_id_hmac: "v1:secret2",
    },
    { full_name: "no id" },
  ],
});
assert.equal(list.rows.length, 1);
assert.equal(list.rows[0].fullName, null, "blank name honest null");
assert.equal(list.rows[0].ratingCount, 3);
assert.equal(list.rows[0].average, 4.5);
assert.equal(list.sort, "rating_count");
assert.equal(list.sortDir, "asc");
assert.ok(!JSON.stringify(list).includes("v1:secret"), "HMAC never passes the DTO");

const detail = normalizeAdminRatingsListenerDetailRpc({
  found: true,
  profile: { user_id: "u-1", full_name: null, email: "a@mail.ru", has_profile: true },
  rating_total: 1,
  event_total: 2,
  ratings: [
    {
      rating_id: "r1",
      practice_id: "p1",
      title: "Т",
      stars: 5,
      href: "//evil.example/x",
      vote_ip_hmac: "v1:secret",
    },
  ],
  events: [
    { id: "e1", practice_id: "p1", old_stars: null, new_stars: 3 },
    { id: "e2", practice_id: "p1", old_stars: 3, new_stars: 5 },
  ],
  signals: { shared_ip_other_accounts: 37, shared_device_other_accounts: 2, fast_registration_paths: 1, ip_hmac: "v1:x" },
});
assert.equal(detail.found, true);
if (detail.found) {
  assert.equal(detail.ratings[0].href, null, "protocol-relative href rejected");
  assert.equal(detail.events[0].eventKind, "first");
  assert.equal(detail.events[1].eventKind, "changed");
  assert.equal(detail.signals.sharedIpOtherAccounts, 37);
  assert.ok(!JSON.stringify(detail).includes("v1:"), "no HMAC in detail DTO");
  const lines = describeAdminRatingsListenerSignals(detail.signals);
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.doesNotMatch(line, /фрод|мошен|накрут|бот|fraud|abuse|наруш(ил|ение) правил/i, "neutral wording");
  }
  assert.match(lines[0], /не доказательство/);
}
assert.deepEqual(normalizeAdminRatingsListenerDetailRpc({ found: false }), { found: false });
assert.deepEqual(normalizeAdminRatingsListenerDetailRpc(null), { found: false });
assert.equal(safeInternalHref("/practice/a/b"), "/practice/a/b");
assert.equal(safeInternalHref("https://x"), null);
assert.equal(safeInternalHref("/\\evil"), null);

// --- source contracts ------------------------------------------------------
const listRoute = read("src/app/api/admin/analytics/ratings/listeners/route.ts");
const detailRoute = read("src/app/api/admin/analytics/ratings/listeners/[userId]/route.ts");
for (const [name, src] of [["list", listRoute], ["detail", detailRoute]] as const) {
  const guardAt = src.indexOf("await requireRatingsListenersViewActor()");
  assert.ok(guardAt > 0, `${name} route calls the listeners guard`);
  assert.ok(guardAt < src.indexOf("await getAdminRatingsListener"), `${name}: guard before data access`);
  assert.match(src, /"Cache-Control": "no-store"/, `${name}: no-store`);
  assert.match(src, /writeAdminRatingsListenersAccessLog/, `${name}: access is logged`);
  assert.doesNotMatch(src, /error\.message\b[^)]*\)\s*}\s*,\s*{\s*status/, `${name}: DB message never returned`);
}
assert.match(detailRoute, /isAdminRatingsListenerUuid\(userId\)/, "detail validates uuid");
const guard = read("src/lib/admin/analytics-ratings-route-guard.ts");
assert.match(guard, /export async function requireRatingsListenersViewActor/);
assert.match(guard, /evaluateRatingsListenersAccess/);
const queries = read("src/lib/admin/analytics-ratings-listeners-queries.ts");
assert.match(queries, /import "server-only"/);
assert.doesNotMatch(queries, /p_search[\s\S]*counts:[^}]*search[^_]/, "search text not logged");
const panel = read("src/components/admin/AdminRatingsListenersPanel.tsx");
assert.doesNotMatch(panel, /hmac|downloadCsv|buildCsv|exclude\(|excludeRating/i, "no HMAC, no export, no exclusion in listeners UI");
const ratingsPanel = read("src/components/admin/AdminRatingsPanel.tsx");
assert.match(ratingsPanel, /\["listeners", "Слушатели"\]/);
assert.match(ratingsPanel, /tab !== "listeners" \? \(/, "CSV export hidden on listeners tab");

// Public / listener-facing code must never call the admin listener RPCs.
const grep = (pattern: string, dirs: string[]) => {
  try {
    return execFileSync("rg", ["-l", pattern, ...dirs], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
};
const users = grep("rpc\\(\"admin_ratings_listener", ["src"]);
assert.deepEqual(
  users.sort(),
  ["src/lib/admin/analytics-ratings-listeners-queries.ts"],
  "only the server-only admin query module calls the listener RPCs",
);
const publicRatingFiles = grep("email", ["src/lib/ratings", "src/app/api/listen", "src/app/api/max/rating"]);
assert.deepEqual(publicRatingFiles, [], "public rating APIs never touch email");

console.log("admin-ratings-listeners-unit: ok");
