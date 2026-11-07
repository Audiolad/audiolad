import assert from "node:assert/strict";
import { isVenueTimezone } from "../src/lib/business-app/venue-timezones";
import { randomBytes } from "node:crypto";
import { handleBusinessGuestStart, type GuestStartDeps, type GuestStartUser } from "../src/lib/business-guest/start";
import { businessGuestStartConfig } from "../src/lib/business-guest/start-config";
import { guestNetworkKey } from "../src/lib/business-guest/network-key";
import { BUSINESS_GIFT_MS } from "../src/lib/business/plan";
import { BUSINESS_GUEST_START_COPY } from "../src/lib/business-guest/copy";
import { BUSINESS_OFFER_EDITION } from "../src/lib/business/offer";
import { GUEST_START_REDIRECTS } from "../src/lib/business-guest/redirects";
import { readFileSync } from "node:fs";

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
  const calls = { auth: 0, reserve: 0, ticket: 0, bootstrap: 0, clear: 0, ready: 0, accept: 0, acceptedBy: [] as string[], logs: [] as string[], timezones: [] as (string | null)[] };
  let user: GuestStartUser | null = null;
  let ready = false;
  let fail = "";
  let notParty = false;
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
      calls.timezones.push(input.timezone ?? null);
      if (fail === "bootstrap") throw Error(); ready = true;
    },
    clearTicket: async () => { calls.clear++; if (fail === "clear") throw Error(); },
    acceptOffer: async (userId) => {
      calls.accept++; if (notParty) return "not_party";
      calls.acceptedBy.push(userId); if (fail === "accept") throw Error();
      return "recorded";
    },
    log: (code) => { calls.logs.push(code); assert.ok(["guest_start_failed", "guest_start_ticket_clear_failed", "guest_start_offer_accept_failed", "guest_start_offer_not_party"].includes(code)); },
  };
  return { deps, calls, setNotParty: () => { notParty = true; }, setUser: (value: GuestStartUser) => { user = value; }, setReady: () => { ready = true; }, setFail: (value: string) => { fail = value; } };
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
// Venue zone from the browser: only one of the 11 ids reaches bootstrap; anything else is dropped (Moscow).
for (const [sent, expected] of [["Asia/Vladivostok", "Asia/Vladivostok"], ["Asia/Krasnoyarsk", null], ["'; drop", null], [42, null], [undefined, null]] as const) {
  const h = harness();
  assert.equal((await handleBusinessGuestStart(request({ ...payload, timezone: sent }), h.deps)).status, 200);
  assert.deepEqual(h.calls.timezones, [expected], String(sent));
}
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
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).body.redirect, "/auth/business-return?site=coffee");
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
  // Already signed in: a failed save is reported, never a silent success; the retry records it.
  const h = harness(); h.setUser({ id: "email-user" }); h.setFail("accept");
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503);
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503);
  h.setFail("");
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 200);
  assert.deepEqual(h.calls.acceptedBy, ["email-user", "email-user", "email-user"]);
  assert.equal(h.calls.bootstrap, 0);
}
{
  // Ready guest (gift already started): same, repeated failures then recovery.
  const g = harness(); g.setUser({ id: "existing-guest", is_anonymous: true }); g.setReady(); g.setFail("accept");
  assert.equal((await handleBusinessGuestStart(request(), g.deps)).status, 503);
  assert.equal((await handleBusinessGuestStart(request(), g.deps)).status, 503);
  g.setFail("");
  assert.equal((await handleBusinessGuestStart(request(), g.deps)).status, 200);
  assert.deepEqual(g.calls.acceptedBy, ["existing-guest", "existing-guest", "existing-guest"]);
  assert.equal(g.calls.bootstrap, 0);
}
{
  // New guest: bootstrap succeeds, acceptance fails twice, the third retry records it.
  const h = harness(); h.setFail("accept");
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503);
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503);
  h.setFail("");
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 200);
  assert.equal(h.calls.accept, 3);
}
{
  // Registered account (with or without an organization): the checkbox is stored for the
  // session account and the start goes on to /auth/business-return, which issues the email gift
  // once and opens onboarding or the workspace. "/" looped back to the gift block (P0 04.11).
  const h = harness(); h.setUser({ id: "email-user-no-org" });
  const result = await handleBusinessGuestStart(request(), h.deps);
  assert.equal(result.status, 200); assert.equal(result.body.redirect, "/auth/business-return?site=coffee");
  assert.notEqual(result.body.redirect, "/");
  assert.ok(GUEST_START_REDIRECTS.includes(result.body.redirect!));
  const b = harness(); b.setUser({ id: "email-user-business-host" });
  const onBusiness = await handleBusinessGuestStart(request(payload, { ...baseHeaders, origin: "https://business.audiolad.ru" }), b.deps);
  assert.equal(onBusiness.status, 200); assert.equal(onBusiness.body.redirect, "https://audiolad.ru/auth/business-return");
  assert.ok(GUEST_START_REDIRECTS.includes(onBusiness.body.redirect!));
  assert.deepEqual(h.calls.acceptedBy, ["email-user-no-org"]);
  assert.equal(h.calls.bootstrap, 0); assert.equal(h.calls.reserve, 0); assert.deepEqual(h.calls.logs, []);
}
{
  // Signed-in manager of another owner's organization: not the Client, nothing to store;
  // the start goes on to the cabinet instead of failing forever.
  const h = harness(); h.setUser({ id: "manager-user" }); h.setNotParty();
  const result = await handleBusinessGuestStart(request(), h.deps);
  assert.equal(result.status, 200); assert.equal(result.body.redirect, "/cabinet");
  assert.equal(h.calls.accept, 1); assert.deepEqual(h.calls.acceptedBy, []);
  assert.deepEqual(h.calls.logs, ["guest_start_offer_not_party"]);
  assert.equal(h.calls.bootstrap, 0); assert.equal(h.calls.reserve, 0);
}
{
  // Guest paths own the gift point: "not_party" there is a failure, never a silent skip.
  const g = harness(); g.setUser({ id: "existing-guest", is_anonymous: true }); g.setReady(); g.setNotParty();
  assert.equal((await handleBusinessGuestStart(request(), g.deps)).status, 503);
  const h = harness(); h.setNotParty();
  assert.equal((await handleBusinessGuestStart(request(), h.deps)).status, 503);
  assert.equal(h.calls.bootstrap, 1); assert.equal(h.calls.clear, 0);
}
{
  // After the start the guest lands on the owner home: /cabinet on coffee, "/" on business.
  const h = harness();
  const onBusiness = await handleBusinessGuestStart(request(payload, { ...baseHeaders, origin: "https://business.audiolad.ru" }), h.deps);
  assert.equal(onBusiness.status, 200); assert.deepEqual(onBusiness.body, { ok: true, redirect: "/" });
  assert.ok(GUEST_START_REDIRECTS.includes("/")); assert.ok(GUEST_START_REDIRECTS.includes("/cabinet"));
}
assert.match(BUSINESS_GUEST_START_COPY.offerChanged, /Обновите страницу/);
for (const failure of ["", "clear"]) {
  const h = harness(); h.setFail(failure);
  const result = await handleBusinessGuestStart(request(), h.deps);
  assert.equal(result.status, 200); assert.deepEqual(result.body, { ok: true, redirect: "/cabinet" });
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
  "7 дней бесплатно со всеми функциями. Дальше 799\u00a0₽ за 30 дней за одну точку, если решите продолжить. Без карты и автосписаний. Без регистрации – вход можно привязать позже.",
);
assert.doesNotMatch(BUSINESS_GUEST_START_COPY.terms, /льготн|grace|3 дня|10 дней/u);
console.log("business-guest-start-unit: ok");
{
  // The CTA follows every redirect the start answers with, and only those.
  const cta = readFileSync(new URL("../src/components/business-app/BusinessGuestStartCta.tsx", import.meta.url), "utf8");
  const request = readFileSync(new URL("../src/lib/business-guest/start-request.ts", import.meta.url), "utf8");
  assert.match(request, /GUEST_START_REDIRECTS\.includes\(result\.redirect\)/);
  assert.match(cta, /requestGuestStart\(/, "the CTA goes through the bounded request");
  assert.doesNotMatch(cta, /await fetch\(/, "no unbounded fetch in the CTA");
  assert.doesNotMatch(cta, /result\.redirect === "\/"/);
  assert.doesNotMatch(cta, /business-guest\/start"/, "client bundle must not import node:crypto start.ts");
}

{
  // P0 04.11: the start button must never stay «Запускаем кабинет…» forever.
  const { requestGuestStart, GUEST_START_TIMEOUT_MS } = await import("../src/lib/business-guest/start-request");
  const { BUSINESS_GUEST_START_COPY: c } = await import("../src/lib/business-guest/copy");
  assert.ok(GUEST_START_TIMEOUT_MS >= 10_000 && GUEST_START_TIMEOUT_MS <= 30_000);
  const json = (status: number, body: unknown) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const t0 = Date.now();
  // Fetch that never settles and ignores the abort signal (dead mobile connection).
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: () => new Promise(() => {}), timeoutMs: 50 }), { kind: "error", message: c.timeout });
  // Fetch that honours the signal.
  let aborted = false;
  assert.deepEqual(await requestGuestStart({}, { timeoutMs: 50, fetchImpl: (_u, init) => new Promise((_, reject) => { init.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("AbortError")); }); }) }), { kind: "error", message: c.timeout });
  assert.ok(aborted, "the request is aborted on timeout");
  // Headers arrive, body never does.
  assert.deepEqual(await requestGuestStart({}, { timeoutMs: 50, fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) }), { kind: "error", message: c.timeout });
  assert.ok(Date.now() - t0 < 2000, "timeouts settle promptly");
  assert.deepEqual(await requestGuestStart({}, { online: false, fetchImpl: () => { throw new Error("must not send offline"); } }), { kind: "error", message: c.offline });
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }), { kind: "error", message: c.failed });
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError("html"); } }) }), { kind: "error", message: c.failed });
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: json(429, { ok: false }) }), { kind: "error", message: c.limit });
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: json(409, { ok: false, code: "offer_changed" }) }), { kind: "error", message: c.offerChanged });
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: json(200, { ok: true, redirect: "/auth/business-return?site=coffee" }) }), { kind: "redirect", url: "/auth/business-return?site=coffee" });
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: json(200, { ok: true, redirect: "/" }) }), { kind: "redirect", url: "/" });
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: json(200, { ok: true, redirect: "/cabinet" }) }), { kind: "redirect", url: "/cabinet" });
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: json(200, { ok: true, redirect: "/cabinet/evil" }) }), { kind: "error", message: c.failed });
  assert.deepEqual(await requestGuestStart({}, { fetchImpl: json(200, { ok: true, redirect: "https://evil.example/" }) }), { kind: "error", message: c.failed });
  // Request shape is unchanged: same endpoint, JSON body, same-origin cookies.
  let seen: { url: string; init: RequestInit } | null = null;
  await requestGuestStart({ accepted: true, idempotencyKey: "k" }, { fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ ok: true, redirect: "/" }) }; } });
  assert.equal(seen!.url, "/api/business/guest-start");
  assert.equal(seen!.init.method, "POST");
  assert.equal(seen!.init.credentials, "same-origin");
  const sent = JSON.parse(String(seen!.init.body));
  assert.deepEqual({ ...sent, timezone: undefined }, { accepted: true, idempotencyKey: "k", timezone: undefined });
  assert.equal(isVenueTimezone(sent.timezone), true, "the browser zone mapped to a venue zone goes with the start");
  for (const text of [c.timeout, c.offline, c.retry]) assert.doesNotMatch(text, /—|-/u, "en dash only in user copy");
  console.log("business-guest-start-request-unit: ok");
}

