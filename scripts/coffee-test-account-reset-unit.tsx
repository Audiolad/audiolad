// «Тестовый аккаунт кофейни» (owner request 04.11.2026): model, proxy wipe, UI copy, guards.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";

import {
  COFFEE_TEST_ACCOUNT_HREF, COFFEE_TEST_RESET_ARM_COOKIE, COFFEE_TEST_RESET_COUNT_LABELS,
  COFFEE_TEST_RESET_ERROR_TEXT, COFFEE_TEST_RESET_PUBLIC_PATH, coffeeTestResetErrorCode,
  isCoffeeTestCookieName, isCoffeeTestStorageKey, parseCoffeeTestAccounts, parseCoffeeTestResetCounts,
} from "../src/lib/admin/coffee-test-reset/model";
import { getVisibleAdminNavItems } from "../src/lib/admin/nav";
import { isBusinessNoAnalyticsRoute } from "../src/lib/analytics/yandex-metrika-environment";
import { migrateCoffeeGuestCookie } from "../src/lib/business-app/coffee-host-proxy";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import {
  CoffeeTestAccountCard, CoffeeTestResetDialog, CoffeeTestResetDone,
} from "../src/components/admin/CoffeeTestAccountPanel";
import type { PlatformAccessSnapshot } from "../src/lib/auth/platform-access";
import { resolvePermissionsForRoles, type PlatformTeamRole } from "../src/lib/auth/platform-permissions";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// --- model
assert.equal(COFFEE_TEST_ACCOUNT_HREF, "/admin/business-coffee-test-account");
assert.equal(coffeeTestResetErrorCode('test_reset_forbidden'), "forbidden");
assert.equal(coffeeTestResetErrorCode('x test_reset_target_not_allowlisted y'), "not_allowlisted");
assert.equal(coffeeTestResetErrorCode('test_reset_target_protected'), "protected");
assert.equal(coffeeTestResetErrorCode('test_reset_shared_organization'), "shared_venue");
assert.equal(coffeeTestResetErrorCode('test_reset_input_invalid'), "invalid");
assert.equal(coffeeTestResetErrorCode('function does not exist'), "unavailable");
assert.equal(coffeeTestResetErrorCode(undefined), "unavailable");
const accounts = parseCoffeeTestAccounts([
  { user_id: "11111111-1111-4111-8111-111111111111", email_masked: "c•••@example.test", organizations: 1, gifts: 1,
    paid_summaries: 0, offer_acceptances: 2, subscription_periods: 0, last_reset_at: null },
  { user_id: 5 }, null, "x",
]);
assert.equal(accounts.length, 1);
assert.deepEqual(parseCoffeeTestAccounts(null), []);
assert.deepEqual(parseCoffeeTestResetCounts({ counts: { gifts: 1, bad: "2", memberships: 0 } }), { gifts: 1, memberships: 0 });
assert.deepEqual(parseCoffeeTestResetCounts(null), {});
const migration = read("supabase/migrations/20270221120000_business_test_account_reset.sql");
for (const [key] of COFFEE_TEST_RESET_COUNT_LABELS) assert.ok(migration.includes(`'${key}'`), `count key ${key} exists in SQL`);
for (const text of [...Object.values(COFFEE_TEST_RESET_ERROR_TEXT), ...COFFEE_TEST_RESET_COUNT_LABELS.map(([, l]) => l)]) {
  assert.ok(!text.includes("—") && !/ - /.test(text), `en dash only: ${text}`);
}
for (const key of ["audiolad-business-sound-profile", "audiolad.business.guest-start.v1", "audiolad.cabinet.device-session",
  "audiolad_ym_business_goals_sent", "audiolad_anonymous_id", "audiolad-business-venue-player-credential"]) {
  assert.equal(isCoffeeTestStorageKey(key), true, key);
}
assert.equal(isCoffeeTestStorageKey("sb-abc-auth-token"), false);
for (const name of ["al-coffee-pref-sound-profile", "al-point", "al-biz-view", "al_biz_guest", "al_coffee_handoff", "audiolad_analytics_cookies"]) {
  assert.equal(isCoffeeTestCookieName(name), true, name);
}
assert.equal(isCoffeeTestCookieName("al-auth-scope"), false, "auth scope marker is never touched by hand");
assert.equal(isCoffeeTestCookieName("sb-abc-auth-token"), false);
assert.equal(isCoffeeTestCookieName("_ym_uid"), false);

// --- SQL hard rules: payments and orders are never deleted or updated
for (const table of ["orders", "payments", "business_subscription_periods", "refunds", "receipts"]) {
  assert.doesNotMatch(migration, new RegExp(`(DELETE\\s+FROM|UPDATE|TRUNCATE)\\s+(public\\.)?${table}\\b`, "i"), table);
}
assert.match(migration, /public\.is_platform_owner\(p_actor\)/);
assert.match(migration, /business_test_account_allowlist/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reset_business_test_account\(uuid, uuid, text\[\], text, text\) TO service_role;/);
assert.doesNotMatch(migration, /GRANT[^;]*reset_business_test_account[^;]*(authenticated|anon)/i);
assert.doesNotMatch(migration, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/, "no address in the migration");

