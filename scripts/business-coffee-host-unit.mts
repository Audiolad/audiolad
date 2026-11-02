import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_PUBLIC_PATH_REWRITES, BUSINESS_SITE_PATH, COFFEE_HOSTNAME, COFFEE_ORIGIN, BUSINESS_ORIGIN, businessCabinetHomePath, coffeeStorefrontUrl, isBusinessHostname } from "../src/lib/business-app/host";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { buildBusinessAppMetadata, buildBusinessAppPageMetadata, buildBusinessAppRobotsRoute, buildCoffeePublicPageMetadata, buildCoffeeRobotsRoute, buildCoffeeSitemap } from "../src/lib/business-app/seo";
import { businessAuthHref, businessReturnPath, businessReturnTarget, isBusinessTrialNext, isBusinessCabinetReturnNext, BUSINESS_TRIAL_SIGN_UP_HREF } from "../src/lib/access-grants/paths";
import { buildBusinessSubscriptionPaidHref, buildBusinessSubscriptionSignInHref } from "../src/lib/payments/checkout-result-cta";
import { getSafeNextPath } from "../src/lib/auth/routes";
import { readFileSync } from "node:fs";
import { getHostBrandMetadata } from "../src/lib/business-app/brand-icons";
import { migrateCoffeeGuestCookie } from "../src/lib/business-app/coffee-host-proxy";
import { COFFEE_HANDOFF_COOKIE, SHARED_GUEST_COFFEE_COOKIE, coffeeReturnPath, selectGuestToken, sharedGuestOptions } from "../src/lib/business-app/guest-coffee/shared-identity";
import { coffeeStorage, migrateCoffeeSettings, normalizeSharedCoffeeValue, sharedCoffeeStorageKey } from "../src/lib/business-app/shared-coffee-storage";
import { hashGuestCoffeeToken } from "../src/lib/business-app/guest-coffee/identity";
import { serializeBusinessSoundProfile, parseBusinessSoundProfile } from "../src/lib/business-app/sound-profile";
import { SUPABASE_COOKIE_SCOPE_MARKER, SUPABASE_COOKIE_SCOPE_MARKER_VALUE, allSupabaseAuthCookieNames } from "../src/lib/supabase/cookie-domain";
import { getSupabaseAuthStorageKey } from "../src/lib/supabase/auth-cookie";

const SUPABASE_URL = "https://abcdefghijklmnop.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test";
const AUTH_KEY = allSupabaseAuthCookieNames(getSupabaseAuthStorageKey(SUPABASE_URL))[0]!;
const { proxy, config, PROXY_STATIC_FILE_PATTERN } = await import("../src/proxy");
const cookieLines = (res: Response) => res.headers.getSetCookie();
const cookieValue = (res: Response, name: string) =>
  cookieLines(res).find((l) => l.startsWith(`${name}=`))?.split(";")[0]!.slice(name.length + 1);

