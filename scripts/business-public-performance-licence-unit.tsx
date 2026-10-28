/**
 * Gift access is a licensed public-performance period. The start is registration.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { BusinessChromeAccessProvider } from "../src/components/business-app/BusinessAccessLine";
import BusinessHomeAccessCard from "../src/components/business-app/BusinessHomeAccessCard";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { resolveCustomerAccess } from "../src/lib/access-grants/policy";
import { resolvePublicPerformanceLicence } from "../src/lib/access-grants/public-performance-licence";
import {
  BUSINESS_LICENCE_ACCESS_RULE,
  BUSINESS_LICENCE_ADMITTED_RULE,
  BUSINESS_LICENCE_ENDED_RULE,
  BUSINESS_LICENCE_PAID_RULE,
  BUSINESS_LICENCE_PLACE_RULE,
  BUSINESS_LICENCE_SECTOR_RULE,
  BUSINESS_LICENCE_TRIAL_RULE,
  businessLicenceCardLine,
} from "../src/lib/business-app/licensing-copy";
import { validateVenuePlace, venuePlaceLine } from "../src/lib/business-app/venue-place";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";

const GIFT_START = "2026-10-23T14:11:37.000Z";
const GIFT_END = "2026-11-22T14:11:37.000Z";
const PAID_UNTIL = "2026-12-31T10:00:00.000Z";
const grant = {
  emailHash: "ab",
  userId: "user",
  kind: "business_new_client",
  startsAt: GIFT_START,
  endsAt: GIFT_END,
};

const duringGift = resolveCustomerAccess({
  now: new Date("2026-10-28T12:00:00.000Z"),
  emailConfirmed: true,
  grant,
  paidUntil: null,
});
assert.equal(duringGift.mode, "trial");
assert.equal(duringGift.licenceStartsAt, GIFT_START);
const trialLicence = resolvePublicPerformanceLicence({
  mode: duringGift.mode,
  startsAt: duringGift.licenceStartsAt,
  endsAt: duringGift.endsAt,
  playbackUntil: duringGift.playbackUntil,
  sectorLabel: "Кафе",
});
assert.ok(trialLicence);
assert.equal(trialLicence.licensed, true);
assert.equal(trialLicence.status, "trial");
assert.equal(trialLicence.startsAt, GIFT_START);
assert.equal(trialLicence.endsAt, GIFT_END);
assert.equal(trialLicence.repertoire, "business_admitted");
assert.equal(trialLicence.sectorLabel, "Кафе");
assert.equal(businessLicenceCardLine(trialLicence.status), BUSINESS_LICENCE_TRIAL_RULE);

const paid = resolveCustomerAccess({
  now: new Date("2026-12-01T00:00:00.000Z"),
  emailConfirmed: true,
  grant,
  paidUntil: PAID_UNTIL,
});
assert.equal(paid.mode, "paid");
assert.equal(paid.licenceStartsAt, GIFT_START, "payment does not move the licence start");
const paidLicence = resolvePublicPerformanceLicence({
  mode: paid.mode,
  startsAt: paid.licenceStartsAt,
  endsAt: paid.endsAt,
  playbackUntil: paid.playbackUntil,
});
assert.ok(paidLicence);
assert.equal(paidLicence.licensed, true);
assert.equal(paidLicence.status, "paid");
assert.equal(paidLicence.startsAt, GIFT_START);
assert.notEqual(paidLicence.startsAt, PAID_UNTIL);
assert.equal(businessLicenceCardLine("paid"), BUSINESS_LICENCE_PAID_RULE);

const grace = resolveCustomerAccess({
  now: new Date(GIFT_END),
  emailConfirmed: true,
  grant,
  paidUntil: null,
});
assert.equal(grace.mode, "grace");
const graceLicence = resolvePublicPerformanceLicence({
  mode: grace.mode,
  startsAt: grace.licenceStartsAt,
  endsAt: grace.endsAt,
  playbackUntil: grace.playbackUntil,
});
assert.ok(graceLicence);
assert.equal(graceLicence.licensed, true);
assert.equal(graceLicence.status, "grace");
assert.equal(graceLicence.startsAt, GIFT_START);
assert.equal(graceLicence.endsAt, grace.playbackUntil);
assert.equal(businessLicenceCardLine("grace"), BUSINESS_LICENCE_ACCESS_RULE);

const expired = resolveCustomerAccess({
  now: new Date(Date.parse(grace.playbackUntil!) + 1000),
  emailConfirmed: true,
  grant,
  paidUntil: null,
});
assert.equal(expired.mode, "offer");
const expiredLicence = resolvePublicPerformanceLicence({
  mode: expired.mode,
  startsAt: expired.licenceStartsAt,
  endsAt: expired.endsAt,
  playbackUntil: expired.playbackUntil,
});
assert.ok(expiredLicence);
assert.equal(expiredLicence.licensed, false);
assert.equal(expiredLicence.status, "expired");
assert.equal(expiredLicence.startsAt, GIFT_START);
assert.equal(businessLicenceCardLine("expired"), BUSINESS_LICENCE_ENDED_RULE);

assert.equal(
  resolvePublicPerformanceLicence({ mode: "none", startsAt: GIFT_START, endsAt: GIFT_END }),
  null,
);

const place = validateVenuePlace({ name: "  Кофейня  ", addressLine1: " ул. Примерная, 1 " });
assert.equal(place.ok, true);
if (place.ok) {
  assert.equal(place.value.name, "Кофейня");
  assert.equal(place.value.addressLine1, "ул. Примерная, 1");
}
assert.equal(validateVenuePlace({ name: "Кофейня", addressLine1: "" }).ok, false);
assert.equal(validateVenuePlace({ name: "Кофейня", addressLine1: "дом\n2" }).ok, false);
assert.equal(venuePlaceLine("Кофейня", "ул. Примерная, 1"), "Кофейня – ул. Примерная, 1");
assert.equal(venuePlaceLine("Кофейня", "  "), null);

const quotes = [
  BUSINESS_LICENCE_TRIAL_RULE,
  BUSINESS_LICENCE_PAID_RULE,
  BUSINESS_LICENCE_ACCESS_RULE,
  BUSINESS_LICENCE_ENDED_RULE,
  BUSINESS_LICENCE_PLACE_RULE,
  BUSINESS_LICENCE_ADMITTED_RULE,
  BUSINESS_LICENCE_SECTOR_RULE,
];
const terms = readFileSync("docs/business/public/program-terms.md", "utf8");
const norm = (value: string) => value.replace(/\*\*/g, "").replace(/[.;]+$/u, "").toLowerCase();
const plainTerms = norm(terms);
for (const quote of quotes) {
  assert.equal(plainTerms.includes(norm(quote)), true, quote);
  assert.doesNotMatch(quote, /—|https?:/);
}

