import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import BusinessPointSlots from "../src/components/business-app/BusinessPointSlots";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { BusinessCabinetModeProvider } from "../src/components/business-app/BusinessPointMode";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import { emptyBusinessOwnerHomeSignals } from "../src/lib/business-app/owner-home-signals";

const noop = () => {};
const fakeRouter = { push: noop, replace: noop, refresh: noop, back: noop, forward: noop, prefetch: noop } as never;

const locations = [{ id: "one", name: "Стритфуд 1", status: "active" }, { id: "two", name: "Стритфуд 2", status: "active" }];
function render(selected: number, pilot = true, point = false, billing?: { paidUntil: string | null; renewalBlocked: boolean }, limit = 3, halls = locations) {
  const domain: BusinessOwnerHomeContext = { status: "authenticated", owner: { userId: "owner", firstName: "Тест" },
    organizationId: "org", organizationName: "Пилот", canPay: true, offerAccepted: false, pilotSlots: pilot, venueSlotLimit: limit, pilotBilling: billing, locations: halls,
    location: { ...halls[selected], organizationId: "org", addressLine1: null, businessCategory: "cafe", countryCode: "RU", timezone: "Europe/Moscow", defaultZoneId: "zone" },
    signals: { ...emptyBusinessOwnerHomeSignals(), liveConnected: true, playbackConfirmedSecondsAgo: 3, playbackState: "playing", currentTrack: { title: selected === 0 ? "Jazz first" : "Jazz second" } } };
  return renderToStaticMarkup(<AppRouterContext.Provider value={fakeRouter}><BusinessCabinetModeProvider value={{ mode: point ? "point" : "owner", pointReports: point, pointCanEdit: true, pointVenueName: null, ownerUnlockUntil: null, canPreview: true }}>
    <BusinessDomainProvider value={domain}><BusinessPointSlots /></BusinessDomainProvider>
  </BusinessCabinetModeProvider></AppRouterContext.Provider>);
}
const first = render(0);
const second = render(1);
assert.equal((first.match(/aria-pressed=/g) ?? []).length, 2, "two existing halls");
assert.equal((first.match(/data-testid="biz-add-point"/g) ?? []).length, 1, "one add button for the next hall");
assert.match(first, /\+ Добавить точку 3/);
assert.doesNotMatch(first, /резерв/, "no fake reserve slot");
assert.doesNotMatch(first, /Точек:|из 3|пустые места|за каждую активную точку/, "no capacity sentence");
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
const tenLimit = render(0, true, false, undefined, 10);
assert.match(tenLimit, /\+ Добавить точку 3/, "ten-hall setting still offers only the next hall");
assert.doesNotMatch(tenLimit, /biz-more-points|Точек:|из 10|biz-tenth-point-notice|Написать|десятую точку/);
const tenHalls = Array.from({ length: 10 }, (_, index) => ({ id: `hall-${index}`, name: `Зал ${index + 1}`, status: "active" }));
for (let count = 3; count < 10; count++) {
  const next = render(0, true, false, undefined, 10, tenHalls.slice(0, count));
  assert.match(next, new RegExp(`\\+ Добавить точку ${count + 1}`), "one sequential add button through hall ten");
  assert.equal((next.match(/data-testid="biz-add-point"/g) ?? []).length, 1);
  if (count === 9) {
    assert.match(next, /data-testid="biz-tenth-point-notice"/);
    assert.match(next, /Сейчас вы подключаете десятую точку/);
    assert.match(next, /В этой конфигурации точек десять/);
    assert.match(next, /Одиннадцатую так же подключить нельзя/);
    assert.match(next, /напишите заранее/);
    assert.match(next, /href="\/profile#kontakty"/);
    assert.match(next, />Написать</);
    assert.doesNotMatch(next, /data-testid="biz-more-points"/);
  } else {
    assert.doesNotMatch(next, /biz-tenth-point-notice|biz-more-points-write|Сейчас вы подключаете десятую точку|data-testid="biz-more-points"/);
  }
}
const tenFull = render(0, true, false, undefined, 10, tenHalls);
assert.equal((tenFull.match(/aria-pressed=/g) ?? []).length, 10, "all existing halls remain selectable");
assert.doesNotMatch(tenFull, /biz-add-point|Добавить точку 11|Точек:|из 10|лимит|https?:|—|<details|Добавить ещё точку/);
assert.match(tenFull, /data-testid="biz-more-points"/, "visible thank-you after ten, without creating a hall");
assert.match(tenFull, /Спасибо, что вы с нами и развиваете сеть/);
assert.match(tenFull, /В этой конфигурации можно подключить десять точек/);
assert.match(tenFull, /одиннадцатую так же добавить нельзя/);
assert.match(tenFull, /напишите заранее/);
assert.match(tenFull, /именно под вашу ситуацию/);
assert.match(tenFull, /href="\/profile#kontakty"/);
assert.match(tenFull, /data-testid="biz-more-points-write"/);
assert.match(tenFull, />Написать</);
assert.match(tenFull, /7990/, "ten active halls keep the same billing math");
assert.match(first, /Активных точек:/);
assert.match(first, /Одна оплата за все активные точки/);
console.log("business-pilot-ui-unit: sequential self-serve through ten, personal proposal, no capacity copy, billing, legacy, staff: PASS");