const flag = process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
const req = (host: string, path = "/", cookie = "") => new NextRequest(`https://${host}${path}`, { headers: { host, cookie } });
const oldToken = "a".repeat(43), liveToken = "b".repeat(43);
try {
  delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  const businessBefore = Object.keys(BUSINESS_PUBLIC_PATH_REWRITES).map((path) => resolveBusinessProxyAction("business.audiolad.ru", path));
  assert.equal(coffeeStorefrontUrl(), "https://business.audiolad.ru/guest/coffee");
  assert.equal(isBusinessHostname(COFFEE_HOSTNAME), false);
  assert.deepEqual(resolveBusinessProxyAction(COFFEE_HOSTNAME, "/"), { action: "not_found" });
  for (const path of ["/", "/cabinet", "/help", "/documents", "/sitemap.xml", "/guest/coffee"]) {
    assert.equal(resolveBusinessProxyAction(COFFEE_HOSTNAME, path).action, "not_found");
  }
  assert.equal(businessReturnPath("/auth/business-return", "coffee"), "/auth/business-return");
  assert.equal(buildBusinessSubscriptionPaidHref(), `${BUSINESS_ORIGIN}/#dostup`);
  assert.equal(buildBusinessSubscriptionSignInHref(), "/auth/sign-in?next=%2Fauth%2Fbusiness-cabinet");
  assert.deepEqual(buildCoffeePublicPageMetadata(COFFEE_HOSTNAME, "/", "Заголовок", "Описание"), {});
  assert.equal(businessAuthHref(COFFEE_HOSTNAME, "sign-in"), "https://audiolad.ru/auth/sign-in");
  assert.equal(businessAuthHref(COFFEE_HOSTNAME, "sign-up", true), BUSINESS_TRIAL_SIGN_UP_HREF);
  assert.equal(businessCabinetHomePath(COFFEE_HOSTNAME), "/");
  assert.equal(businessReturnTarget({ site: "coffee", cabinet: true }), `${BUSINESS_ORIGIN}/#dostup`);
  assert.equal(sharedGuestOptions("business.audiolad.ru"), undefined);
  assert.equal(migrateCoffeeGuestCookie(req("business.audiolad.ru", "/", `al_biz_guest=${oldToken}`), NextResponse.next()).headers.get("set-cookie"), null);
  process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";
  assert.equal(coffeeStorefrontUrl(), "https://coffee.audiolad.ru/");
  assert.equal(businessCabinetHomePath(COFFEE_HOSTNAME), "/cabinet");
  assert.equal(businessCabinetHomePath("business.audiolad.ru"), "/");
  assert.equal(businessAuthHref("business.audiolad.ru", "sign-in"), "https://audiolad.ru/auth/sign-in");
  assert.equal(businessAuthHref("business.audiolad.ru", "sign-up", true), BUSINESS_TRIAL_SIGN_UP_HREF);
  for (const route of ["sign-in", "sign-up"] as const) {
    const gift = new URL(businessAuthHref(COFFEE_HOSTNAME, route, true));
    assert.equal(gift.origin, "https://audiolad.ru");
    assert.equal(gift.searchParams.get("next"), "/auth/business-return?site=coffee");
  }
  assert.equal(new URL(businessAuthHref(COFFEE_HOSTNAME, "sign-in")).searchParams.get("next"), "/auth/business-cabinet?site=coffee");
  assert.equal(isBusinessTrialNext("/auth/business-return?site=coffee"), true);
  assert.equal(isBusinessCabinetReturnNext("/auth/business-cabinet?site=coffee"), true);
  assert.equal(getSafeNextPath("/auth/business-return?site=coffee"), "/auth/business-return?site=coffee");
  assert.equal(getSafeNextPath("/auth/business-cabinet?site=coffee"), "/auth/business-cabinet?site=coffee");
  assert.equal(businessReturnPath("/auth/business-return", "coffee"), "/auth/business-return?site=coffee");
  assert.equal(businessReturnTarget({ site: "coffee" }), `${COFFEE_ORIGIN}/workspace?space=cafe`);
  assert.equal(businessReturnTarget({ site: "coffee", needsVenue: true }), `${COFFEE_ORIGIN}/onboarding?type=cafe&next=%2Fworkspace%3Fspace%3Dcafe`);
  assert.equal(businessReturnTarget({ site: "coffee", cabinet: true }), `${COFFEE_ORIGIN}/cabinet#dostup`);
  for (const site of [undefined, "Coffee", "https://evil.test", "coffee.audiolad.ru"]) {
    assert.equal(businessReturnTarget({ site }), `${BUSINESS_ORIGIN}/workspace?space=cafe`);
    assert.equal(businessReturnTarget({ site, cabinet: true }), `${BUSINESS_ORIGIN}/#dostup`);
  }
  // Payment return is unchanged (business /#dostup); returning to coffee after Tochka is a separate Human Gate.
  assert.equal(buildBusinessSubscriptionPaidHref(), `${BUSINESS_ORIGIN}/#dostup`);
  assert.equal(buildBusinessSubscriptionSignInHref(), "/auth/sign-in?next=%2Fauth%2Fbusiness-cabinet");
  assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", "/coffee-handoff"), { action: "rewrite_business_app", pathname: "/business-app/coffee-handoff" });
  assert.equal(resolveBusinessProxyAction("business.audiolad.ru", "/sitemap.xml").action, "not_found");
  const publicPaths = ["/", "/help", "/documents", "/documents/venue-license", "/documents/b2b-terms", "/documents/claims-procedure", "/documents/claim-reply-kit"];
  assert.deepEqual(buildCoffeeSitemap().map((entry) => entry.url), publicPaths.map((path) => COFFEE_ORIGIN + path));
  assert.equal(buildCoffeeRobotsRoute().sitemap, `${COFFEE_ORIGIN}/sitemap.xml`);
  assert.equal(buildCoffeeRobotsRoute().host, COFFEE_ORIGIN);
  assert.deepEqual(buildBusinessAppRobotsRoute(), { rules: { userAgent: "*", disallow: "/" } });
  assert.deepEqual(buildCoffeeRobotsRoute().rules, { userAgent: "*", allow: ["/$", "/help$", "/documents$", "/documents/"], disallow: "/" });
  for (const path of publicPaths) {
    const metadata = buildCoffeePublicPageMetadata(COFFEE_HOSTNAME, path, "Заголовок", "Описание");
    assert.equal(metadata.alternates?.canonical, COFFEE_ORIGIN + path);
    assert.deepEqual(metadata.robots, { index: true, follow: true, googleBot: { index: true, follow: true } });
    assert.equal(metadata.openGraph?.url, COFFEE_ORIGIN + path);
    assert.deepEqual(buildCoffeePublicPageMetadata("business.audiolad.ru", path, "Заголовок", "Описание"), {});
  }
  assert.deepEqual(buildCoffeePublicPageMetadata(COFFEE_HOSTNAME, "/cabinet", "Кабинет", "Описание"), {});

  assert.deepEqual(Object.keys(BUSINESS_PUBLIC_PATH_REWRITES).map((path) => resolveBusinessProxyAction("business.audiolad.ru", path)), businessBefore);
  for (const [path, internal] of Object.entries(BUSINESS_PUBLIC_PATH_REWRITES)) {
    assert.deepEqual(resolveBusinessProxyAction(COFFEE_HOSTNAME, path), path === "/spa" ? { action: "not_found" } :
      { action: "rewrite_business_app", pathname: path === "/" ? `${BUSINESS_SITE_PATH}/guest/coffee` : internal });
  }
  for (const path of ["/spa", "/business-app/spa", "/catalog", "/coffee-handoff", "/business-app/coffee-handoff"]) {
    assert.equal(resolveBusinessProxyAction(COFFEE_HOSTNAME, path).action, "not_found");
  }
  for (const path of ["/robots.txt", "/sitemap.xml", "/api/business/guest/coffee/usage", "/api/business/workspace/queue", "/api/business/subscription/checkout", "/api/business/player/report"]) {
    assert.equal(resolveBusinessProxyAction(COFFEE_HOSTNAME, path).action, "pass_through");
  }
  // MAJOR 2 regression: /spa pilot player APIs are not served on coffee; business unchanged.
  for (const path of ["/api/business/player/manifest", "/api/business/player/track-url"]) {
    assert.deepEqual(resolveBusinessProxyAction(COFFEE_HOSTNAME, path), { action: "not_found" });
    assert.equal(resolveBusinessProxyAction("business.audiolad.ru", path).action, "pass_through");
  }
  const reportRoute = readFileSync(new URL("../src/app/api/business/player/report/route.ts", import.meta.url), "utf8");
  assert.ok(reportRoute.indexOf("isCabinetReportSource(body)") < reportRoute.indexOf("isCoffeeHostRequest(request.headers)") &&
    reportRoute.indexOf("isCoffeeHostRequest(request.headers)") < reportRoute.indexOf("handleSpaReport("), "coffee: cabinet report only, SPA branch refused");
  assert.deepEqual(getHostBrandMetadata(COFFEE_HOSTNAME), getHostBrandMetadata("business.audiolad.ru"));
  assert.equal(buildBusinessAppMetadata(COFFEE_HOSTNAME).alternates?.canonical, "https://coffee.audiolad.ru/");
  assert.deepEqual(buildBusinessAppMetadata(COFFEE_HOSTNAME).robots, buildBusinessAppMetadata().robots);
  // MINOR: pages inherit the host-aware layout canonical (no page-level alternates).
  assert.equal(buildBusinessAppPageMetadata().alternates, undefined);
  assert.deepEqual(buildBusinessAppPageMetadata().robots, buildBusinessAppMetadata().robots);
  for (const page of ["music", "profile", "settings"]) {
    const src = readFileSync(new URL(`../src/app/business-app/${page}/page.tsx`, import.meta.url), "utf8");
    assert.ok(src.includes("buildBusinessAppPageMetadata()") && !/alternates|buildBusinessAppMetadata\(/.test(src), `${page}: inherits canonical`);
  }
  assert.deepEqual(sharedGuestOptions(COFFEE_HOSTNAME), { domain: ".audiolad.ru", secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
  for (const host of ["localhost", "preview.test", "audiolad.ru.evil.test", "evilaudiolad.ru"]) {
    assert.equal(sharedGuestOptions(host), undefined);
    assert.equal(migrateCoffeeGuestCookie(req(host, "/", `al_biz_guest=${oldToken}`), NextResponse.next()).headers.get("set-cookie"), null);
  }
  const migrated = migrateCoffeeGuestCookie(req("business.audiolad.ru", "/coffee-handoff", `al_biz_guest=${oldToken}`), NextResponse.next());
  assert.equal(cookieValue(migrated, SHARED_GUEST_COFFEE_COOKIE), oldToken);
  assert.equal(cookieValue(migrated, COFFEE_HANDOFF_COOKIE), "1");
  assert.ok(cookieLines(migrated).every((l) => /Domain=\.audiolad\.ru/i.test(l) && /HttpOnly/i.test(l) && /Secure/i.test(l)));

  // MAJOR 1 regression: raw Set-Cookie lines already on the response (Supabase host-only
  // expiries + al-auth-scope marker) survive the guest-cookie migration.
  const withRaw = NextResponse.next();
  withRaw.headers.append("set-cookie", `${AUTH_KEY}=; Path=/; Max-Age=0; SameSite=None; Secure`);
  withRaw.headers.append("set-cookie", `${SUPABASE_COOKIE_SCOPE_MARKER}=${SUPABASE_COOKIE_SCOPE_MARKER_VALUE}; Domain=.audiolad.ru; Path=/`);
  const kept = cookieLines(migrateCoffeeGuestCookie(req("business.audiolad.ru", "/coffee-handoff", `al_biz_guest=${oldToken}`), withRaw));
  assert.ok(kept.some((l) => l.startsWith(`${AUTH_KEY}=;`)), "Supabase host-only expiry kept");
  assert.ok(kept.some((l) => l.startsWith(`${SUPABASE_COOKIE_SCOPE_MARKER}=`)), "al-auth-scope marker kept");
  assert.ok(kept.some((l) => l.startsWith(`${SHARED_GUEST_COFFEE_COOKIE}=`)));
  assert.equal(hashGuestCoffeeToken(selectGuestToken(oldToken, undefined)!), hashGuestCoffeeToken(oldToken), "same DB meter key on coffee");
  assert.equal(migrateCoffeeGuestCookie(req("business.audiolad.ru", "/", `al_biz_guest=${oldToken}; ${SHARED_GUEST_COFFEE_COOKIE}=${liveToken}`), NextResponse.next()).headers.get("set-cookie"), null, "stale legacy identity never overwrites shared identity");
  assert.equal(selectGuestToken("invalid", oldToken), oldToken);
  assert.equal(selectGuestToken(undefined, "invalid"), undefined);
  for (const value of ["//evil.test", "/\\evil.test", "https://evil.test", "/\nfoo"]) assert.equal(coffeeReturnPath(value), "/");

  // Browser storage mock: separate origin stores, one domain cookie jar.
  const jar = new Map<string, string>();
  let local = new Map<string, string>();
  const profileKey = "audiolad-business-sound-profile", prefsKey = "audiolad-business-cafe-queue-prefs", hoursKey = "audiolad-business-cafe-daypart-hours";
  const profile = '{"character":"cozy","direction":"jazz","daypart":"morning"}';
  local.set(profileKey, profile); local.set(prefsKey, '{"daypartMode":"evening","energyOffset":15}');
  local.set(hoursKey, '{"morning":{"start":"07:00","end":"11:00"}}');
  local.set("private-device-token", "never-share");
  const browser = { location: { hostname: "business.audiolad.ru" }, localStorage: {
    get length() { return local.size; }, key(i: number) { return [...local.keys()][i] ?? null; },
    getItem(key: string) { return local.get(key) ?? null; }, setItem(key: string, value: string) { local.set(key, value); },
  } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); },
    set cookie(line: string) { assert.match(line, /Domain=\.audiolad.ru/); assert.match(line, /Secure/); assert.match(line, /SameSite=Lax/); const [k, v] = line.split(";")[0]!.split("="); jar.set(k!, v!); },
  } });
  migrateCoffeeSettings();
  assert.equal(jar.size, 3, "only allowlisted settings migrate");
  browser.location.hostname = COFFEE_HOSTNAME; local = new Map();
  const normalizedProfile = serializeBusinessSoundProfile(parseBusinessSoundProfile(profile));
  assert.equal(coffeeStorage.getItem(profileKey), normalizedProfile);
  coffeeStorage.setItem(profileKey, '{"direction":"rhythm","email":"x@example.test"}');
  assert.ok(![...jar.values()].some((v) => decodeURIComponent(v).includes("email")), "unknown fields never reach the domain cookie");
  const rhythm = serializeBusinessSoundProfile(parseBusinessSoundProfile('{"direction":"rhythm"}'));
  browser.location.hostname = "business.audiolad.ru"; local = new Map([[profileKey, profile]]);
  assert.equal(coffeeStorage.getItem(profileKey), rhythm, "shared settings win over stale business localStorage");
  jar.set("al_set_sound-profile", encodeURIComponent('{"direction":"rhythm","note":"<script>"}'));
  assert.equal(coffeeStorage.getItem(profileKey), rhythm, "cookie read is normalized too");
  assert.equal(normalizeSharedCoffeeValue("private-device-token", "x"), null);
  assert.equal(sharedCoffeeStorageKey("private-device-token"), false);
  browser.location.hostname = "preview.test"; local = new Map([[profileKey, profile]]);
  assert.equal(coffeeStorage.getItem(profileKey), profile, "preview stays host-only");
  delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  browser.location.hostname = "business.audiolad.ru";
  assert.equal(coffeeStorage.getItem(profileKey), profile, "flag OFF retains legacy reads");
  // Proxy runs server-side: drop the browser mocks (GoTrue would otherwise start a BroadcastChannel).
  Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "document");

  // MINOR: coffee-host static files are 404 when the flag is OFF (matcher sends them to proxy()).
  const coffeeMatcher = config.matcher.find((m) => typeof m === "object") as { source: string; has: Array<{ value: string }> };
  assert.ok(coffeeMatcher && new RegExp(`^${coffeeMatcher.has[0]!.value}$`).test(COFFEE_HOSTNAME) && !new RegExp(`^${coffeeMatcher.has[0]!.value}$`).test("business.audiolad.ru"));
  assert.ok(!coffeeMatcher.source.includes("txt") && !coffeeMatcher.source.includes("sw"), "coffee entry includes robots/sw/images");
  for (const path of ["/robots.txt", "/x.png", "/sw.js", "/manifest.webmanifest", "/favicon.ico"]) {
    assert.ok(PROXY_STATIC_FILE_PATTERN.test(path), path);
    assert.equal((await proxy(req(COFFEE_HOSTNAME, path))).status, 404, `flag OFF ${path}`);
  }
  assert.equal(PROXY_STATIC_FILE_PATTERN.test("/"), false);
  assert.equal((await proxy(req(COFFEE_HOSTNAME, "/"))).status, 404);
  process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";
  for (const path of ["/robots.txt", "/x.png"]) {
    const res = await proxy(req(COFFEE_HOSTNAME, path));
    assert.equal(res.headers.get("x-middleware-next"), "1", `flag ON ${path} passes through untouched`);
    assert.equal(cookieLines(res).length, 0);
  }

  for (const path of ["/", "/help", "/documents", "/guest/coffee", "/cabinet"]) {
    const response = await proxy(req(COFFEE_HOSTNAME, `${path}?utm_source=atlas`));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("location"), null, path);
    const rewrite = new URL(response.headers.get("x-middleware-rewrite")!);
    assert.equal(rewrite.hostname, COFFEE_HOSTNAME);
    assert.equal(rewrite.pathname, path === "/" ? "/business-app/guest/coffee" : BUSINESS_PUBLIC_PATH_REWRITES[path]);
    assert.equal(rewrite.searchParams.get("utm_source"), "atlas");
  }

  // MAJOR 1 regression through the real proxy: legacy host-only Supabase cookie on
  // /coffee-handoff -> one 307 reload that keeps expiries + marker (no reload loop).
  const legacy = await proxy(req("business.audiolad.ru", "/coffee-handoff?next=%2F", `${AUTH_KEY}=stale; al_biz_guest=${oldToken}`));
  assert.equal(legacy.status, 307);
  assert.equal(new URL(legacy.headers.get("location")!).pathname, "/coffee-handoff");
  const legacyLines = cookieLines(legacy);
  assert.ok(legacyLines.some((l) => l.startsWith(`${AUTH_KEY}=;`) && !/Domain=/i.test(l)), "host-only expiry survives");
  assert.ok(legacyLines.some((l) => l.startsWith(`${SUPABASE_COOKIE_SCOPE_MARKER}=`)), "marker survives");
  assert.ok(!legacyLines.some((l) => l.includes("stale")));
  // Browser applies them: the repeat carries the marker, not the legacy cookie -> no self-307.
  const repeat = await proxy(req("business.audiolad.ru", "/coffee-handoff?next=%2F",
    `${SUPABASE_COOKIE_SCOPE_MARKER}=${SUPABASE_COOKIE_SCOPE_MARKER_VALUE}; al_biz_guest=${oldToken}; ${SHARED_GUEST_COFFEE_COOKIE}=${oldToken}`));
  assert.ok(!(repeat.status === 307 && new URL(repeat.headers.get("location")!).pathname === "/coffee-handoff"), "no reload loop");
  delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;

  console.log("business-coffee-host-unit: OK (flag, routing, SEO, identity, migration, storage, raw cookies, coffee API/static gates)");
} finally {
  if (flag === undefined) delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  else process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = flag;
  Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "document");
}