const migration = readFileSync("supabase/migrations/20270206130000_business_location_venue_address.sql", "utf8");
assert.match(migration, /business_owner_set_location_venue/);
assert.match(migration, /address_line1/);
assert.doesNotMatch(migration, /ADD COLUMN/i);
assert.doesNotMatch(migration, /ALTER TABLE public\.business_locations/i);
assert.match(migration, /create_business_organization_with_location\(text,text,text,text,text\)/);

const domain: BusinessOwnerHomeContext = {
  status: "authenticated",
  owner: { userId: "owner", firstName: "Анна" },
  organizationId: "org",
  organizationName: "Кафе",
  location: {
    id: "loc",
    organizationId: "org",
    name: "Кофейня",
    businessCategory: "Кафе",
    countryCode: "RU",
    timezone: "Europe/Moscow",
    status: "active",
    addressLine1: "ул. Примерная, 1",
    defaultZoneId: null,
  },
  canPay: true,
  offerAccepted: true,
  signals: null,
};

const withAddress = renderToStaticMarkup(
  <BusinessDomainProvider value={domain}>
    <BusinessChromeAccessProvider value={{ mode: "trial", endsAt: GIFT_END, startsAt: GIFT_START }}>
      <BusinessHomeAccessCard />
    </BusinessChromeAccessProvider>
  </BusinessDomainProvider>,
);
assert.match(withAddress, /data-testid="biz-home-licence"/);
assert.match(withAddress, /Пробный и пилотный доступ/);
assert.match(withAddress, /data-testid="biz-home-venue"/);
assert.match(withAddress, /Кофейня – ул\. Примерная, 1/);
assert.doesNotMatch(withAddress, /biz-home-venue-missing/);
assert.doesNotMatch(withAddress, /—/);

const missing = renderToStaticMarkup(
  <BusinessDomainProvider value={{ ...domain, location: { ...domain.location!, addressLine1: null } }}>
    <BusinessChromeAccessProvider value={{ mode: "trial", endsAt: GIFT_END, startsAt: GIFT_START }}>
      <BusinessHomeAccessCard />
    </BusinessChromeAccessProvider>
  </BusinessDomainProvider>,
);
assert.match(missing, /data-testid="biz-home-venue-missing"/);
assert.match(missing, /href="\/preferences#venue"/);
assert.match(missing, /Указать адрес/);

console.log("business-public-performance-licence-unit: ok");
