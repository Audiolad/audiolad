import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessCalendarDaysLeft, businessProfileSubscription } from "../src/lib/business-app/profile-subscription";
import {
  BUSINESS_OWNER_NAME_PLACEHOLDER, BUSINESS_PROFILE_NAME_HREF, validateBusinessProfile, businessKindLabel, businessTimezoneLabel,
} from "../src/lib/business-app/profile";
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
assert.deepEqual(validateBusinessProfile({ ownerName: "  Анна  ", venueName: "  Долина Кофе  " }), { ok: true, ownerName: "Анна", venueName: "Долина Кофе" });
assert.deepEqual(validateBusinessProfile({ ownerName: "", venueName: null }), { ok: true, ownerName: "", venueName: null }, "no venue yet: only the name");
assert.equal(validateBusinessProfile({ ownerName: "Анна", venueName: "   " }).ok, false, "the cafe name cannot be emptied");
for (const bad of ["<b>Анна</b>", "Анна>", "\u0000", "\nАнна", "Анна\t", "\u007f", "\u202e"]) {
  assert.equal(validateBusinessProfile({ ownerName: bad, venueName: "Кофе" }).ok, false);
  assert.equal(validateBusinessProfile({ ownerName: "", venueName: bad }).ok, false);
}
for (const [ownerName, venueName, ok] of [["А".repeat(80), "Я".repeat(120), true], ["А".repeat(81), "Кофе", false], ["", "Я".repeat(121), false]] as const) {
  assert.equal(validateBusinessProfile({ ownerName, venueName }).ok, ok);
}
assert.equal(validateBusinessProfile({ ownerName: null, venueName: 123 }).ok, false);
assert.equal(validateBusinessProfile({ ownerName: "", organizationName: "Кофе" }).ok, false, "old shape is rejected");
assert.equal(validateBusinessProfile(null).ok, false);
assert.equal(validateBusinessProfile({}).ok, false);
assert.equal(BUSINESS_OWNER_NAME_PLACEHOLDER, "Ваше имя");
assert.equal(BUSINESS_PROFILE_NAME_HREF, "/profile?edit=name");
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
assert.doesNotMatch(form, /window\.location\.(href|assign|replace|reload)/);
assert.match(form, /placeholder=\{BUSINESS_OWNER_NAME_PLACEHOLDER\}/);
assert.doesNotMatch(form, /Например, Анна|Организация/);
assert.match(form, />Название кофейни</);
assert.match(form, /get\("edit"\) !== "name"/);
assert.match(form, /focusBusinessOwnerNameField\(\)/);
assert.doesNotMatch(form, /\u2014/);
const page = readFileSync("src/app/business-app/profile/page.tsx", "utf8");
assert.doesNotMatch(page, /Изменить в управлении кофейней/, "no duplicate cafe row in the profile");
assert.match(page, /venueName=\{domain\.location\?\.name \?\? null\}/);
const action = readFileSync("src/app/business-app/profile/actions.ts", "utf8");
assert.match(action, /rpc\("rename_business_location"/, "the header venue name is renamed through the existing owner-only RPC");
assert.match(action, /p_location_id: location\.id/, "venue resolved on the server");
assert.match(action, /count !== 1\) return/, "organization sync only for a single-venue account");
const panel = readFileSync("src/components/business-app/VenueControlPanel.tsx", "utf8");
assert.doesNotMatch(panel, /Название кофейни|biz-venue-name|biz-venue-rename|action: "rename"/, "settings do not edit the cafe name");
const pointRoute = readFileSync("src/app/api/business/point/route.ts", "utf8");
assert.doesNotMatch(pointRoute, /rename_business_location/, "one rename path: the profile");
const switcher = readFileSync("src/components/business-app/BusinessEntrySwitcher.tsx", "utf8");
assert.match(switcher, /label: person \|\| BUSINESS_OWNER_NAME_PLACEHOLDER/);
assert.doesNotMatch(switcher, /label: person \|\| "–"/);
assert.match(switcher, /router\.push\(BUSINESS_PROFILE_NAME_HREF\)/);
assert.match(switcher, /if \(!person\) return openNameField\(\);/);
// On /profile the name field keeps the focus: the menu must not hand it back to the trigger.
assert.match(switcher, /const focusMoved = option\.onSelect\(\) === true;\s*close\(!focusMoved\);/);
assert.match(switcher, /focusBusinessOwnerNameField\(\)\) return true;/);
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
// Profile: after acceptance the accepted document stays visible and clickable.
const profileAccepted = renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, payLabel: "Оплатить заранее", showAcceptedNote: true }));
assert.match(profileAccepted, /Условия приняты для всего аккаунта/);
assert.match(profileAccepted, /href="\/documents\/b2b-terms" target="_blank"/);
assert.equal((profileAccepted.match(/<button/g) ?? []).length, 1);
// Before acceptance: clear text + document link right above «Принять условия».
assert.match(unaccepted, /Нажимая «Принять условия», вы соглашаетесь с документом/);
assert.match(unaccepted, /target="_blank" rel="noopener noreferrer"/);
// Guest-start account without email: the receipt email field sits before the pay button.
const withEmail = renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, payLabel: "Оплатить заранее", receiptEmail: { value: "", onChange() {} } }));
assert.match(withEmail, /Почта для чека/);
assert.ok(withEmail.indexOf("biz-home-receipt-email-input") < withEmail.indexOf("biz-home-pay-button"));
const receiptError = renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, error: { code: "receipt_email_required", href: null } }));
assert.match(receiptError, /Укажите почту для чека/);
assert.doesNotMatch(receiptError, /Не удалось перейти к оплате/);
console.log("business-app-profile shared controls: OK");
