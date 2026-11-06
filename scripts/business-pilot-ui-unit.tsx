import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import BusinessPointSlots from "../src/components/business-app/BusinessPointSlots";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { BusinessCabinetModeProvider } from "../src/components/business-app/BusinessPointMode";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import { emptyBusinessOwnerHomeSignals } from "../src/lib/business-app/owner-home-signals";

const locations = [{ id: "one", name: "Стритфуд 1", status: "active" }, { id: "two", name: "Стритфуд 2", status: "active" }];
function render(selected: number, pilot = true, point = false, billing?: { paidUntil: string | null; renewalBlocked: boolean }) {
  const domain: BusinessOwnerHomeContext = { status: "authenticated", owner: { userId: "owner", firstName: "Тест" },
    organizationId: "org", organizationName: "Пилот", canPay: true, offerAccepted: false, pilotSlots: pilot, pilotBilling: billing, locations,
    location: { ...locations[selected], organizationId: "org", addressLine1: null, businessCategory: "cafe", countryCode: "RU", timezone: "Europe/Moscow", defaultZoneId: "zone" },
    signals: { ...emptyBusinessOwnerHomeSignals(), liveConnected: true, playbackConfirmedSecondsAgo: 3, playbackState: "playing", currentTrack: { title: selected === 0 ? "Jazz first" : "Jazz second" } } };
  return renderToStaticMarkup(<BusinessCabinetModeProvider value={{ mode: point ? "point" : "owner", pointReports: point, pointCanEdit: true, pointVenueName: null, ownerUnlockUntil: null, canPreview: true }}>
    <BusinessDomainProvider value={domain}><BusinessPointSlots /></BusinessDomainProvider>
  </BusinessCabinetModeProvider>);
}
const first = render(0);
const second = render(1);
assert.equal((first.match(/aria-pressed=/g) ?? []).length, 3, "exactly three slot controls");
assert.match(first, /Точка 3<!-- --> – резерв для кофейни · Активировать|Точка 3 – резерв для кофейни · Активировать/);
assert.match(first, /1598/, "two active venues billed, empty reserve excluded");
assert.match(first, /Jazz first/);
assert.doesNotMatch(first, /Jazz second/);
assert.match(second, /Jazz second/);
assert.doesNotMatch(second, /Jazz first/);
assert.match(first, /aria-pressed="true"[^>]*>Точка 1/);
assert.match(second, /aria-pressed="true"[^>]*>Точка 2/);
assert.equal(render(0, false), "", "legacy cabinet has no pilot controls");
assert.equal(render(0, true, true), "", "staff device cannot switch owner locations");
console.log("business-pilot-ui-unit: three slots, reserve, owner switching/status, legacy, staff: PASS");

const blockedRenewal = render(1, true, false, { paidUntil: "2026-12-06T12:00:00Z", renewalBlocked: true });
assert.match(blockedRenewal, /Следующее продление/);
assert.match(blockedRenewal, /Новая точка пока не оплачена/);
assert.doesNotMatch(blockedRenewal, /data-testid="biz-home-pay"/, "no mid-period full-price checkout when a venue is unpaid");
