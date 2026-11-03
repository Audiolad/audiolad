/**
 * 253821e0: the mobile bottom bar (and the desktop sidebar) highlights exactly the open
 * section on business.audiolad.ru and coffee.audiolad.ru, for a guest and a member.
 *
 * Bug: on the coffee host `/` is the guest player. The server render saw the rewritten
 * `/business-app/guest/coffee` (Music), the browser saw `/` (normalized to Home). React keeps
 * server attributes on a hydration mismatch, so «Музыка» stayed `is-active` on every page
 * until it was opened once. Each case below is checked with the server (internal) path and
 * the browser (public) path – both must give the same single tab.
 */
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import BusinessBottomNav from "../src/components/business-app/BusinessBottomNav";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import type { BusinessOwnerHomeContext as Domain } from "../src/lib/business-app/domain";
import { BUSINESS_HOSTNAME, COFFEE_HOSTNAME, businessNavPathname } from "../src/lib/business-app/host";
import { BUSINESS_MOBILE_NAV_ITEMS, businessActiveNavItemId } from "../src/lib/business-app/nav";

// The coffee host is a build flag read at call time; production has it on.
process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";

type TabId = "home" | "music" | "settings" | "documents" | "profile";
type Case = { tab: TabId; browser: string[]; server: string[] };

const shared: Case[] = [
  {
    tab: "music",
    browser: ["/guest/coffee", "/music", "/workspace", "/workspace/cafe", "/player"],
    server: ["/business-app/guest/coffee", "/business-app/music", "/business-app/workspace", "/business-app/player"],
  },
  { tab: "settings", browser: ["/preferences"], server: ["/business-app/settings"] },
  {
    tab: "documents",
    browser: ["/documents", "/documents/b2b-terms", "/documents/venue-license"],
    server: ["/business-app/documents", "/business-app/documents/b2b-terms"],
  },
  { tab: "profile", browser: ["/profile"], server: ["/business-app/profile"] },
];

const HOSTS: Record<string, Case[]> = {
  [COFFEE_HOSTNAME]: [
    { tab: "home", browser: ["/cabinet"], server: ["/business-app"] },
    // Coffee root is the guest player: Music, not Home.
    { tab: "music", browser: ["/"], server: ["/business-app/guest/coffee"] },
    ...shared,
  ],
  [BUSINESS_HOSTNAME]: [
    { tab: "home", browser: ["/", "/cabinet"], server: ["/business-app"] },
    ...shared,
  ],
};

// ---------------------------------------------------------------- pure logic: one tab per path
for (const [host, cases] of Object.entries(HOSTS)) {
  const covered = new Set(cases.map((c) => c.tab));
  assert.deepEqual([...covered].sort(), BUSINESS_MOBILE_NAV_ITEMS.map((i) => i.id).sort(), `${host}: every tab covered`);
  for (const { tab, browser, server } of cases) {
    for (const raw of [...browser, ...server]) {
      const pathname = businessNavPathname(raw, host);
      const matches = BUSINESS_MOBILE_NAV_ITEMS.filter((i) => businessActiveNavItemId(pathname, [i]) !== null).map((i) => i.id);
      assert.deepEqual(matches, [tab], `${host} ${raw}: only «${tab}» matches (got ${matches.join(",")})`);
      assert.equal(businessActiveNavItemId(pathname, BUSINESS_MOBILE_NAV_ITEMS), tab, `${host} ${raw}`);
    }
  }
}
// Server and browser views of the coffee root agree (the hydration bug).
assert.equal(
  businessNavPathname("/", COFFEE_HOSTNAME),
  businessNavPathname("/business-app/guest/coffee", COFFEE_HOSTNAME),
  "coffee /: server and browser resolve to the same section",
);
assert.equal(businessNavPathname("/", BUSINESS_HOSTNAME), "/", "business /: cabinet home");
assert.equal(businessActiveNavItemId("/unknown", BUSINESS_MOBILE_NAV_ITEMS), null, "unknown path: nothing highlighted");

// ---------------------------------------------------------------- rendered bar: guest and member
const fakeRouter = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} } as never;
const anonymous: Domain = { status: "anonymous" };
const member: Domain = {
  status: "authenticated",
  owner: { userId: "u1", firstName: "Анна" },
  organizationId: "org",
  organizationName: "Кофейня",
  location: { id: "loc", organizationId: "org", name: "Зал", businessCategory: "Кафе", countryCode: "RU", timezone: "Europe/Moscow", status: "active", defaultZoneId: null },
  canPay: true,
  offerAccepted: true,
  signals: null,
};

function activeTabs(domain: Domain, host: string, raw: string): string[] {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={fakeRouter}>
      <PathnameContext.Provider value={raw}>
        <BusinessDomainProvider value={domain} hostname={host}>
          <BusinessBottomNav />
        </BusinessDomainProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
  const tags = [...html.matchAll(/<(?:a|button)\b[^>]*data-nav-id="[a-z]+"[^>]*>/g)].map((m) => m[0]);
  assert.equal(tags.length, 5, `${host} ${raw}: five buttons`);
  return tags.filter((t) => /class="[^"]*\bis-active\b/.test(t)).map((t) => /data-nav-id="([a-z]+)"/.exec(t)![1]);
}

for (const [host, cases] of Object.entries(HOSTS)) {
  for (const { tab, browser, server } of cases) {
    for (const raw of [...browser, ...server]) {
      assert.deepEqual(activeTabs(member, host, raw), [tab], `member ${host} ${raw}: only «${tab}» highlighted`);
      // A guest sees settings, documents and profile as locked buttons; the open one is still marked.
      assert.deepEqual(activeTabs(anonymous, host, raw), [tab], `guest ${host} ${raw}: only «${tab}» highlighted`);
    }
  }
}

console.log("business-nav-active-unit: ok");
