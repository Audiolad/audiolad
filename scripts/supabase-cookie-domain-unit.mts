import assert from "node:assert/strict";

import {
  planSupabaseCookieScope,
  getSupabaseCookieOptions,
  parseCookieHeader,
  resolveSupabaseCookieDomain,
  SUPABASE_COOKIE_SCOPE_MARKER,
} from "../src/lib/supabase/cookie-domain";
import { resolveNotFoundCatalogHref } from "../src/lib/business-app/not-found-link";

const URL_ = "https://abcd.supabase.co";
const KEY = "sb-abcd-auth-token";

// Domain derivation.
for (const h of ["audiolad.ru", "AUDIOLAD.RU:443", "business.audiolad.ru", "www.audiolad.ru", "audiolad.ru."]) {
  assert.equal(resolveSupabaseCookieDomain(h), ".audiolad.ru", h);
}
for (const h of ["localhost", "localhost:3000", "127.0.0.1", "evilaudiolad.ru", "audiolad.ru.evil.com", "", null, "[::1]:3000"]) {
  assert.equal(resolveSupabaseCookieDomain(h), undefined, String(h));
}

// Dev: nothing extra.
assert.deepEqual(
  planSupabaseCookieScope({
    hostname: "localhost",
    supabaseUrl: URL_,
    requestCookies: [{ name: KEY, value: "x" }],
    written: [{ name: KEY, value: "y", options: {} }],
  }).lines,
  [],
);
assert.deepEqual(getSupabaseCookieOptions("localhost:3000"), {});
assert.deepEqual(getSupabaseCookieOptions("business.audiolad.ru"), { domain: ".audiolad.ru", secure: true });

// Legacy migration: re-issue with Domain, expire host-only, set marker.
const legacyPlan = planSupabaseCookieScope({
  hostname: "audiolad.ru",
  supabaseUrl: URL_,
  requestCookies: [
    { name: `${KEY}.0`, value: "base64-aaa" },
    { name: `${KEY}.1`, value: "bbb" },
    { name: "other", value: "z" },
  ],
  written: [],
});
assert.equal(legacyPlan.mode, "reissue");
const legacy = legacyPlan.lines;
const expiry = (n: string) =>
  legacy.find((l) => l.startsWith(`${n}=;`) && !l.includes("Domain=") && l.includes("Max-Age=0"));
assert.ok(expiry(`${KEY}.0`) && expiry(`${KEY}.1`), "host-only expired");
assert.ok(legacy.some((l) => l.startsWith(`${KEY}.0=base64-aaa;`) && l.includes("Domain=.audiolad.ru") && l.includes("Secure")));
assert.ok(legacy.some((l) => l.startsWith(`${SUPABASE_COOKIE_SCOPE_MARKER}=`) && !l.includes("Domain=")), "marker is host-only (per host)");
assert.ok(!legacy.some((l) => l.startsWith("other=")), "non-auth cookies untouched");

// Marker present: only writes cause host-only expiry (refresh / logout).
const refresh = planSupabaseCookieScope({
  hostname: "business.audiolad.ru",
  supabaseUrl: URL_,
  requestCookies: [{ name: KEY, value: "old" }, { name: SUPABASE_COOKIE_SCOPE_MARKER, value: "d1" }],
  written: [
    { name: KEY, value: "", options: { domain: ".audiolad.ru", maxAge: 0 } },
    { name: "unrelated", value: "1", options: {} },
  ],
}).lines;
assert.equal(refresh.length, 1);
assert.match(refresh[0]!, new RegExp(`^${KEY}=; Max-Age=0; Path=/`));
assert.ok(!refresh[0]!.includes("Domain="));

// Subdomain legacy (e.g. stale host-only session after logout elsewhere):
// expired, never promoted to the shared domain.
const sub = planSupabaseCookieScope({
  hostname: "max.audiolad.ru",
  supabaseUrl: URL_,
  requestCookies: [{ name: KEY, value: "stale-B" }],
  written: [],
});
assert.equal(sub.mode, "expire_only");
assert.deepEqual(sub.legacyNames, [KEY]);
assert.ok(!sub.lines.some((l) => l.includes("stale-B")), "no re-issue on subdomain");
assert.ok(sub.lines.some((l) => l.startsWith(`${KEY}=;`) && !l.includes("Domain=")));
assert.ok(sub.lines.some((l) => l.startsWith(`${SUPABASE_COOKIE_SCOPE_MARKER}=`)));
// Apex marker does not suppress a subdomain migration: markers are per host
// (the browser simply does not send apex's host-only marker to max.).

// Migration + simultaneous write: written value wins (no re-issue of stale value).
const both = planSupabaseCookieScope({
  hostname: "audiolad.ru",
  supabaseUrl: URL_,
  requestCookies: [{ name: KEY, value: "stale" }],
  written: [{ name: KEY, value: "fresh", options: { domain: ".audiolad.ru" } }],
}).lines;
assert.ok(!both.some((l) => l.startsWith(`${KEY}=stale`)));
assert.equal(both.filter((l) => l.startsWith(`${KEY}=;`)).length, 1);

// Duplicate-name parse: first wins (same as @supabase/ssr default parser).
assert.deepEqual(parseCookieHeader("a=1; b=2; a=3"), [{ name: "a", value: "1" }, { name: "b", value: "2" }]);
assert.ok(legacy.every((l) => l.includes("Secure")), "prod lines are Secure");

// 404 link.
assert.equal(resolveNotFoundCatalogHref("business.audiolad.ru"), "https://audiolad.ru/catalog");
assert.equal(resolveNotFoundCatalogHref("audiolad.ru"), "/catalog");

console.log("supabase-cookie-domain-unit: ok");

// Proxy integration: subdomain legacy GET -> 307 reload with host-only expiries.
{
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test";
  const { NextRequest } = await import("next/server");
  const { updateSession } = await import("../src/lib/supabase/proxy");
  const req = new NextRequest("http://127.0.0.1:3000/spa?x=1", {
    headers: { host: "business.audiolad.ru", cookie: `${KEY}=stale-B` },
  });
  const res = await updateSession(req, { rewritePathname: "/business-app/spa" });
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "/spa?x=1");
  const setCookies = res.headers.getSetCookie();
  assert.ok(setCookies.some((l) => l.startsWith(`${KEY}=;`) && !l.includes("Domain=")));
  assert.ok(!setCookies.some((l) => l.includes("stale-B")));
  assert.ok(setCookies.some((l) => l.startsWith(`${SUPABASE_COOKIE_SCOPE_MARKER}=`)));
}

console.log("supabase-cookie-domain-unit: proxy ok");
