/**
 * «АудиоЛад Бизнес» → «Подарочная неделя» (task 253821e0): aggregation, owner-only nav, static render.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminBusinessTrials from "../src/components/admin/AdminBusinessTrials";
import AdminNavTabs from "../src/components/admin/AdminNavTabs";
import { BUSINESS_TRIALS_IN_CHUNK, BUSINESS_TRIALS_PAGE_SIZE, chunkValues, selectInPaged, type BusinessTrialsDb, type BusinessTrialsQuery } from "../src/lib/admin/business-trials-select";
import {
  BUSINESS_TRIAL_STATUS_LABELS,
  buildBusinessTrialStats,
  businessTrialFirstPlay,
  earliestBusinessTrialDay,
  latestIso,
  type BusinessTrialFacts,
} from "../src/lib/admin/business-trials";
import { ADMIN_NAV_ITEMS, BUSINESS_TRIALS_HREF, canSeeBusinessTrialStats, getVisibleAdminNavItems } from "../src/lib/admin/nav";
import { groupAudioladBusinessNav } from "../src/lib/admin/nav-group";
import type { PlatformAccessSnapshot } from "../src/lib/auth/platform-access";
import { PLATFORM_TEAM_ROLES, resolvePermissionsForRoles, type PlatformTeamRole } from "../src/lib/auth/platform-permissions";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const DAY = 86_400_000;
const now = new Date("2026-11-10T12:00:00.000Z");
const at = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
const KIND = "business_new_client";
const uid = (n: number) => `0000000${n}-aaaa-4bbb-8ccc-dddddddddddd`;

const grants = [
  // 1: guest, day 2 of 7, played in cabinet.
  { userId: uid(1), hasEmail: false, kind: KIND, startsAt: at(-2), endsAt: at(5) },
  // 2: registered, gift ended 1 day ago -> grace.
  { userId: uid(2), hasEmail: true, kind: KIND, startsAt: at(-8), endsAt: at(-1) },
  // 3: registered, gift ended long ago, paid until +20 days.
  { userId: uid(3), hasEmail: true, kind: KIND, startsAt: at(-30), endsAt: at(-23) },
  // 4: registered from guest, gift ended 10 days ago -> closed.
  { userId: uid(4), hasEmail: true, kind: KIND, startsAt: at(-17), endsAt: at(-10) },
  // 5: other kind -> ignored; 6: broken dates -> ignored; duplicate of 1 -> ignored.
  { userId: uid(5), hasEmail: true, kind: "other", startsAt: at(-1), endsAt: at(6) },
  { userId: uid(6), hasEmail: true, kind: KIND, startsAt: "nope", endsAt: at(6) },
  { userId: uid(1), hasEmail: false, kind: KIND, startsAt: at(-1), endsAt: at(6) },
];
const facts = new Map<string, BusinessTrialFacts>([
  [uid(1), { organizationName: "Моя кофейня", workspacePlaybackAt: at(-0.5), pointSeenAt: at(-1), guestStart: true }],
  [uid(2), { firstUsefulAction: true, organizationName: "  " }],
  [uid(3), { paidUntil: at(20), organizationName: "Кофе на углу", deviceSeenAt: at(-0.1) }],
  [uid(4), { guestStart: true, pointSeenAt: at(-11) }],
]);

const stats = buildBusinessTrialStats({ now, grants, facts });
assert.deepEqual(stats.totals, {
  started: 4,
  trial: 1,
  grace: 1,
  paid: 1,
  closed: 1,
  guests: 1,
  registered: 3,
  firstPlayYes: 2,
  activeEnough: null,
});
assert.equal(stats.generatedAt, now.toISOString());
assert.deepEqual(stats.rows.map((row) => row.userId), [uid(1), uid(2), uid(4), uid(3)], "newest start first");

const byId = new Map(stats.rows.map((row) => [row.userId, row]));
const guest = byId.get(uid(1))!;
assert.equal(guest.status, "trial");
assert.equal(guest.daysLeft, 5);
assert.equal(guest.account, "guest");
assert.equal(guest.title, "Моя кофейня");
assert.equal(guest.firstPlay, "yes");
assert.equal(guest.lastActivityAt, at(-0.5), "latest of cabinet and point");
assert.equal(guest.startsAt, at(-2), "first grant row wins over the duplicate");

const grace = byId.get(uid(2))!;
assert.equal(grace.status, "grace");
assert.equal(grace.daysLeft, 2, "grace: days until playback stops");
assert.equal(grace.title, "Без заведения", "blank venue name");
assert.equal(grace.shortId, uid(2).replace(/-/g, "").slice(0, 8), "anonymous id");
assert.equal(grace.firstPlay, "yes", "first_useful_action counts");
assert.equal(grace.lastActivityAt, null);

const paid = byId.get(uid(3))!;
assert.equal(paid.status, "paid");
assert.equal(paid.daysLeft, 20);
assert.equal(paid.firstPlay, "unknown", "point/device only -> unknown");

const closed = byId.get(uid(4))!;
assert.equal(closed.status, "closed");
assert.equal(closed.daysLeft, 0);
assert.equal(closed.account, "registered_from_guest");

// Edge: exact end instant is already grace; end + 3 days is closed.
const edge = buildBusinessTrialStats({
  now,
  grants: [
    { userId: uid(7), hasEmail: false, kind: KIND, startsAt: at(-7), endsAt: now.toISOString() },
    { userId: uid(8), hasEmail: false, kind: KIND, startsAt: at(-10), endsAt: at(-3) },
  ],
});
assert.equal(edge.rows.find((row) => row.userId === uid(7))?.status, "grace");
assert.equal(edge.rows.find((row) => row.userId === uid(8))?.status, "closed");
assert.equal(edge.rows.find((row) => row.userId === uid(8))?.firstPlay, "no");
assert.deepEqual(buildBusinessTrialStats({ now, grants: [] }).totals.started, 0);

assert.equal(businessTrialFirstPlay({}), "no");
assert.equal(businessTrialFirstPlay({ workspacePlaybackAt: "bad" }), "no");
assert.equal(latestIso(null, "bad", at(1), at(-1)), at(1));
assert.equal(BUSINESS_TRIAL_STATUS_LABELS.grace, "льготный период");

// Owner only: nav item and page guard.
const access = (roles: PlatformTeamRole[]): PlatformAccessSnapshot => ({
  userId: "00000000-0000-4000-8000-000000000001",
  roles,
  permissions: resolvePermissionsForRoles(roles),
  usedLegacyFallback: false,
});
const item = ADMIN_NAV_ITEMS.find((entry) => entry.href === BUSINESS_TRIALS_HREF);
assert.ok(item);
assert.equal(item.label, "Подарочная неделя");
assert.equal(item.ownerOnly, true);
assert.equal(canSeeBusinessTrialStats(access(["owner"])), true);
for (const role of PLATFORM_TEAM_ROLES.filter((name) => name !== "owner")) {
  assert.equal(canSeeBusinessTrialStats(access([role])), false, role);
  assert.equal(getVisibleAdminNavItems(access([role])).some((entry) => entry.href === BUSINESS_TRIALS_HREF), false, role);
}
assert.ok(getVisibleAdminNavItems(access(["owner"])).some((entry) => entry.href === BUSINESS_TRIALS_HREF));

const page = read("src/app/(platform)/admin/business-trials/page.tsx");
assert.match(page, /requireAdminPanelAccess\(\)/);
assert.match(page, /canSeeBusinessTrialStats\(session\.access\)\) forbidden\(\)/);
const queries = read("src/lib/admin/business-trials-queries.ts");
assert.doesNotMatch(queries, /\.(insert|update|upsert|delete|rpc)\(/, "read-only loader");
const selected = [...queries.matchAll(/\.select\("([^"]+)"\)|"(user_id, [^"]+|id, name|email_hash, [^"]+|organization_id, [^"]+)"/g)]
  .map((match) => match[1] ?? match[2]).join(",");
assert.ok(selected.includes("starts_at"), "columns parsed");
for (const column of selected.split(",").map((value) => value.trim())) {
  assert.ok(!/(^email$|network|ip|token|address)/.test(column), `column ${column}`);
}
assert.ok(!/\.select\("\*"\)/.test(queries), "no select *");
assert.ok(!queries.includes("auth.admin"), "no auth user lookup (email)");

// The tab lives inside «АудиоЛад Бизнес», not as a new top-level pill.
const grouped = groupAudioladBusinessNav([
  { href: "/admin", label: "Обзор" },
  { href: "/admin/business-admissions", label: "Допуски музыки" },
  { href: "/admin/business-verification", label: "Проверка правообладателей" },
  { href: "/admin/business-track-review", label: "Прослушивание треков" },
  { href: BUSINESS_TRIALS_HREF, label: "Подарочная неделя" },
]);
assert.equal(grouped.primary.some((entry) => entry.href === BUSINESS_TRIALS_HREF), false);
assert.deepEqual(grouped.business?.map((entry) => entry.label), [
  "Допуски музыки",
  "Проверка правообладателей",
  "Прослушивание треков",
  "Подарочная неделя",
]);
assert.equal(grouped.primary.find((entry) => entry.navId === "audiolad-business")?.href, "/admin/business-admissions");
const navHtml = renderToStaticMarkup(createElement(AdminNavTabs, {
  items: [
    { href: "/admin", label: "Обзор" },
    { href: "/admin/business-admissions", label: "Допуски музыки" },
    { href: BUSINESS_TRIALS_HREF, label: "Подарочная неделя" },
  ],
  pathname: BUSINESS_TRIALS_HREF,
}));
assert.match(navHtml, /data-nav-href="audiolad-business"[^>]*aria-current="true"/);
assert.match(navHtml, /data-nav-href="\/admin\/business-trials"[^>]*aria-current="page"/);

// Static render of the screen.
const html = renderToStaticMarkup(createElement(AdminBusinessTrials, { data: stats }));
for (const text of ["Начали", "Сейчас в подарке", "Льготный период", "Сейчас оплачено", "Закрыто", "Моя кофейня", "Кофе на углу", "гость", "зарегистрирован (начинал гостем)", "подарок", "льготный период", "оплачено", "закрыто", "неизвестно", "5 дней", "2 дня", "МСК"]) {
  assert.ok(html.includes(text), text);
}
assert.doesNotMatch(html, /—/, "en dash only");
assert.doesNotMatch(html, /@|email_hash/);
assert.doesNotMatch(page + read("src/components/admin/AdminBusinessTrials.tsx") + read("src/lib/admin/business-trials.ts"), /—/);
const empty = renderToStaticMarkup(createElement(AdminBusinessTrials, { data: buildBusinessTrialStats({ now, grants: [] }) }));
assert.match(empty, /Пока никто не начинал подарочную неделю/);

// Paging: every IN-chunk is read page by page with a stable order; >1000 rows are never truncated.
type FakeCall = { table: string; columns: string; in?: [string, readonly string[]]; eq: [string, string][]; gte: [string, string][]; order: string[]; range?: [number, number] };
function fakeDb(rowsFor: (call: FakeCall) => Record<string, unknown>[], calls: FakeCall[], cap = BUSINESS_TRIALS_PAGE_SIZE): BusinessTrialsDb {
  return {
    from(table) {
      return {
        select(columns) {
          const call: FakeCall = { table, columns, eq: [], gte: [], order: [] };
          const q: BusinessTrialsQuery = {
            in(column, values) { call.in = [column, values]; return q; },
            eq(column, value) { call.eq.push([column, value]); return q; },
            gte(column, value) { call.gte.push([column, value]); return q; },
            order(column) { call.order.push(column); return q; },
            range(from, to) { call.range = [from, to]; return q; },
            then(resolve, reject) {
              calls.push(call);
              const all = rowsFor(call);
              const [from, to] = call.range ?? [0, all.length - 1];
              const data = all.slice(from, Math.min(to + 1, from + cap));
              return Promise.resolve({ data, error: null }).then(resolve, reject);
            },
          };
          return q;
        },
      };
    },
  };
}
async function pagingTests(): Promise<void> {
  assert.equal(BUSINESS_TRIALS_IN_CHUNK, 50);
  assert.deepEqual(chunkValues(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
  const orgs = Array.from({ length: 51 }, (_, i) => `org-${i}`);
  // First chunk holds 2500 rows (3 pages), second chunk 1000 exactly (2 pages: 1000 + 0).
  const rowsFor = (call: FakeCall) => {
    const part = call.in?.[1] ?? [];
    const n = part.length === 50 ? 2500 : 1000;
    return Array.from({ length: n }, (_, i) => ({ organization_id: part[i % part.length], i }));
  };
  const calls: FakeCall[] = [];
  const rows = await selectInPaged(fakeDb(rowsFor, calls), "business_point_sessions", "organization_id, last_seen_at", "organization_id", orgs, {
    order: ["id"],
    eq: { kind: "k" },
    gte: { day: "2026-11-01" },
  });
  assert.equal(rows.length, 3500, "no silent 1000-row truncation");
  assert.equal(calls.length, 5, "3 pages for chunk 1, 2 pages for chunk 2");
  assert.deepEqual(calls.map((c) => c.range), [[0, 999], [1000, 1999], [2000, 2999], [0, 999], [1000, 1999]]);
  for (const c of calls) {
    assert.deepEqual(c.order, ["id"], "stable order on every page");
    assert.deepEqual(c.eq, [["kind", "k"]]);
    assert.deepEqual(c.gte, [["day", "2026-11-01"]]);
    assert.ok((c.in?.[1].length ?? 0) <= 50);
  }
  // Activity days: 1 org x 1500 days > 1000 rows, all read across two pages with the day bound.
  {
    const activityCalls: FakeCall[] = [];
    const days = Array.from({ length: 1500 }, (_, i) => ({ organization_id: "org-1", day: `d${String(i).padStart(4, "0")}`, listened_seconds: 60, cabinet_visits: 1 }));
    const activityRows = await selectInPaged(
      fakeDb(() => days, activityCalls),
      "business_trial_activity_days",
      "organization_id, day, listened_seconds, cabinet_visits",
      "organization_id",
      ["org-1"],
      { order: ["organization_id", "day"], gte: { day: "2026-10-01" } },
    );
    assert.equal(activityRows.length, 1500, "activity days beyond 1000 rows are not dropped");
    assert.equal(activityCalls.length, 2);
    for (const c of activityCalls) {
      assert.deepEqual(c.order, ["organization_id", "day"]);
      assert.deepEqual(c.gte, [["day", "2026-10-01"]]);
    }
  }
  assert.equal(earliestBusinessTrialDay([]), null);
  assert.equal(earliestBusinessTrialDay([{ startsAt: "bad" }]), null);
  assert.equal(
    earliestBusinessTrialDay([{ startsAt: "2026-11-01T10:00:00.000Z" }, { startsAt: "2026-10-20T21:30:00.000Z" }, { startsAt: "2026-10-25T00:00:00.000Z" }]),
    "2026-10-21",
    "Moscow day: 21:30Z on 20 Oct is 00:30 MSK on 21 Oct",
  );
  await assert.rejects(
    selectInPaged(fakeDb(rowsFor, []), "t", "a", "a", ["x"], { order: [] }),
    /business_trials_t_order_required/,
  );
  const erroring: BusinessTrialsDb = {
    from: () => ({
      select: () => {
        const q: BusinessTrialsQuery = {
          in: () => q, eq: () => q, gte: () => q, order: () => q, range: () => q,
          then: (resolve, reject) => Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve, reject),
        };
        return q;
      },
    }),
  };
  await assert.rejects(selectInPaged(erroring, "t", "a", "a", ["x"], { order: ["a"] }), /business_trials_t_failed: .*boom/);
}
{
  const queries = read("src/lib/admin/business-trials-queries.ts");
  assert.match(queries, /^import "server-only";/, "loader is server-only");
  // B1: activity days are paged with (organization_id, day) order and cut at the earliest gift start day.
  assert.match(
    queries,
    /"business_trial_activity_days",[\s\S]*?order: \["organization_id", "day"\],\s*gte: \{ day: earliestDay \}/,
    "activity days paged and bounded by earliest start day",
  );
  assert.match(queries, /const earliestDay = earliestBusinessTrialDay\(grants\);/);
  assert.doesNotMatch(queries, /\.in\(/, "every IN read goes through the paged helper");
  const calls = queries.split(/selectIn\(\s*db,/).slice(1);
  assert.ok(calls.length >= 9, `selectIn calls: ${calls.length}`);
  for (const call of calls) assert.match(call.slice(0, 320), /order: \[/, `stable order: ${call.slice(0, 80)}`);
}

if (process.env.BUSINESS_TRIALS_RENDER_OUT) {
  writeFileSync(process.env.BUSINESS_TRIALS_RENDER_OUT, `${navHtml}\n<div class="mt-6">${html}</div>`);
}

pagingTests().then(
  () => console.log("admin-business-trials-unit: ok"),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
