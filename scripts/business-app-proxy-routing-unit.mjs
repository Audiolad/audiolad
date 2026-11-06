#!/usr/bin/env node
/**
 * Regression: business.audiolad.ru host rewrite must not collide with public /b,
 * must fail-closed for platform routes, and must 404 /business-app on apex.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_HOSTNAME,
  BUSINESS_PUBLIC_PATH_REWRITES,
  BUSINESS_SITE_PATH,
  isBusinessHostname,
  isBusinessSitePath,
  normalizeBusinessAppPathname,
  resolveBusinessInternalPath,
  resolveVenueLicenceInternalPath,
  venueLicencePublicUrl,
  venueLicenceInternalPath,
} from "../src/lib/business-app/host.ts";
import { VENUE_LICENCE_PUBLIC_KEY } from "../src/lib/business-app/venue-licence/flag.ts";
import {
  COFFEE_ALLOWED_AUTH_PATHS,
  COFFEE_ALLOWED_AUTH_API_PATHS,
  businessPrivateGuestRedirect,
  resolveBusinessProxyAction,
} from "../src/lib/business-app/proxy-policy.ts";
import {
  isLoopbackHostHeader,
  resolveProxyRequestHostname,
} from "../src/lib/business-app/proxy-hostname.ts";
import {
  BUSINESS_POINT_STATES,
  isBusinessPointState,
  parseBusinessPointState,
} from "../src/lib/business-app/point-state.ts";
import {
  BUSINESS_MOBILE_NAV_ITEMS,
  BUSINESS_PRIMARY_NAV_ITEMS,
  BUSINESS_SECONDARY_NAV_ITEMS,
  isBusinessNavItemActive,
} from "../src/lib/business-app/nav.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const proxySource = readFileSync(join(repoRoot, "src/proxy.ts"), "utf8");
const sessionProxy = readFileSync(join(repoRoot, "src/lib/supabase/proxy.ts"), "utf8");
const bPage = readFileSync(
  join(repoRoot, "src/app/(platform)/b/page.tsx"),
  "utf8",
);
const businessLanding = readFileSync(
  join(repoRoot, "src/components/business/BusinessLandingView.tsx"),
  "utf8",
);

function assertAction(hostname, pathname, expected, rewritePath) {
  const actual = resolveBusinessProxyAction(hostname, pathname);
  assert.equal(
    actual.action,
    expected,
    `${hostname}${pathname} → expected ${expected}, got ${actual.action}`,
  );
  if (expected === "rewrite_business_app") {
    assert.equal(actual.pathname, rewritePath);
  }
}

assert.equal(isBusinessHostname(BUSINESS_HOSTNAME), true);
assert.equal(isBusinessHostname("audiolad.ru"), false);
assert.equal(isBusinessSitePath(BUSINESS_SITE_PATH), true);
assert.equal(isBusinessSitePath("/b"), false);

assertAction(BUSINESS_HOSTNAME, "/", "rewrite_business_app", BUSINESS_SITE_PATH);
assertAction(BUSINESS_HOSTNAME, "/cabinet", "rewrite_business_app", BUSINESS_SITE_PATH);
assertAction(
  BUSINESS_HOSTNAME,
  "/music",
  "rewrite_business_app",
  `${BUSINESS_SITE_PATH}/music`,
);
assertAction(
  BUSINESS_HOSTNAME,
  "/player",
  "rewrite_business_app",
  `${BUSINESS_SITE_PATH}/player`,
);
assertAction(
  BUSINESS_HOSTNAME,
  "/spa",
  "rewrite_business_app",
  `${BUSINESS_SITE_PATH}/spa`,
);
assertAction(
  BUSINESS_HOSTNAME,
  "/onboarding",
  "rewrite_business_app",
  `${BUSINESS_SITE_PATH}/onboarding`,
);
assertAction(
  BUSINESS_HOSTNAME,
  "/preferences",
  "rewrite_business_app",
  `${BUSINESS_SITE_PATH}/settings`,
);
assertAction(BUSINESS_HOSTNAME, BUSINESS_SITE_PATH, "pass_through");
assertAction(BUSINESS_HOSTNAME, "/robots.txt", "pass_through");
assertAction(BUSINESS_HOSTNAME, "/sw.js", "pass_through");
assertAction(BUSINESS_HOSTNAME, "/api/client-errors", "pass_through");
assertAction(BUSINESS_HOSTNAME, "/api/health/build", "pass_through");
assertAction(BUSINESS_HOSTNAME, "/api/listen/resume-session", "not_found");
assertAction(BUSINESS_HOSTNAME, "/sitemap.xml", "not_found");
assertAction(BUSINESS_HOSTNAME, "/b", "not_found");
assertAction(BUSINESS_HOSTNAME, "/catalog", "not_found");
assertAction(BUSINESS_HOSTNAME, "/author-dashboard", "not_found");
assertAction(BUSINESS_HOSTNAME, "/settings", "not_found");

assertAction("audiolad.ru", BUSINESS_SITE_PATH, "not_found");
assertAction("www.audiolad.ru", `${BUSINESS_SITE_PATH}/music`, "not_found");
assertAction("audiolad.ru", "/b", "pass_through");
assertAction("audiolad.ru", "/", "pass_through");

assert.equal(resolveBusinessInternalPath("/"), BUSINESS_SITE_PATH);
assert.equal(normalizeBusinessAppPathname("/business-app"), "/");
assert.equal(normalizeBusinessAppPathname("/cabinet"), "/");
assert.equal(normalizeBusinessAppPathname("/business-app/settings"), "/preferences");
assert.equal(normalizeBusinessAppPathname("/business-app/profile"), "/profile");
assert.equal(resolveBusinessInternalPath("/profile"), `${BUSINESS_SITE_PATH}/profile`);
assert.equal(normalizeBusinessAppPathname("/music"), "/music");

// Guest /profile on the business host must not be sent to same-host /auth/sign-in (404).
// Same guest entry as /music, /workspace and /player. Apex sign-in stays as it is.
const profileGuest = businessPrivateGuestRedirect(`${BUSINESS_SITE_PATH}/profile`, "/profile");
assert.equal(profileGuest, "/guest/coffee");
assert.notEqual(profileGuest, "/auth/sign-in");
assert.equal(
  resolveBusinessProxyAction(BUSINESS_HOSTNAME, profileGuest).action,
  "rewrite_business_app",
  "the guest entry itself must exist on the business host",
);
assert.equal(businessPrivateGuestRedirect(`${BUSINESS_SITE_PATH}/profile`, "/profile/edit"), "/guest/coffee");
assert.equal(businessPrivateGuestRedirect(undefined, "/profile"), null, "audiolad.ru /profile still uses /auth/sign-in");
assert.equal(businessPrivateGuestRedirect("/school-site", "/profile"), null);
assert.equal(businessPrivateGuestRedirect(`${BUSINESS_SITE_PATH}/music`, "/music"), null, "/music is not a listener private route");
assert.equal(businessPrivateGuestRedirect(`${BUSINESS_SITE_PATH}`, "/catalog"), null);
assert.match(sessionProxy, /businessPrivateGuestRedirect\(rewritePathname, pathname\)/);
assert.match(sessionProxy, /new URL\("\/auth\/sign-in", request\.url\)/, "apex sign-in redirect stays");

assert.deepEqual([...BUSINESS_POINT_STATES], ["healthy", "autonomous", "stopped"]);
assert.equal(isBusinessPointState("healthy"), true);
assert.equal(isBusinessPointState("broken"), false);
assert.equal(parseBusinessPointState("autonomous"), "autonomous");
assert.equal(parseBusinessPointState("nope"), "healthy");

assert.equal(BUSINESS_PRIMARY_NAV_ITEMS.length, 3);
assert.equal(BUSINESS_SECONDARY_NAV_ITEMS.length, 2);
assert.equal(BUSINESS_MOBILE_NAV_ITEMS.length, 5);
assert.ok(BUSINESS_MOBILE_NAV_ITEMS.length <= 5, "mobile bottom nav has at most five buttons");
assert.deepEqual(
  BUSINESS_MOBILE_NAV_ITEMS.map((item) => item.title),
  ["Главная", "Музыка", "Настройка", "Документы", "Профиль"],
);
assert.deepEqual(
  [...BUSINESS_PRIMARY_NAV_ITEMS, ...BUSINESS_SECONDARY_NAV_ITEMS].map((item) => item.id),
  BUSINESS_MOBILE_NAV_ITEMS.map((item) => item.id),
);
assert.equal(isBusinessNavItemActive("/", "/"), true);
assert.equal(isBusinessNavItemActive("/music", "/"), false);
assert.equal(BUSINESS_MOBILE_NAV_ITEMS.some((item) => item.id === "documents"), true);
assert.equal(BUSINESS_MOBILE_NAV_ITEMS.some((item) => item.id === "settings"), true);
assert.equal(BUSINESS_MOBILE_NAV_ITEMS.some((item) => item.id === "profile"), true);
assert.equal(BUSINESS_MOBILE_NAV_ITEMS.some((item) => item.id === "help"), false);
assert.equal(BUSINESS_PRIMARY_NAV_ITEMS.some((item) => item.id === "player"), false);

assert.match(
  proxySource,
  /resolveBusinessProxyAction/,
  "proxy must wire business host policy",
);
assert.match(
  proxySource,
  /rewrite_business_app/,
  "proxy must rewrite business app paths",
);
assert.match(
  proxySource,
  /businessAction\.action === "not_found"/,
  "proxy must fail-closed for business not_found",
);

// Public /b marketing landing must remain untouched by this feature.
assert.match(bPage, /BusinessLandingView/);
assert.match(businessLanding, /BusinessLandingView|business-landing/);
assert.equal(
  Object.prototype.hasOwnProperty.call(BUSINESS_PUBLIC_PATH_REWRITES, "/b"),
  false,
  "business host must not rewrite public /b",
);

const rootLayout = readFileSync(join(repoRoot, "src/app/layout.tsx"), "utf8");
assert.match(rootLayout, /isBusinessHostname/, "root layout must detect business host");
assert.match(
  rootLayout,
  /isBusinessHost \? children : <BaseProviders>/,
  "root layout must skip BaseProviders on business host",
);
assert.equal(
  existsSync(join(repoRoot, "src/app/(platform)/business-app")),
  false,
  "business-app must not live under (platform)",
);
assert.equal(
  existsSync(join(repoRoot, "src/app/business-app/page.tsx")),
  true,
  "business-app lives at src/app/business-app",
);

const venueId = "0123456789abcdef0123456789abcdef";
const venueOn = { [VENUE_LICENCE_PUBLIC_KEY]: "1" };
assert.equal(resolveVenueLicenceInternalPath(`/v/${venueId}`), venueLicenceInternalPath(venueId));
assert.equal(resolveVenueLicenceInternalPath("/v/short"), null);
assert.equal(resolveVenueLicenceInternalPath(`/v/${venueId.toUpperCase()}`), null);
assert.equal(venueLicencePublicUrl(venueId), `https://business.audiolad.ru/v/${venueId}`);
for (const value of [undefined, "0", "true", "false", "", "01", " 1", "anything"]) {
  const env = { [VENUE_LICENCE_PUBLIC_KEY]: value };
  for (const host of [BUSINESS_HOSTNAME, "audiolad.ru", "www.audiolad.ru", "other.example"]) {
    for (const path of [`/v/${venueId}`, venueLicenceInternalPath(venueId), `${BUSINESS_SITE_PATH}/v/${venueId}`]) {
      assert.deepEqual(resolveBusinessProxyAction(host, path, env), { action: "not_found" }, `${host}${path} flag=${value}`);
    }
  }
}
assert.equal(venueLicenceInternalPath(venueId), `/business-venue-licence/v/${venueId}`);
assert.deepEqual(
  resolveBusinessProxyAction(BUSINESS_HOSTNAME, venueLicenceInternalPath(venueId), venueOn),
  { action: "pass_through" },
  "rewritten licence path passes through with the flag on",
);
assert.deepEqual(
  resolveBusinessProxyAction(BUSINESS_HOSTNAME, `${BUSINESS_SITE_PATH}/v/${venueId}`, venueOn),
  { action: "not_found" },
  "former cabinet route is retired",
);
assert.deepEqual(
  resolveBusinessProxyAction(BUSINESS_HOSTNAME, `/v/${venueId}`, venueOn),
  { action: "rewrite_business_app", pathname: venueLicenceInternalPath(venueId) },
);
assert.equal(resolveBusinessProxyAction(BUSINESS_HOSTNAME, "/v/not-a-token", venueOn).action, "not_found");
assert.equal(
  resolveBusinessProxyAction("audiolad.ru", venueLicenceInternalPath(venueId), venueOn).action,
  "not_found",
  "apex does not serve the business licence page",
);

console.log("business-app-proxy-routing-unit: ok");

// Exact coffee auth admission, without opening business auth or arbitrary platform routes.
const coffeeFlag = process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
try {
  for (const enabled of [undefined, "1"]) {
    if (enabled) process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = enabled;
    else delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
    const paths = [
      "/auth/sign-in", "/auth/sign-up", "/auth/forgot-password", "/auth/recovery",
      "/auth/reset-password", "/auth/callback", "/auth/sign-out",
      "/auth/business-return", "/auth/business-cabinet",
      "/auth/claim-partner-attribution", "/auth/claim-guest-ratings",
      "/api/analytics/track", "/api/analytics/signup/complete",
    ];
    assert.deepEqual([...COFFEE_ALLOWED_AUTH_PATHS, ...COFFEE_ALLOWED_AUTH_API_PATHS], paths);
    for (const path of paths) {
      assertAction("coffee.audiolad.ru", path, enabled ? "pass_through" : "not_found");
      assertAction(BUSINESS_HOSTNAME, path, "not_found");
      assertAction("audiolad.ru", path, "pass_through");
      assertAction("coffee.audiolad.ru", `${path}/extra`, "not_found");
    }
    for (const path of ["/auth/unknown", "/api/listen/resume-session", "/api/analytics/session", "/catalog"]) {
      assertAction("coffee.audiolad.ru", path, "not_found");
    }
    for (const path of ["/privacy", "/documents/privacy"]) {
      assertAction("coffee.audiolad.ru", path, enabled ? "rewrite_business_app" : "not_found", "/business-app/documents/privacy");
      assertAction(BUSINESS_HOSTNAME, path, "rewrite_business_app", "/business-app/documents/privacy");
      assertAction("audiolad.ru", path, "pass_through");
    }
  }
} finally {
  if (coffeeFlag === undefined) delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  else process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = coffeeFlag;
}

// Incident 02.11.2026: Next.js re-requests a proxy rewrite with Host: localhost:<PORT> and keeps
// X-Forwarded-Host. That internal request must still route as the public host, not 404.
{
  const h = (host, forwarded) => ({
    get(name) {
      if (name === "host") return host ?? null;
      if (name === "x-forwarded-host") return forwarded ?? null;
      return null;
    },
  });
  for (const loopback of ["localhost", "localhost:3001", "127.0.0.1:3000", "[::1]:3000", "::1", "LOCALHOST:3999"]) {
    assert.equal(isLoopbackHostHeader(loopback), true, loopback);
  }
  for (const external of ["coffee.audiolad.ru", "business.audiolad.ru", "audiolad.ru:443", "localhost.evil.ru", "127.0.0.2", "", null]) {
    assert.equal(isLoopbackHostHeader(external), false, String(external));
  }
  const coffeeFlagBefore = process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  try {
    process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";
    for (const internalHost of ["localhost:3001", "127.0.0.1:3000", "[::1]:3000"]) {
      const hostname = resolveProxyRequestHostname(h(internalHost, "coffee.audiolad.ru"));
      assert.equal(hostname, "coffee.audiolad.ru", `internal ${internalHost}`);
      for (const path of ["/business-app", "/business-app/documents", "/business-app/guest/coffee", "/business-app/help", "/business-app/cabinet"]) {
        assert.notEqual(resolveBusinessProxyAction(hostname, path).action, "not_found", `internal ${internalHost}${path}`);
      }
      assert.equal(resolveProxyRequestHostname(h(internalHost, BUSINESS_HOSTNAME)), BUSINESS_HOSTNAME);
      assert.equal(resolveProxyRequestHostname(h(internalHost, "audiolad.ru")), "audiolad.ru");
    }
    // Direct nginx requests (Host = X-Forwarded-Host = $host).
    for (const host of ["coffee.audiolad.ru", BUSINESS_HOSTNAME, "audiolad.ru"]) {
      assert.equal(resolveProxyRequestHostname(h(host, host)), host);
      assert.equal(resolveProxyRequestHostname(h(host, null)), host);
    }
    // A real public Host beats a forged forwarded coffee host, and vice versa.
    assert.equal(resolveProxyRequestHostname(h(BUSINESS_HOSTNAME, "coffee.audiolad.ru")), BUSINESS_HOSTNAME);
    assert.equal(resolveProxyRequestHostname(h("coffee.audiolad.ru", BUSINESS_HOSTNAME)), "coffee.audiolad.ru");
    // Other hosts keep X-Forwarded-Host ?? Host.
    assert.equal(resolveProxyRequestHostname(h("audiolad.ru", BUSINESS_HOSTNAME)), BUSINESS_HOSTNAME);
  } finally {
    if (coffeeFlagBefore === undefined) delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
    else process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = coffeeFlagBefore;
  }
  assert.match(proxySource, /resolveProxyRequestHostname\(request\.headers\)/);
  console.log("business-app-proxy-routing-unit: internal rewrite hostname ok");
}
