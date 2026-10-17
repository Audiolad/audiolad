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
  GUEST_COFFEE_WARN_AFTER_SECONDS,
  GuestCoffeePlaybackMeter,
  clampGuestCoffeeCredit,
  guestCoffeeLimitState,
} from "../src/lib/business-app/guest-coffee/limit";
import {
  createGuestCoffeeToken,
  guestCoffeeCookieOptions,
  guestCoffeeFallbackHash,
  hashGuestCoffeeToken,
  isGuestCoffeeToken,
} from "../src/lib/business-app/guest-coffee/identity";
import { handleGuestCoffeeTrackUrl, handleGuestCoffeeUsage } from "../src/lib/business-app/guest-coffee/routes";
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

// ---------------------------------------------------------------- identity
{
  const token = createGuestCoffeeToken();
  assert.ok(isGuestCoffeeToken(token));
  assert.equal(isGuestCoffeeToken("short"), false);
  assert.match(hashGuestCoffeeToken(token), /^[0-9a-f]{64}$/);
  const a = guestCoffeeFallbackHash({ ip: "1.2.3.4", userAgent: "UA", secret: "s" });
  assert.match(a ?? "", /^[0-9a-f]{64}$/);
  assert.equal(a, guestCoffeeFallbackHash({ ip: "1.2.3.4", userAgent: "UA", secret: "s" }));
  assert.notEqual(a, guestCoffeeFallbackHash({ ip: "1.2.3.4", userAgent: "UA2", secret: "s" }), "IP+UA, not IP alone");
  assert.equal(guestCoffeeFallbackHash({ ip: "unknown", userAgent: "UA", secret: "s" }), null);
  assert.equal(guestCoffeeFallbackHash({ ip: "1.2.3.4", userAgent: "UA", secret: "" }), null, "no secret → cookie only");
  const o = guestCoffeeCookieOptions(true);
  assert.equal(o.httpOnly, true);
  assert.equal(o.sameSite, "lax");
  assert.equal(o.secure, true);
}

// ---------------------------------------------------------------- server gate (track-url / usage)
{
  const shelf = [sample[0]];
  let signed = 0;
  const deps = (used: number | null) => ({
    loadShelf: async () => shelf,
    readUsage: async () => used,
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
  assert.equal(credited, 60, "credit clamped to 60 s per report");
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

// ---------------------------------------------------------------- migration contract
const migration = read("supabase/migrations/20270106120000_business_guest_listening.sql");
const rollback = read("docs/business/guest-listening-a8240527-rollback.sql");
{
  const clean = migration.replace(/--[^\n]*/g, "");
  assert.match(clean, /^\s*BEGIN;/);
  assert.match(clean, /COMMIT;\s*$/);
  assert.match(clean, /CREATE TABLE IF NOT EXISTS public\.business_guest_listening/);
  assert.match(clean, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(clean, /CREATE POLICY/, "no policies: service_role only");
  assert.match(clean, /REVOKE ALL ON public\.business_guest_listening FROM PUBLIC, anon, authenticated;/);
  assert.match(clean, /GRANT EXECUTE ON FUNCTION public\.business_guest_listening_apply\(text, text, integer\) TO service_role;/);
  assert.match(clean, /GRANT EXECUTE ON FUNCTION public\.business_guest_listening_peek\(text, text\) TO service_role;/);
  assert.doesNotMatch(clean, /GRANT[^;]*TO (anon|authenticated)/);
  assert.doesNotMatch(clean, /\b(ALTER TABLE public\.(?!business_guest_listening)|DROP |UPDATE public\.(?!business_guest_listening)|DELETE FROM)/i, "additive only");
  for (const body of clean.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g)) {
    assert.match(body[0], /SECURITY DEFINER/);
    assert.match(body[0], /SET search_path = public, pg_temp/);
  }
  assert.match(rollback, /DROP TABLE IF EXISTS public\.business_guest_listening;/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.business_guest_listening_apply\(text, text, integer\);/);
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
    const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), F = "f".repeat(64), G = "e".repeat(64);
    const out = psql(db, [setup, migration, migration /* idempotent re-run */, `
SET ROLE service_role;
SELECT 'r1=' || public.business_guest_listening_apply('${A}', '${F}', 0);
SELECT 'r2=' || public.business_guest_listening_apply('${A}', '${F}', 15);
SELECT 'r3=' || public.business_guest_listening_apply('${A}', '${F}', 500);
SELECT 'r4=' || public.business_guest_listening_apply('${B}', '${F}', 0);
SELECT 'r5=' || public.business_guest_listening_apply('${C}', '${G}', 0);
SELECT 'r6=' || public.business_guest_listening_peek('${"0".repeat(64)}', '${F}');
SELECT 'r7=' || public.business_guest_listening_peek('${"0".repeat(64)}', NULL);
SELECT 'r8=' || public.business_guest_listening_apply('${C}', NULL, -5);
RESET ROLE;
UPDATE public.business_guest_listening SET used_seconds = 1795, last_credit_at = now() - interval '1 hour' WHERE device_hash = '${A}';
SET ROLE service_role;
SELECT 'r9=' || public.business_guest_listening_apply('${A}', '${F}', 60);
RESET ROLE;
`].join("\n"));
    const val = (k: string) => Number(out.match(new RegExp(`^${k}=(\\d+)$`, "m"))?.[1]);
    assert.equal(val("r1"), 0, "new guest starts at 0");
    assert.equal(val("r2"), 15, "first report credited");
    assert.equal(val("r3"), 25, "replayed/burst report clamped by wall clock (+10 s slack)");
    assert.equal(val("r4"), 25, "cookie cleared, same IP+UA → limit kept");
    assert.equal(val("r5"), 0, "other IP+UA → own meter");
    assert.equal(val("r6"), 25, "peek by fallback");
    assert.equal(val("r7"), 0);
    assert.equal(val("r8"), 0, "negative credit ignored");
    assert.equal(val("r9"), 1855, "total keeps growing past the limit (gate is at URL issuance)");
    for (const role of ["anon", "authenticated"]) {
      assert.throws(
        () => psql(db, `SET ROLE ${role}; SELECT public.business_guest_listening_apply('${A}', NULL, 1);`),
        /permission denied/,
        `${role} cannot call the meter`,
      );
      assert.throws(() => psql(db, `SET ROLE ${role}; SELECT * FROM public.business_guest_listening;`), /permission denied/, `${role} cannot read the table`);
    }
    assert.throws(() => psql(db, `SET ROLE service_role; SELECT public.business_guest_listening_apply('bad', NULL, 1);`), /invalid_device_hash/);
    psql(db, rollback);
    assert.equal(psql(db, "SELECT to_regclass('public.business_guest_listening') IS NULL;").trim(), "t", "rollback drops the table");
    console.log("business-guest-coffee-unit: ok (incl. real PostgreSQL scenarios)");
  } finally {
    psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  }
}
