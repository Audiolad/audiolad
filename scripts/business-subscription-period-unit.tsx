import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { BusinessChromeAccessProvider } from "../src/components/business-app/BusinessAccessLine";
import { BusinessPayControls } from "../src/components/business-app/BusinessHomeAccessCard";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { businessEarlyPayCarryoverNote, businessPaidPeriodBounds } from "../src/lib/business/subscription-period";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";

const MS_DAY = 86_400_000;
const paidAt = new Date("2026-11-09T10:00:00.000Z");

// t1311u: pay during free trial – 30 days start after trial end (799 path).
{
  const trialEnds = new Date("2026-11-14T10:00:00.000Z");
  const { periodStart, periodEnd } = businessPaidPeriodBounds({
    paidAt,
    trialEndsAt: trialEnds,
    paidUntil: null,
  });
  assert.equal(periodStart.toISOString(), trialEnds.toISOString());
  assert.equal(periodEnd.toISOString(), new Date(trialEnds.getTime() + 30 * MS_DAY).toISOString());
}

// t1311u: partner-code 399 uses the same clock stacking (fulfilment passes v_base/v_end through).
{
  const trialEnds = new Date("2026-11-12T08:00:00.000Z");
  const { periodStart, periodEnd } = businessPaidPeriodBounds({
    paidAt,
    trialEndsAt: trialEnds,
    paidUntil: null,
  });
  assert.equal(periodStart.toISOString(), trialEnds.toISOString());
  assert.equal((periodEnd.getTime() - periodStart.getTime()) / MS_DAY, 30);
}

// Pay after trial ended, no paid period: starts at payment time.
{
  const { periodStart, periodEnd } = businessPaidPeriodBounds({
    paidAt,
    trialEndsAt: new Date("2026-11-01T10:00:00.000Z"),
    paidUntil: null,
  });
  assert.equal(periodStart.toISOString(), paidAt.toISOString());
  assert.equal(periodEnd.toISOString(), new Date(paidAt.getTime() + 30 * MS_DAY).toISOString());
}

// t1312u: early 799 renewal – remaining paid days stack, +30 on top.
{
  const paidUntil = new Date("2026-11-20T10:00:00.000Z");
  const { periodStart, periodEnd } = businessPaidPeriodBounds({
    paidAt,
    trialEndsAt: null,
    paidUntil,
  });
  assert.equal(periodStart.toISOString(), paidUntil.toISOString());
  assert.equal(periodEnd.toISOString(), new Date(paidUntil.getTime() + 30 * MS_DAY).toISOString());
}

// t1312u: multi-venue / partner – org paid_until later than trial wins (shared renewal date).
{
  const trialEnds = new Date("2026-11-11T10:00:00.000Z");
  const orgPaidUntil = new Date("2026-12-01T10:00:00.000Z");
  const { periodStart, periodEnd } = businessPaidPeriodBounds({
    paidAt,
    trialEndsAt: trialEnds,
    paidUntil: orgPaidUntil,
  });
  assert.equal(periodStart.toISOString(), orgPaidUntil.toISOString(), "paid days win over remaining gift");
  assert.equal(periodEnd.toISOString(), new Date(orgPaidUntil.getTime() + 30 * MS_DAY).toISOString());
}

// Copy: trial and paid early-pay lines (no em dash; never mention the hidden grace).
{
  const now = new Date("2026-11-09T12:00:00.000Z");
  const trialNote = businessEarlyPayCarryoverNote(
    { mode: "trial", endsAt: "2026-11-14T15:00:00.000Z" },
    now,
  );
  // endsAt 14 Nov 15:00Z + 30d = 14 Dec 15:00Z → Moscow day 14 декабря 2026
  assert.equal(
    trialNote,
    "Оставшиеся дни сохранятся, и к ним добавится ещё 30 дней – доступ будет до 14 декабря 2026.",
  );
  const paidNote = businessEarlyPayCarryoverNote(
    { mode: "paid", endsAt: "2026-12-05T15:00:00.000Z" },
    now,
  );
  // 5 Dec 15:00Z + 30d = 4 Jan 15:00Z → Moscow 4 января 2027
  assert.equal(
    paidNote,
    "Оставшиеся дни сохранятся, и к ним добавится ещё 30 дней – доступ будет до 4 января 2027.",
  );
  assert.equal(businessEarlyPayCarryoverNote({ mode: "grace", endsAt: "2026-11-14T15:00:00.000Z" }, now), null);
  assert.equal(businessEarlyPayCarryoverNote({ mode: "offer", endsAt: null }, now), null);
  assert.equal(businessEarlyPayCarryoverNote({ mode: "trial", endsAt: "2026-11-01T00:00:00.000Z" }, now), null);
  for (const note of [trialNote, paidNote]) {
    assert.ok(note);
    assert.doesNotMatch(note, /льготн|grace|скрыт/iu);
    assert.doesNotMatch(note, /\u2014/);
  }
}

