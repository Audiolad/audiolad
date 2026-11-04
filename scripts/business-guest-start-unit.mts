import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { handleBusinessGuestStart, type GuestStartDeps, type GuestStartUser } from "../src/lib/business-guest/start";
import { businessGuestStartConfig } from "../src/lib/business-guest/start-config";
import { guestNetworkKey } from "../src/lib/business-guest/network-key";
import { BUSINESS_GIFT_MS } from "../src/lib/business/plan";
import { BUSINESS_GUEST_START_COPY } from "../src/lib/business-guest/copy";
import { BUSINESS_OFFER_EDITION } from "../src/lib/business/offer";

const secret = randomBytes(32).toString("hex");
const config = businessGuestStartConfig({ AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED: "1", AUDIOLAD_BUSINESS_GUEST_NETWORK_HASH_SECRET: secret, NODE_ENV: "production" });
const idempotencyKey = "253821e0-0000-4000-8000-000000000003";
const payload = {
  accepted: true, idempotencyKey, userId: "untrusted-body-id",
  offerVersion: BUSINESS_OFFER_EDITION.version, offerHash: BUSINESS_OFFER_EDITION.contentHash,
};
const baseHeaders = { origin: "https://coffee.audiolad.ru", "sec-fetch-site": "same-origin", "content-type": "application/json" };
function request(body: unknown = payload, headers: Record<string, string> = baseHeaders, method = "POST") {
  return { method, headers: new Headers(headers), text: async () => JSON.stringify(body) };
}
function harness() {
  const calls = { auth: 0, reserve: 0, ticket: 0, bootstrap: 0, clear: 0, ready: 0, accept: 0, acceptedBy: [] as string[] };
  let user: GuestStartUser | null = null;
  let ready = false;
  let fail = "";
  const deps: GuestStartDeps = {
    config: { ...config }, networkHash: () => "a".repeat(64),
    currentUser: async () => user,
    ready: async () => { calls.ready++; return ready; },
    reserve: async () => { calls.reserve++; if (fail === "reserve") throw Error(); return fail !== "limit"; },
    ticket: async () => { calls.ticket++; if (fail === "ticket") throw Error(); return "private-ticket"; },
    signIn: async (ticket) => { calls.auth++; assert.equal(ticket, "private-ticket"); if (fail === "auth") throw Error(); user = { id: "auth-user-id", is_anonymous: true }; return user; },
    bootstrap: async (input) => {
      calls.bootstrap++;
      assert.equal(input.userId, user?.id);
      assert.notEqual(input.userId, payload.userId);
      assert.match(input.idempotencyHash, /^[a-f0-9]{64}$/);
      assert.notEqual(input.idempotencyHash, idempotencyKey);
      assert.equal(input.giftSeconds, BUSINESS_GIFT_MS / 1000);
      if (fail === "bootstrap") throw Error(); ready = true;
    },
    clearTicket: async () => { calls.clear++; if (fail === "clear") throw Error(); },
    acceptOffer: async (userId) => { calls.accept++; calls.acceptedBy.push(userId); if (fail === "accept") throw Error(); },
    log: (code) => assert.ok(["guest_start_failed", "guest_start_ticket_clear_failed", "guest_start_offer_accept_failed"].includes(code)),
  };
  return { deps, calls, setUser: (value: GuestStartUser) => { user = value; }, setReady: () => { ready = true; }, setFail: (value: string) => { fail = value; } };
}
async function rejected(req: ReturnType<typeof request>, status: number) {
  const h = harness(); const result = await handleBusinessGuestStart(req, h.deps);
  assert.equal(result.status, status); assert.equal(h.calls.auth, 0); assert.equal(h.calls.reserve, 0);
  assert.equal(result.headers["Cache-Control"], "no-store");
}
{
  const h = harness(); h.deps.config.enabled = false;
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 404); assert.equal(h.calls.auth, 0);
}
await rejected(request(payload, { ...baseHeaders, origin: "https://example.invalid" }), 403);
await rejected(request(payload, { ...baseHeaders, "sec-fetch-site": "cross-site" }), 403);
await rejected(request(payload, { ...baseHeaders, "content-type": "text/plain" }), 415);
await rejected(request({ ...payload, extra: "x".repeat(4097) }), 413);
await rejected(request(payload, { ...baseHeaders, "content-length": "5000" }), 413);
await rejected(request({ idempotencyKey }), 400);
await rejected(request({ ...payload, accepted: false }), 400);
await rejected(request({ ...payload, accepted: "true" }), 400);
await rejected(request({ ...payload, idempotencyKey: "invalid" }), 400);
await rejected(request({ ...payload, venueName: "x".repeat(121) }), 400);
// The checkbox accepts exactly the published offer edition; a stale page must be refreshed.
await rejected(request({ ...payload, offerVersion: undefined, offerHash: undefined }), 409);
await rejected(request({ ...payload, offerHash: "0".repeat(64) }), 409);
await rejected(request({ ...payload, offerVersion: "offer-v0" }), 409);
{
  const result = await handleBusinessGuestStart(request({ ...payload, offerHash: "0".repeat(64) }), harness().deps);
  assert.deepEqual(result.body, { ok: false, code: "offer_changed" });
}
await rejected(request(payload, baseHeaders, "GET"), 405);
await rejected(request(payload, { "content-type": "application/json" }), 403);
{
  const h = harness(); h.setUser({ id: "email-user" });
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).body.redirect, "/");
  assert.equal(h.calls.auth, 0); assert.equal(h.calls.reserve, 0); assert.equal(h.calls.bootstrap, 0);
}
{
  const h = harness(); h.setUser({ id: "existing-guest", is_anonymous: true }); h.setReady();
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 200);
  assert.equal(h.calls.auth, 0); assert.equal(h.calls.reserve, 0);
}
for (const [failure, status] of [["limit", 429], ["reserve", 503], ["auth", 503], ["ticket", 503]] as const) {
  const h = harness(); h.setFail(failure);
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, status);
  if (["limit", "reserve", "ticket"].includes(failure)) assert.equal(h.calls.auth, 0);
  assert.equal(h.calls.bootstrap, 0);
}
{
  const h = harness(); h.setFail("bootstrap");
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503);
  h.setFail("");
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 200);
  assert.equal(h.calls.auth, 1); assert.equal(h.calls.ticket, 1); assert.equal(h.calls.bootstrap, 2);
}
// Gift start saves the acceptance for the session user (never the body id), once per start.
{
  const h = harness();
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 200);
  assert.equal(h.calls.accept, 1); assert.deepEqual(h.calls.acceptedBy, ["auth-user-id"]);
}
{
  // Not saved: the start fails and is retried (bootstrap is idempotent), the cabinet never asks blindly.
  const h = harness(); h.setFail("accept");
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503);
  assert.equal(h.calls.clear, 0);
}
{
  // Already started or signed in: the tick is still recorded, best effort.
  const h = harness(); h.setUser({ id: "email-user" }); h.setFail("accept");
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 200);
  assert.deepEqual(h.calls.acceptedBy, ["email-user"]);
  const g = harness(); g.setUser({ id: "existing-guest", is_anonymous: true }); g.setReady();
  assert.equal((await handleBusinessGuestStart(request(), g.deps)).status, 200);
  assert.deepEqual(g.calls.acceptedBy, ["existing-guest"]);
}
assert.match(BUSINESS_GUEST_START_COPY.offerChanged, /Обновите страницу/);
for (const failure of ["", "clear"]) {
  const h = harness(); h.setFail(failure);
  const result = await handleBusinessGuestStart(request(), h.deps);
  assert.equal(result.status, 200); assert.deepEqual(result.body, { ok: true, redirect: "/" });
  for (const privateValue of ["private-ticket", "auth-user-id", "token", "ticket", "a".repeat(64)]) assert.ok(!JSON.stringify(result.body).includes(privateValue));
}
{
  const h = harness(); h.deps.config.available = false;
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503);
  assert.equal(h.calls.reserve, 0);
}
assert.equal(businessGuestStartConfig({}).available, false);
assert.equal(businessGuestStartConfig({ AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED: "1" }).available, false);
assert.equal(businessGuestStartConfig({ AUDIOLAD_BUSINESS_GUEST_NETWORK_HASH_SECRET: "short", AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED: "1" }).available, false);
assert.equal(businessGuestStartConfig({ AUDIOLAD_BUSINESS_GUEST_START_NETWORK_LIMIT: "2000" }).networkLimit, 1000);
assert.equal(businessGuestStartConfig({ AUDIOLAD_BUSINESS_GUEST_START_NETWORK_LIMIT: "-2" }).networkLimit, 1);
assert.equal(businessGuestStartConfig({ AUDIOLAD_BUSINESS_GUEST_START_NETWORK_LIMIT: "bad" }).networkLimit, 3);
assert.equal(businessGuestStartConfig({ AUDIOLAD_BUSINESS_GUEST_START_WINDOW_HOURS: "2000" }).windowSeconds, 48 * 3600);
assert.equal(businessGuestStartConfig({ AUDIOLAD_BUSINESS_GUEST_START_WINDOW_HOURS: "0" }).windowSeconds, 3600);
assert.equal(businessGuestStartConfig({}).windowSeconds, 86400);
const a = guestNetworkKey("2001:db8:abcd:1::1", secret);
assert.equal(a, guestNetworkKey("2001:0db8:abcd:0001:ffff::2", secret));
assert.notEqual(a, guestNetworkKey("2001:db8:abcd:2::1", secret));
assert.notEqual(guestNetworkKey("203.0.113.1", secret), guestNetworkKey("203.0.113.2", secret));
assert.equal(guestNetworkKey("::ffff:203.0.113.1", secret), guestNetworkKey("203.0.113.1", secret));
assert.match(a!, /^[a-f0-9]{64}$/); assert.ok(!a!.includes("2001:db8"));
assert.equal(guestNetworkKey("unknown", secret), null); assert.equal(guestNetworkKey("203.0.113.1", "short"), null);
{
  const h = harness();
  assert.equal((await handleBusinessGuestStart({ ...request(), text: async () => "{" }, h.deps)).status, 400);
  assert.equal((await handleBusinessGuestStart({ ...request(), text: async () => { throw Error(); } }, h.deps)).status, 400);
  assert.equal(h.calls.reserve, 0);
}
{
  const h = harness(); h.deps.networkHash = () => null;
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503); assert.equal(h.calls.auth, 0);
}
{
  const h = harness(); h.deps.currentUser = async () => { throw Error(); };
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503); assert.equal(h.calls.reserve, 0);
}
{
  const h = harness(); h.setUser({ id: "unfinished-guest", is_anonymous: true });
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 200);
  assert.equal(h.calls.bootstrap, 1); assert.equal(h.calls.auth, 0); assert.equal(h.calls.ticket, 0);
}
{
  const headers = { ...baseHeaders, origin: "http://localhost:3000" };
  await rejected(request(payload, headers), 403);
  const h = harness(); h.deps.config.production = false;
  assert.equal((await handleBusinessGuestStart(request(payload, headers), h.deps)).status, 200);
}
// Owner 02.11.2026: the pre-trial offer names 7 days only; the 3 grace days stay in the access logic.
assert.equal(
  BUSINESS_GUEST_START_COPY.terms,
  "7 дней бесплатно со всеми функциями. Дальше 799\u00a0₽ в месяц за одну точку, если решите продолжить. Без карты и автосписаний. Без регистрации – вход можно привязать позже.",
);
assert.doesNotMatch(BUSINESS_GUEST_START_COPY.terms, /льготн|grace|3 дня|10 дней/u);
console.log("business-guest-start-unit: ok");
