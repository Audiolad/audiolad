import assert from "node:assert/strict";

import {
  planSupabaseCookieScope,
  hostnameFromHeaders,
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

// Legacy migration on apex: expire host-only only, NEVER re-issue (C3 B3).
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
assert.equal(legacyPlan.mode, "expire_only");
const legacy = legacyPlan.lines;
const expiry = (n: string) =>
  legacy.find((l) => l.startsWith(`${n}=;`) && !l.includes("Domain=") && l.includes("Max-Age=0"));
assert.ok(expiry(`${KEY}.0`) && expiry(`${KEY}.1`), "host-only expired");
assert.ok(!legacy.some((l) => l.includes("base64-aaa") || l.includes("bbb")), "legacy values never re-issued");
assert.ok(!legacy.some((l) => l.includes("Domain=")), "no Domain write during migration");
// C3 B2: expiries must be accepted in the MAX cross-site iframe.
for (const l of legacy) assert.ok(l.includes("SameSite=None") && l.includes("Secure"), l);
assert.ok(legacy.some((l) => l.startsWith(`${SUPABASE_COOKIE_SCOPE_MARKER}=`) && !l.includes("Domain=")), "marker is host-only (per host)");
assert.ok(!legacy.some((l) => l.startsWith("other=")), "non-auth cookies untouched");

// Late apex visit after shared login B + logout: legacy A is not resurrected.
const late = planSupabaseCookieScope({
  hostname: "audiolad.ru",
  supabaseUrl: URL_,
  requestCookies: [{ name: KEY, value: "old-A" }],
  written: [],
});
assert.ok(!late.lines.some((l) => l.includes("old-A")));

// C4 B4: hidden legacy cookies (not sent in this request, e.g. Lax unsuffixed
// in the MAX iframe while shared chunks .0/.1 are sent) are expired too,
// before the marker ends the migration for this host.
const hidden = planSupabaseCookieScope({
  hostname: "max.audiolad.ru",
  supabaseUrl: URL_,
  requestCookies: [{ name: `${KEY}.0`, value: "B0" }, { name: `${KEY}.1`, value: "B1" }],
  written: [],
});
for (const n of [KEY, `${KEY}.0`, `${KEY}.1`, `${KEY}.9`, `${KEY}-code-verifier`, `${KEY}-user`, `${KEY}-user.2`]) {
  const l = hidden.lines.find((x) => x.startsWith(`${n}=;`));
  assert.ok(l && !l.includes("Domain=") && l.includes("Max-Age=0") && l.includes("SameSite=None") && l.includes("Secure"), `expire ${n}`);
}
const markerAt = hidden.lines.findIndex((l) => l.startsWith(`${SUPABASE_COOKIE_SCOPE_MARKER}=`));
assert.equal(markerAt, hidden.lines.length - 1, "marker set after all expiries");
assert.ok(new Set(hidden.lines.map((l) => l.split("=")[0])).size === hidden.lines.length, "no duplicate lines");

// C3 B1: real Host wins over client X-Forwarded-Host.
const H = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
assert.equal(hostnameFromHeaders(H({ host: "audiolad.ru", "x-forwarded-host": "localhost" })), "audiolad.ru");
assert.equal(hostnameFromHeaders(H({ host: "localhost:3000", "x-forwarded-host": "audiolad.ru" })), "localhost");
assert.equal(hostnameFromHeaders(H({ "x-forwarded-host": "business.audiolad.ru" })), "business.audiolad.ru");

// Marker present: only writes cause host-only expiry (refresh / logout).
const refresh = planSupabaseCookieScope({ // marker present
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
assert.ok(!both.some((l) => l.includes("stale")));
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
  assert.ok(setCookies.some((l) => l.startsWith(`${SUPABASE_COOKIE_SCOPE_MARKER}=`) && l.includes("SameSite=None") && l.includes("Secure")));

  // POST (server action) on subdomain with legacy cookies: also 307, never processed.
  const post = await updateSession(
    new NextRequest("http://127.0.0.1:3000/spa", {
      method: "POST",
      headers: { host: "business.audiolad.ru", cookie: `${KEY}=stale-B` },
      body: "x",
    }),
  );
  assert.equal(post.status, 307);

  // Apex legacy (e.g. logout POST): 307 with expiries only, request not processed.
  const apex = await updateSession(
    new NextRequest("http://127.0.0.1:3000/profile", {
      method: "POST",
      headers: { host: "audiolad.ru", "x-forwarded-host": "localhost", cookie: `${KEY}=base64-sess` },
      body: "x",
    }),
  );
  assert.equal(apex.status, 307, "spoofed X-Forwarded-Host does not skip migration");
  const apexCookies = apex.headers.getSetCookie();
  assert.ok(!apexCookies.some((l) => l.includes("base64-sess")));
  assert.ok(apexCookies.some((l) => l.startsWith(`${KEY}=;`) && !l.includes("Domain=") && l.includes("SameSite=None") && l.includes("Secure")));

  // Repeat after migration (marker sent, as in MAX iframe too): no 307 loop.
  // Dev host: never migrates.
  const dev = await updateSession(
    new NextRequest("http://localhost:3000/catalog", {
      headers: { host: "localhost:3000", cookie: `${KEY}=x` },
    }),
  ).catch(() => null);
  assert.ok(dev === null || dev.status !== 307, "dev not migrated");
  const marker = planSupabaseCookieScope({
    hostname: "business.audiolad.ru",
    supabaseUrl: URL_,
    requestCookies: [{ name: KEY, value: "d" }, { name: SUPABASE_COOKIE_SCOPE_MARKER, value: "d1" }],
    written: [],
  });
  assert.equal(marker.mode, "none", "no repeat 307 once marker present");
}

console.log("supabase-cookie-domain-unit: proxy ok");
