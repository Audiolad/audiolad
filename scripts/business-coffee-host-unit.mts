import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_PUBLIC_PATH_REWRITES, BUSINESS_SITE_PATH, COFFEE_HOSTNAME, coffeeStorefrontUrl, isBusinessHostname } from "../src/lib/business-app/host";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { buildBusinessAppMetadata, buildBusinessAppPageMetadata } from "../src/lib/business-app/seo";
import { readFileSync } from "node:fs";
import { getHostBrandMetadata } from "../src/lib/business-app/brand-icons";
import { coffeeHandoffRedirect, migrateCoffeeGuestCookie } from "../src/lib/business-app/coffee-host-proxy";
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
  assert.equal(coffeeHandoffRedirect(req(COFFEE_HOSTNAME)), null);
  assert.equal(sharedGuestOptions("business.audiolad.ru"), undefined);
  assert.equal(migrateCoffeeGuestCookie(req("business.audiolad.ru", "/", `al_biz_guest=${oldToken}`), NextResponse.next()).headers.get("set-cookie"), null);
  process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";
  assert.equal(coffeeStorefrontUrl(), "https://coffee.audiolad.ru/");
  assert.deepEqual(Object.keys(BUSINESS_PUBLIC_PATH_REWRITES).map((path) => resolveBusinessProxyAction("business.audiolad.ru", path)), businessBefore);
  for (const [path, internal] of Object.entries(BUSINESS_PUBLIC_PATH_REWRITES)) {
    assert.deepEqual(resolveBusinessProxyAction(COFFEE_HOSTNAME, path), path === "/spa" ? { action: "not_found" } :
      { action: "rewrite_business_app", pathname: path === "/" ? `${BUSINESS_SITE_PATH}/guest/coffee` : internal });
  }
  for (const path of ["/spa", "/business-app/spa", "/catalog", "/sitemap.xml", "/coffee-handoff", "/business-app/coffee-handoff"]) {
    assert.equal(resolveBusinessProxyAction(COFFEE_HOSTNAME, path).action, "not_found");
  }
  for (const path of ["/robots.txt", "/api/business/guest/coffee/usage", "/api/business/workspace/queue", "/api/business/subscription/checkout", "/api/business/player/report"]) {
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
  const redirect = coffeeHandoffRedirect(req(COFFEE_HOSTNAME, "/?utm_source=atlas&from=coffee"))!;
  const target = new URL(redirect.headers.get("location")!);
  assert.equal(target.origin, "https://business.audiolad.ru");
  assert.equal(target.pathname, "/coffee-handoff");
  assert.equal(target.searchParams.get("next"), "/?utm_source=atlas&from=coffee");
  const migrated = migrateCoffeeGuestCookie(req("business.audiolad.ru", target.pathname, `al_biz_guest=${oldToken}`), NextResponse.next());
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
  assert.equal(coffeeHandoffRedirect(req(COFFEE_HOSTNAME, "/", `${COFFEE_HANDOFF_COOKIE}=1; ${SHARED_GUEST_COFFEE_COOKIE}=${oldToken}`)), null);
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
