// t1442u: «Вход в кабинет» email brand/link follows the site the visitor is on.
import assert from "node:assert/strict";
process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";
const { businessLoginEmailSite } = await import("../src/lib/email/business-login-email-site");
const { publicHostnameFromHeaders, hostnameFromHeaders, isLoopbackHostHeader } = await import("../src/lib/supabase/cookie-domain");
const { isLoopbackHostHeader: proxyLoopback } = await import("../src/lib/business-app/proxy-hostname");

const h = (o: Record<string, string>) => new Headers(o);

// Root cause: server action on a rewritten coffee page = internal request with Host: localhost.
const rewrittenCoffee = h({ host: "localhost:3000", "x-forwarded-host": "coffee.audiolad.ru" });
assert.equal(hostnameFromHeaders(rewrittenCoffee), "localhost", "cookie scope helper unchanged");
assert.equal(publicHostnameFromHeaders(rewrittenCoffee), "coffee.audiolad.ru");

const coffee = { coffee: true, brand: "АудиоЛад Кофейня", authOrigin: "https://coffee.audiolad.ru", next: "/cabinet" };
for (const headers of [
  rewrittenCoffee,                                                    // profile server action
  h({ host: "127.0.0.1:3000", "x-forwarded-host": "COFFEE.audiolad.ru" }),
  h({ host: "[::1]:3000", "x-forwarded-host": "coffee.audiolad.ru, other" }),
  h({ host: "coffee.audiolad.ru", "x-forwarded-host": "coffee.audiolad.ru" }), // checkout API (pass-through)
  h({ host: "coffee.audiolad.ru" }),
]) assert.deepEqual(businessLoginEmailSite(headers), coffee);

const business = businessLoginEmailSite(h({ host: "localhost:3000", "x-forwarded-host": "business.audiolad.ru" }));
assert.equal(business.coffee, false);
assert.equal(business.brand, "АудиоЛад Бизнес");
assert.equal(business.authOrigin, "https://audiolad.ru");
assert.notEqual(business.next, "/cabinet");
assert.deepEqual(businessLoginEmailSite(h({ host: "business.audiolad.ru" })), business);

// A real public Host still wins over a client-supplied forwarded host.
assert.deepEqual(businessLoginEmailSite(h({ host: "business.audiolad.ru", "x-forwarded-host": "coffee.audiolad.ru" })), business);
assert.equal(publicHostnameFromHeaders(h({ host: "audiolad.ru", "x-forwarded-host": "coffee.audiolad.ru" })), "audiolad.ru");
// Loopback without forwarded host stays loopback (local dev).
assert.equal(publicHostnameFromHeaders(h({ host: "localhost:3000" })), "localhost");

for (const v of ["localhost", "localhost:3000", "127.0.0.1:3000", "[::1]:3000", "::1"]) { assert.ok(isLoopbackHostHeader(v)); assert.ok(proxyLoopback(v)); }
for (const v of ["", null, "coffee.audiolad.ru", "localhost.evil.ru"]) assert.ok(!isLoopbackHostHeader(v));

// Flag OFF: never coffee.
process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "0";
assert.equal(businessLoginEmailSite(rewrittenCoffee).brand, "АудиоЛад Бизнес");

// Senders must take the resolved site, not a raw Host-derived hostname.
const { readFileSync } = await import("node:fs");
const profile = readFileSync("src/app/business-app/profile/actions.ts", "utf8");
const checkout = readFileSync("src/app/api/business/subscription/checkout/route.ts", "utf8");
const sender = readFileSync("src/lib/email/send-business-login-email.ts", "utf8");
assert.match(profile, /const site = businessLoginEmailSite\(await headers\(\)\);\s*after\(\(\) => sendBusinessLoginEmail\(receiptEmail, site, user\.id\)\)/);
assert.match(checkout, /const site = businessLoginEmailSite\(request\.headers\);\s*after\(\(\) => sendBusinessLoginEmail\(customerEmail, site, user\.id\)\)/);
assert.doesNotMatch(sender, /isCoffeeHostname|hostname: string/);
assert.match(readFileSync("src/app/(platform)/auth/forgot-password/actions.ts", "utf8"), /buildPasswordRecoveryRedirectUrl\(input\.next, publicHostnameFromHeaders\(await headers\(\)\)\)/);
console.log("business-login-email-site-unit: ok");