// --- server action: owner check first, local sign-out only, no address in logs
const action = read("src/app/(platform)/admin/business-coffee-test-account/actions.ts");
assert.ok(action.indexOf("requirePlatformOwnerAccess(") < action.indexOf("createServiceRoleClient()"), "owner check before service role");
assert.match(action, /signOut\(\{ scope: "local" \}\)/);
assert.doesNotMatch(action, /console\.(error|log|warn)\([^)]*(email|session\.)/);
const page = read("src/app/(platform)/admin/business-coffee-test-account/page.tsx");
assert.ok(page.indexOf("requirePlatformOwnerAccess(") < page.indexOf("createServiceRoleClient()"));

// --- nav: owner only
const accessFor = (roles: PlatformTeamRole[]): PlatformAccessSnapshot => ({
  userId: "00000000-0000-4000-8000-000000000001", roles, permissions: resolvePermissionsForRoles(roles), usedLegacyFallback: false,
});
const owner = accessFor(["owner"]);
const admin = accessFor(["admin"]);
assert.ok(getVisibleAdminNavItems(owner).some((item) => item.href === COFFEE_TEST_ACCOUNT_HREF));
assert.ok(!getVisibleAdminNavItems(admin).some((item) => item.href === COFFEE_TEST_ACCOUNT_HREF));

// --- coffee host: /test-reset is a no-analytics business page, never on the main site
const flag = process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";
try {
  assert.deepEqual(resolveBusinessProxyAction("coffee.audiolad.ru", COFFEE_TEST_RESET_PUBLIC_PATH),
    { action: "rewrite_business_app", pathname: "/business-app/test-reset" });
  assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", COFFEE_TEST_RESET_PUBLIC_PATH),
    { action: "rewrite_business_app", pathname: "/business-app/test-reset" });
  assert.deepEqual(resolveBusinessProxyAction("audiolad.ru", "/business-app/test-reset"), { action: "not_found" });
  assert.equal(isBusinessNoAnalyticsRoute("/test-reset"), true);
  assert.equal(isBusinessNoAnalyticsRoute("/business-app/test-reset"), true);

  const req = (host: string, cookie: string) =>
    new NextRequest(`https://${host}/test-reset`, { headers: { host, cookie } });
  const token = "a".repeat(43);
  // Not armed: nothing expired, and no legacy token migration either.
  const idle = migrateCoffeeGuestCookie(req("business.audiolad.ru", `al_biz_guest=${token}`), NextResponse.next());
  assert.deepEqual(idle.headers.getSetCookie(), []);
  assert.equal(idle.headers.get("cache-control"), "private, no-store");
  // Armed: every guest/point/view cookie and the marker expire, host-only and domain copies.
  for (const host of ["coffee.audiolad.ru", "business.audiolad.ru"]) {
    const armed = migrateCoffeeGuestCookie(req(host, `${COFFEE_TEST_RESET_ARM_COOKIE}=1; al_biz_guest=${token}`), NextResponse.next());
    const lines = armed.headers.getSetCookie();
    for (const name of ["al_biz_guest_shared", "al_biz_guest", "al_coffee_handoff", "al-point", "al-biz-view", COFFEE_TEST_RESET_ARM_COOKIE]) {
      assert.ok(lines.some((l) => l.startsWith(`${name}=;`) && /Max-Age=0/.test(l) && !/Domain=/.test(l)), `${host} host-only ${name}`);
      assert.ok(lines.some((l) => l.startsWith(`${name}=;`) && /Max-Age=0/.test(l) && /Domain=\.?audiolad\.ru/.test(l)), `${host} domain ${name}`);
    }
    assert.ok(!lines.some((l) => l.startsWith(`al_biz_guest_shared=${token}`)), "no re-migration of the old token");
    assert.ok(!lines.some((l) => l.startsWith("al-auth-scope")), "auth scope marker untouched");
  }
} finally {
  if (flag === undefined) delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  else process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = flag;
}

// --- UI copy: Russian, en dash only, green main CTA, danger reset, masked address only
const account = accounts[0]!;
const card = renderToStaticMarkup(<CoffeeTestAccountCard account={account} onReset={() => undefined} />);
assert.match(card, /bg-\[#3d8d65\][^"]*"[^>]*>Начать путь кофейни заново/);
assert.match(card, /c•••@example\.test/);
const dialog = renderToStaticMarkup(
  <CoffeeTestResetDialog account={account} pending={false} error={null} onCancel={() => undefined} onConfirm={() => undefined} />);
assert.match(dialog, /role="dialog"/);
assert.match(dialog, /aria-modal="true"/);
assert.match(dialog, /bg-\[#b34f63\][^"]*"[^>]*>Сбросить – начать с нуля/);
assert.match(dialog, /Оплаты, заказы и чеки – остаются в истории/);
const done = renderToStaticMarkup(<CoffeeTestResetDone counts={{ gifts: 1, memberships: 0 }} next="https://coffee.audiolad.ru/test-reset" />);
assert.match(done, /Подарок «7 дней» – отвязан: 1/);
assert.doesNotMatch(done, /Связи с кофейней сняты/, "zero counts are hidden");
const failed = renderToStaticMarkup(
  <CoffeeTestResetDialog account={account} pending error="shared_venue" onCancel={() => undefined} onConfirm={() => undefined} />);
assert.match(failed, /role="alert"/);
assert.match(failed, /Сбрасываем…/);
for (const html of [card, dialog, done, failed]) {
  assert.ok(!html.includes("—"), "no em dash");
  assert.doesNotMatch(html, / - /, "no hyphen as a dash");
}

console.log("coffee-test-account-reset-unit: ok");
