/**
 * Partner codes (task 8142d69a): pure model, the demo scenario without any payment,
 * and the rendered price blocks (t1300u: 799 ₽ struck through next to 399 ₽).
 * The server rules themselves run in scripts/business-partner-codes-isolated.py.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PARTNER_CODE_ALPHABET,
  formatPartnerCode,
  generatePartnerCode,
  mapPartnerCodeRpcError,
  normalizePartnerCode,
  parsePartnerPeriods,
  parsePartnerQuote,
  parsePartnerUnitPriceRub,
  partnerCodeLink,
  partnerCodePublicLink,
  PARTNER_CODE_PUBLIC_ORIGIN,
  partnerCodeStatus,
  partnerConfirmedUnitPriceMinor,
  partnerDiscountPercent,
  PARTNER_CODE_RESERVATION_HINT,
  partnerCodeClientIp,
  partnerCodeErrorIsFinal,
  partnerReservationNoteLead,
  partnerReservationCountdownLabel,
  partnerDiscountProgressLine,
  partnerFinishedNotice,
  partnerLatePaymentNotice,
  partnerPeriodsLeft,
  partnerQuoteIsDiscounted,
  partnerQuoteTermsLines,
  partnerQuoteToWire,
  ruPeriodsWord,
  simulatePartnerBilling,
} from "../src/lib/business/partner-codes";
import { buildPartnerCodeAdminRows } from "../src/lib/admin/business-partner-codes";
import { mapBusinessSubscriptionRpcError, parseConfirmedUnitPriceMinor } from "../src/lib/business/subscription-checkout";
import { BusinessPartnerHomeBanner, BusinessPartnerTerms, BusinessStruckPrice } from "../src/components/business-app/BusinessPartnerPrice";
import { BusinessPayControls } from "../src/components/business-app/BusinessHomeAccessCard";
import { resetPartnerQuoteStore } from "../src/components/business-app/partner-quote-store";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";

// Codes: unpredictable, unambiguous, normalized the same way as the SQL.
const seen = new Set<string>();
for (let i = 0; i < 2000; i += 1) {
  const code = generatePartnerCode((size) => randomBytes(size));
  assert.match(code, /^[2-9A-HJ-NP-Z]{12}$/);
  seen.add(code);
}
assert.equal(seen.size, 2000, "no collisions in 2000 random codes");
assert.equal(PARTNER_CODE_ALPHABET.length, 32, "256 % 32 = 0: no modulo bias");
assert.equal(generatePartnerCode(() => new Uint8Array(12)), "222222222222");
assert.throws(() => generatePartnerCode(() => new Uint8Array(3)));
assert.equal(normalizePartnerCode(" abcd-efgh-jkmn "), "ABCDEFGHJKMN");
assert.equal(normalizePartnerCode("ABCD EFGH JKMN"), "ABCDEFGHJKMN");
assert.equal(normalizePartnerCode("ABCD-EFGH-JKM0"), null, "0 is not in the alphabet");
assert.equal(normalizePartnerCode("ABC"), null);
assert.equal(normalizePartnerCode(42), null);
assert.equal(formatPartnerCode("ABCDEFGHJKMN"), "ABCD-EFGH-JKMN");
assert.equal(partnerCodeLink("https://business.audiolad.ru", "ABCDEFGHJKMN"), "https://business.audiolad.ru/podarok?code=ABCD-EFGH-JKMN", "legacy business links still format");
assert.equal(partnerCodeLink("https://coffee.audiolad.ru", "ABCDEFGHJKMN"), "https://coffee.audiolad.ru/podarok?code=ABCD-EFGH-JKMN");
assert.equal(PARTNER_CODE_PUBLIC_ORIGIN, "https://coffee.audiolad.ru");
assert.equal(partnerCodePublicLink("ABCDEFGHJKMN"), "https://coffee.audiolad.ru/podarok?code=ABCD-EFGH-JKMN", "t1321u: new links use coffee host");

// Admin parameters: whole rubles below 799; never 399.50.
assert.equal(parsePartnerUnitPriceRub("399"), 399);
assert.equal(parsePartnerUnitPriceRub(399.5), null);
assert.equal(parsePartnerUnitPriceRub("399.50"), null);
assert.equal(parsePartnerUnitPriceRub(799), null, "a code cannot keep the standard price");
assert.equal(parsePartnerUnitPriceRub(0), null);
assert.equal(parsePartnerPeriods("3"), 3);
assert.equal(parsePartnerPeriods(13), null);
assert.equal(partnerDiscountPercent(399), 50, "marketing «скидка 50%» from the real 399 of 799");

// Checkout confirmation: kopecks of whole rubles only.
assert.equal(parseConfirmedUnitPriceMinor(undefined), 79900, "older client = standard price");
assert.equal(parseConfirmedUnitPriceMinor(39900), 39900);
assert.equal(parseConfirmedUnitPriceMinor(39950), null, "no kopecks");
assert.equal(parseConfirmedUnitPriceMinor(79900 + 100), null);
assert.equal(parseConfirmedUnitPriceMinor("39900"), null);
assert.equal(mapBusinessSubscriptionRpcError("partner_terms_changed").error, "partner_terms_changed");
assert.equal(mapBusinessSubscriptionRpcError("partner_terms_changed").status, 409);
assert.equal(mapPartnerCodeRpcError("ERROR: partner_code_unavailable").error, "partner_code_unavailable");
assert.equal(mapPartnerCodeRpcError("partner_code_already_applied").status, 409);
assert.equal(mapPartnerCodeRpcError("boom").error, "internal_error");

// Server quote parsing.
const reserved = parsePartnerQuote({ source: "reserved", unit_price_minor: 39900, standard_unit_price_minor: 79900, venue_count: 2,
  total_minor: 79800, discount_periods: 3, period_index: 1, periods_used: 0, code_hint: "JKMN" });
assert.ok(reserved);
assert.equal(reserved.totalRub, 798);
assert.equal(reserved.standardTotalRub, 1598);
assert.ok(partnerQuoteIsDiscounted(reserved));
assert.equal(partnerPeriodsLeft(reserved), 3);
assert.equal(partnerConfirmedUnitPriceMinor(reserved), 39900);
assert.equal(partnerConfirmedUnitPriceMinor(null), 79900);

// t1335u: the route sends the quote in the same wire shape the browser parses again.
// Sending the parsed camelCase object made every browser parse return null.
assert.equal(parsePartnerQuote(JSON.parse(JSON.stringify(reserved))), null, "a parsed quote is not wire format");
for (const raw of [
  { source: "reserved", unit_price_minor: 39900, standard_unit_price_minor: 79900, venue_count: 2, total_minor: 79800,
    discount_periods: 3, period_index: 1, periods_used: 0, code_hint: "EUUV", discount_paid_until: null, late_payment: null,
    reserved_until: "2026-11-12T15:31:06.832185+00:00" },
  { source: "entitlement", unit_price_minor: 39900, standard_unit_price_minor: 79900, venue_count: 1, total_minor: 39900,
    discount_periods: 3, period_index: 2, periods_used: 1, code_hint: "EUUV", discount_paid_until: "2026-12-10T10:00:00+00:00",
    late_payment: { reason: "partner_code_revoked", paid_at: "2026-11-10T10:00:00+00:00", period_end: "2026-12-10T10:00:00+00:00" },
    reserved_until: null },
  { source: "finished", unit_price_minor: 79900, standard_unit_price_minor: 79900, venue_count: 0, total_minor: 79900,
    discount_periods: 3, period_index: null, periods_used: 3, code_hint: null, discount_paid_until: null, late_payment: null,
    reserved_until: null },
  { source: "standard", unit_price_minor: 79900, standard_unit_price_minor: 79900, venue_count: 1, total_minor: 79900,
    discount_periods: null, period_index: null, periods_used: 0, code_hint: null, discount_paid_until: null, late_payment: null,
    reserved_until: null },
]) {
  const parsed = parsePartnerQuote(raw);
  assert.ok(parsed, `${raw.source}: server parse`);
  const browser = parsePartnerQuote(JSON.parse(JSON.stringify({ quote: partnerQuoteToWire(parsed) })).quote);
  assert.deepEqual(browser, parsed, `${raw.source}: the browser reads exactly the server quote`);
}
const heldWire = parsePartnerQuote(JSON.parse(JSON.stringify(partnerQuoteToWire(reserved))));
assert.ok(partnerQuoteIsDiscounted(heldWire), "a held 399 ₽ stays discounted in the browser");
assert.equal(parsePartnerQuote({ source: "reserved", unit_price_minor: 39950, standard_unit_price_minor: 79900, venue_count: 1, total_minor: 39950 }), null, "kopecks rejected");
assert.equal(parsePartnerQuote({ source: "weird" }), null);
const last = parsePartnerQuote({ source: "entitlement", unit_price_minor: 39900, standard_unit_price_minor: 79900, venue_count: 1,
  total_minor: 39900, discount_periods: 3, period_index: 3, periods_used: 2 });
assert.ok(last);
assert.deepEqual(partnerQuoteTermsLines(last), ["Это последний период по персональной цене.", "Затем – обычная цена 799 ₽ за точку за 30 дней."]);
const finished = parsePartnerQuote({ source: "finished", unit_price_minor: 79900, standard_unit_price_minor: 79900, venue_count: 2,
  total_minor: 159800, discount_periods: 3, periods_used: 3 });
assert.ok(finished);
assert.equal(partnerQuoteIsDiscounted(finished), false, "after the window no discount is shown");
assert.match(partnerFinishedNotice(finished) ?? "", /Персональная цена закончилась: оплачено 3 оплаченных периода\. Сейчас действует обычная цена – 799 ₽ за точку за 30 дней\./);
assert.equal(ruPeriodsWord(1), "оплаченный период");

// A late bank confirmation of a replaced link: shown plainly, never a bare personal price.
const revokedLate = parsePartnerQuote({ source: "standard", unit_price_minor: 79900, standard_unit_price_minor: 79900, venue_count: 1,
  total_minor: 79900, late_payment: { reason: "partner_code_revoked", paid_at: "2026-11-09T07:00:00Z", period_end: "2026-12-09T07:00:00Z" } });
assert.ok(revokedLate?.latePayment);
assert.equal(partnerLatePaymentNotice(revokedLate),
  "Персональный код отозван до первой оплаты. Оплата от 9 ноября засчитана полностью: доступ продлён до 9 декабря. Скидка по коду больше не действует, следующая оплата – по обычной цене 799 ₽ за точку.");
assert.doesNotMatch(partnerLatePaymentNotice(revokedLate) ?? "", /399/, "no bare personal price");
const replacedLate = parsePartnerQuote({ source: "reserved", unit_price_minor: 39900, standard_unit_price_minor: 79900, venue_count: 1,
  total_minor: 39900, discount_periods: 3, period_index: 1, periods_used: 0,
  late_payment: { reason: "partner_code_applied", paid_at: "2026-11-09T07:00:00Z", period_end: "2026-12-09T07:00:00Z" } });
assert.equal(partnerLatePaymentNotice(replacedLate), "Прежняя ссылка на оплату всё же была оплачена 9 ноября. Оплата засчитана полностью: доступ продлён до 9 декабря.");
assert.equal(partnerLatePaymentNotice(reserved), null);
assert.equal(parsePartnerQuote({ source: "standard", unit_price_minor: 79900, standard_unit_price_minor: 79900, venue_count: 1, total_minor: 79900, late_payment: { reason: "x" } })?.latePayment, null);
// 72-hour hold (t1304u): the exact end in Moscow time, only while the code is held.
const held = parsePartnerQuote({ source: "reserved", unit_price_minor: 39900, standard_unit_price_minor: 79900, venue_count: 1,
  total_minor: 39900, discount_periods: 3, period_index: 1, periods_used: 0, reserved_until: "2026-11-12T07:05:00Z" });
assert.equal(held?.reservedUntil, "2026-11-12T07:05:00Z");
assert.equal(partnerReservationNoteLead(held, new Date("2026-11-09T08:00:00Z")),
  "Код закреплён за вами на 72 часа, до 12 ноября, 10:05 по московскому времени – цена");
assert.doesNotMatch(partnerReservationNoteLead(held, new Date("2026-11-09T08:00:00Z")) ?? "", /оплатите сейчас|оплатите сразу/);
assert.equal(partnerReservationCountdownLabel(held, new Date("2026-11-09T08:00:00Z")), "Код действует ещё 71:05:00");
assert.equal(partnerReservationCountdownLabel(held, new Date("2026-11-09T08:00:42Z")), "Код действует ещё 71:04:18", "ticks include seconds from reservedUntil");
assert.equal(partnerReservationCountdownLabel(held, new Date("2026-11-12T07:05:00Z")), null, "exactly at expiry – no countdown");
assert.equal(partnerReservationCountdownLabel(held, new Date("2026-11-12T08:00:00Z")), null, "no countdown after the hold");
assert.equal(partnerReservationNoteLead(held, new Date("2026-11-12T08:00:00Z")), null, "no note after the hold");
assert.equal(partnerReservationNoteLead(last), null, "no hold note once the code is bound");
assert.equal(partnerDiscountProgressLine(held), null, "countdown covers the reserved state");
assert.equal(partnerDiscountProgressLine(last), "Скидка на оплату 3 из 3");
const mid = parsePartnerQuote({ source: "entitlement", unit_price_minor: 39900, standard_unit_price_minor: 79900, venue_count: 2,
  total_minor: 79800, discount_periods: 3, period_index: 2, periods_used: 1 });
assert.ok(mid);
assert.equal(partnerDiscountProgressLine(mid), "Скидка на оплату 2 из 3");
assert.ok(partnerQuoteIsDiscounted(mid));
assert.equal(partnerDiscountProgressLine(finished), null, "finished: no discount progress");
assert.equal(partnerQuoteIsDiscounted(finished), false);
assert.equal(parsePartnerQuote({ source: "entitlement", unit_price_minor: 39900, standard_unit_price_minor: 79900, venue_count: 1, total_minor: 39900, reserved_until: "2026-11-12T07:05:00Z" })?.reservedUntil, null);
assert.equal(
  PARTNER_CODE_RESERVATION_HINT,
  "Код сохранён в этом браузере на 30 дней – цена 399 ₽ применится при оплате, даже если сначала вы пройдёте 7 бесплатных дней.",
  "t1322u: gift-first hint, no pressure to pay now",
);
assert.doesNotMatch(PARTNER_CODE_RESERVATION_HINT, /оплатите сразу|оплатите сейчас/);
assert.doesNotMatch(PARTNER_CODE_RESERVATION_HINT, /льготн|GRACE/i);

// Rate-limit key: nginx X-Real-IP first, otherwise the last X-Forwarded-For hop (nginx appends it).
assert.equal(partnerCodeClientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 203.0.113.7" })), "203.0.113.7");
assert.equal(partnerCodeClientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 198.51.100.2" })), "198.51.100.2", "a spoofed first hop is ignored");
assert.equal(partnerCodeClientIp(new Headers()), "unknown");
// Only a final answer about the code drops the link cookie.
assert.ok(partnerCodeErrorIsFinal("partner_code_invalid") && partnerCodeErrorIsFinal("partner_code_unavailable") && partnerCodeErrorIsFinal("partner_code_already_applied"));
assert.ok(!partnerCodeErrorIsFinal("not_organization_owner") && !partnerCodeErrorIsFinal("support_mode_consent_forbidden") && !partnerCodeErrorIsFinal("internal_error"));
assert.equal(mapBusinessSubscriptionRpcError("partner_period_in_payment").error, "partner_period_in_payment");
assert.equal(ruPeriodsWord(3), "оплаченных периода");
assert.equal(ruPeriodsWord(5), "оплаченных периодов");

// Demo «one account, 1–3 venues, three payments at 399 per venue, then 799» – no real charges.
const demo = simulatePartnerBilling({ unitPriceRub: 399, discountPeriods: 3, venuesPerPayment: [1, 2, 3, 3] });
assert.deepEqual(demo.map((row) => row.totalRub), [399, 798, 1197, 2397]);
assert.deepEqual(demo.map((row) => row.discounted), [true, true, true, false]);
assert.ok(demo.every((row) => Number.isInteger(row.totalRub)), "no kopecks anywhere");
console.log("demo (no charges):", demo.map((row) => `payment ${row.payment}: ${row.venues} × ${row.unitRub} ₽ = ${row.totalRub} ₽`).join("; "));

// Admin status.
const now = new Date("2026-11-09T06:00:00Z");
const base = { revokedAt: null, boundOrganizationId: null, reservedUntil: null, periodsApplied: 0, discountPeriods: 3, now };
assert.equal(partnerCodeStatus(base), "created");
assert.equal(partnerCodeStatus({ ...base, reservedUntil: "2026-11-10T00:00:00Z" }), "reserved");
assert.equal(partnerCodeStatus({ ...base, reservedUntil: "2026-11-01T00:00:00Z" }), "created", "expired reservation frees the code");
assert.equal(partnerCodeStatus({ ...base, reservedUntil: "2026-11-01T00:00:00Z", hasOpenPayment: true }), "reserved", "open link still holds it");
assert.equal(partnerCodeStatus({ ...base, boundOrganizationId: "org", periodsApplied: 1 }), "in_use");
assert.equal(partnerCodeStatus({ ...base, boundOrganizationId: "org", periodsApplied: 3 }), "finished");
assert.equal(partnerCodeStatus({ ...base, revokedAt: "2026-11-01T00:00:00Z" }), "revoked");
const rows = buildPartnerCodeAdminRows({
  codes: [{ id: "c1", code: "ABCDEFGHJKMN", purpose: "top10", recipient_note: "участник десятки", unit_price_minor: 39900, discount_periods: 3,
    created_at: "2026-11-09T05:00:00Z", reserved_until: null, bound_organization_id: "org1", bound_at: "2026-11-16T05:00:00Z", revoked_at: null }],
  entitlements: [{ organization_id: "org1", code_id: "c1", first_paid_at: "2026-11-16T05:00:00Z" }],
  periods: [{ organization_id: "org1", period_index: 1, venue_count: 1, period_end: "2026-12-16T05:00:00Z" },
    { organization_id: "org1", period_index: 2, venue_count: 2, period_end: "2027-01-15T05:00:00Z" }],
  organizationNames: { org1: "Кофейня" },
  now,
});
assert.equal(rows[0].status, "in_use");
assert.equal(rows[0].periodsApplied, 2);
assert.equal(rows[0].periodsLeft, 1);
assert.equal(rows[0].discountPaidUntil, "2027-01-15T05:00:00Z");
assert.equal(rows[0].organizationName, "Кофейня");
assert.equal(rows[0].canRevoke, false, "a bound code cannot be revoked");
assert.equal(rows[0].codeDisplay, "ABCD-EFGH-JKMN");

// t1300u: the personal price is always rendered with the usual price struck through.
const struck = renderToStaticMarkup(<BusinessStruckPrice standardRub={799} priceRub={399} />);
assert.match(struck, /<s[^>]*>799\u00a0₽<\/s> <strong[^>]*>399\u00a0₽<\/strong>/);
assert.match(struck, /text-\[var\(--biz-text-muted\)\]/, "default tone keeps muted ink off the button");
const struckOnButton = renderToStaticMarkup(<BusinessStruckPrice standardRub={1598} priceRub={798} tone="onButton" testId="biz-home-pay-button-price" />);
assert.match(struckOnButton, /text-white\/75/, "onButton struck is translucent white");
assert.match(struckOnButton, /font-bold text-white/, "onButton current is white bold");
assert.doesNotMatch(struckOnButton, /--biz-text/, "onButton does not pull dark card ink");
const terms = renderToStaticMarkup(<BusinessPartnerTerms quote={reserved} />);
const heldTerms = renderToStaticMarkup(
  <BusinessPartnerTerms quote={{ ...held!, reservedUntil: "2099-01-01T09:00:17Z" }} now={new Date("2099-01-01T08:00:00Z")} />,
);
assert.match(heldTerms, /data-testid="biz-partner-countdown"[^>]*>Код действует ещё 01:00:17</, "live countdown while reserved includes seconds");
assert.match(heldTerms, /data-testid="biz-partner-reservation"[^>]*>Код закреплён за вами на 72 часа, до 1 января, 12:00 по московскому времени – цена <span[^>]*><s[^>]*>799\u00a0₽<\/s> <strong[^>]*>399\u00a0₽<\/strong><\/span> сохранится при оплате/, "soft hold note keeps 799 struck through next to 399");
assert.doesNotMatch(heldTerms, /оплатите сейчас|оплатите сразу/);
const midTerms = renderToStaticMarkup(<BusinessPartnerTerms quote={mid!} />);
assert.match(midTerms, /data-testid="biz-partner-progress"[^>]*>Скидка на оплату 2 из 3/);
assert.match(midTerms, /<s[^>]*>799\u00a0₽<\/s> <strong[^>]*>399\u00a0₽<\/strong>/);
assert.match(midTerms, /<s[^>]*>1598\u00a0₽<\/s> <strong[^>]*>798\u00a0₽<\/strong>/);
assert.doesNotMatch(midTerms, /biz-partner-countdown|biz-partner-reservation/, "no reservation countdown after binding");
const lastTerms = renderToStaticMarkup(<BusinessPartnerTerms quote={last!} />);
assert.match(lastTerms, /Скидка на оплату 3 из 3/);
const finishedTerms = renderToStaticMarkup(<BusinessPartnerTerms quote={finished!} />);
// finished is not discounted – PayControls shows finished notice, not terms; still ensure helpers hide strike UI
assert.equal(partnerQuoteIsDiscounted(finished), false);
const finishedBanner = renderToStaticMarkup(<BusinessPartnerHomeBanner quote={finished} />);
assert.equal(finishedBanner, "", "finished: no home banner");
const reservedBanner = renderToStaticMarkup(<BusinessPartnerHomeBanner quote={reserved} />);
assert.match(reservedBanner, /data-testid="biz-home-partner-banner"/);
assert.match(reservedBanner, /Персональная скидка активна/);
assert.doesNotMatch(reservedBanner, /biz-partner-countdown/, "countdown lives in terms, not duplicated in banner");
const midBanner = renderToStaticMarkup(<BusinessPartnerHomeBanner quote={mid} />);
assert.match(midBanner, /Скидка на оплату 2 из 3/);
assert.doesNotMatch(terms, /biz-partner-reservation/, "no hold note without a hold end");
assert.match(terms, /скидка 50%/);
assert.match(terms, /<s[^>]*>799\u00a0₽<\/s> <strong[^>]*>399\u00a0₽<\/strong>[\s\S]*за точку/);
assert.match(terms, /Точек: 2\. Итого:[\s\S]*<s[^>]*>1598\u00a0₽<\/s> <strong[^>]*>798\u00a0₽<\/strong>/);
assert.match(terms, /3 оплаченных периода по 30 дней с первой оплаты/);
assert.match(terms, /Затем – обычная цена 799 ₽ за точку за 30 дней/);
assert.doesNotMatch(terms, /399\.5|399,5|—/, "no kopecks, no em dash");

// The shared «Оплатить» block: discounted terms replace the 799 line; the standard path is unchanged.
const controls = { canPay: true, accepted: true, busy: false, error: null, onAccept() {}, onPay() {} };
resetPartnerQuoteStore({ status: "ready", quote: reserved });
const discountedControls = renderToStaticMarkup(<BusinessPayControls {...controls} />);
assert.match(discountedControls, /data-testid="biz-partner-terms"/);
assert.match(discountedControls, /<s[^>]*>799\u00a0₽<\/s>/, "799 struck through before payment");
assert.match(discountedControls, /data-testid="biz-home-pay-button-price"/, "pay button shows struck total");
assert.match(discountedControls, /<s[^>]*>1598\u00a0₽<\/s> <strong[^>]*>798\u00a0₽<\/strong>/, "two venues: ~~1598~~ 798 on the button");
assert.match(discountedControls, /data-testid="biz-home-pay-button-price-standard"[^>]*class="text-white\/75"|class="text-white\/75"[^>]*data-testid="biz-home-pay-button-price-standard"/, "struck total on pay button is translucent white");
assert.match(discountedControls, /data-testid="biz-home-pay-button-price-current"[^>]*class="font-bold text-white"|class="font-bold text-white"[^>]*data-testid="biz-home-pay-button-price-current"/, "current total on pay button is white bold");
assert.doesNotMatch(discountedControls, /Автосписания нет[\s\S]*799 ₽ за 30 дней, картой/, "no plain 799 line next to the offer");
resetPartnerQuoteStore({ status: "ready", quote: mid });
const midControls = renderToStaticMarkup(<BusinessPayControls {...controls} />);
assert.match(midControls, /Скидка на оплату 2 из 3/);
assert.match(midControls, /biz-home-pay-button-price/);
assert.doesNotMatch(midControls, /biz-partner-countdown/);
resetPartnerQuoteStore({ status: "ready", quote: finished });
const finishedControls = renderToStaticMarkup(<BusinessPayControls {...controls} />);
assert.match(finishedControls, /data-testid="biz-partner-finished"/);
assert.doesNotMatch(finishedControls, /<s[^>]*>/);
resetPartnerQuoteStore({ status: "ready", quote: null });
const standardControls = renderToStaticMarkup(<BusinessPayControls {...controls} />);
assert.match(standardControls, /799 ₽ за 30 дней, картой или по СБП/);
assert.doesNotMatch(standardControls, /biz-partner/);
resetPartnerQuoteStore();

// Routing: the link and the API are served on the business host.
assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", "/podarok"), { action: "rewrite_business_app", pathname: "/business-app/podarok" });
assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", "/api/business/partner-code"), { action: "pass_through" });
{
  const prev = process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";
  assert.deepEqual(resolveBusinessProxyAction("coffee.audiolad.ru", "/podarok"), { action: "rewrite_business_app", pathname: "/business-app/podarok" }, "coffee host serves /podarok");
  assert.deepEqual(resolveBusinessProxyAction("coffee.audiolad.ru", "/api/business/partner-code"), { action: "pass_through" });
  if (prev === undefined) delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  else process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = prev;
}

// Copy and wiring guards.
const files = [
  "src/lib/business/partner-codes.ts",
  "src/components/business-app/BusinessPartnerPrice.tsx",
  "src/components/business-app/BusinessPartnerCodePanel.tsx",
  "src/components/business-app/BusinessPartnerLanding.tsx",
  "src/app/business-app/podarok/page.tsx",
  "src/components/admin/BusinessPartnerCodesPanel.tsx",
  "src/app/(platform)/admin/business-partner-codes/page.tsx",
  "src/app/api/business/partner-code/route.ts",
];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(source, /—/, `${file}: en dash only`);
  assert.doesNotMatch(source, /GRACE|льготн/i, `${file}: no hidden post-period wording`);
  assert.doesNotMatch(source, /399\.5|39950/, `${file}: no half kopecks`);
}
const panel = readFileSync("src/components/business-app/BusinessPartnerCodePanel.tsx", "utf8");
assert.match(panel, /У меня есть подарочный код/);
assert.match(panel, /aria-expanded=\{false\}/, "collapsed by default");
const profile = readFileSync("src/components/business-app/profile/BusinessProfileSubscription.tsx", "utf8");
assert.match(profile, /BusinessPartnerCodePanel/, "gift-code link lives in «Подписка»");
const home = readFileSync("src/components/business-app/BusinessHomePage.tsx", "utf8");
assert.doesNotMatch(home, /BusinessPartnerCodePanel/, "no permanent code field on the home");
const card = readFileSync("src/components/business-app/BusinessHomeAccessCard.tsx", "utf8");
assert.match(card, /confirmed_unit_price_minor: partnerConfirmedUnitPriceMinor\(getPartnerQuote\(\)\)/, "pay sends the price that was shown");
assert.match(card, /refreshPartnerQuoteFromCookie/, "t1322u: stale partner quote re-reserves from cookie");
assert.match(card, /partner_terms_changed[\s\S]*refreshPartnerQuoteFromCookie[\s\S]*checkoutOnce/, "t1322u: terms_changed retries pay once after refresh");
const quoteStore = readFileSync("src/components/business-app/partner-quote-store.ts", "utf8");
assert.match(quoteStore, /export async function refreshPartnerQuoteFromCookie/);
assert.match(quoteStore, /body: "\{\}"/, "cookie re-reserve posts empty body");
const route = readFileSync("src/app/api/business/subscription/checkout/route.ts", "utf8");
assert.match(route, /p_expected_unit_price_minor: confirmedUnitPriceMinor/);
const landing = readFileSync("src/components/business-app/BusinessPartnerLanding.tsx", "utf8");
assert.match(landing, /BusinessStruckPrice/, "the link landing shows the struck price");
assert.match(landing, /BusinessGuestStartCta/, "the free start stays the same");
assert.match(landing, /Активировать скидку/, "signed-in CTA after reserve");
assert.match(landing, /\/profile#podpiska/, "lands on subscription after activate");
assert.match(landing, /Закрепляем скидку/, "waits for reserve before navigate");
assert.match(landing, /Перейти в подписку/, "t1335u: an error that sends the owner to «Подписка» links straight there");
assert.doesNotMatch(landing, /Скидка пока недоступна/, "t1335u: no dead disabled button after an error");
const profileSub = readFileSync("src/components/business-app/profile/BusinessProfileSubscription.tsx", "utf8");
assert.match(profileSub, /id="podpiska"/);
assert.doesNotMatch(profileSub, /window\.location/);
assert.match(profileSub, /BusinessPartnerHomeBanner/);
assert.match(card, /BusinessPartnerHomeBanner/, "home shows discount banner");
assert.match(quoteStore, /refreshPartnerQuoteFromCookie/, "pay UI refreshes quote on mount (t1328u race)");
const partnerRoute = readFileSync("src/app/api/business/partner-code/route.ts", "utf8");
assert.match(partnerRoute, /checkAnalyticsRateLimit/, "the code endpoint is rate limited");
assert.match(partnerRoute, /partnerCodeErrorIsFinal/, "the link cookie survives non-final errors");
assert.match(partnerRoute, /quote: quote \? partnerQuoteToWire\(quote\) : null/, "t1335u: the route sends the wire quote");
const revoke = readFileSync("src/app/(platform)/admin/business-partner-codes/actions.ts", "utf8");
assert.match(revoke, /rpc\("revoke_business_partner_code"/, "revoke goes through the one transactional function");
// t1320u: created code lives in the table/card row, not as a sticky result inside «Новый код».
const adminPanel = readFileSync("src/components/admin/BusinessPartnerCodesPanel.tsx", "utf8");
assert.doesNotMatch(adminPanel, /admin-partner-code-created/, "no sticky created block in the form");
assert.doesNotMatch(adminPanel, /setCreated\(/, "form no longer keeps a created-code result");
assert.match(adminPanel, /admin-partner-copy-code/, "row has copy-code");
assert.match(adminPanel, /admin-partner-copy-link/, "row has copy-link");
assert.match(adminPanel, /Скопировать код/);
assert.match(adminPanel, /Скопировать ссылку/);
assert.match(adminPanel, /Скопировано/);
assert.match(adminPanel, /admin-partner-codes-cards/, "mobile cards at 390px");
assert.match(adminPanel, /setHighlightCode\(result\.code\)/, "new row is highlighted after create");
assert.match(adminPanel, /scrollIntoView/, "new row is scrolled into view");
assert.match(adminPanel, /router\.refresh\(\)/, "list refreshes after create/revoke");
assert.match(adminPanel, /partnerCodePublicLink\(row\.code\)/, "row link uses coffee public helper");
assert.doesNotMatch(adminPanel, /partnerCodeLink\(/, "admin panel does not take a free-form origin");
const adminPage = readFileSync("src/app/(platform)/admin/business-partner-codes/page.tsx", "utf8");
assert.doesNotMatch(adminPage, /BUSINESS_ORIGIN/, "admin no longer issues business host links");
assert.doesNotMatch(adminPage, /origin=\{/, "panel builds the coffee link itself");
assert.match(readFileSync("src/lib/business/partner-codes.ts", "utf8"), /PARTNER_CODE_PUBLIC_ORIGIN = "https:\/\/coffee\.audiolad\.ru"/);

assert.doesNotMatch(adminPanel, /—/, "admin panel: en dash only");
assert.match(card, /partner_period_in_payment/);
const migration = readFileSync("supabase/migrations/20270302120000_business_partner_codes.sql", "utf8");
assert.match(migration, /^-- PREPARE ONLY/);
assert.doesNotMatch(migration, /GRACE|льготн/i);
const executable = migration.split("COMMIT;")[0].replace(/--[^\n]*/g, "");
assert.doesNotMatch(executable, /DROP TABLE|DROP COLUMN|TRUNCATE/i, "additive only");
assert.deepEqual(executable.match(/DELETE FROM [a-z_.]+/g), ["DELETE FROM public.access_paid_periods"], "only the existing guest-summary fold, unchanged");
// The replaced-link path never ends in the dead-end mismatch for a code, and fulfilment changes only that branch.
assert.match(executable, /v_replace_reason := 'partner_code_applied'/);
assert.match(executable, /IF v_order.status IN \('cancelled', 'failed'\) AND NOT v_superseded THEN/);
assert.equal((executable.match(/v_superseded/g) ?? []).length, 5, "fulfilment: one flag, three guarded branches");
console.log("business-partner-codes-unit: PASS");
