import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import BusinessPointSlots from "../src/components/business-app/BusinessPointSlots";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { BusinessCabinetModeProvider } from "../src/components/business-app/BusinessPointMode";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import { emptyBusinessOwnerHomeSignals } from "../src/lib/business-app/owner-home-signals";

const locations = [{ id: "one", name: "Стритфуд 1", status: "active" }, { id: "two", name: "Стритфуд 2", status: "active" }];
function render(selected: number, pilot = true, point = false, billing?: { paidUntil: string | null; renewalBlocked: boolean }, limit = 3, halls = locations) {
  const domain: BusinessOwnerHomeContext = { status: "authenticated", owner: { userId: "owner", firstName: "Тест" },
    organizationId: "org", organizationName: "Пилот", canPay: true, offerAccepted: false, pilotSlots: pilot, venueSlotLimit: limit, pilotBilling: billing, locations: halls,
    location: { ...halls[selected], organizationId: "org", addressLine1: null, businessCategory: "cafe", countryCode: "RU", timezone: "Europe/Moscow", defaultZoneId: "zone" },
    signals: { ...emptyBusinessOwnerHomeSignals(), liveConnected: true, playbackConfirmedSecondsAgo: 3, playbackState: "playing", currentTrack: { title: selected === 0 ? "Jazz first" : "Jazz second" } } };
  return renderToStaticMarkup(<BusinessCabinetModeProvider value={{ mode: point ? "point" : "owner", pointReports: point, pointCanEdit: true, pointVenueName: null, ownerUnlockUntil: null, canPreview: true }}>
    <BusinessDomainProvider value={domain}><BusinessPointSlots /></BusinessDomainProvider>
  </BusinessCabinetModeProvider>);
}
const first = render(0);
const second = render(1);
assert.equal((first.match(/aria-pressed=/g) ?? []).length, 2, "two existing halls");
assert.equal((first.match(/data-testid="biz-add-point"/g) ?? []).length, 1, "one add button for the next hall");
assert.match(first, /\+ Добавить точку 3/);
assert.doesNotMatch(first, /резерв/, "no fake reserve slot");
assert.match(first, /Точек: <!-- -->2<!-- --> из <!-- -->3|Точек: 2 из 3/);
assert.match(first, /1598/, "two active venues billed, empty reserve excluded");
assert.match(first, /Jazz first/);
assert.doesNotMatch(first, /Jazz second/);
assert.match(second, /Jazz second/);
assert.doesNotMatch(second, /Jazz first/);
assert.match(first, /aria-pressed="true"[^>]*>Точка 1/);
assert.match(second, /aria-pressed="true"[^>]*>Точка 2/);
// Every ordinary account with one hall gets the same add button, no per-client flag.
const single = render(0, false, false, undefined, 3, [locations[0]]);
assert.match(single, /\+ Добавить точку 2/, "single hall can add the second");
assert.doesNotMatch(single, /data-testid="biz-home-pay"/, "single hall keeps the existing access card for payment");
const full = render(0, true, false, undefined, 3, [...locations, { id: "three", name: "Стритфуд 3", status: "active" }]);
assert.doesNotMatch(full, /biz-add-point/, "add blocked at cap");
assert.match(full, /2397/, "three active halls 2397");
const raised = render(0, true, false, undefined, 5, [...locations, { id: "three", name: "Стритфуд 3", status: "active" }]);
assert.match(raised, /\+ Добавить точку 4/, "raised system limit offers the fourth hall");
assert.equal(render(0, false, false, undefined, 1, [locations[0]]), "", "limit 1 (old schema) keeps the legacy cabinet");
assert.equal(render(0, true, true), "", "staff device cannot switch owner locations");
console.log("business-pilot-ui-unit: add button for every account, cap 3, raisable cap, owner switching/status, legacy, staff: PASS");

const blockedRenewal = render(1, true, false, { paidUntil: "2026-12-06T12:00:00Z", renewalBlocked: true });
assert.match(blockedRenewal, /Следующее продление/);
assert.match(blockedRenewal, /Новая точка пока не оплачена/);
assert.doesNotMatch(blockedRenewal, /data-testid="biz-home-pay"/, "no mid-period full-price checkout when a venue is unpaid");
