/**
 * Task 39ef47c4: Audiolad Business gift is 7 days (was 30), grace stays 3 days, price stays 799 ₽ per 30 days.
 * Boundaries are exact instants in Europe/Moscow (UTC+3, no DST).
 */
import assert from "node:assert/strict";

import { activateBusinessTrial, recordPaidRenewal } from "../src/lib/access-grants/apply";
import {
  BUSINESS_GIFT_CLOSING_NOTE,
  BUSINESS_GIFT_CTA,
  BUSINESS_GIFT_TITLE,
  businessGiftPriceNote,
} from "../src/lib/access-grants/copy";
import { eventsForAccessAction } from "../src/lib/access-grants/events";
import { hashAccessEmail } from "../src/lib/access-grants/email-hash";
import { createMemoryAccessGrantStore } from "../src/lib/access-grants/memory-store";
import { addGiftPeriod, moscowCalendarDayIndex, moscowYmd, resolveCustomerAccess } from "../src/lib/access-grants/policy";
import {
  BUSINESS_GIFT_DAYS,
  BUSINESS_GIFT_MS,
  BUSINESS_GRACE_DAYS,
  BUSINESS_GRACE_MS,
  BUSINESS_PAID_PERIOD_DAYS,
} from "../src/lib/business/plan";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const USER = "11111111-2222-4333-8444-555555555555";
const EMAIL = "trial-7@example.test";
const at = (iso: string) => new Date(iso);

// ---------------------------------------------------------------- constants
assert.equal(BUSINESS_GIFT_DAYS, 7);
assert.equal(BUSINESS_GIFT_MS, 7 * DAY);
assert.equal(BUSINESS_GRACE_DAYS, 3, "grace is unchanged");
assert.equal(BUSINESS_GRACE_MS, 3 * DAY);
assert.equal(BUSINESS_PAID_PERIOD_DAYS, 30, "the paid period is unchanged");
assert.equal(BUSINESS_GIFT_TITLE, "7 дней в подарок");
assert.equal(BUSINESS_GIFT_CTA, "Получить 7 дней бесплатно");
assert.equal(businessGiftPriceNote().replace(/\s/gu, " "), "799 ₽ за 30 дней, картой или по СБП. Автосписания нет.");
assert.match(BUSINESS_GIFT_CLOSING_NOTE, /требуется оплата.*ещё 3 дня.*до оплаты/u);
for (const text of [BUSINESS_GIFT_TITLE, BUSINESS_GIFT_CTA, BUSINESS_GIFT_CLOSING_NOTE, businessGiftPriceNote()]) {
  assert.doesNotMatch(text, /\u2014/u, "no em dash in visible copy");
  assert.doesNotMatch(text, /30 дней в подарок|30 дней бесплатно/u);
}

// ---------------------------------------------------------------- timeline in Moscow time
// Confirmed at 23:30 MSK on 1 March: late evening start must not lose or gain a day.
const start = at("2026-03-01T23:30:00+03:00");
const ends = addGiftPeriod(start);
assert.equal(ends.toISOString(), at("2026-03-08T23:30:00+03:00").toISOString(), "ends at the same MSK clock time 7 days later");
assert.equal(moscowYmd(start), "2026-03-01");
assert.equal(moscowYmd(ends), "2026-03-08");

const access = (now: Date, paidUntil: string | null = null) =>
  resolveCustomerAccess({
    now,
    emailConfirmed: true,
    grant: { emailHash: hashAccessEmail(EMAIL)!, userId: USER, kind: "business_new_client", startsAt: start.toISOString(), endsAt: ends.toISOString() },
    paidUntil,
  });

// Day 1 (first calendar day in MSK) and day 7.
const day1 = at("2026-03-01T23:59:59+03:00");
assert.equal(moscowCalendarDayIndex(start, day1), 0);
assert.equal(access(day1).mode, "trial");
assert.equal(access(day1).daysLeft, 7);
const day7 = at("2026-03-07T12:00:00+03:00");
assert.equal(moscowCalendarDayIndex(start, day7), 6);
assert.equal(access(day7).mode, "trial");
assert.equal(access(day7).player, true);
assert.equal(access(new Date(ends.getTime() - 1)).mode, "trial", "last millisecond of the gift");
assert.equal(access(new Date(ends.getTime() - 1)).daysLeft, 1);

