import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessCalendarDaysLeft, businessProfileSubscription } from "../src/lib/business-app/profile-subscription";
import {
  BUSINESS_OWNER_NAME_PLACEHOLDER, BUSINESS_OWNER_SURNAME_HINT, BUSINESS_OWNER_SURNAME_PLACEHOLDER,
  BUSINESS_OWNER_SURNAME_REQUIRED_CTA, BUSINESS_OWNER_SURNAME_REQUIRED_ERROR,
  BUSINESS_OWNER_SURNAME_REQUIRED_PROMPT, BUSINESS_PROFILE_LIMITS_TEXT, BUSINESS_PROFILE_NAME_HREF,
  BUSINESS_PROFILE_SURNAME_HREF, validateBusinessProfile, businessKindLabel, businessTimezoneLabel,
} from "../src/lib/business-app/profile";
import { extractBusinessFirstName, extractBusinessLastName, formatBusinessOwnerDisplayName } from "../src/lib/business-app/domain-identity";
import { formatVenueOwnerLabel } from "../src/lib/business-app/venue-licence/present";
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
assert.equal(validateBusinessProfile({ ownerName: "  Анна  ", venueName: "  Долина Кофе  " }).ok, false, "missing surname is required");
assert.deepEqual(validateBusinessProfile({ ownerName: "  Анна  ", ownerSurname: "  Иванова  ", venueName: "  Долина Кофе  " }), {
  ok: true, ownerName: "Анна", ownerSurname: "Иванова", venueName: "Долина Кофе",
});
assert.deepEqual(validateBusinessProfile({ ownerName: "Анна", ownerSurname: "   ", venueName: "Кофе" }), {
  ok: false, error: BUSINESS_OWNER_SURNAME_REQUIRED_ERROR,
});
assert.deepEqual(validateBusinessProfile({ ownerName: "", ownerSurname: "Иванова", venueName: null }), {
  ok: true, ownerName: "", ownerSurname: "Иванова", venueName: null,
}, "no venue yet: name may be empty, surname required");
assert.equal(validateBusinessProfile({ ownerName: "Анна", ownerSurname: "Иванова", venueName: "   " }).ok, false, "the cafe name cannot be emptied");
for (const bad of ["<b>Анна</b>", "Анна>", "\u0000", "\nАнна", "Анна\t", "\u007f", "\u202e"]) {
  assert.equal(validateBusinessProfile({ ownerName: bad, venueName: "Кофе" }).ok, false);
  assert.equal(validateBusinessProfile({ ownerName: "", venueName: bad }).ok, false);
  assert.equal(validateBusinessProfile({ ownerName: "Анна", ownerSurname: bad, venueName: "Кофе" }).ok, false);
}
for (const [ownerName, venueName, ok] of [["А".repeat(80), "Я".repeat(120), true], ["А".repeat(81), "Кофе", false], ["", "Я".repeat(121), false]] as const) {
  assert.equal(validateBusinessProfile({ ownerName, ownerSurname: "Иванова", venueName }).ok, ok);
}
assert.equal(validateBusinessProfile({ ownerName: "Анна", ownerSurname: "Я".repeat(81), venueName: "Кофе" }).ok, false);
assert.deepEqual(validateBusinessProfile({ ownerName: "Анна", ownerSurname: "Я".repeat(80), venueName: "Кофе" }), {
  ok: true, ownerName: "Анна", ownerSurname: "Я".repeat(80), venueName: "Кофе",
});
assert.equal(validateBusinessProfile({ ownerName: null, venueName: 123 }).ok, false);
assert.equal(validateBusinessProfile({ ownerName: "Анна", ownerSurname: 1, venueName: "Кофе" }).ok, false);
assert.equal(validateBusinessProfile({ ownerName: "", organizationName: "Кофе" }).ok, false, "old shape is rejected");
assert.equal(validateBusinessProfile(null).ok, false);
assert.equal(validateBusinessProfile({}).ok, false);
assert.equal(BUSINESS_OWNER_NAME_PLACEHOLDER, "Ваше имя");
assert.equal(BUSINESS_OWNER_SURNAME_PLACEHOLDER, "Ваша фамилия");
assert.equal(BUSINESS_OWNER_SURNAME_HINT, "Фамилия нужна, чтобы подтвердить ваше право легально включать музыку в заведении.");
assert.match(BUSINESS_PROFILE_LIMITS_TEXT, /Имя и фамилия – до 80/);
assert.doesNotMatch(BUSINESS_OWNER_SURNAME_HINT, /\u2014/);
assert.equal(BUSINESS_PROFILE_NAME_HREF, "/profile?edit=name");
assert.equal(extractBusinessFirstName({ metadataFirstName: "", fullName: "Старое имя", email: "fixture@example.invalid" }), "");
assert.equal(extractBusinessLastName({ metadataLastName: "  Петрова  " }), "Петрова");
assert.equal(extractBusinessLastName({}), "", "surname has no full_name fallback");
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
assert.match(form, /placeholder=\{BUSINESS_OWNER_SURNAME_PLACEHOLDER\}/);
assert.match(form, />Фамилия владельца \/ хозяйки</);
assert.match(form, /BUSINESS_OWNER_SURNAME_HINT/);
assert.match(form, /data-testid="biz-profile-owner-surname"/);
assert.match(form, /autoComplete="family-name" required disabled=\{busy\}/);
assert.doesNotMatch(form, /optional surname/i);
assert.match(readFileSync("src/app/business-app/profile/actions.ts", "utf8"), /required surname/);
assert.doesNotMatch(readFileSync("src/app/business-app/profile/actions.ts", "utf8"), /optional surname/);

