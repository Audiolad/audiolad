#!/usr/bin/env node
/**
 * Regression: school.audiolad.ru host rewrite must not 308-loop with /school-site.
 * Main site /school-site stays non-indexable (404).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isMainSiteHostname,
  isSchoolHostname,
  isSchoolSitePath,
  normalizeHostname,
  SCHOOL_HOSTNAME,
  SCHOOL_SITE_PATH,
} from "../src/lib/school/host.ts";
import { resolveSchoolProxyAction } from "../src/proxy.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const proxySource = readFileSync(join(repoRoot, "src/proxy.ts"), "utf8");

function assertAction(hostname, pathname, expected) {
  const actual = resolveSchoolProxyAction(hostname, pathname);
  assert.equal(
    actual.action,
    expected,
    `${hostname}${pathname} → expected ${expected}, got ${actual.action}`,
  );
}

// Host helpers (forwarded/host production shape).
assert.equal(normalizeHostname("School.Audiolad.ru:443"), SCHOOL_HOSTNAME);
assert.equal(normalizeHostname("audiolad.ru"), "audiolad.ru");
assert.equal(isSchoolHostname(SCHOOL_HOSTNAME), true);
assert.equal(isSchoolHostname("audiolad.ru"), false);
assert.equal(isMainSiteHostname("audiolad.ru"), true);
assert.equal(isMainSiteHostname("www.audiolad.ru"), true);
assert.equal(isMainSiteHostname(SCHOOL_HOSTNAME), false);
assert.equal(isSchoolSitePath(SCHOOL_SITE_PATH), true);

// school.audiolad.ru/ → rewrite landing (no redirect loop).
assertAction(SCHOOL_HOSTNAME, "/", "rewrite_school_landing");
// Internal path on school host must pass through (served via rewrite), never redirect.
assertAction(SCHOOL_HOSTNAME, SCHOOL_SITE_PATH, "pass_through");
assertAction(SCHOOL_HOSTNAME, "/catalog", "pass_through");

// audiolad.ru/school-site → intentional 404 (SEO / no public duplicate).
assertAction("audiolad.ru", SCHOOL_SITE_PATH, "not_found");
assertAction("www.audiolad.ru", SCHOOL_SITE_PATH, "not_found");
assertAction("audiolad.ru", "/", "pass_through");

// Source guard: no school-host 308 /school-site → / (the loop bug).
assert.equal(
  /isSchoolHostname\(hostname\)\s*&&\s*pathname\s*===\s*SCHOOL_SITE_PATH/.test(
    proxySource,
  ),
  false,
  "proxy must not special-case school host /school-site (redirect loop risk)",
);
assert.equal(
  /NextResponse\.redirect\([\s\S]*SCHOOL_SITE_PATH|pathname === SCHOOL_SITE_PATH[\s\S]*NextResponse\.redirect/.test(
    proxySource,
  ),
  false,
  "proxy must not redirect SCHOOL_SITE_PATH on school host",
);
assert.match(
  proxySource,
  /action:\s*"not_found"/,
  "main-site school-site block must remain",
);
assert.match(
  proxySource,
  /rewritePathname:\s*SCHOOL_SITE_PATH/,
  "school root rewrite must remain",
);

console.log("school-proxy-routing-unit: ok");