const blockedRenewal = render(1, true, false, { paidUntil: "2026-12-06T12:00:00Z", renewalBlocked: true });
assert.match(blockedRenewal, /Следующее продление/);
assert.match(blockedRenewal, /Новая точка пока не оплачена/);
assert.doesNotMatch(blockedRenewal, /data-testid="biz-home-pay"/, "no mid-period full-price checkout when a venue is unpaid");

// Owner home -> settings must preserve the shell and the existing audio element.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const slots = read("src/components/business-app/BusinessPointSlots.tsx");
assert.doesNotMatch(slots, /location\.(?:assign|replace|reload)|location\.href/);
assert.match(slots, /href="\/profile#kontakty"/);
assert.match(slots, />Написать</);
assert.match(read("src/components/business-app/ProfileHelpContact.tsx"), /id="kontakty"/);
assert.match(slots, /import \{ useRouter \} from "next\/navigation"/);
assert.match(slots, /const router = useRouter\(\)/);
assert.match(slots, /slot\.location \? await selectBusinessPoint\(slot\.location\.id\) : await activateBusinessPoint\(slot\.number\)/);
assert.match(slots, /if \(!result\.ok\) \{[^}]*return; \}/, "failed selection must not navigate");
assert.equal((slots.match(/router\.push\("\/preferences"\)/g) ?? []).length, 1, "both successful actions share client navigation");
assert.doesNotMatch(slots, /router\.refresh/, "the server action already invalidates cached settings");
const actions = read("src/app/business-app/actions.ts");
const selectAction = actions.slice(actions.indexOf("export async function selectBusinessPoint"));
assert.match(selectAction, /cookies\(\)\)\.set\(BUSINESS_LOCATION_COOKIE, row\.id/);
assert.match(selectAction, /revalidatePath\(BUSINESS_SITE_PATH, "layout"\)/);
assert.match(selectAction, /return selectBusinessPoint\(data\.location_id\)/, "new hall also sets cookie and invalidates the router cache");
const settings = read("src/app/business-app/settings/page.tsx");
assert.match(settings, /<BusinessVenuePlaceForm\s+key=\{domain\.location\.id\}\s+locationId=\{domain\.location\.id\}/, "reset only the selected hall's local name/address state");
assert.match(settings, /<VenueControlPanel\s+key=\{locationId\}/);
const shell = read("src/components/business-app/BusinessAppShell.tsx");
assert.match(shell, /<BusinessCabinetPlayerProvider[^>]*>\s*<BusinessGuestPlaybackProvider[^>]*>[\s\S]*\{children\}[\s\S]*<BusinessBottomNav \/>\s*<\/BusinessGuestPlaybackProvider>\s*<\/BusinessCabinetPlayerProvider>/, "routed pages remain inside both persistent playback providers");
assert.doesNotMatch(shell, /<(?:BusinessCabinetPlayerProvider|BusinessGuestPlaybackProvider)[^>]*\bkey=/, "changing halls must not key/remount playback");
const workspace = read("src/components/business-app/workspace/BusinessWorkspace.tsx");
assert.match(workspace, /<Link[^>]*href="\/music">Перейти и повторить<\/Link>/);
assert.match(workspace, /<Link[^>]*href=\{model\.onboardingHref\}[^>]*data-testid="biz-workspace-connect-venue"/);
assert.match(read("src/components/business-app/venue-licence/VenueLicencePage.tsx"), /<Link href="\/documents\/b2b-terms">/);
console.log("business-pilot-ui-unit: client settings navigation, action cache invalidation, hall-local forms, persistent playback shell: PASS");
