#!/usr/bin/env -S npx tsx
/**
 * a8240527 — AudioLad Business guest coffee cabinet (https://business.audiolad.ru/guest/coffee).
 * Routing, curated shelf, server-side 30-minute limit gate, reused Business player controller,
 * migration contract, and (with an explicit disposable database only) real PostgreSQL scenarios.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  BUSINESS_GUEST_COFFEE_INTERNAL_PATH,
  BUSINESS_GUEST_COFFEE_PUBLIC_PATH,
  BUSINESS_GUEST_COFFEE_URL,
  isBusinessGuestPathname,
} from "../src/lib/business-app/host";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DIRECTIONS,
  GUEST_COFFEE_SHELF,
  findGuestCoffeeTrack,
  guestCoffeePlaylistMinutes,
  selectGuestCoffeePlaylists,
  type GuestCoffeePlaylist,
} from "../src/lib/business-app/guest-coffee/catalog";
import { buildGuestCoffeeShelf } from "../src/lib/business-app/guest-coffee/shelf";
import {
  GUEST_COFFEE_LIMIT_SECONDS,
  GUEST_COFFEE_MIN_LEASE_CHARGE_SECONDS,
  GUEST_COFFEE_NETWORK_LIMIT_SECONDS,
  GUEST_COFFEE_WARN_AFTER_SECONDS,
  GuestCoffeePlaybackMeter,
  clampGuestCoffeeCredit,
  guestCoffeeLimitState,
} from "../src/lib/business-app/guest-coffee/limit";
import {
  createGuestCoffeeToken,
  guestCoffeeCookieOptions,
  guestCoffeeNetworkHash,
  guestCoffeeNetworkKey,
  hashGuestCoffeeToken,
  isGuestCoffeeToken,
} from "../src/lib/business-app/guest-coffee/identity";
import { guestCoffeeLeaseSeconds, handleGuestCoffeeTrackUrl, handleGuestCoffeeUsage } from "../src/lib/business-app/guest-coffee/routes";
import { SpaOnlinePlayer } from "../src/lib/business-app/spa-online-player";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ---------------------------------------------------------------- routing (permanent URL)
assert.equal(BUSINESS_GUEST_COFFEE_URL, "https://business.audiolad.ru/guest/coffee", "URL printed in the PDF atlas never changes");
assert.equal(BUSINESS_GUEST_COFFEE_PUBLIC_PATH, "/guest/coffee");
assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", "/guest/coffee"), {
  action: "rewrite_business_app",
  pathname: "/business-app/guest/coffee",
});
assert.equal(BUSINESS_GUEST_COFFEE_INTERNAL_PATH, "/business-app/guest/coffee");
assert.equal(resolveBusinessProxyAction("business.audiolad.ru", "/business-app/guest/coffee").action, "pass_through");
assert.equal(resolveBusinessProxyAction("audiolad.ru", "/business-app/guest/coffee").action, "not_found", "no apex duplicate");
assert.equal(resolveBusinessProxyAction("business.audiolad.ru", "/guest").action, "not_found", "only the exact path exists");
assert.equal(resolveBusinessProxyAction("business.audiolad.ru", "/guest/coffee/x").action, "not_found");
for (const api of ["/api/business/guest/coffee/track-url", "/api/business/guest/coffee/usage"]) {
  assert.equal(resolveBusinessProxyAction("business.audiolad.ru", api).action, "pass_through", `${api} reachable on business host`);
}
assert.equal(resolveBusinessProxyAction("business.audiolad.ru", "/api/catalog/play").action, "not_found", "no new platform API exposed");
assert.equal(isBusinessGuestPathname("/guest/coffee"), true);
assert.equal(isBusinessGuestPathname("/business-app/guest/coffee"), true);
assert.equal(isBusinessGuestPathname("/"), false);
assert.equal(isBusinessGuestPathname("/player"), false);
const shell = read("src/components/business-app/BusinessAppShell.tsx");
assert.match(shell, /isBusinessGuestPathname\(pathname\)/, "guest path renders without owner sidebar/bottom nav");
const page = read("src/app/business-app/guest/coffee/page.tsx");
assert.match(page, /loadGuestCoffeeShelf/);
assert.doesNotMatch(page, /notFound\(/, "no login / allowlist gate: guests land straight in the cabinet");

// ---------------------------------------------------------------- curated shelf
const keys = GUEST_COFFEE_SHELF.map((r) => `${r.authorSlug}/${r.productSlug}`);
assert.equal(new Set(keys).size, keys.length, "no duplicate shelf entries");
const directionIds = new Set(GUEST_COFFEE_DIRECTIONS.map((d) => d.id));
const characterIds = new Set(GUEST_COFFEE_CHARACTERS.map((c) => c.id));
for (const ref of GUEST_COFFEE_SHELF) {
  assert.match(ref.authorSlug, /^[a-z0-9-]+$/);
  assert.match(ref.productSlug, /^[a-z0-9-]+$/);
  assert.ok(directionIds.has(ref.direction));
  assert.ok(ref.characters.length > 0 && ref.characters.every((c) => characterIds.has(c)));
}
for (const d of GUEST_COFFEE_DIRECTIONS) {
  assert.ok(GUEST_COFFEE_SHELF.some((r) => r.direction === d.id), `direction ${d.id} has at least one album`);
}
assert.deepEqual(GUEST_COFFEE_DAYPARTS.map((d) => d.id), ["morning", "day", "evening", "allday"]);

const pl = (id: string, direction: GuestCoffeePlaylist["direction"], dayparts: GuestCoffeePlaylist["dayparts"], characters: GuestCoffeePlaylist["characters"], tracks = 3): GuestCoffeePlaylist => ({
  id, authorSlug: "a", productSlug: id, title: id, authorName: null, href: `/practice/a/${id}`, coverUrl: null, coverImage: null,
  updatedAt: null, format: null, direction, dayparts, characters,
  tracks: Array.from({ length: tracks }, (_, i) => ({ audioItemId: `${id}-t${i}`, title: `${id} ${i}`, durationSeconds: 120 })),
});
const sample = [
  pl("j-morning", "jazz", ["morning"], ["city"]),
  pl("j-evening", "jazz", ["evening"], ["evening"]),
  pl("j-all", "jazz", "allday", ["cozy"]),
  pl("b-all", "bossa", "allday", ["cozy", "city"]),
];
let sel = selectGuestCoffeePlaylists(sample, { character: "evening", direction: "jazz", daypart: "evening" });
assert.equal(sel.playlists[0].id, "j-evening", "daypart + character win");
assert.ok(sel.playlists.every((p) => p.direction === "jazz"), "only the chosen direction when it exists");
assert.equal(sel.directionFallback, false);
sel = selectGuestCoffeePlaylists(sample, { character: "city", direction: "jazz", daypart: "morning" });
assert.equal(sel.playlists[0].id, "j-morning");
sel = selectGuestCoffeePlaylists(sample, { character: "cozy", direction: "jazz", daypart: "allday" });
assert.equal(sel.playlists[0].id, "j-all");
sel = selectGuestCoffeePlaylists(sample.filter((p) => p.direction !== "sax"), { character: "cozy", direction: "sax", daypart: "day" });
assert.equal(sel.directionFallback, true, "honest fallback when a direction has no albums");
assert.equal(selectGuestCoffeePlaylists([], { character: "cozy", direction: "jazz", daypart: "day" }).playlists.length, 0);
assert.equal(guestCoffeePlaylistMinutes(sample[0]), 6);
assert.equal(findGuestCoffeeTrack(sample, "b-all-t1")?.playlist.id, "b-all");
assert.equal(findGuestCoffeeTrack(sample, "nope"), null);

// shelf builder: only FREE published albums the existing loader can play in full
{
  const products = [
    { id: "p1", title: "Free jazz", slug: "dzhazovaya-muzyka-dlya-kofeen", authorSlug: "teplyy-takt", href: "/x", coverUrl: null, isFree: true, audioCount: 7 },
    { id: "p2", title: "Paid", slug: "muzyka-dlya-kofeyni-dzhaz", authorSlug: "teplyy-takt", href: "/y", coverUrl: null, isFree: false, audioCount: 7 },
    { id: "p3", title: "Preview only", slug: "uyutnaya-muzyka-kofeyni", authorSlug: "teplyy-takt", href: "/z", coverUrl: null, isFree: true, audioCount: 7 },
    { id: "p4", title: "Not on shelf", slug: "something", authorSlug: "someone", href: "/w", coverUrl: null, isFree: true, audioCount: 3 },
  ];
  const calls: string[] = [];
  const shelf = await buildGuestCoffeeShelf({
    loadPublishedProducts: async () => products,
    loadFullTracks: async ({ productSlug }) => {
      calls.push(productSlug);
      if (productSlug === "uyutnaya-muzyka-kofeyni") return null;
      return [{ audioItemId: "t1", title: "Track 1", durationSeconds: 200 }];
    },
  });
  assert.deepEqual(shelf.map((p) => p.id), ["p1"], "paid, preview-only and unknown albums are dropped");
  assert.ok(!calls.includes("muzyka-dlya-kofeyni-dzhaz"), "paid album is never even loaded");
  assert.equal(shelf[0].direction, "jazz");
  assert.deepEqual(
    await buildGuestCoffeeShelf({ loadPublishedProducts: async () => { throw new Error("down"); }, loadFullTracks: async () => [] }),
    [],
    "catalogue failure → empty shelf (honest empty state), never fake tracks",
  );
  assert.deepEqual(
    await buildGuestCoffeeShelf({ loadPublishedProducts: async () => products, loadFullTracks: async () => { throw new Error("x"); } }),
    [],
  );
}

// ---------------------------------------------------------------- limit (actual playback)
assert.equal(GUEST_COFFEE_LIMIT_SECONDS, 1800, "30 minutes");
assert.ok(GUEST_COFFEE_WARN_AFTER_SECONDS < GUEST_COFFEE_LIMIT_SECONDS);
assert.equal(guestCoffeeLimitState(0), "ok");
assert.equal(guestCoffeeLimitState(GUEST_COFFEE_WARN_AFTER_SECONDS), "near_end");
assert.equal(guestCoffeeLimitState(1799), "near_end");
assert.equal(guestCoffeeLimitState(1800), "exhausted");
assert.equal(guestCoffeeLimitState(null), "unavailable", "DB unavailable → fail closed");
assert.equal(clampGuestCoffeeCredit(15.7), 15);
assert.equal(clampGuestCoffeeCredit(1000), 60);
assert.equal(clampGuestCoffeeCredit(-1), null);
assert.equal(clampGuestCoffeeCredit("15"), null);
{
  const m = new GuestCoffeePlaybackMeter();
  m.sample(0, true);
  m.sample(1, true);
  m.sample(2, true);
  m.sample(40, true); // seek jump: not counted
  m.sample(41, true);
  m.sample(41.5, false); // paused: not counted
  m.sample(80, true);
  m.sample(80.5, true);
  assert.equal(Math.round(m.pendingSeconds * 10) / 10, 3.5, "only real forward playback counts");
  assert.equal(m.take(), 3);
  m.restore(3);
  assert.equal(m.take(2), 2);
  m.reanchor();
  m.sample(100, true);
  assert.equal(Math.round(m.pendingSeconds * 10) / 10, 1.5);
}
const cabinet = read("src/components/business-app/guest-coffee/GuestCoffeeCabinet.tsx");
const copy = read("src/lib/business-app/guest-coffee/copy.ts");
assert.doesNotMatch(cabinet + copy, /осталось\s+\d|осталось\s*\{|remaining/i, "no countdown in the UI");
assert.match(cabinet, /GUEST_COFFEE_REPORT_INTERVAL_MS/);
assert.match(cabinet, /keepalive/, "pending seconds are flushed when the page is hidden");
// Accessible connect dialog: native modal <dialog> (focus trap, inert page, Escape) and focus returns to the opener.
assert.match(cabinet, /<dialog/);
assert.match(cabinet, /showModal\(\)/);
assert.match(cabinet, /addEventListener\("close"/);
assert.match(cabinet, /event.key !== "Tab"/, "Tab / Shift+Tab stay inside the dialog");
assert.match(cabinet, /openerRef\.current = event\.currentTarget/);

// ---------------------------------------------------------------- identity
{
  const token = createGuestCoffeeToken();
  assert.ok(isGuestCoffeeToken(token));
  assert.equal(isGuestCoffeeToken("short"), false);
  assert.match(hashGuestCoffeeToken(token), /^[0-9a-f]{64}$/);
  const a = guestCoffeeNetworkHash({ ip: "1.2.3.4", secret: "s" });
  assert.match(a ?? "", /^[0-9a-f]{64}$/);
  assert.equal(a, guestCoffeeNetworkHash({ ip: "1.2.3.4", secret: "s" }));
  assert.equal(a, guestCoffeeNetworkHash({ ip: "::ffff:1.2.3.4", secret: "s" }), "IPv4-mapped = same network");
  assert.notEqual(a, guestCoffeeNetworkHash({ ip: "1.2.3.5", secret: "s" }));
  assert.notEqual(a, guestCoffeeNetworkHash({ ip: "1.2.3.4", secret: "other" }), "keyed");
  assert.equal(guestCoffeeNetworkHash({ ip: "unknown", secret: "s" }), null);
  assert.equal(guestCoffeeNetworkHash({ ip: "1.2.3.4", secret: "" }), null, "no secret → cookie only");
  assert.equal(guestCoffeeNetworkHash({ ip: "999.1.1.1", secret: "s" }), null);
  // IPv6: one subscriber /64 = one network (address rotation inside it does not reset).
  assert.equal(guestCoffeeNetworkKey("2001:db8:1:2:aaaa::1"), "v6:2001:db8:1:2::/64");
  assert.equal(guestCoffeeNetworkKey("2001:0db8:0001:0002:ffff:1:2:3"), "v6:2001:db8:1:2::/64");
  assert.notEqual(guestCoffeeNetworkKey("2001:db8:1:3::1"), guestCoffeeNetworkKey("2001:db8:1:2::1"));
  assert.equal(guestCoffeeNetworkKey("2001:db8::1::2"), null);
  // The network hash never takes client-controlled headers (User-Agent etc.).
  assert.doesNotMatch(read("src/lib/business-app/guest-coffee/identity.ts"), /userAgent|["'`]user-agent/i);
  assert.doesNotMatch(read("src/lib/business-app/guest-coffee/usage.server.ts"), /["'`]user-agent/i);
  const o = guestCoffeeCookieOptions(true);
  assert.equal(o.httpOnly, true);
  assert.equal(o.sameSite, "lax");
  assert.equal(o.secure, true);
}

// ---------------------------------------------------------------- server gate (track-url / usage)
{
  const shelf = [sample[0]];
  let signed = 0;
  let leases: number[] = [];
  let stillFree = true;
  const deps = (used: number | null) => ({
    loadShelf: async () => shelf,
    isStillFree: async () => stillFree,
    issueLease: async (trackSeconds: number) => {
      leases.push(trackSeconds);
      return used;
    },
    sign: async () => {
      signed++;
      return { ok: true as const, url: "https://audiolad.ru/storage/v1/object/sign/x" };
    },
  });
  assert.deepEqual(await handleGuestCoffeeTrackUrl({}, deps(0)), { ok: false, reason: "invalid_request" });
  assert.deepEqual(await handleGuestCoffeeTrackUrl({ audioItemId: "foreign" }, deps(0)), { ok: false, reason: "not_in_manifest" }, "only curated tracks");
  assert.equal(signed, 0);
  assert.deepEqual(await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t0" }, deps(null)), { ok: false, reason: "guest_unavailable", limit: "unavailable" });
  assert.deepEqual(await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t0" }, deps(1800)), { ok: false, reason: "no_access", limit: "exhausted" });
  assert.equal(signed, 0, "no URL is signed once the limit is used");
  assert.deepEqual(await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t0" }, deps(1600)), {
    ok: true, data: { url: "https://audiolad.ru/storage/v1/object/sign/x" }, limit: "near_end",
  });
  // The server lease is opened for the real length of THIS track (server-known, not client-claimed).
  leases = [];
  await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t0" }, deps(0));
  assert.deepEqual(leases, [guestCoffeeLeaseSeconds(shelf[0].tracks[0].durationSeconds)]);
  assert.equal(guestCoffeeLeaseSeconds(null), 300);
  assert.equal(guestCoffeeLeaseSeconds(5000), 900);
  assert.equal(guestCoffeeLeaseSeconds(181.2), 182);
  // Cached shelf says free, DB now says paid (even with guest access) → refused before any lease or signing.
  stillFree = false;
  leases = [];
  const signedBefore = signed;
  assert.deepEqual(await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t0" }, deps(0)), { ok: false, reason: "not_in_manifest" });
  assert.equal(signed, signedBefore, "paid-now album is never signed");
  assert.deepEqual(leases, [], "and never charged");
  stillFree = true;
  const fail = await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t1" }, {
    ...deps(10), sign: async () => ({ ok: false as const, reason: "audio_missing" }),
  });
  assert.deepEqual(fail, { ok: false, reason: "not_in_manifest", limit: "ok" }, "missing audio → player skips the track");
  const transient = await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t1" }, {
    ...deps(10), sign: async () => ({ ok: false as const, reason: "storage_unavailable" }),
  });
  assert.equal(transient.ok ? "" : transient.reason, "sign_failed");

  let credited = -1;
  assert.deepEqual(await handleGuestCoffeeUsage({ seconds: 15 }, async (s) => { credited = s; return 900; }), { ok: true, limit: "ok" });
  assert.equal(credited, 15);
  await handleGuestCoffeeUsage({ seconds: 500 }, async (s) => { credited = s; return 900; });
  assert.equal(credited, 60, "credit clamped to 60 s per report (the server clamps again by wall clock)");
  assert.deepEqual(await handleGuestCoffeeUsage({ seconds: "x" }, async () => 0), { ok: false, reason: "invalid_request" });
  assert.deepEqual(await handleGuestCoffeeUsage({ seconds: 5 }, async () => null), { ok: false, reason: "guest_unavailable", limit: "unavailable" });
  assert.deepEqual(await handleGuestCoffeeUsage({ seconds: 5 }, async () => 1805), { ok: true, limit: "exhausted" });
}

// ---------------------------------------------------------------- reused Business player controller
{
  class FakeAudio {
    src = "";
    currentTime = 0;
    played: string[] = [];
    paused = true;
    async play() { this.paused = false; this.played.push(this.src); }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ""; }
    load() {}
  }
  const audio = new FakeAudio();
  let allow = true;
  const ctl = new SpaOnlinePlayer(
    {
      audio,
      onChange: () => {},
      sign: async (id) => (allow ? { ok: true, data: { url: `https://audiolad.ru/s/${id}` } } : { ok: false, reason: "no_access" }),
    },
    [],
  );
  const items = (p: GuestCoffeePlaylist) => p.tracks.map((t, position) => ({
    position, audioItemId: t.audioItemId, trackCode: null, title: t.title, durationSeconds: t.durationSeconds,
    gainDb: null, playableUntil: null, offlineAllowed: false, offlineCacheUntil: null,
  }));
  await ctl.applyManifest(items(sample[0]));
  await ctl.playIndex(0);
  assert.equal(ctl.status, "playing", "real <audio> playback starts from a signed URL");
  await ctl.toggle();
  assert.equal(ctl.status, "paused", "pause");
  await ctl.toggle();
  assert.equal(ctl.status, "playing", "resume");
  // Switching playlists while playing: no re-questionnaire, the new album starts at once.
  await ctl.applyManifest(items(sample[3]));
  assert.equal(ctl.status, "playing");
  assert.equal(ctl.current?.audioItemId, "b-all-t0", "switch / compare playlists instantly");
  await ctl.next();
  assert.equal(ctl.current?.audioItemId, "b-all-t1");
  // Limit used: the server refuses the next URL → controller stops and stays closed.
  allow = false;
  await ctl.onEnded();
  assert.equal(ctl.status, "no_access", "server-enforced limit stops playback at the next track");
  assert.ok(audio.played.every((u) => u.startsWith("https://audiolad.ru/s/")), "only server-signed URLs were played");
}

// ---------------------------------------------------------------- atlas CTA → permanent URL
{
  const constants = read("src/lib/business/coffee-atlas/constants.ts");
  assert.match(constants, /COFFEE_ATLAS_CTA_HREF = BUSINESS_GUEST_COFFEE_URL;/);
  assert.match(cabinet, /GUEST_COFFEE_ATLAS_URL/, "way back to the atlas");
  assert.match(copy, /COFFEE_ATLAS_OFFER\.price/, "terms share the atlas offer source");
  assert.match(copy, /7 дней — в подарок/);
  assert.match(copy, /нельзя зарегистрироваться, начать пробный период или оплатить/, "info-only connect window");
  assert.doesNotMatch(cabinet, /checkout|payment|\/api\/payments|tochka|prodamus/i, "no payment wiring in this stage");
}

// ---------------------------------------------------------------- fresh free check wiring
{
  const loader = read("src/lib/business-app/guest-coffee/load.server.ts");
  const route = read("src/app/api/business/guest/coffee/track-url/route.ts");
  assert.match(loader, /export async function isGuestCoffeePlaylistStillFree/);
  assert.match(loader, /is_free === true && row\.status === "published" && row\.catalog_visibility === "listed"/);
  assert.match(route, /isStillFree: isGuestCoffeePlaylistStillFree/, "uncached re-check right before signing");
  assert.match(route, /issueLease: \(trackSeconds\) => issueGuestCoffeeLease\(request, trackSeconds\)/);
}

// ---------------------------------------------------------------- migration contract
const migration = read("supabase/migrations/20270108120000_business_guest_listening.sql");
const rollback = read("docs/business/guest-listening-a8240527-rollback.sql");
{
  const clean = migration.replace(/--[^\n]*/g, "");
  assert.match(clean, /^\s*BEGIN;/);
  assert.match(clean, /COMMIT;\s*$/);
  assert.match(clean, /CREATE TABLE IF NOT EXISTS public\.business_guest_listening/);
  assert.match(clean, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(clean, /CREATE POLICY/, "no policies: service_role only");
  assert.match(clean, /CREATE TABLE IF NOT EXISTS public\.business_guest_listening_ip/);
  assert.match(clean, /REVOKE ALL ON public\.business_guest_listening FROM PUBLIC, anon, authenticated;/);
  assert.match(clean, /REVOKE ALL ON public\.business_guest_listening_ip FROM PUBLIC, anon, authenticated;/);
  const granted = [...clean.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO service_role;/g)].map((m) => m[1]).sort();
  assert.deepEqual(granted, ["business_guest_listening_issue", "business_guest_listening_peek", "business_guest_listening_report"]);
  assert.doesNotMatch(clean, /GRANT[^;]*TO (anon|authenticated|PUBLIC)/);
  assert.doesNotMatch(clean, /\b(ALTER TABLE public\.(?!business_guest_listening)|DROP |UPDATE public\.(?!business_guest_listening)|DELETE FROM)/i, "additive only");
  for (const body of clean.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)[\s\S]*?\$\$;/g)) {
    assert.match(body[0], /SET search_path = public, pg_temp/, `${body[1]}: fixed search_path`);
    const pure = body[1] === "business_guest_listening_lease_owed_" || body[1] === "business_guest_listening_effective_";
    if (!pure) assert.match(body[0], /SECURITY DEFINER/, `${body[1]}: SECURITY DEFINER`);
    assert.match(clean, new RegExp(`REVOKE ALL ON FUNCTION public\\.${body[1]}\\(`), `${body[1]}: revoked from PUBLIC`);
  }
  // Constants mirror limit.ts.
  assert.match(clean, new RegExp(`\\(${GUEST_COFFEE_NETWORK_LIMIT_SECONDS} - ${GUEST_COFFEE_LIMIT_SECONDS}\\)`));
  assert.match(clean, new RegExp(`v_effective < ${GUEST_COFFEE_LIMIT_SECONDS}`));
  assert.match(clean, new RegExp(`least\\(p_device\\.lease_cap_seconds, ${GUEST_COFFEE_MIN_LEASE_CHARGE_SECONDS}\\)`));
  assert.doesNotMatch(clean, /\+ 10\b/, "no renewable per-request slack");
  for (const fn of ["peek(text, text)", "report(text, text, integer)", "issue(text, text, integer)", "effective_(integer, integer)", "lease_owed_(public.business_guest_listening)", "charge_(text, text, integer)", "lock_(text, text)"]) {
    assert.ok(rollback.includes(`DROP FUNCTION IF EXISTS public.business_guest_listening_${fn};`), `rollback drops ${fn}`);
  }
  assert.match(rollback, /DROP TABLE IF EXISTS public\.business_guest_listening_ip;/);
  assert.match(rollback, /DROP TABLE IF EXISTS public\.business_guest_listening;/);
}
const pkg = JSON.parse(read("package.json"));
assert.ok(String(pkg.scripts["test:business-guest-coffee"]).includes("business-guest-coffee-unit.mts"));
assert.match(read(".github/workflows/business-pr-validation.yml"), /npm run test:business-guest-coffee/);

