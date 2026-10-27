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

import { BusinessChromeAccessProvider } from "../src/components/business-app/BusinessAccessLine";
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
import { BUSINESS_NO_ACCESS, effectiveChromeAccess, type BusinessChromeAccess } from "../src/lib/access-grants/access-line";
import { peekChromeAccessWith, type PeekReader } from "../src/lib/access-grants/peek-closure";
import type { GrantRow } from "../src/lib/access-grants/policy";
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
assert.deepEqual(lockedForGuest, ["documents", "profile", "settings"], "documents, settings and profile stay closed for a guest");
assert.ok(BUSINESS_MOBILE_NAV_ITEMS.length <= 5, "mobile bottom nav has at most five buttons");
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
  assert.equal((g.match(/data-locked="true"/g) ?? []).length, 6, "documents, settings and profile locked in the sidebar and the bottom nav");
  has(g, /доступно после подключения/);
  has(g, /aria-label="Документы – доступно после подключения"/);
  has(g, /data-testid="biz-guest-status"/, "guest status inside the shell");
  const bar = g.slice(g.indexOf('data-testid="biz-guest-status"'), g.indexOf("</section>", g.indexOf('data-testid="biz-guest-status"')));
  has(bar, /30 дней в подарок – полный доступ ко всем функциям, затем 799\u00a0₽ в месяц/);
  has(bar, /Получить 30 дней бесплатно/);
  hasNot(bar, /30 минут/, "the top banner does not mention the 30 minutes before they run out");
  hasNot(bar, /Гостевой режим/);
  const bottom = g.slice(g.indexOf('aria-label="Мобильная навигация"'), g.indexOf("</nav>", g.indexOf('aria-label="Мобильная навигация"')));
  has(bottom, /business-app-bottom-nav__lock/, "lock badge sits on the mobile icon");
  hasNot(bottom, /business-app-bottom-nav__label/, "mobile bar has no text labels");
  hasNot(bottom, />\s*(Главная|Музыка|Настройка|Документы|Профиль)\s*</, "mobile names are not visible text");
  for (const title of ["Главная", "Музыка"]) {
    has(bottom, new RegExp(`aria-label="${title}"`), `${title} keeps an accessible name`);
    has(bottom, new RegExp(`title="${title}"`), `${title} tooltip`);
  }
  for (const title of ["Настройка", "Документы", "Профиль"]) {
    has(bottom, new RegExp(`aria-label="${title} – доступно после подключения"`));
    has(bottom, new RegExp(`title="${title} – доступно после подключения"`));
  }
  has(bottom, /is-active/, "active tab is marked");
  has(bottom, /aria-current="page"/);
  hasNot(g, /M12 3\.5v2\.2/, "settings icon is no longer a sun");
  has(bottom, /M19\.4 15a1\.65/, "mobile Настройка is a gear");
  const aside = g.slice(g.indexOf("<aside"), g.indexOf("</aside>"));
  has(aside, /Настройка/, "desktop sidebar keeps the text label");
  has(aside, /M19\.4 15a1\.65/, "desktop sidebar uses the same gear");
  const navCss = read("src/components/business-app/business-app.css");
  assert.match(navCss, /\.business-app-bottom-nav__item \{[^}]*min-height:\s*48px/, "tap target is at least 44px");
  assert.match(navCss, /\.business-app-bottom-nav__item\.is-active \{[^}]*color:\s*var\(--biz-accent\)/);
  assert.match(navCss, /\.business-app-bottom-nav__icon > \.business-app-bottom-nav__lock \{[^}]*top:\s*-5px/, "lock is a corner badge, not a second full icon");
  assert.match(navCss, /\.business-app-bottom-nav__icon > svg:not\(\.business-app-bottom-nav__lock\)/, "the section icon keeps its own size");
  has(g, /data-testid="biz-trial-cta"/, "gift CTA is on the guest bar before the limit");
  assert.ok(anchors(g, "/onboarding?type=cafe").some((t) => t.includes('data-testid="biz-connect"')), "Подключить → real onboarding");
  hasCurrentLink(g, "/guest/coffee", "Music is the current section");
  hasNot(g, /href="\/(locations|stats|documents|team|preferences|player|announcements|profile)"/, "no link into protected sections");
  const m = shell(member, "/guest/coffee");
  assert.equal((m.match(/data-locked="true"/g) ?? []).length, 0);
  hasNot(m, /biz-guest-status|доступно после подключения/);
  hasCurrentLink(m, "/music", "member Music current");
  has(m, /href="\/documents"/);
  has(m, /href="\/preferences"/);
  has(m, /href="\/profile"/);
  hasNot(m, /href="\/help"/, "help stays off the cabinet nav");
  has(m, /Анна/);
}

