/**
 * a8240527 rework (Sergey 17.10.2026): ONE AudioLad Business cabinet for the guest and the
 * venue owner. Renders the real BusinessAppShell / Music section / onboarding for both access
 * levels and checks: same shell (sidebar + bottom nav), locked protected sections for the
 * guest, guest status inside the shell, shared player + settings, the conversion path staying
 * in the same cabinet, closed APIs for a guest, and the permanent atlas URL.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import BusinessAppShell from "../src/components/business-app/BusinessAppShell";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import BusinessOnboardingWizardPage from "../src/components/business-app/BusinessOnboardingWizardPage";
import BusinessMemberOnly from "../src/components/business-app/BusinessMemberOnly";
import BusinessSoundStudio from "../src/components/business-app/sound/BusinessSoundStudio";
import {
  BUSINESS_CONNECT_HREF,
  businessNavHref,
  isBusinessNavItemLocked,
  resolveBusinessAccess,
} from "../src/lib/business-app/access";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import type { GuestCoffeePlaylist } from "../src/lib/business-app/guest-coffee/catalog";
import { BUSINESS_GUEST_COFFEE_URL } from "../src/lib/business-app/host";
import {
  BUSINESS_MOBILE_NAV_ITEMS,
  BUSINESS_PRIMARY_NAV_ITEMS,
  BUSINESS_SECONDARY_NAV_ITEMS,
  isBusinessNavItemCurrent,
} from "../src/lib/business-app/nav";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { BUSINESS_SOUND_PROFILE_STORAGE_KEY, parseBusinessSoundProfile, serializeBusinessSoundProfile } from "../src/lib/business-app/sound-profile";
import { handleSpaTrackUrl } from "../src/lib/business-app/spa-player-report";
import { COFFEE_ATLAS_CTA_HREF } from "../src/lib/business/coffee-atlas/constants";

const read = (p: string) => readFileSync(p, "utf8");
// Short failure messages (rendered markup is large).
function has(html: string, re: RegExp, msg = String(re)) { assert.ok(re.test(html), `expected ${re} – ${msg}`); }
function anchors(html: string, href: string) { return [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(`href="${href}"`)); }
function hasCurrentLink(html: string, href: string, msg: string) { assert.ok(anchors(html, href).some((t) => t.includes('aria-current="page"')), msg); }
function hasNot(html: string, re: RegExp, msg = String(re)) { assert.ok(!re.test(html), `unexpected ${re} – ${msg}`); }
const fakeRouter = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} } as never;

const anonymous: BusinessOwnerHomeContext = { status: "anonymous" };
const signedInNoOrg: BusinessOwnerHomeContext = {
  status: "authenticated", owner: { userId: "u0", firstName: "Ира" }, location: null, organizationName: null, organizationId: null, signals: null,
};
const member: BusinessOwnerHomeContext = {
  status: "authenticated",
  owner: { userId: "u1", firstName: "Анна" },
  organizationId: "org", organizationName: "Кофейня",
  location: { id: "loc", organizationId: "org", name: "Зал", businessCategory: "Кафе", countryCode: "RU", timezone: "Europe/Moscow", status: "active", defaultZoneId: null },
  signals: null,
};

function wrap(domain: BusinessOwnerHomeContext, pathname: string, node: React.ReactNode) {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={fakeRouter}>
      <PathnameContext.Provider value={pathname}>
        <BusinessDomainProvider value={domain}>{node}</BusinessDomainProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}
const shell = (domain: BusinessOwnerHomeContext, pathname: string) => wrap(domain, pathname, <BusinessAppShell><main data-testid="page">page</main></BusinessAppShell>);

// ---------------------------------------------------------------- access model
assert.deepEqual(resolveBusinessAccess(anonymous), { level: "guest", signedIn: false, hasPoint: false });
assert.deepEqual(resolveBusinessAccess(signedInNoOrg), { level: "guest", signedIn: true, hasPoint: false });
assert.deepEqual(resolveBusinessAccess(member), { level: "member", signedIn: true, hasPoint: true });
const all = [...BUSINESS_PRIMARY_NAV_ITEMS, ...BUSINESS_SECONDARY_NAV_ITEMS, ...BUSINESS_MOBILE_NAV_ITEMS];
const guestAccess = resolveBusinessAccess(anonymous);
const memberAccess = resolveBusinessAccess(member);
for (const item of all) assert.equal(isBusinessNavItemLocked(item, memberAccess), false, `${item.id}: member sees everything`);
const lockedForGuest = [...new Set(all.filter((i) => isBusinessNavItemLocked(i, guestAccess)).map((i) => i.id))].sort();
assert.deepEqual(lockedForGuest, ["announcements", "documents", "locations", "player", "settings", "stats", "team"], "venues / payments / documents / stats / team stay closed for a guest");
const music = BUSINESS_PRIMARY_NAV_ITEMS.find((i) => i.id === "music")!;
assert.equal(businessNavHref(music, guestAccess), "/guest/coffee", "guest enters Music through the permanent atlas URL");
assert.equal(businessNavHref(music, memberAccess), "/music");
assert.ok(isBusinessNavItemCurrent("/guest/coffee", music) && isBusinessNavItemCurrent("/music", music));
assert.equal(BUSINESS_CONNECT_HREF.startsWith("/onboarding"), true, "Подключить stays in this cabinet");

// ---------------------------------------------------------------- same shell for guest and subscriber
const domains: ReadonlyArray<readonly [string, BusinessOwnerHomeContext]> = [["guest", anonymous], ["signed-in", signedInNoOrg], ["member", member]];
for (const path of ["/guest/coffee", "/music", "/"]) {
  for (const [name, domain] of domains) {
    const html: string = shell(domain, path);
    has(html, /class="business-app-shell"/, `${name} ${path}: shared shell`);
    has(html, /<aside class="business-app-sidebar[^"]*"[^>]*aria-label="Навигация кабинета"/, `${name} ${path}: desktop sidebar`);
    has(html, /<nav class="business-app-bottom-nav" aria-label="Мобильная навигация"/, `${name} ${path}: mobile bottom nav`);
    hasNot(html, /business-app-guest"/, "no separate guest chrome");
    has(html, /data-testid="page"/);
    // Same navigation items in the same order for everyone.
    const ids = [...html.matchAll(/data-nav-id="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids, [...BUSINESS_PRIMARY_NAV_ITEMS, ...BUSINESS_SECONDARY_NAV_ITEMS, ...BUSINESS_MOBILE_NAV_ITEMS].map((i) => i.id), `${name} ${path}: same nav`);
  }
}
{
  const g = shell(anonymous, "/guest/coffee");
  assert.equal((g.match(/data-locked="true"/g) ?? []).length, 10, "7 locked in the sidebar + 3 in the bottom nav");
  has(g, /доступно после подключения/);
  has(g, /aria-label="Точки – доступно после подключения"/);
  has(g, /data-biz-chrome="guest-player"/, "guest coffee stays off the cabinet chrome");
  hasNot(g, /business-app-brand-mark/, "guest coffee keeps the wordmark, not the leather crop");
  has(shell(anonymous, "/"), /data-biz-chrome="cabinet"/, "cabinet home");
  has(shell(anonymous, "/"), /business-app-brand-mark/, "cabinet home shows the leather crop");
  has(g, /data-testid="biz-guest-status"/, "guest status inside the shell");
  has(g, /В гостевом режиме доступно 30 минут прослушивания/);
  has(g, /Первые 7 дней – в подарок, затем 799\u00a0₽ в месяц/);
  assert.ok(anchors(g, "/onboarding?type=cafe").some((t) => t.includes('data-testid="biz-connect"')), "Подключить → real onboarding");
  hasCurrentLink(g, "/guest/coffee", "Music is the current section");
  hasNot(g, /href="\/(locations|stats|documents|team|preferences|player|announcements)"/, "no link into protected sections");
  const m = shell(member, "/guest/coffee");
  assert.equal((m.match(/data-locked="true"/g) ?? []).length, 0);
  hasNot(m, /biz-guest-status|доступно после подключения/);
  hasCurrentLink(m, "/music", "member Music current");
  has(m, /href="\/documents"/);
  has(m, /Анна/);
}

// ---------------------------------------------------------------- server limit on every guest screen
{
  const at = (limit: "ok" | "near_end" | "exhausted" | "unavailable", path: string) =>
    wrap(anonymous, path, <BusinessAppShell initialGuestLimit={limit}><main>page</main></BusinessAppShell>);
  has(at("exhausted", "/"), /data-limit="exhausted"[\s\S]*Гостевое прослушивание завершено/, "exhausted shown on Home");
  has(at("exhausted", "/onboarding"), /data-limit="exhausted"/, "exhausted shown on onboarding");
  has(at("near_end", "/"), /скоро подойдёт к концу/);
  has(at("unavailable", "/"), /data-limit="unavailable"/);
  const layout = read("src/app/business-app/layout.tsx");
  has(layout, /resolveBusinessAccess\(domain\)\.level === "guest"\s*\?\s*guestCoffeeLimitState\(await peekGuestCoffeeUsage\(\)\)\s*:\s*null/, "layout peeks the server meter for guests only");
  has(layout, /<BusinessAppShell initialGuestLimit=\{initialGuestLimit\}>/);
}

// ---------------------------------------------------------------- real player + settings (Music section)
const playlists: GuestCoffeePlaylist[] = [{
  id: "p1", authorSlug: "a", productSlug: "jazz", title: "Джаз для кофеен", authorName: "Тёплый такт", href: "https://audiolad.ru/practice/a/jazz",
  coverUrl: null, coverImage: null, updatedAt: null, format: null, direction: "jazz", dayparts: "allday", characters: ["cozy"],
  tracks: [{ audioItemId: "t1", title: "Трек", durationSeconds: 180 }],
}];
for (const [name, domain] of [["guest", anonymous], ["member", member]] as const) {
  const html = wrap(domain, "/guest/coffee", <BusinessSoundStudio playlists={playlists} initialLimit="ok" />);
  has(html, /data-testid="biz-sound-settings"/, `${name}: settings`);
  for (const legend of ["Характер заведения", "Тип звучания", "Время суток"]) has(html, new RegExp(legend));
  has(html, /data-testid="biz-player"/, `${name}: Business player`);
  // Sergey 17.10 23:21: nothing plays or changes before the explicit «Собрать атмосферу» step.
  has(html, /data-testid="biz-atmosphere-assemble"[^>]*>Собрать атмосферу</, `${name}: explicit assemble button`);
  has(html, /data-testid="biz-atmosphere-empty"/, `${name}: placeholder before assembling`);
  has(html, /Здесь появится ваша атмосфера/);
  hasNot(html, /data-testid="biz-atmosphere"[ >]/, "no playlist before the button is pressed");
  hasNot(html, /data-testid="biz-sound-listen"/, "no per-album live list any more");
  has(html, /Это не каталог эфира/, "free albums are not presented as the B2B catalogue");
  hasNot(html, /<dialog/);
  has(html, new RegExp(`data-access="${name === "guest" ? "guest" : "member"}"`));
}
{
  const g = wrap(anonymous, "/guest/coffee", <BusinessSoundStudio playlists={playlists} initialLimit="exhausted" />);
  has(g, /data-testid="biz-sound-exhausted"/);
  has(g, /Гостевое прослушивание завершено/);
  has(g, /href="\/onboarding\?type=cafe"/, "exhausted → real connect path");
  const m = wrap(member, "/music", <BusinessSoundStudio playlists={playlists} initialLimit="exhausted" />);
  hasNot(m, /href="\/onboarding/);
  has(m, /плеер программы/);
  assert.equal(wrap(anonymous, "/music", <BusinessMemberOnly><p>probe</p></BusinessMemberOnly>), "", "member tools hidden for a guest");
  has(wrap(member, "/music", <BusinessMemberOnly><p>probe</p></BusinessMemberOnly>), /probe/);
  assert.equal(wrap(anonymous, "/music", <BusinessMemberOnly guest="Без регистрации." />), "Без регистрации.", "guest-only lead");
  assert.equal(wrap(member, "/music", <BusinessMemberOnly guest="Без регистрации." />), "", "no «без регистрации» for a member");
}
assert.deepEqual(parseBusinessSoundProfile(serializeBusinessSoundProfile({ character: "evening", direction: "melodic", daypart: "evening" })), { character: "evening", direction: "melodic", daypart: "evening" });
// Settings saved before the passport stage (old genre directions) keep working.
assert.deepEqual(parseBusinessSoundProfile('{"character":"x","direction":"bossa"}'), { character: "cozy", direction: "rhythm", daypart: "allday" });
assert.deepEqual(parseBusinessSoundProfile('{"character":"city","direction":"sax","daypart":"day"}'), { character: "city", direction: "jazz", daypart: "day" });
assert.deepEqual(parseBusinessSoundProfile('{"direction":"nope"}'), { character: "cozy", direction: "jazz", daypart: "allday" });
assert.deepEqual(parseBusinessSoundProfile("not json"), { character: "cozy", direction: "jazz", daypart: "allday" });
assert.equal(BUSINESS_SOUND_PROFILE_STORAGE_KEY, "audiolad-business-sound-profile");

// ---------------------------------------------------------------- conversion stays in the same cabinet
{
  const anon = wrap(anonymous, "/onboarding", <BusinessOnboardingWizardPage initialTypeId="cafe" />);
  has(anon, /data-testid="onboarding-sign-in"/);
  has(anon, /href="https:\/\/audiolad\.ru\/auth\/sign-in"/);
  has(anon, /href="https:\/\/audiolad\.ru\/auth\/sign-up"/);
  has(anon, /пока не подключены – ничего не списывается/, "honest: no trial activation / payment yet");
  const noOrg = wrap(signedInNoOrg, "/onboarding", <BusinessOnboardingWizardPage initialTypeId="cafe" />);
  has(noOrg, /aria-selected="true"[^>]*>[\s\S]{0,400}Кафе \/ кофейня/, "coffee type preselected");
  has(noOrg, /data-testid="onboarding-terms-note"[\s\S]{0,600}пока не подключены – ничего не списывается/, "signed-in wizard also discloses: no trial activation / payment yet");
  has(noOrg, /data-testid="onboarding-terms-note"[^>]*>[^<]*799[\s\S]{0,300}пока не подключены – ничего не списывается/, "signed-in path also says: no trial activation / payment yet");
  const bogus = wrap(signedInNoOrg, "/onboarding", <BusinessOnboardingWizardPage initialTypeId="<script>" />);
  hasNot(bogus, /aria-selected="true"/, "unknown type ignored");
  has(read("src/app/business-app/onboarding/page.tsx"), /initialTypeId=/);
}

// ---------------------------------------------------------------- guest cannot use closed APIs
async function closedApis() {
  const id = "157f8644-4ad1-4bea-9de0-d44f911ae009";
  let signed = 0;
  const r = await handleSpaTrackUrl({ audioItemId: id }, { loadContext: async () => null, sign: async () => { signed++; return { url: "x" }; } });
  assert.deepEqual(r, { ok: false, reason: "no_access" }, "program (airplay) stream URL refused without pilot context");
  assert.equal(signed, 0);
  has(read("src/app/api/business/player/manifest/route.ts"), /if \(!ctx\) return NextResponse\.json\(\{ ok: false, reason: "no_access" \}/);
  for (const api of ["/api/payments", "/api/checkout/studio-music", "/api/catalog/play", "/api/admin/users"]) {
    assert.equal(resolveBusinessProxyAction("business.audiolad.ru", api).action, "not_found", `${api} not exposed on the business host`);
  }
  for (const path of ["/locations", "/stats", "/documents", "/team", "/preferences"]) {
    assert.equal(resolveBusinessProxyAction("business.audiolad.ru", path).action, "rewrite_business_app", `${path} is still a real cabinet route`);
  }
}

// ---------------------------------------------------------------- permanent atlas URL
assert.equal(BUSINESS_GUEST_COFFEE_URL, "https://business.audiolad.ru/guest/coffee");
assert.equal(COFFEE_ATLAS_CTA_HREF, "https://business.audiolad.ru/guest/coffee", "atlas CTA unchanged");
assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", "/guest/coffee"), { action: "rewrite_business_app", pathname: "/business-app/guest/coffee" });

closedApis().then(
  () => console.log("business-guest-shell-unit: OK"),
  (e) => { console.error(e); process.exit(1); },
);