assert.doesNotMatch(form, /Например, Анна|Организация/);
assert.match(form, />Название кофейни</);
assert.match(form, /edit !== "name" && edit !== "surname"/);
assert.match(form, /focusBusinessOwnerSurnameField\(\)/);
assert.match(form, /focusBusinessOwnerNameField\(\)/);
assert.doesNotMatch(form, /\u2014/);
const page = readFileSync("src/app/business-app/profile/page.tsx", "utf8");
assert.doesNotMatch(page, /Изменить в управлении кофейней/, "no duplicate cafe row in the profile");
assert.match(page, /venueName=\{domain\.location\?\.name \?\? null\}/);
assert.match(page, /ownerSurname=\{ownerSurname\}/);
assert.match(page, /extractBusinessLastName/);

const action = readFileSync("src/app/business-app/profile/actions.ts", "utf8");
assert.match(action, /rpc\("rename_business_location"/, "the header venue name is renamed through the existing owner-only RPC");
assert.match(action, /p_location_id: location\.id/, "venue resolved on the server");
assert.match(action, /count !== 1\) return/, "organization sync only for a single-venue account");
assert.match(action, /last_name: parsed\.ownerSurname/, "surname stored in auth user_metadata like first_name");
assert.match(action, /Имя и фамилия не сохранены/);
assert.doesNotMatch(action, /"Имя не сохранено/);
assert.match(action, /first_name: parsed\.ownerName/);
assert.doesNotMatch(action, /CREATE TABLE|ALTER TABLE|migration/, "no DB migration for surname – auth metadata only");
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
assert.match(switcher, /const focusMoved = \(await option\.onSelect\(\)\) === true;\s*close\(!focusMoved\);/);
// Pending uses ARIA rather than a disabled trigger so close() can still restore keyboard focus.
assert.match(switcher, /aria-disabled=\{pending \|\| undefined\}/);
assert.doesNotMatch(switcher, /\sdisabled=\{pending\}/);
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

{
  const licence = readFileSync("src/components/business-app/venue-licence/VenueLicencePage.tsx", "utf8");
  assert.match(licence, /Лицензиат/);
  assert.match(licence, /venue-owner/);
  assert.doesNotMatch(licence, /first_name|last_name|email|phone/, "raw auth fields stay off the page");
  assert.match(licence, /venue-address/);
  assert.match(licence, /venue-name/);
}

assert.equal(BUSINESS_PROFILE_SURNAME_HREF, "/profile?edit=surname");
assert.equal(BUSINESS_OWNER_SURNAME_REQUIRED_PROMPT, "Укажите фамилию – она нужна для подтверждения прав на музыку в заведении");
assert.equal(BUSINESS_OWNER_SURNAME_REQUIRED_CTA, "Указать фамилию");
assert.equal(formatBusinessOwnerDisplayName({ firstName: "Анна", lastName: "Иванова" }), "Анна Иванова");
assert.equal(formatBusinessOwnerDisplayName({ firstName: "Анна", lastName: "" }), "Анна");
assert.equal(formatBusinessOwnerDisplayName({ firstName: "", lastName: "" }), null);
assert.equal(formatVenueOwnerLabel({ firstName: "Анна", lastName: "Иванова" }), "Владелец: Анна Иванова");
assert.equal(formatVenueOwnerLabel({ firstName: "Анна", lastName: null }), "Владелец: Анна");
assert.equal(formatVenueOwnerLabel({ firstName: null, lastName: null }), null);
{
  const prompt = readFileSync("src/components/business-app/BusinessOwnerSurnamePrompt.tsx", "utf8");
  assert.match(prompt, /BUSINESS_PROFILE_SURNAME_HREF/);
  assert.match(prompt, /biz-owner-surname-prompt-cta/);
  assert.doesNotMatch(prompt, /\u2014/);
  const home = readFileSync("src/components/business-app/BusinessHomePage.tsx", "utf8");
  assert.match(home, /BusinessOwnerSurnamePrompt/);
  assert.match(home, /!domain\.owner\.lastName\.trim\(\)/);
  const hall = readFileSync("src/components/business-app/BusinessHallHome.tsx", "utf8");
  assert.doesNotMatch(hall, /BusinessOwnerSurnamePrompt|ownerSurname|Фамилия/, "hall device must not see the surname prompt");
}
{
  const load = readFileSync("src/lib/business-app/venue-licence/load.server.ts", "utf8");
  assert.match(load, /ownerFirstName = asString\(meta\.first_name\)/);
  assert.match(load, /ownerLastName = asString\(meta\.last_name\)/);
  assert.match(load, /ownerFirstName,\s*\n?\s*ownerLastName/);
  assert.doesNotMatch(load, /ownerEmail|email:\s*owner/, "raw email must not be a presentVenueLicence field");
}
{
  const signUpPage = readFileSync("src/app/(platform)/auth/sign-up/page.tsx", "utf8");
  assert.doesNotMatch(signUpPage, /lastNameOptional:\s*businessTrial/);
  assert.doesNotMatch(signUpPage, /Фамилия – необязательно/);
  const signUpAction = readFileSync("src/app/(platform)/auth/sign-up/actions.ts", "utf8");
  assert.match(signUpAction, /if \(!firstName \|\| !lastName\)/);
  assert.doesNotMatch(signUpAction, /!businessTrial && !lastName/);
}


{
  const privacy = readFileSync("src/components/legal/PrivacyDocument.tsx", "utf8");
  assert.match(privacy, /Последнее обновление: 9 ноября 2026 года/);
  assert.match(privacy, /имя и фамилия \(для владельцев сервиса «АудиоЛад Бизнес» – имя и фамилия владельца \/ хозяйки\);/);
  assert.match(privacy, /указанном заведении/);
  assert.match(privacy, /этого заведения/);
  assert.match(privacy, /странице подтверждения прав заведения;/);
  assert.doesNotMatch(privacy, /имя или отображаемое имя/);
  assert.doesNotMatch(privacy, /указанной точке|этой точки|прав точки/);
  assert.doesNotMatch(privacy, /\u2014/);
  const docs = readFileSync("src/lib/business-app/client-documents.ts", "utf8");
  assert.match(docs, /editionLabel: "Последнее обновление: 9 ноября 2026 года"/);
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
assert.match(unaccepted, /href="\/documents\/business-offer"/);
assert.equal(renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, canPay: false })), "");
assert.match(renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, busy: true })), /disabled=""/);
// Profile: after acceptance the accepted document stays visible and clickable.
const profileAccepted = renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, payLabel: "Оплатить заранее", showAcceptedNote: true }));
assert.match(profileAccepted, /Оплата по договору:/);
assert.match(profileAccepted, /Принят один раз\s+для всего аккаунта/);
assert.match(profileAccepted, /href="\/documents\/business-offer"(?![^>]*target=)[^>]*aria-haspopup="dialog"/);
// The offer link sits next to every «Оплатить», with or without the profile flag.
for (const payLabel of ["Оплатить заранее", "Продлить", "Оплатить"]) {
  assert.match(renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, payLabel })), /href="\/documents\/business-offer"(?![^>]*target=)[^>]*aria-haspopup="dialog"/);
}
assert.equal((profileAccepted.match(/<button/g) ?? []).length, 1);
// Before acceptance: clear text + document link right above «Принять условия».
assert.match(unaccepted, /Нажимая «Принять\s+условия», вы принимаете/);
assert.match(unaccepted, /href="\/documents\/business-offer"[^>]*aria-haspopup="dialog"/);
assert.doesNotMatch(unaccepted, /target="_blank"|новой вкладке/);
// Guest-start account without email: the receipt email field sits before the pay button.
const withEmail = renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, payLabel: "Оплатить заранее", receiptEmail: { value: "", onChange() {} } }));
assert.match(withEmail, /Почта для чека/);
assert.ok(withEmail.indexOf("biz-home-receipt-email-input") < withEmail.indexOf("biz-home-pay-button"));
const receiptError = renderToStaticMarkup(h(BusinessPayControls, { ...controlsProps, error: { code: "receipt_email_required", href: null } }));
assert.match(receiptError, /Укажите почту для чека/);
assert.doesNotMatch(receiptError, /Не удалось перейти к оплате/);
console.log("business-app-profile shared controls: OK");