// ---------------------------------------------------------------- real PostgreSQL (explicit disposable DB only)
const container = process.env.AUDIOLAD_ONBOARDING_TEST_CONTAINER;
// libpq key=value conninfo of a throwaway cluster, e.g. "host=/tmp port=55491 user=postgres"; never production.
const dsn = process.env.AUDIOLAD_GUEST_COFFEE_TEST_DSN;
if (!container && !dsn) {
  assert.notEqual(process.env.AUDIOLAD_REQUIRE_GUEST_COFFEE_SQL, "1", "isolated SQL required; provide a disposable database");
  console.log("business-guest-coffee-unit: contract OK; SQL scenarios SKIPPED (no explicit disposable database)");
} else {
  assert.doesNotMatch(dsn ?? "", /audiolad\.ru|72\.56\.|supabase\.co/i, "never a production database");
  const db = `guest_coffee_${process.pid}`;
  const psql = (database: string, input: string) =>
    container
      ? execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" })
      : execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", `${dsn} dbname=${database}`], { input, encoding: "utf8" });
  psql("postgres", `CREATE DATABASE ${db};`);
  try {
    const setup = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`;
    const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), D = "d".repeat(64), F = "f".repeat(64), G = "e".repeat(64);
    const Z = "0".repeat(64);
    const out = psql(db, [setup, migration, migration /* idempotent re-run */, `
SET ROLE service_role;
SELECT 'i1=' || public.business_guest_listening_issue('${A}', '${F}', 200);
-- burst / replayed reports right after issue: nothing (bounded by wall clock since the lease opened, no slack)
SELECT 'r1=' || public.business_guest_listening_report('${A}', '${F}', 60);
SELECT 'r2=' || public.business_guest_listening_report('${A}', '${F}', 60);
RESET ROLE;
UPDATE public.business_guest_listening SET lease_started_at = now() - interval '100 seconds' WHERE device_hash = '${A}';
SET ROLE service_role;
SELECT 'r3=' || public.business_guest_listening_report('${A}', '${F}', 60);
SELECT 'r4=' || public.business_guest_listening_report('${A}', '${F}', 60);
SELECT 'r5=' || public.business_guest_listening_report('${A}', '${F}', 60);
SELECT 'i2=' || public.business_guest_listening_issue('${A}', '${F}', 200);
-- skip-through: every issued URL costs at least 15 s
SELECT 'i3=' || public.business_guest_listening_issue('${A}', '${F}', 200);
RESET ROLE;
-- client suppresses ALL usage reports and keeps requesting tracks
UPDATE public.business_guest_listening SET lease_started_at = now() - interval '1 hour' WHERE device_hash = '${A}';
SET ROLE service_role;
SELECT 'p1=' || public.business_guest_listening_peek('${A}', '${F}');
SELECT 'i4=' || public.business_guest_listening_issue('${A}', '${F}', 200);
RESET ROLE;
UPDATE public.business_guest_listening SET lease_started_at = now() - interval '1 hour' WHERE device_hash = '${A}';
SET ROLE service_role;
SELECT 'i5=' || public.business_guest_listening_issue('${A}', '${F}', 200);
-- cookie juggling on one network G: B and C created BEFORE listening
SELECT 'jb=' || public.business_guest_listening_issue('${B}', '${G}', 200);
SELECT 'jc=' || public.business_guest_listening_issue('${C}', '${G}', 200);
RESET ROLE;
UPDATE public.business_guest_listening SET used_seconds = 1800, lease_started_at = NULL, lease_cap_seconds = NULL WHERE device_hash IN ('${B}');
UPDATE public.business_guest_listening SET lease_started_at = NULL, lease_cap_seconds = NULL WHERE device_hash IN ('${C}');
UPDATE public.business_guest_listening_ip SET used_seconds = 1800 WHERE ip_hash = '${G}';
SET ROLE service_role;
SELECT 'xb=' || public.business_guest_listening_issue('${B}', '${G}', 200);
RESET ROLE;
SELECT 'xblease=' || (lease_started_at IS NULL)::text FROM public.business_guest_listening WHERE device_hash = '${B}';
SET ROLE service_role;
SELECT 'xc=' || public.business_guest_listening_issue('${C}', '${G}', 200);
RESET ROLE;
UPDATE public.business_guest_listening SET lease_started_at = NULL, lease_cap_seconds = NULL WHERE device_hash = '${C}';
UPDATE public.business_guest_listening_ip SET used_seconds = 3600 WHERE ip_hash = '${G}';
SET ROLE service_role;
SELECT 'yc=' || public.business_guest_listening_issue('${C}', '${G}', 200);
SELECT 'yd=' || public.business_guest_listening_peek('${D}', '${G}');
SELECT 'yd2=' || public.business_guest_listening_issue('${D}', '${G}', 200);
SELECT 'ye=' || public.business_guest_listening_peek('${D}', NULL);
SELECT 'z=' || public.business_guest_listening_peek('${Z}', NULL);
SELECT 'neg=' || public.business_guest_listening_report('${Z}', NULL, -5);
RESET ROLE;
-- an IP window older than 30 days starts over
UPDATE public.business_guest_listening_ip SET window_started_at = now() - interval '31 days' WHERE ip_hash = '${G}';
SET ROLE service_role;
SELECT 'w=' || public.business_guest_listening_peek('${Z}', '${G}');
RESET ROLE;
`].join("\n"));
    const val = (k: string) => Number(out.match(new RegExp(`^${k}=(\\d+)$`, "m"))?.[1]);
    assert.equal(val("i1"), 0, "new guest starts at 0");
    assert.equal(val("r1"), 0, "report right after issue: nothing to credit yet");
    assert.equal(val("r2"), 0, "replayed reports add nothing");
    assert.equal(val("r3"), 60, "real report credited (≤ 60 s per report)");
    assert.equal(val("r4"), 100, "cumulative credit bounded by wall clock since the lease opened");
    assert.equal(val("r5"), 100, "no renewable slack on repeated reports");
    assert.equal(val("i2"), 100, "settling an already reported lease adds nothing");
    assert.equal(val("i3"), 115, "instant skip still costs the 15 s minimum");
    assert.equal(val("p1"), 315, "peek includes what the open lease would cost now");
    assert.equal(val("i4"), 315, "no reports at all: lease settled by the server at the track length");
    assert.equal(val("i5"), 515, "…and again for every following track");
    assert.equal(val("jb"), 0);
    assert.equal(val("jc"), 0);
    assert.ok(val("xb") >= 1800, "exhausted device refused");
    assert.match(out, /^xblease=true$/m, "no lease is opened for a refused URL");
    assert.equal(val("xc"), 0, "pre-created second cookie on the same network: one more session at most");
    assert.equal(val("yc"), 1800, "network allowance (2 × 30 min) used → second cookie refused too");
    assert.equal(val("yd"), 1800, "brand-new cookie on that network: refused (peek)");
    assert.ok(val("yd2") >= 1800, "brand-new cookie on that network: refused (issue)");
    assert.equal(val("ye"), 0, "another network: own meter");
    assert.equal(val("z"), 0);
    assert.equal(val("neg"), 0, "report without a lease / negative credit ignored");
    assert.equal(val("w"), 0, "IP window older than 30 days starts over");
    for (const role of ["anon", "authenticated"]) {
      for (const call of [
        `SELECT public.business_guest_listening_issue('${A}', NULL, 1);`,
        `SELECT public.business_guest_listening_report('${A}', NULL, 1);`,
        `SELECT public.business_guest_listening_peek('${A}', NULL);`,
        `SELECT public.business_guest_listening_charge_('${A}', NULL, 100);`,
        `SELECT public.business_guest_listening_lock_('${A}', NULL);`,
        "SELECT * FROM public.business_guest_listening;",
        "SELECT * FROM public.business_guest_listening_ip;",
      ]) {
        assert.throws(() => psql(db, `SET ROLE ${role}; ${call}`), /permission denied/, `${role}: ${call}`);
      }
    }
    assert.throws(() => psql(db, `SET ROLE service_role; SELECT public.business_guest_listening_charge_('${A}', NULL, 100);`), /permission denied/, "internal helpers are not callable even by service_role");
    assert.throws(() => psql(db, `SET ROLE service_role; SELECT public.business_guest_listening_issue('bad', NULL, 1);`), /invalid_device_hash/);
    assert.throws(() => psql(db, `SET ROLE service_role; SELECT public.business_guest_listening_issue('${A}', 'bad', 1);`), /invalid_ip_hash/);
    psql(db, rollback);
    assert.equal(psql(db, "SELECT to_regclass('public.business_guest_listening') IS NULL AND to_regclass('public.business_guest_listening_ip') IS NULL;").trim(), "t", "rollback drops both tables");
    assert.equal(psql(db, "SELECT count(*) FROM pg_proc WHERE proname LIKE 'business_guest_listening%';").trim(), "0", "rollback drops every function");
    console.log("business-guest-coffee-unit: ok (incl. real PostgreSQL scenarios)");
  } finally {
    psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  }
}
