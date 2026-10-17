#!/usr/bin/env node
/**
 * Admin «Оценки → Слушатели» (task 612f9c76): RBAC matrix on real role
 * bundles, parsing, DTO whitelist (no HMAC/IP leakage), neutral wording,
 * safe links, and source contracts (guard first, no-store, no export,
 * no public exposure). Isolated SQL smoke is the companion:
 * scripts/admin-ratings-listeners-sql-unit.mjs
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  ADMIN_RATINGS_LISTENER_NO_NAME,
  describeAdminRatingsListenerEventsTruncation,
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
import {
  AUDIT_UNAVAILABLE_BODY,
  handleRatingsListenerDetail,
  handleRatingsListenersList,
  type RatingsListenersRouteDeps,
} from "../src/lib/admin/analytics-ratings-listeners-route";

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


// --- route-level behaviour with mocked auth / queries / audit log ----------
const PII_EMAIL = "secret.person@mail.ru";
const U = "c0000000-0000-4000-8000-000000000001";
function makeDeps(opts: {
  guard: "allow" | 401 | 403;
  logOk?: boolean;
  found?: boolean;
  throwOnQuery?: boolean;
}) {
  const calls = { list: 0, detail: 0, log: [] as unknown[] };
  const deps: RatingsListenersRouteDeps = {
    requireActor: async () =>
      opts.guard === "allow"
        ? { ok: true, actor: { userId: "admin-1" } }
        : {
            ok: false,
            response: Response.json(
              { error: opts.guard === 401 ? "unauthorized" : "forbidden" },
              { status: opts.guard },
            ),
          },
    getList: async () => {
      calls.list += 1;
      if (opts.throwOnQuery) throw new Error("db exploded: relation x");
      return {
        total: 1, limit: 50, offset: 0, sort: "last_activity", sortDir: "desc",
        rows: [{
          userId: U, fullName: "Секретное Имя", email: PII_EMAIL, registeredAt: null,
          ratingCount: 1, activeCount: 1, excludedCount: 0, average: 5,
          firstRatedAt: null, lastActivityAt: null, isTest: false,
        }],
      };
    },
    getDetail: async () => {
      calls.detail += 1;
      if (opts.found === false) return { found: false };
      return {
        found: true,
        profile: { userId: U, fullName: null, email: PII_EMAIL, registeredAt: null, hasProfile: true, isTest: false },
        ratingTotal: 0, eventTotal: 0, limit: 200, ratings: [], events: [],
        signals: { sharedIpOtherAccounts: 0, sharedDeviceOtherAccounts: 0, fastRegistrationPaths: 0 },
      };
    },
    writeAccessLog: async (input) => {
      calls.log.push(input);
      return opts.logOk !== false;
    },
  };
  return { deps, calls };
}
const listReq = new Request("https://audiolad.ru/api/admin/analytics/ratings/listeners?q=secret&sort=rating_count&dir=asc&offset=50");

for (const status of [401, 403] as const) {
  const { deps, calls } = makeDeps({ guard: status });
  const res = await handleRatingsListenersList(listReq, deps);
  assert.equal(res.status, status, `list denied ${status}`);
  const body = await res.text();
  assert.ok(!body.includes(PII_EMAIL), "denied list returns no PII");
  assert.equal(calls.list, 0, "denied list never queries data");
  assert.equal(calls.log.length, 0);
  const { deps: d2, calls: c2 } = makeDeps({ guard: status });
  const res2 = await handleRatingsListenerDetail(U, d2);
  assert.equal(res2.status, status, `detail denied ${status}`);
  assert.ok(!(await res2.text()).includes(PII_EMAIL));
  assert.equal(c2.detail, 0, "denied detail never queries data");
}
{
  const { deps, calls } = makeDeps({ guard: "allow" });
  const res = await handleRatingsListenersList(listReq, deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.ok((await res.text()).includes(PII_EMAIL));
  assert.equal(calls.list, 1);
  assert.equal(calls.log.length, 1, "list access logged");
  assert.ok(!JSON.stringify(calls.log).includes("secret"), "search text not logged");
}
{
  const { deps } = makeDeps({ guard: "allow", logOk: false });
  const res = await handleRatingsListenersList(listReq, deps);
  assert.equal(res.status, 503, "audit failure → 503");
  const body = await res.text();
  assert.deepEqual(JSON.parse(body), AUDIT_UNAVAILABLE_BODY);
  assert.ok(!body.includes(PII_EMAIL), "fail closed: no PII without audit row");
  const { deps: d2 } = makeDeps({ guard: "allow", logOk: false });
  const res2 = await handleRatingsListenerDetail(U, d2);
  assert.equal(res2.status, 503);
  assert.ok(!(await res2.text()).includes(PII_EMAIL), "detail fail closed");
}
{
  const { deps, calls } = makeDeps({ guard: "allow" });
  const res = await handleRatingsListenerDetail(U, deps);
  assert.equal(res.status, 200);
  assert.equal(calls.log.length, 1, "detail access logged");
  const logged = calls.log[0] as { kind: string; targetUserId: string };
  assert.equal(logged.kind, "detail");
  assert.equal(logged.targetUserId, U);
  const { deps: d2, calls: c2 } = makeDeps({ guard: "allow" });
  const bad = await handleRatingsListenerDetail("../../etc/passwd", d2);
  assert.equal(bad.status, 400);
  assert.equal(c2.detail, 0, "invalid id never queries");
  const { deps: d3, calls: c3 } = makeDeps({ guard: "allow", found: false });
  const nf = await handleRatingsListenerDetail(U, d3);
  assert.equal(nf.status, 404);
  assert.equal(c3.log.length, 0);
  const { deps: d4 } = makeDeps({ guard: "allow", throwOnQuery: true });
  const err = await handleRatingsListenersList(listReq, d4);
  assert.equal(err.status, 500);
  assert.ok(!(await err.text()).includes("relation"), "DB message never returned");
}

// --- source contracts ------------------------------------------------------
const listRoute = read("src/app/api/admin/analytics/ratings/listeners/route.ts");
const detailRoute = read("src/app/api/admin/analytics/ratings/listeners/[userId]/route.ts");
for (const [name, src] of [["list", listRoute], ["detail", detailRoute]] as const) {
  assert.match(src, /requireActor: requireRatingsListenersViewActor/, `${name} route wires the listeners guard`);
  assert.match(src, /writeAccessLog: writeAdminRatingsListenersAccessLog/, `${name}: real audit writer wired`);
}
const sqlRunner = read("scripts/admin-ratings-listeners-sql-unit.mjs");
assert.doesNotMatch(sqlRunner, /execFileSync\(\s*"(docker|sudo)"/, "SQL smoke never targets an existing server");
assert.match(sqlRunner, /initdb/, "SQL smoke uses a disposable cluster");
const auditWriter = read("src/lib/admin/analytics-ratings-listeners-queries.ts");
assert.match(auditWriter, /Promise<boolean>/, "audit writer reports success for fail-closed routes");
assert.match(auditWriter, /target_email_hash:[\s\S]*hashListenerEmailForAudit\(/, "audit row stores sha256 of email");
assert.doesNotMatch(auditWriter, /^\s*(target_)?email:/m, "audit row never stores raw email");
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

// Event history truncation notice (review r3 MINOR).
assert.equal(describeAdminRatingsListenerEventsTruncation({ eventTotal: 2, events: [1, 2] }), null);
assert.equal(describeAdminRatingsListenerEventsTruncation({ eventTotal: 0, events: [] }), null);
{
  const note = describeAdminRatingsListenerEventsTruncation({ eventTotal: 250, events: new Array(200).fill(0) });
  assert.ok(note && note.includes("200") && note.includes("250") && /неполная/.test(note));
  assert.doesNotMatch(note!, /фрод|накрут|наруш/i);
}
assert.match(panel, /describeAdminRatingsListenerEventsTruncation\(detail\)/, "panel shows truncated-history notice");

// Migration version must be unique across the repo (collision with PR #890's 20270106120000 fixed).
{
  const files = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
  const versions = files.map((f) => f.split("_")[0]);
  const dupes = versions.filter((v, i) => versions.indexOf(v) !== i);
  assert.deepEqual(dupes, [], "no duplicate Supabase migration versions");
  const mine = files.filter((f) => f.endsWith("_admin_ratings_listeners.sql"));
  assert.deepEqual(mine, ["20270107190000_admin_ratings_listeners.sql"]);
  assert.notEqual(mine[0].split("_")[0], "20270106120000", "must not reuse PR #890 version");
  // Must sort after #899's 20270107120000 (already applied on prod), otherwise the deploy planner aborts with history drift.
  assert.ok(mine[0].split("_")[0] > "20270107120000", "must be newer than the latest applied production migration");
}

console.log("admin-ratings-listeners-unit: ok");