// Start of day 8 after the gift instant: grace begins exactly at the end instant.
assert.equal(access(ends).mode, "grace");
assert.equal(access(ends).player, true);
assert.equal(access(ends).endsAt, ends.toISOString(), "grace does not move the contractual end");
assert.equal(access(ends).playbackUntil, new Date(ends.getTime() + 3 * DAY).toISOString());

// Each grace day.
for (const graceDay of [1, 2, 3]) {
  const now = new Date(ends.getTime() + (graceDay - 1) * DAY + 12 * HOUR);
  const a = access(now);
  assert.equal(a.mode, "grace", `grace day ${graceDay}`);
  assert.equal(a.player, true, `music plays on grace day ${graceDay}`);
  assert.equal(a.daysLeft, 4 - graceDay, `grace day ${graceDay} countdown`);
}
const graceEnd = new Date(ends.getTime() + BUSINESS_GRACE_MS);
assert.equal(graceEnd.toISOString(), at("2026-03-11T23:30:00+03:00").toISOString());
assert.equal(access(new Date(graceEnd.getTime() - 1)).mode, "grace", "last millisecond of grace");
// Grace end moment: access suspended, payment offered.
assert.equal(access(graceEnd).mode, "offer");
assert.equal(access(graceEnd).player, false);
assert.equal(access(graceEnd).grantKept, true);

// ---------------------------------------------------------------- store flow: payment inside grace, re-entry after suspension
{
  const store = createMemoryAccessGrantStore();
  const issued = await activateBusinessTrial(store, { userId: USER, email: EMAIL, now: start });
  assert.equal(issued.decision, "issued");
  assert.equal(issued.grant?.endsAt, ends.toISOString());
  await store.writePlayback({ userId: USER, spaceId: "cafe", index: 3, positionSec: 12, volume: 0.5, updatedAt: start.toISOString() });

  const inGrace = new Date(ends.getTime() + 2 * DAY);
  const before = await activateBusinessTrial(store, { userId: USER, email: EMAIL, now: inGrace });
  assert.equal(before.access.mode, "grace");
  const paidUntil = new Date(inGrace.getTime() + BUSINESS_PAID_PERIOD_DAYS * DAY);
  const paid = await recordPaidRenewal(store, { userId: USER, email: EMAIL, paidUntil, now: inGrace });
  assert.equal(paid.mode, "paid", "payment inside grace switches to paid");
  assert.equal(paid.player, true);
  assert.equal(store.grants.length, 1, "no second gift, no re-onboarding");
  assert.equal(store.grants[0]?.endsAt, ends.toISOString());
  assert.equal((await store.readPlayback(USER, "cafe"))?.index, 3, "playback settings kept");
  const later = await activateBusinessTrial(store, { userId: USER, email: EMAIL, now: new Date(graceEnd.getTime() + DAY) });
  assert.equal(later.decision, "paid_kept");
  assert.equal(later.access.mode, "paid", "after the old grace end the paid period keeps access");
}
{
  const store = createMemoryAccessGrantStore();
  await activateBusinessTrial(store, { userId: USER, email: EMAIL, now: start });
  await store.writePlayback({ userId: USER, spaceId: "cafe", index: 5, positionSec: 0, volume: 0.3, updatedAt: start.toISOString() });
  const suspended = new Date(graceEnd.getTime() + 5 * DAY);
  const reentry = await activateBusinessTrial(store, { userId: USER, email: EMAIL, now: suspended });
  assert.equal(reentry.decision, "existing", "re-entry after suspension does not restart the gift");
  assert.equal(reentry.access.mode, "offer");
  assert.equal(reentry.access.player, false);
  assert.equal(store.grants.length, 1);
  const paid = await recordPaidRenewal(store, {
    userId: USER,
    email: EMAIL,
    paidUntil: new Date(suspended.getTime() + BUSINESS_PAID_PERIOD_DAYS * DAY),
    now: suspended,
  });
  assert.equal(paid.mode, "paid", "paying after suspension restores access");
  assert.equal((await store.readPlayback(USER, "cafe"))?.index, 5, "data kept through suspension");
}