// Venue timezone: 11 Russian zones, browser auto-detect, owner-only save, no silent changes.
{
  const tz = await import("../src/lib/business-app/venue-timezones");
  assert.deepEqual(tz.VENUE_TIMEZONES.map((z) => z.id), [
    "Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Novosibirsk",
    "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka",
  ]);
  assert.deepEqual(tz.VENUE_TIMEZONES.map((z) => z.label), [
    "Калининград (UTC+2)", "Москва (UTC+3)", "Самара (UTC+4)", "Екатеринбург (UTC+5)", "Омск (UTC+6)", "Новосибирск (UTC+7)",
    "Иркутск (UTC+8)", "Якутск (UTC+9)", "Владивосток (UTC+10)", "Магадан (UTC+11)", "Петропавловск-Камчатский (UTC+12)",
  ]);
  const at = new Date("2026-11-04T12:00:00Z");
  for (const zone of tz.VENUE_TIMEZONES) {
    assert.equal(tz.timezoneOffsetMinutes(zone.id, at), zone.offset * 60, zone.id);
    assert.equal(tz.venueTimezoneFromBrowserZone(zone.id, at), zone.id);
    assert.equal(businessTimezoneLabel(zone.id), zone.label, "read-only label matches the dropdown");
  }
  for (const [browser, expected] of [
    ["Asia/Krasnoyarsk", "Asia/Novosibirsk"], ["Asia/Chita", "Asia/Yakutsk"], ["Asia/Sakhalin", "Asia/Magadan"],
    ["Asia/Anadyr", "Asia/Kamchatka"], ["Europe/Volgograd", "Europe/Moscow"], ["Europe/Ulyanovsk", "Europe/Samara"],
    ["Asia/Barnaul", "Asia/Novosibirsk"], ["Europe/Minsk", "Europe/Moscow"], ["Asia/Almaty", "Asia/Yekaterinburg"],
    // Foreign browsers (VPN, travel): an hour or more from every Russian zone, or on daylight saving – Moscow.
    ["Europe/Berlin", "Europe/Moscow"], ["America/New_York", "Europe/Moscow"], ["Pacific/Auckland", "Europe/Moscow"],
    ["Europe/London", "Europe/Moscow"], ["Asia/Tokyo", "Asia/Yakutsk"],
    ["Asia/Kolkata", "Asia/Yekaterinburg"], ["Not/AZone", "Europe/Moscow"], ["", "Europe/Moscow"], [undefined, "Europe/Moscow"],
  ] as const) assert.equal(tz.venueTimezoneFromBrowserZone(browser, at), expected, String(browser));
  const july = new Date("2026-07-15T12:00:00Z");
  for (const [browser, expected] of [
    ["Europe/Berlin", "Europe/Moscow"], ["America/New_York", "Europe/Moscow"], ["Pacific/Auckland", "Europe/Moscow"],
    ["Asia/Krasnoyarsk", "Asia/Novosibirsk"], ["Europe/Volgograd", "Europe/Moscow"], ["Asia/Kolkata", "Asia/Yekaterinburg"],
  ] as const) assert.equal(tz.venueTimezoneFromBrowserZone(browser, july), expected, `${browser} in July`);
  assert.equal(tz.nearestVenueTimezone(60), "Europe/Moscow", "UTC+1 is an hour from Kaliningrad");
  assert.equal(tz.nearestVenueTimezone(13 * 60), "Europe/Moscow", "UTC+13 is an hour from Kamchatka");
  assert.equal(tz.nearestVenueTimezone(5.5 * 60), "Asia/Yekaterinburg", "half-hour tie goes west");
  assert.equal(tz.nearestVenueTimezone(2.5 * 60), "Europe/Kaliningrad");
  assert.equal(tz.isVenueTimezone("Asia/Krasnoyarsk"), false, "server accepts only the 11 ids");
  assert.equal(tz.isVenueTimezone("europe/moscow"), false);
  assert.equal(typeof tz.detectVenueTimezone(), "string");

  const action = readFileSync(new URL("../src/app/business-app/profile/actions.ts", import.meta.url), "utf8");
  const save = action.slice(action.indexOf("export async function saveBusinessTimezone"));
  assert.match(save, /isVenueTimezone\(timezone\)/);
  assert.match(save, /businessHallDeviceLocked\(\)/, "not from the hall («Точка») device");
  assert.match(save, /role !== "owner"/, "owner only");
  assert.ok(save.indexOf('role !== "owner"') < save.indexOf("createServiceRoleClient()"), "owner check before the write");
  assert.match(save, /\.update\(\{ timezone \}\)/, "only the timezone column");

  const page = readFileSync(new URL("../src/app/business-app/profile/page.tsx", import.meta.url), "utf8");
  assert.match(page, /membership\?\.role === "owner" \? \(\s*<BusinessTimezoneForm/);
  const form = readFileSync(new URL("../src/components/business-app/profile/BusinessTimezoneForm.tsx", import.meta.url), "utf8");
  assert.match(form, /business-app-btn-cta/, "green «Сохранить» like the name form");
  assert.match(form, /POINT_SOUND_CHANGED_EVENT/, "the cabinet player re-reads the zone");
  assert.doesNotMatch(form + page, /—/, "en dash only");

  const route = readFileSync(new URL("../src/app/api/business/guest-start/route.ts", import.meta.url), "utf8");
  assert.match(route, /data\[0\]\.created === true && input\.timezone/, "auto-detect only for a newly created venue");
  const hook = readFileSync(new URL("../src/components/business-app/workspace/useCafeQueuePreferences.ts", import.meta.url), "utf8");
  assert.doesNotMatch(hook, /getHours\(\)/, "opening hours follow the venue zone, not the phone clock");
  assert.match(hook, /venueMinuteOfDay\(venueZone, clockAt\)/);
}
console.log("venue timezone ok");
