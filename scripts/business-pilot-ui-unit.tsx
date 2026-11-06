import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import BusinessPointSlots from "../src/components/business-app/BusinessPointSlots";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { BusinessCabinetModeProvider } from "../src/components/business-app/BusinessPointMode";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import { emptyBusinessOwnerHomeSignals } from "../src/lib/business-app/owner-home-signals";

const locations = [{ id: "one", name: "Стритфуд 1", status: "active" }, { id: "two", name: "Стритфуд 2", status: "active" }];
function render(selected: number, pilot = true, point = false) {
  const domain: BusinessOwnerHomeContext = { status: "authenticated", owner: { userId: "owner", firstName: "Александр" },
    organizationId: "org", organizationName: "Пилот", canPay: true, offerAccepted: true, pilotSlots: pilot, locations,
    location: { ...locations[selected], organizationId: "org", addressLine1: null, businessCategory: "cafe", countryCode: "RU", timezone: "Europe/Moscow", defaultZoneId: "zone" },
    signals: { ...emptyBusinessOwnerHomeSignals(), liveConnected: true, playbackConfirmedSecondsAgo: 3, playbackState: "playing", currentTrack: { title: selected === 0 ? "Jazz first" : "Jazz second" } } };
  return renderToStaticMarkup(<BusinessCabinetModeProvider value={{ mode: point ? "point" : "owner", pointReports: point, pointCanEdit: true, pointVenueName: null, ownerUnlockUntil: null, canPreview: true }}>
    <BusinessDomainProvider value={domain}><BusinessPointSlots /></BusinessDomainProvider>
  </BusinessCabinetModeProvider>);
}
const first = render(0);
const second = render(1);
assert.equal((first.match(/<button /g) ?? []).length, 3, "exactly three slot controls");
assert.match(first, /Точка 3<!-- --> – резерв для кофейни · Активировать|Точка 3 – резерв для кофейни · Активировать/);
assert.match(first, /1598/);
assert.match(first, /Jazz first/);
assert.doesNotMatch(first, /Jazz second/);
assert.match(second, /Jazz second/);
assert.doesNotMatch(second, /Jazz first/);
assert.match(first, /aria-pressed="true"[^>]*>Точка 1/);
assert.match(second, /aria-pressed="true"[^>]*>Точка 2/);
assert.equal(render(0, false), "", "legacy cabinet has no pilot controls");
assert.equal(render(0, true, true), "", "staff device cannot switch owner locations");
console.log("business-pilot-ui-unit: three slots, reserve, owner switching/status, legacy, staff: PASS");