{
  // Sergey 07.11.2026: after the start the guest music keeps playing on the home.
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const { guestStartClientNavigation } = await import("../src/components/business-app/BusinessGuestStartCta");
  assert.equal(guestStartClientNavigation("/cabinet"), "push");
  assert.equal(guestStartClientNavigation("/"), "push");
  assert.equal(guestStartClientNavigation("/auth/business-return?site=coffee"), "assign");
  assert.equal(guestStartClientNavigation("https://audiolad.ru/auth/business-return"), "assign");
  const cta = read("src/components/business-app/BusinessGuestStartCta.tsx");
  assert.match(cta, /router\.push\(outcome\.url\);\n\s*router\.refresh\(\);/);
  assert.match(cta, /else \{\n\s*window\.location\.assign\(outcome\.url\);/);
  // The studio no longer owns the <audio>: unmounting it never pauses or disposes the music.
  const studio = read("src/components/business-app/sound/BusinessSoundStudio.tsx");
  assert.doesNotMatch(studio, /<audio|\.dispose\(\)|new Controller|new FadingAudio|\.pause\(\)/);
  assert.match(studio, /useEffect\(\(\) => attachStudio\(\), \[attachStudio\]\)/);
  const playback = read("src/components/business-app/sound/BusinessGuestPlayback.tsx");
  assert.equal((playback.match(/<audio /g) ?? []).length, 1);
  assert.match(playback, /return \(\) => setStudios\(\(n\) => n - 1\);/, "detaching the page only moves the bar");
  assert.match(read("src/components/business-app/BusinessAppShell.tsx"), /<BusinessGuestPlaybackProvider initialLimit=\{initialGuestLimit \?\? "ok"\}>/);
  const { showGuestShellBar } = await import("../src/components/business-app/sound/BusinessGuestPlayback");
  const meta = { title: "Трек", coverSrc: null, duration: 120 };
  assert.equal(showGuestShellBar({ studioMounted: false, meta, current: {}, dismissed: false, status: "playing" }), true);
  assert.equal(showGuestShellBar({ studioMounted: true, meta, current: {}, dismissed: false, status: "playing" }), false);
  assert.equal(showGuestShellBar({ studioMounted: false, meta, current: {}, dismissed: true, status: "playing" }), false);
  assert.equal(showGuestShellBar({ studioMounted: false, meta, current: {}, dismissed: false, status: "idle" }), false);
  console.log("# business-guest-start-music-unit: ok");
}

{
  // Sergey 07.11.2026: after «Начать бесплатно» the home opens and the guest music keeps playing.
  const { guestStartClientNavigation } = await import("../src/components/business-app/BusinessGuestStartCta");
  assert.equal(guestStartClientNavigation("/cabinet"), "push", "coffee home: client move, music goes on");
  assert.equal(guestStartClientNavigation("/"), "push", "business home: client move");
  assert.equal(guestStartClientNavigation("/auth/business-return?site=coffee"), "assign", "registered gift path: full load");
  assert.equal(guestStartClientNavigation("https://audiolad.ru/auth/business-return"), "assign", "cross-origin: full load");
  for (const url of GUEST_START_REDIRECTS) assert.ok(["push", "assign"].includes(guestStartClientNavigation(url)));
  const cta = readFileSync(new URL("../src/components/business-app/BusinessGuestStartCta.tsx", import.meta.url), "utf8");
  assert.match(cta, /from "next\/navigation"/);
  assert.match(cta, /=== "push"\) \{\s*(?:\/\/.*\n\s*)*router\.push\(outcome\.url\);\s*router\.refresh\(\);\s*\} else \{\s*window\.location\.assign\(outcome\.url\);/);
  assert.equal((cta.match(/window\.location\.assign\(/g) ?? []).length, 1, "assign only on the full-load branch");

  // The same <audio> lives in the shell provider; leaving the music page never pauses or disposes it.
  const { showGuestShellBar } = await import("../src/components/business-app/sound/BusinessGuestPlayback");
  const studio = readFileSync(new URL("../src/components/business-app/sound/BusinessSoundStudio.tsx", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../src/components/business-app/sound/BusinessGuestPlayback.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/components/business-app/BusinessAppShell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(studio, /<audio\b/, "no second element on the music page");
  assert.doesNotMatch(studio, /\.dispose\(\)|\.pause\(\)|new Controller\(|new FadingAudio\(/, "the music page owns no playback to tear down");
  assert.match(studio, /useBusinessGuestPlayback\(\)/);
  assert.match(studio, /useEffect\(\(\) => attachStudio\(\), \[attachStudio\]\)/);
  const attach = provider.slice(provider.indexOf("const attachStudio"), provider.indexOf("const value = useMemo"));
  assert.doesNotMatch(attach, /dispose|pause|toggle|removeAttribute/, "detaching the page only moves the bar");
  assert.match(provider, /\{children\}[\s\S]*<audio ref=\{audioRef\}/, "the element sits outside the routed page");
  assert.match(shell, /<BusinessGuestPlaybackProvider[^>]*>[\s\S]*\{children\}[\s\S]*<BusinessBottomNav \/>\s*<\/BusinessGuestPlaybackProvider>/);
  // Home after the start: the page is gone, music plays → the shell draws the familiar bar.
  const playing = { studioMounted: false, meta: { title: "Трек", coverSrc: null, duration: 120 }, current: { audioItemId: "a" }, dismissed: false, status: "playing" as const };
  assert.equal(showGuestShellBar(playing), true);
  assert.equal(showGuestShellBar({ ...playing, studioMounted: true }), false, "music page draws its own bar, never two");
  assert.equal(showGuestShellBar({ ...playing, dismissed: true }), false, "closed bar stays closed");
  assert.equal(showGuestShellBar({ ...playing, status: "idle" }), false);
  console.log("business-guest-start-music-keep-unit: ok");
}
