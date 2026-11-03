import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessCalendarDaysLeft, businessProfileSubscription } from "../src/lib/business-app/profile-subscription";
import { validateBusinessProfile, businessKindLabel, businessTimezoneLabel } from "../src/lib/business-app/profile";
import { extractBusinessFirstName } from "../src/lib/business-app/domain-identity";
import { buildBusinessGreeting } from "../src/lib/business-app/greeting";

const now = new Date("2026-11-03T12:00:00Z");
const end = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
for (const [days, word] of [[1, "день"], [2, "дня"], [5, "дней"], [11, "дней"], [12, "дней"], [13, "дней"], [14, "дней"], [21, "день"], [22, "дня"]] as const) {
  const summary = businessProfileSubscription({ mode: "trial", endsAt: end(days) }, "Europe/Moscow", now);
  assert.equal(summary.title, `Бесплатный доступ ещё ${days} ${word}`);
  assert.equal(summary.button, "Оплатить заранее");
}
assert.equal(businessProfileSubscription({ mode: "paid", endsAt: end(22) }, "Europe/Moscow", now).title, "Музыка оплачена ещё на 22 дня");
assert.equal(businessProfileSubscription({ mode: "paid", endsAt: end(1) }, "Europe/Moscow", now).button, "Продлить");
assert.equal(businessProfileSubscription({ mode: "trial", endsAt: "2026-11-03T18:00:00Z" }, "Europe/Moscow", now).title, "Бесплатный доступ – сегодня последний день");
assert.equal(businessProfileSubscription({ mode: "paid", endsAt: "2026-11-03T20:00:00Z" }, "Europe/Moscow", now).title, "Музыка оплачена – сегодня последний день");
assert.equal(businessProfileSubscription({ mode: "paid", endsAt: now.toISOString() }, "Europe/Moscow", now).button, "Оплатить", "access ends exactly at endsAt");
for (const mode of ["grace", "offer", "none", "trial", "paid"] as const) {
  assert.deepEqual(businessProfileSubscription({ mode, endsAt: end(-1) }, "Europe/Moscow", now), {
    title: "Оплатите, чтобы музыка продолжала играть.", until: null, button: "Оплатить",
  });
}
assert.equal(businessProfileSubscription({ mode: "trial", endsAt: "invalid" }, "Europe/Moscow", now).until, null);
assert.equal(businessProfileSubscription({ mode: "none", endsAt: null }, "Europe/Moscow", now).until, null);
assert.equal(businessProfileSubscription({ mode: "trial", endsAt: end(1) }, "bad-zone", now).until, "до 4 ноября");
assert.equal(businessCalendarDaysLeft(new Date("2026-11-03T22:00:00Z"), new Date("2026-11-03T20:59:00Z"), "Europe/Moscow"), 1);
assert.equal(businessCalendarDaysLeft(new Date("2026-11-03T22:00:00Z"), new Date("2026-11-03T20:59:00Z"), "Asia/Vladivostok"), 0);
assert.equal(businessCalendarDaysLeft(new Date("2026-03-30T10:00:00Z"), new Date("2026-03-28T11:00:00Z"), "Europe/Berlin"), 2, "DST: 47 hours spans two calendar days");
assert.equal(businessCalendarDaysLeft(new Date("2027-01-01T10:00:00Z"), new Date("2026-12-31T10:00:00Z"), "Europe/Moscow"), 1);
assert.deepEqual(validateBusinessProfile({ ownerName: "  Анна  ", organizationName: "  Кофейня  " }), { ok: true, ownerName: "Анна", organizationName: "Кофейня" });
assert.equal(validateBusinessProfile({ ownerName: "", organizationName: "" }).ok, true);
for (const bad of ["<b>Анна</b>", "Анна>", "\u0000", "\nАнна", "Анна\t", "\u007f", "\u202e"]) {
  assert.equal(validateBusinessProfile({ ownerName: bad, organizationName: "" }).ok, false);
  assert.equal(validateBusinessProfile({ ownerName: "", organizationName: bad }).ok, false);
}
for (const [ownerName, organizationName, ok] of [["А".repeat(80), "Я".repeat(120), true], ["А".repeat(81), "", false], ["", "Я".repeat(121), false]] as const) {
  assert.equal(validateBusinessProfile({ ownerName, organizationName }).ok, ok);
}
assert.equal(validateBusinessProfile({ ownerName: null, organizationName: 123 }).ok, false);
assert.equal(validateBusinessProfile(null).ok, false);
assert.equal(validateBusinessProfile({}).ok, false);
assert.equal(extractBusinessFirstName({ metadataFirstName: "", fullName: "Старое имя", email: "fixture@example.invalid" }), "");
assert.match(buildBusinessGreeting(extractBusinessFirstName({ metadataFirstName: "Новое имя" }), now), /Новое имя/);
assert.equal(businessKindLabel("cafe"), "Кофейня");
assert.equal(businessKindLabel("unknown"), "unknown");
assert.equal(businessKindLabel("toString"), "toString");
assert.equal(businessTimezoneLabel("Europe/Moscow"), "Москва (UTC+3)");
assert.equal(businessTimezoneLabel("unknown"), "unknown");
assert.equal(businessTimezoneLabel("__proto__"), "__proto__");
const form = readFileSync("src/components/business-app/profile/BusinessProfileForm.tsx", "utf8");
assert.match(form, /router\.refresh\(\)/);
assert.doesNotMatch(form, /window\.location/);
const subscription = readFileSync("src/components/business-app/profile/BusinessProfileSubscription.tsx", "utf8");
assert.match(subscription, /useBusinessHomePay\(\)/);
assert.match(subscription, /BusinessPayControls/);
assert.match(subscription, /onAccept=\{accept\}/);
const controls = readFileSync("src/components/business-app/BusinessHomeAccessCard.tsx", "utf8");
assert.match(controls, /businessGiftPriceNote\(\)/);
assert.doesNotMatch(subscription, /отсроч|799|checkout|window\.location/u);
const sql = readFileSync("supabase/migrations/20270216120000_business_profile_organization.sql", "utf8");
assert.match(sql, /is_business_organization_owner\(p_organization_id, v_user_id\)/);
assert.match(sql, /FROM PUBLIC, anon/);
assert.doesNotMatch(sql, /GRANT UPDATE|CREATE POLICY/);
for (const cf of ["\\u202A-\\u202E", "\\u200B-\\u200F", "\\u2066-\\u206F", "\\uFEFF", "\\u00AD", "[:cntrl:]"]) assert.ok(sql.includes(cf), `SQL must reject ${cf}`);
{
  // Every Cf code point in the BMP+astral must be inside the SQL class mirrored from TypeScript.
  const ranges = [...sql.matchAll(/\\(?:u([0-9A-F]{4})|U([0-9A-F]{8}))(?:-\\(?:u([0-9A-F]{4})|U([0-9A-F]{8})))?/g)].map((m) => { const a = parseInt(m[1] ?? m[2], 16); const b = m[3] ?? m[4]; return [a, b ? parseInt(b, 16) : a]; });
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (/\p{Cf}/u.test(String.fromCodePoint(cp))) assert.ok(ranges.some(([a, b]) => cp >= a && cp <= b), `SQL misses Cf U+${cp.toString(16)}`);
  }
}
console.log("business-app-profile-unit: OK");

// Render the exact shared controls to verify the terms gate and the sole green action.
const { createElement: h } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { BusinessPayControls } = await import("../src/components/business-app/BusinessHomeAccessCard");
const controlsProps = { canPay: true, accepted: true, busy: false, error: null, onAccept() {}, onPay() {}, buttonVariant: "cta" as const };
for (const payLabel of ["Оплатить заранее", "Продлить", "Оплатить"]) {
  const html = renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, payLabel }));
  assert.match(html, new RegExp(payLabel));
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.match(html, /business-app-btn-cta/);
  assert.doesNotMatch(html, /biz-home-accept/);
}
const unaccepted = renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, accepted: false }));
assert.doesNotMatch(unaccepted, /biz-home-pay-button/);
assert.match(unaccepted, /Принять условия/);
assert.match(unaccepted, /href="\/documents\/b2b-terms"/);
assert.equal(renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, canPay: false })), "");
assert.match(renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, busy: true })), /disabled=""/);
console.log("business-app-profile shared controls: OK");