// ---------------------------------------------------------------- server limit on every guest screen
{
  const at = (limit: "ok" | "near_end" | "exhausted" | "unavailable", path: string) =>
    wrap(anonymous, path, <BusinessAppShell initialGuestLimit={limit}><main>page</main></BusinessAppShell>);
  const exhaustedHome = at("exhausted", "/");
  has(exhaustedHome, /data-limit="exhausted"/, "exhausted shown on Home");
  has(exhaustedHome, /Гостевые 30 минут закончились\. Зарегистрируйтесь – и получите 30 дней в подарок с полным доступом/);
  has(exhaustedHome, /data-testid="biz-guest-register"[^>]*>Зарегистрироваться/);
  has(exhaustedHome, /href="https:\/\/audiolad\.ru\/auth\/sign-up\?next=/, "register is a direct link");
  hasNot(exhaustedHome, /30 минут прослушивания без регистрации/);
  has(at("exhausted", "/onboarding"), /data-limit="exhausted"/, "exhausted shown on onboarding");
  const near = at("near_end", "/");
  has(near, /полный доступ ко всем функциям/);
  hasNot(near, /30 минут/, "near the end the top banner still does not name the 30 minutes");
  has(at("unavailable", "/"), /data-limit="unavailable"/);
  hasNot(at("ok", "/"), /30 минут/);
  const layout = read("src/app/business-app/layout.tsx");
  has(layout, /resolveBusinessAccess\(domain\)\.level === "guest" && !hasLiveBusinessAccess\(customerAccess\)\s*\?\s*guestCoffeeLimitState\(await peekGuestCoffeeUsage\(\)\)\s*:\s*null/, "layout peeks the server meter for guests without a live gift only");
  has(layout, /const customerAccess = domain\.status === "authenticated" \? await peekBusinessChromeAccess\(\) : null;/, "layout reads the gift state (read-only) for signed-in visitors");
  has(layout, /<BusinessAppShell initialGuestLimit=\{initialGuestLimit\} customerAccess=\{customerAccess\}>/);
  const peek = read("src/lib/access-grants/peek.server.ts") + read("src/lib/access-grants/peek-closure.ts");
  hasNot(peek, /\.rpc\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|activateBusinessTrial\(|insertGrant\(/, "chrome access peek is read-only (no gift issue, no identity binding)");
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
  has(g, /Гостевые 30 минут закончились\. Зарегистрируйтесь – и получите 30 дней в подарок с полным доступом/);
  has(g, /data-testid="biz-guest-register"[^>]*>Зарегистрироваться/, "register button after the meter");
  has(g, /href="https:\/\/audiolad\.ru\/auth\/sign-up\?next=/, "register is a direct link");
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

// ---------------------------------------------------------------- live gift hides the guest strip (Sergey 23.10.2026)
{
  const trial: BusinessChromeAccess = { mode: "trial", endsAt: "2026-11-22T14:11:37.762Z" };
  const withAccess = (domain: BusinessOwnerHomeContext, pathname: string, customerAccess: BusinessChromeAccess | null) =>
    wrap(domain, pathname, <BusinessAppShell customerAccess={customerAccess}><main data-testid="page">page</main></BusinessAppShell>);
  for (const path of ["/", "/onboarding", "/settings"]) {
    const t = withAccess(signedInNoOrg, path, trial);
    hasNot(t, /biz-guest-status|Гостевой режим|Получить 30 дней бесплатно|799/, `${path}: no guest strip / gift offer / price once the gift is live`);
    has(t, /data-testid="biz-access-line"[^>]*>[\s\S]*Бесплатный доступ до 22 ноября 2026/, `${path}: calm access line with the Moscow end date`);
  }
  const paid = withAccess(signedInNoOrg, "/", { mode: "paid" as const, endsAt: "2026-12-31T10:00:00Z" });
  hasNot(paid, /biz-guest-status/, "paid: no guest strip");
  has(paid, /Подписка действует до 31 декабря 2026/, "paid: quiet paid line");
  const expired = withAccess(signedInNoOrg, "/", { mode: "offer" as never, endsAt: null } as never);
  has(expired, /data-testid="biz-guest-status"/, "expired / no gift: guest strip and offer stay");
  has(withAccess(anonymous, "/", null), /data-testid="biz-guest-status"/, "anonymous guest still sees the strip");
  hasNot(withAccess(signedInNoOrg, "/workspace", trial), /biz-access-line|biz-guest-status/, "workspace shows its own period block");
  hasNot(withAccess(signedInNoOrg, "/music", trial), /biz-access-line|biz-guest-status/, "music shows its own period block");
  hasNot(withAccess(member, "/", null), /biz-guest-status/, "member never sees the guest strip");

  // Onboarding and the listening limit must not re-offer the gift or show its price either.
  const inTrial = (domain: BusinessOwnerHomeContext, pathname: string, node: React.ReactNode) =>
    wrap(domain, pathname, <BusinessChromeAccessProvider value={trial}>{node}</BusinessChromeAccessProvider>);
  const onb = inTrial(signedInNoOrg, "/onboarding", <BusinessOnboardingWizardPage initialTypeId="cafe" />);
  hasNot(onb, /onboarding-terms-note|30 дней в подарок|799/, "onboarding in trial: no gift terms / price");
  has(onb, /data-testid="onboarding-access-line"[^>]*>Бесплатный доступ до 22 ноября 2026/, "onboarding in trial: end date line");
  has(wrap(signedInNoOrg, "/onboarding", <BusinessOnboardingWizardPage initialTypeId="cafe" />), /onboarding-terms-note/, "onboarding without gift keeps the terms");
  const studio = inTrial(signedInNoOrg, "/music", <BusinessSoundStudio playlists={playlists} initialLimit="exhausted" />);
  hasNot(studio, /biz-trial-cta|Получить 30 дней бесплатно|799/, "sound limit in trial: no gift CTA");
  has(studio, /data-testid="biz-connect-cta"/, "sound limit in trial: connect the venue instead");

  // First visit: /workspace issues the gift while the (persisting) layout peek may already have
  // answered "no access" – the workspace reports its live period so the strip does not return.
  const none = BUSINESS_NO_ACCESS;
  assert.deepEqual(effectiveChromeAccess(none, trial), trial, "stale guest peek + live workspace report → live");
  assert.deepEqual(effectiveChromeAccess(null, trial), BUSINESS_NO_ACCESS, "anonymous (no peek): a report is never applied");
  assert.deepEqual(effectiveChromeAccess(trial, null), trial, "live peek stays live");
  assert.deepEqual(effectiveChromeAccess(paid0(), trial), paid0(), "a report never overrides a live server value");
  assert.deepEqual(effectiveChromeAccess(none, { mode: "trial", endsAt: null }), none, "a report without an end date is ignored");
  assert.deepEqual(effectiveChromeAccess(none, { mode: "offer" as never, endsAt: "2026-11-22T14:11:37Z" }), none, "a non-live report is ignored");
  assert.deepEqual(effectiveChromeAccess(null, null), BUSINESS_NO_ACCESS);
  const workspaceSource = readFileSync("src/components/business-app/workspace/BusinessWorkspace.tsx", "utf8");
  assert.match(workspaceSource, /useReportBusinessChromeAccess\(\)/, "workspace reports its live period to the shell");
  assert.match(workspaceSource, /reportChromeAccess\(\{ mode: reportedStatus, endsAt: reportedEndsAt \}\)/);
  const shellSource = readFileSync("src/components/business-app/BusinessAppShell.tsx", "utf8");
  assert.match(shellSource, /const chromeAccess = useBusinessChromeAccess\(\);/, "shell strip decision reads the (reportable) context");
}

function paid0(): BusinessChromeAccess {
  return { mode: "paid", endsAt: "2026-12-31T10:00:00Z" };
}

// ---------------------------------------------------------------- permanent atlas URL
assert.equal(BUSINESS_GUEST_COFFEE_URL, "https://business.audiolad.ru/guest/coffee");
assert.equal(COFFEE_ATLAS_CTA_HREF, "https://business.audiolad.ru/guest/coffee", "atlas CTA unchanged");
assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", "/guest/coffee"), { action: "rewrite_business_app", pathname: "/business-app/guest/coffee" });

closedApis().then(
  () => console.log("business-guest-shell-unit: OK"),
  (e) => { console.error(e); process.exit(1); },
);

// ---------------------------------------------------------------- peek walks the identity graph like resolve_access_grant
void (async () => {
  // Gift issued to account A on address X; account B is bound to X and Y; account C signs in with Y.
  const grants: GrantRow[] = [{ emailHash: "X", userId: "A", kind: "business_new_client", startsAt: "2026-10-23T14:11:37Z", endsAt: "2026-11-22T14:11:37Z" }];
  const bindings = [{ emailHash: "X", userId: "A" }, { emailHash: "X", userId: "B" }, { emailHash: "Y", userId: "B" }, { emailHash: "Y", userId: "C" }];
  const reads: string[] = [];
  const reader = (paid: string[] = []): PeekReader => ({
    async edges(users, hashes) {
      reads.push("edges");
      return [...bindings, ...grants].filter((e) => users.includes(e.userId) || hashes.includes(e.emailHash)).map(({ emailHash, userId }) => ({ emailHash, userId }));
    },
    async grants(users, hashes) { return grants.filter((g) => users.includes(g.userId) || hashes.includes(g.emailHash)); },
    async paidStamps() { return paid; },
  });
  const now = new Date("2026-10-23T15:00:00Z");
  const c = await peekChromeAccessWith(reader(), { userId: "C", emailHash: "Y" }, now);
  assert.deepEqual(c, { mode: "trial", endsAt: "2026-11-22T14:11:37Z" }, "chain A–X–B–Y–C: C sees the live gift");
  const stranger = await peekChromeAccessWith(reader(), { userId: "D", emailHash: "Z" }, now);
  assert.notEqual(stranger.mode, "trial", "unrelated account: no gift");
  assert.equal(stranger.endsAt, null);
  const over = await peekChromeAccessWith(reader(), { userId: "C", emailHash: "Y" }, new Date("2026-11-22T14:11:37Z"));
  assert.ok(over.mode !== "trial" && over.endsAt === null, "gift over at its exact end instant");
  const paid = await peekChromeAccessWith(reader(["2026-12-31T10:00:00Z"]), { userId: "C", emailHash: "Y" }, new Date("2026-12-01T00:00:00Z"));
  assert.deepEqual(paid, { mode: "paid", endsAt: "2026-12-31T10:00:00Z" }, "paid period after the gift");
  assert.ok(reads.length > 0);
  console.log("business-guest-shell-unit: peek closure OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
