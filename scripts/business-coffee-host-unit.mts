import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_PUBLIC_PATH_REWRITES, BUSINESS_SITE_PATH, COFFEE_HOSTNAME, coffeeStorefrontUrl, isBusinessHostname } from "../src/lib/business-app/host";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { buildBusinessAppMetadata } from "../src/lib/business-app/seo";
import { getHostBrandMetadata } from "../src/lib/business-app/brand-icons";
import { coffeeHandoffRedirect, migrateCoffeeGuestCookie } from "../src/lib/business-app/coffee-host-proxy";
import { COFFEE_HANDOFF_COOKIE, SHARED_GUEST_COFFEE_COOKIE, coffeeReturnPath, selectGuestToken, sharedGuestOptions } from "../src/lib/business-app/guest-coffee/shared-identity";
import { coffeeStorage, migrateCoffeeSettings, sharedCoffeeStorageKey } from "../src/lib/business-app/shared-coffee-storage";
import { hashGuestCoffeeToken } from "../src/lib/business-app/guest-coffee/identity";

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
  for (const path of ["/robots.txt", "/api/business/guest/coffee/usage", "/api/business/workspace/queue", "/api/business/subscription/checkout"]) {
    assert.equal(resolveBusinessProxyAction(COFFEE_HOSTNAME, path).action, "pass_through");
  }
  assert.deepEqual(getHostBrandMetadata(COFFEE_HOSTNAME), getHostBrandMetadata("business.audiolad.ru"));
  assert.equal(buildBusinessAppMetadata(COFFEE_HOSTNAME).alternates?.canonical, "https://coffee.audiolad.ru/");
  assert.deepEqual(buildBusinessAppMetadata(COFFEE_HOSTNAME).robots, buildBusinessAppMetadata().robots);
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
  assert.equal(migrated.cookies.get(SHARED_GUEST_COFFEE_COOKIE)?.value, oldToken);
  assert.equal(migrated.cookies.get(COFFEE_HANDOFF_COOKIE)?.value, "1");
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
  assert.equal(coffeeStorage.getItem(profileKey), profile);
  coffeeStorage.setItem(profileKey, '{"direction":"rhythm"}');
  browser.location.hostname = "business.audiolad.ru"; local = new Map([[profileKey, profile]]);
  assert.equal(coffeeStorage.getItem(profileKey), '{"direction":"rhythm"}', "shared settings win over stale business localStorage");
  assert.equal(sharedCoffeeStorageKey("private-device-token"), false);
  browser.location.hostname = "preview.test"; local = new Map([[profileKey, profile]]);
  assert.equal(coffeeStorage.getItem(profileKey), profile, "preview stays host-only");
  delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  browser.location.hostname = "business.audiolad.ru";
  assert.equal(coffeeStorage.getItem(profileKey), profile, "flag OFF retains legacy reads");
  console.log("business-coffee-host-unit: OK (flag, routing, SEO, identity, migration, storage)");
} finally {
  if (flag === undefined) delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  else process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = flag;
  Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "document");
}