// Fulfilment SQL still stacks from trial end and paid_until (no reset path).
{
  const sql = readFileSync("supabase/migrations/20270302120000_business_partner_codes.sql", "utf8");
  const applyStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.apply_business_subscription_for_order");
  assert.ok(applyStart >= 0);
  const body = sql.slice(applyStart, applyStart + 12000);
  assert.match(body, /v_trial_end := v_grant\.ends_at/);
  assert.match(body, /IF v_trial_end IS NOT NULL AND v_trial_end > v_base THEN\s+v_base := v_trial_end;/);
  assert.match(body, /IF v_paid_until IS NOT NULL AND v_paid_until > v_base THEN\s+v_base := v_paid_until;/);
  assert.match(body, /v_end := v_base \+ interval '30 days'/);
  assert.match(body, /business_partner_apply_period_internal\([\s\S]*v_base, v_end, v_paid_at\)/);
  assert.doesNotMatch(body, /v_end := v_paid_at \+ interval '30 days'/);
}

// Smoke coverage pointers (SQL tests already assert 799/code/multi-venue stacking).
{
  const paymentSmoke = readFileSync("supabase/tests/business_subscription_payment_smoke.sql", "utf8");
  assert.match(paymentSmoke, /trial extension start/);
  const partnerSmoke = readFileSync("supabase/tests/business_partner_codes_smoke.sql", "utf8");
  assert.match(partnerSmoke, /gift days are not consumed: first paid period starts after the gift/);
  assert.match(partnerSmoke, /no overlap: the code period follows the late ordinary one/);
  const venueSmoke = readFileSync("supabase/tests/business_shared_venue_renewal_smoke.sql", "utf8");
  assert.match(venueSmoke, /one two-venue payment adds exactly 30 shared days after the existing gift/);
}

// UI: carryover line renders next to pay controls while trial is live.
{
  const ownerDomain: BusinessOwnerHomeContext = {
    status: "authenticated",
    owner: { userId: "owner", firstName: "Анна", lastName: "Иванова" },
    organizationId: "org",
    organizationName: "Кафе",
    location: null,
    canPay: true,
    offerAccepted: true,
    signals: null,
  };
  const html = renderToStaticMarkup(
    <BusinessDomainProvider value={ownerDomain}>
      <BusinessChromeAccessProvider value={{ mode: "trial", endsAt: "2026-11-14T15:00:00.000Z" }}>
        <BusinessPayControls
          canPay
          accepted
          busy={false}
          error={null}
          onAccept={() => {}}
          onPay={() => {}}
          payLabel="Оплатить заранее"
        />
      </BusinessChromeAccessProvider>
    </BusinessDomainProvider>,
  );
  assert.match(html, /data-testid="biz-home-carryover-note"/);
  assert.match(html, /Оставшиеся дни сохранятся, и к ним добавится ещё 30 дней – доступ будет до 14 декабря 2026\./);
}


// t1313u: every early-pay surface either uses BusinessPayControls or BusinessEarlyPayCarryoverNote.
{
  const checklist = readFileSync("src/components/business-app/BusinessHomeChecklist.tsx", "utf8");
  assert.match(checklist, /BusinessEarlyPayCarryoverNote/);
  const profile = readFileSync("src/components/business-app/profile/BusinessProfileSubscription.tsx", "utf8");
  assert.match(profile, /BusinessPayControls/);
  assert.match(profile, /payLabel=\{summary\.button\}/);
  const slots = readFileSync("src/components/business-app/BusinessPointSlots.tsx", "utf8");
  assert.match(slots, /BusinessPayControls/);
  const home = readFileSync("src/components/business-app/BusinessHomeAccessCard.tsx", "utf8");
  assert.match(home, /businessEarlyPayCarryoverNote\(access\)/);
  assert.match(home, /BusinessEarlyPayCarryoverNote/);
  // Hall «Продлить доступ» is only after access ended – not an early-pay stack surface.
  const hall = readFileSync("src/components/business-app/BusinessHallHome.tsx", "utf8");
  assert.match(hall, /Продлить доступ/);
  assert.doesNotMatch(hall, /carryover|BusinessPayControls/);
}

console.log("business-subscription-period-unit: ok");
