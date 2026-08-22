#!/usr/bin/env node
/**
 * Regression: max.audiolad.ru host rewrite must not 308-loop with /max-site.
 * Main site /max-site stays non-indexable (404). MAX host must not expose catalog.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isMaxHostname,
  isMaxSessionVerifyPath,
  isMaxSitePath,
  MAX_HOSTNAME,
  MAX_SESSION_VERIFY_PATH,
  MAX_SITE_PATH,
} from "../src/lib/max/host.ts";
import { resolveMaxProxyAction } from "../src/lib/max/proxy-policy.ts";
import {
  isMainSiteHostname,
  normalizeHostname,
  SCHOOL_HOSTNAME,
  SCHOOL_SITE_PATH,
} from "../src/lib/school/host.ts";
import { resolveSchoolProxyAction } from "../src/lib/school/proxy-policy.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const proxySource = readFileSync(join(repoRoot, "src/proxy.ts"), "utf8");
const policySource = readFileSync(
  join(repoRoot, "src/lib/max/proxy-policy.ts"),
  "utf8",
);
const appOriginSource = readFileSync(
  join(repoRoot, "src/lib/seo/app-origin.ts"),
  "utf8",
);
const pageSource = readFileSync(
  join(repoRoot, "src/app/(platform)/max-site/page.tsx"),
  "utf8",
);
const robotsSource = readFileSync(join(repoRoot, "src/app/robots.ts"), "utf8");
const sitemapSource = readFileSync(join(repoRoot, "src/app/sitemap.ts"), "utf8");

function assertMaxAction(hostname, pathname, expected) {
  const actual = resolveMaxProxyAction(hostname, pathname);
  assert.equal(
    actual.action,
    expected,
    `${hostname}${pathname} → expected ${expected}, got ${actual.action}`,
  );
}

function assertSchoolAction(hostname, pathname, expected) {
  const actual = resolveSchoolProxyAction(hostname, pathname);
  assert.equal(
    actual.action,
    expected,
    `school policy ${hostname}${pathname} → expected ${expected}, got ${actual.action}`,
  );
}

assert.equal(normalizeHostname("Max.Audiolad.ru:443"), MAX_HOSTNAME);
assert.equal(isMaxHostname(MAX_HOSTNAME), true);
assert.equal(isMaxHostname("audiolad.ru"), false);
assert.equal(isMaxHostname(SCHOOL_HOSTNAME), false);
assert.equal(isMaxSitePath(MAX_SITE_PATH), true);
assert.equal(isMainSiteHostname(MAX_HOSTNAME), false);

// max.audiolad.ru/ → rewrite landing (no redirect loop).
assert.equal(isMaxSessionVerifyPath(MAX_SESSION_VERIFY_PATH), true);
assert.equal(isMaxSessionVerifyPath(`${MAX_SESSION_VERIFY_PATH}/`), false);
assert.equal(isMaxSessionVerifyPath("/api/max"), false);

assertMaxAction(MAX_HOSTNAME, "/", "rewrite_max_landing");
assertMaxAction(MAX_HOSTNAME, MAX_SITE_PATH, "pass_through");
assertMaxAction(MAX_HOSTNAME, "/robots.txt", "pass_through");
assertMaxAction(MAX_HOSTNAME, "/sw.js", "pass_through");
assertMaxAction(MAX_HOSTNAME, "/manifest.webmanifest", "pass_through");
assertMaxAction(MAX_HOSTNAME, MAX_SESSION_VERIFY_PATH, "pass_through");
assertMaxAction(MAX_HOSTNAME, `${MAX_SESSION_VERIFY_PATH}/`, "not_found");
assertMaxAction(MAX_HOSTNAME, "/api/health/build", "not_found");
assertMaxAction(MAX_HOSTNAME, "/api/max", "not_found");
assertMaxAction(MAX_HOSTNAME, "/api/max/session", "not_found");

for (const pathname of [
  "/catalog",
  "/studio",
  "/studio/projects",
  "/listen/sergey-petrov/dengi-menya-obozhayut",
  "/authors",
  "/author-dashboard",
  "/become-author",
  "/auth/sign-up",
  "/auth/sign-in",
  "/profile",
  "/sitemap.xml",
  SCHOOL_SITE_PATH,
]) {
  assertMaxAction(MAX_HOSTNAME, pathname, "not_found");
}

// apex / www / school must not expose /max-site as a second homepage.
assertMaxAction("audiolad.ru", MAX_SITE_PATH, "not_found");
assertMaxAction("www.audiolad.ru", MAX_SITE_PATH, "not_found");
assertMaxAction(SCHOOL_HOSTNAME, MAX_SITE_PATH, "not_found");

// apex / is unchanged by the MAX policy.
assertMaxAction("audiolad.ru", "/", "pass_through");
assertMaxAction("audiolad.ru", "/catalog", "pass_through");
assertMaxAction("www.audiolad.ru", "/", "pass_through");
assertMaxAction(SCHOOL_HOSTNAME, "/", "pass_through");
assertMaxAction("audiolad.ru", MAX_SESSION_VERIFY_PATH, "pass_through");

// School policy still owns school host isolation.
assertSchoolAction(SCHOOL_HOSTNAME, "/", "rewrite_school_landing");
assertSchoolAction("audiolad.ru", SCHOOL_SITE_PATH, "not_found");
assertSchoolAction("audiolad.ru", "/", "pass_through");

assert.equal(
  /isMaxHostname\(hostname\)\s*&&\s*pathname\s*===\s*MAX_SITE_PATH/.test(
    proxySource,
  ),
  false,
  "proxy must not special-case MAX host /max-site (redirect loop risk)",
);
assert.equal(
  /NextResponse\.redirect\([\s\S]*MAX_SITE_PATH|pathname === MAX_SITE_PATH[\s\S]*NextResponse\.redirect/.test(
    proxySource,
  ),
  false,
  "proxy must not redirect MAX_SITE_PATH on MAX host",
);
assert.match(
  policySource,
  /action:\s*"not_found"/,
  "non-MAX /max-site block must remain",
);
assert.match(
  proxySource,
  /maxAction\.action === "not_found"/,
  "proxy still returns 404 for MAX not_found actions",
);
assert.match(
  proxySource,
  /rewritePathname:\s*MAX_SITE_PATH/,
  "MAX root rewrite must remain",
);
assert.match(
  policySource,
  /MAX_PUBLIC_ASSET_PATHS/,
  "MAX public asset allowlist exists",
);
assert.match(
  appOriginSource,
  /"max\.audiolad\.ru"/,
  "PUBLIC_REQUEST_HOSTS must include max.audiolad.ru",
);
assert.match(
  pageSource,
  /if \(!isMaxHostname\(hostname\)\)/,
  "MAX page must hostname-guard non-MAX hosts",
);
assert.match(
  pageSource,
  /notFound\(\)/,
  "MAX page must notFound() on non-MAX hosts",
);
assert.match(robotsSource, /isMaxHostname/, "robots.ts handles MAX host");
assert.match(robotsSource, /buildMaxRobotsRoute/, "MAX robots are disallow-all");
assert.match(sitemapSource, /isMaxHostname/, "sitemap.ts must not leak catalog on MAX");
assert.doesNotMatch(
  proxySource,
  /Content-Security-Policy|X-Frame-Options/,
  "proxy must not invent CSP or X-Frame-Options",
);
const maxClientSources = [
  "src/lib/max/bridge.ts",
  "src/lib/max/host.ts",
  "src/lib/max/proxy-policy.ts",
  "src/lib/max/seo.ts",
  "src/components/max/MaxBridgeScript.tsx",
  "src/components/max/MaxMiniAppScreen.tsx",
  "src/app/(platform)/max-site/page.tsx",
  "src/app/(platform)/max-site/layout.tsx",
]
  .map((relative) => readFileSync(join(repoRoot, relative), "utf8"))
  .join("\n");
assert.doesNotMatch(
  maxClientSources,
  /MAX_BOT|BOT_TOKEN|process\.env\.\w*SECRET|process\.env\.\w*TOKEN/,
  "MAX client/shell sources must not embed bot tokens or secrets",
);
assert.doesNotMatch(
  maxClientSources,
  /NEXT_PUBLIC_MAX/,
  "MAX client/shell sources must not expose MAX secrets",
);
assert.match(
  maxClientSources,
  /MAX_SESSION_VERIFY_PATH/,
  "shell must call the Stage 1 verify path",
);

const verifierSource = readFileSync(
  join(repoRoot, "src/lib/max/verify-init-data.ts"),
  "utf8",
);
const routeSource = readFileSync(
  join(repoRoot, "src/app/api/max/session/verify/route.ts"),
  "utf8",
);
const touchSource = readFileSync(
  join(repoRoot, "src/lib/max/touch-external-identity.ts"),
  "utf8",
);
assert.doesNotMatch(`${verifierSource}\n${routeSource}\n${touchSource}`, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(verifierSource, /CREATE TABLE|alter table|external_identities/i);
assert.doesNotMatch(verifierSource, /createServiceRoleClient|@\/lib\/supabase/);
assert.match(routeSource, /touchExternalIdentity/);
assert.match(touchSource, /createServiceRoleClient/);
assert.doesNotMatch(`${routeSource}\n${touchSource}`, /CREATE TABLE|alter table/i);
assert.doesNotMatch(
  maxClientSources,
  /зарегистрир|вошли|вход выполнен|logged in|registered/i,
);
assert.match(policySource, /isMaxSessionVerifyPath/);
assert.doesNotMatch(
  `${maxClientSources}\n${verifierSource}\n${routeSource}\n${touchSource}`
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, ""),
  /\.ready\s*\(/,
  "MAX sources must not call Telegram-style ready()",
);

console.log("max-proxy-routing-unit: ok");