// ---------------------------------------------------------------- legacy 30-day grants are not shortened
{
  const store = createMemoryAccessGrantStore();
  const legacyStart = at("2026-10-20T10:00:00+03:00");
  const legacyEnd = new Date(legacyStart.getTime() + 30 * DAY);
  store.grants.push({
    emailHash: hashAccessEmail(EMAIL)!,
    userId: USER,
    kind: "business_new_client",
    startsAt: legacyStart.toISOString(),
    endsAt: legacyEnd.toISOString(),
  });
  const day20 = new Date(legacyStart.getTime() + 20 * DAY);
  const legacy = await activateBusinessTrial(store, { userId: USER, email: EMAIL, now: day20 });
  assert.equal(legacy.decision, "existing");
  assert.equal(legacy.access.mode, "trial", "a stored 30-day trial keeps running after the switch to 7 days");
  assert.equal(legacy.grant?.endsAt, legacyEnd.toISOString(), "stored ends_at is never recomputed");
  assert.equal(legacy.access.daysLeft, 10);
  assert.equal(store.grants.length, 1);
  const legacyGrace = await activateBusinessTrial(store, { userId: USER, email: EMAIL, now: legacyEnd });
  assert.equal(legacyGrace.access.mode, "grace", "legacy trials still get the 3-day grace");
}

// Moscow midnight, month/year rollover and leap day: never truncate the full period.
for (const iso of [
  "2026-11-02T00:00:00+03:00",
  "2026-11-02T00:00:01+03:00",
  "2026-11-02T23:59:59+03:00",
  "2026-12-28T23:30:00+03:00",
  "2028-02-26T12:00:00+03:00",
]) {
  const begins = at(iso);
  const until = addGiftPeriod(begins);
  const grant = { emailHash: hashAccessEmail(EMAIL)!, userId: USER, kind: "business_new_client", startsAt: begins.toISOString(), endsAt: until.toISOString() };
  const state = (now: Date) => resolveCustomerAccess({ now, emailConfirmed: true, grant, paidUntil: null });
  assert.equal(until.getTime() - begins.getTime(), 7 * DAY, iso);
  assert.equal(moscowCalendarDayIndex(begins, until), 7, iso);
  assert.equal(state(new Date(until.getTime() - 1)).mode, "trial", iso);
  assert.equal(state(until).mode, "grace", iso);
  assert.equal(state(new Date(until.getTime() + 3 * DAY - 1)).player, true, iso);
  assert.equal(state(new Date(until.getTime() + 3 * DAY)).mode, "offer", iso);
}
assert.equal(moscowYmd(at("2026-11-01T21:00:00Z")), "2026-11-02");
assert.equal(moscowCalendarDayIndex(at("2026-11-01T20:59:59Z"), at("2026-11-01T21:00:00Z")), 1);
// The start of calendar day 8 still keeps the remaining hours of the full 7-day gift.
assert.equal(access(at("2026-03-08T00:00:00+03:00")).mode, "trial");
for (let index = 0; index <= 10; index++) {
  const now = new Date(start.getTime() + index * DAY);
  const events = eventsForAccessAction({ action: "visit", mode: access(now).mode, calendarDayIndex: moscowCalendarDayIndex(start, now), recorded: [] });
  assert.equal(events.includes("activity_day_7"), index === 6);
  assert.equal(events.includes("activity_day_14"), false);
  assert.equal(events.includes("activity_day_30"), false);
  assert.equal(events.includes("subscription_offer_shown"), index === 10);
}

console.log("business-trial-7-days-unit: ok");
