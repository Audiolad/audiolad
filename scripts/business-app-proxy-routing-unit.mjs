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
} from "../src/lib/business-app/host.ts";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy.ts";
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
assertAction(
  BUSINESS_HOSTNAME,
  "/music",
  "rewrite_business_app",
  `${BUSINESS_SITE_PATH}/music`,
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
assert.equal(normalizeBusinessAppPathname("/business-app/settings"), "/preferences");
assert.equal(normalizeBusinessAppPathname("/music"), "/music");

assert.deepEqual([...BUSINESS_POINT_STATES], ["healthy", "autonomous", "stopped"]);
assert.equal(isBusinessPointState("healthy"), true);
assert.equal(isBusinessPointState("broken"), false);
assert.equal(parseBusinessPointState("autonomous"), "autonomous");
assert.equal(parseBusinessPointState("nope"), "healthy");

assert.equal(BUSINESS_PRIMARY_NAV_ITEMS.length, 4);
assert.equal(BUSINESS_SECONDARY_NAV_ITEMS.length, 5);
assert.equal(BUSINESS_MOBILE_NAV_ITEMS.length, 5);
assert.equal(isBusinessNavItemActive("/", "/"), true);
assert.equal(isBusinessNavItemActive("/music", "/"), false);
assert.equal(
  BUSINESS_SECONDARY_NAV_ITEMS.find((i) => i.id === "settings")?.href,
  "/preferences",
);

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

console.log("business-app-proxy-routing-unit: ok");
