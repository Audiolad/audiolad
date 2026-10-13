import assert from "node:assert/strict";

import {
  buildSupabaseCookieScopeHeaders,
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
  buildSupabaseCookieScopeHeaders({
    hostname: "localhost",
    supabaseUrl: URL_,
    requestCookies: [{ name: KEY, value: "x" }],
    written: [{ name: KEY, value: "y", options: {} }],
    secure: false,
  }),
  [],
);

// Legacy migration: re-issue with Domain, expire host-only, set marker.
const legacy = buildSupabaseCookieScopeHeaders({
  hostname: "audiolad.ru",
  supabaseUrl: URL_,
  requestCookies: [
    { name: `${KEY}.0`, value: "base64-aaa" },
    { name: `${KEY}.1`, value: "bbb" },
    { name: "other", value: "z" },
  ],
  written: [],
  secure: true,
});
const expiry = (n: string) =>
  legacy.find((l) => l.startsWith(`${n}=;`) && !l.includes("Domain=") && l.includes("Max-Age=0"));
assert.ok(expiry(`${KEY}.0`) && expiry(`${KEY}.1`), "host-only expired");
assert.ok(legacy.some((l) => l.startsWith(`${KEY}.0=base64-aaa;`) && l.includes("Domain=.audiolad.ru") && l.includes("Secure")));
assert.ok(legacy.some((l) => l.startsWith(`${SUPABASE_COOKIE_SCOPE_MARKER}=`) && l.includes("Domain=.audiolad.ru")));
assert.ok(!legacy.some((l) => l.startsWith("other=")), "non-auth cookies untouched");

// Marker present: only writes cause host-only expiry (refresh / logout).
const refresh = buildSupabaseCookieScopeHeaders({
  hostname: "business.audiolad.ru",
  supabaseUrl: URL_,
  requestCookies: [{ name: KEY, value: "old" }, { name: SUPABASE_COOKIE_SCOPE_MARKER, value: "d1" }],
  written: [
    { name: KEY, value: "", options: { domain: ".audiolad.ru", maxAge: 0 } },
    { name: "unrelated", value: "1", options: {} },
  ],
  secure: true,
});
assert.equal(refresh.length, 1);
assert.match(refresh[0]!, new RegExp(`^${KEY}=; Max-Age=0; Path=/`));
assert.ok(!refresh[0]!.includes("Domain="));

// Migration + simultaneous write: written value wins (no re-issue of stale value).
const both = buildSupabaseCookieScopeHeaders({
  hostname: "audiolad.ru",
  supabaseUrl: URL_,
  requestCookies: [{ name: KEY, value: "stale" }],
  written: [{ name: KEY, value: "fresh", options: { domain: ".audiolad.ru" } }],
  secure: true,
});
assert.ok(!both.some((l) => l.startsWith(`${KEY}=stale`)));
assert.equal(both.filter((l) => l.startsWith(`${KEY}=;`)).length, 1);

// Duplicate-name parse: last (newest) wins.
assert.deepEqual(parseCookieHeader("a=1; b=2; a=3"), [{ name: "a", value: "3" }, { name: "b", value: "2" }]);

// 404 link.
assert.equal(resolveNotFoundCatalogHref("business.audiolad.ru"), "https://audiolad.ru/catalog");
assert.equal(resolveNotFoundCatalogHref("audiolad.ru"), "/catalog");

console.log("supabase-cookie-domain-unit: ok");
