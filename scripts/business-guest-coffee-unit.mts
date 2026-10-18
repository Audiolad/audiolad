#!/usr/bin/env -S npx tsx
/**
 * a8240527 — AudioLad Business guest coffee cabinet (https://business.audiolad.ru/guest/coffee).
 * Routing, curated shelf, server-side 30-minute limit gate, reused Business player controller,
 * migration contract, and (with an explicit disposable database only) real PostgreSQL scenarios.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  BUSINESS_GUEST_COFFEE_INTERNAL_PATH,
  BUSINESS_GUEST_COFFEE_PUBLIC_PATH,
  BUSINESS_GUEST_COFFEE_URL,
} from "../src/lib/business-app/host";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DIRECTIONS,
  GUEST_COFFEE_SHELF,
  findGuestCoffeeTrack,
  guestCoffeePlaylistMinutes,
  type GuestCoffeePlaylist,
} from "../src/lib/business-app/guest-coffee/catalog";
import { selectGuestCoffeePlaylists } from "../src/lib/business-app/guest-coffee/recommend";
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
// a8240527 rework (Sergey 17.10.2026): ONE cabinet – the guest entry renders inside the shared
// BusinessAppShell (sidebar / bottom nav), no separate guest branch or guest chrome.
const shell = read("src/components/business-app/BusinessAppShell.tsx");
assert.doesNotMatch(shell, /isBusinessGuestPathname|business-app-guest"|usePathname/, "no guest-only shell branch");
assert.match(shell, /<BusinessSidebar \/>[\s\S]*<BusinessBottomNav \/>/, "sidebar + bottom nav for everyone");
assert.doesNotMatch(read("src/lib/business-app/host.ts"), /isBusinessGuestPathname/);
const page = read("src/app/business-app/guest/coffee/page.tsx");
assert.match(page, /export default BusinessAppMusicPage;/, "guest entry IS the cabinet's Music section");
assert.doesNotMatch(page, /notFound\(/, "no login / allowlist gate: guests land straight in the cabinet");
const musicSection = read("src/components/business-app/sound/BusinessMusicSection.tsx");
assert.match(musicSection, /loadGuestCoffeeShelf/);
assert.match(musicSection, /peekGuestCoffeeUsage/);
assert.match(read("src/app/business-app/music/page.tsx"), /<BusinessMusicSection/, "owner /music renders the same section");

// ---------------------------------------------------------------- curated shelf
const keys = GUEST_COFFEE_SHELF.map((r) => `${r.authorSlug}/${r.productSlug}`);
assert.equal(new Set(keys).size, keys.length, "no duplicate shelf entries");
const directionIds = new Set(GUEST_COFFEE_DIRECTIONS.map((d) => d.id));
const editorialStyles = new Set(["jazz", "bossa", "sax", "calm"]);
const characterIds = new Set(GUEST_COFFEE_CHARACTERS.map((c) => c.id));
for (const ref of GUEST_COFFEE_SHELF) {
  assert.match(ref.authorSlug, /^[a-z0-9-]+$/);
  assert.match(ref.productSlug, /^[a-z0-9-]+$/);
  assert.ok(editorialStyles.has(ref.direction), "editorial style (reserve basis)");
  assert.ok((ref.sounds ?? []).every((s) => directionIds.has(s)), "editorial sound types are real sound types");
  assert.ok(ref.characters.length > 0 && ref.characters.every((c) => characterIds.has(c)));
}
assert.deepEqual(GUEST_COFFEE_DIRECTIONS.map((d) => d.id), ["jazz", "calm", "rhythm", "melodic"], "4 sound types");
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
assert.deepEqual(sel.playlists.slice(0, 3).map((p) => p.direction), ["jazz", "jazz", "jazz"], "sound-fitting albums first");
assert.equal(sel.playlists.length, sample.length, "no hard filter: the closest albums follow");
assert.equal(sel.directionFallback, false);
sel = selectGuestCoffeePlaylists(sample, { character: "city", direction: "jazz", daypart: "morning" });
assert.equal(sel.playlists[0].id, "j-morning");
sel = selectGuestCoffeePlaylists(sample, { character: "cozy", direction: "jazz", daypart: "allday" });
assert.equal(sel.playlists[0].id, "j-all");
sel = selectGuestCoffeePlaylists(sample.filter((p) => p.direction !== "bossa"), { character: "cozy", direction: "rhythm", daypart: "day" });
assert.equal(sel.directionFallback, true, "honest fallback when no album fits the sound type");
assert.equal(sel.playlists.length, 3, "…and still never an empty shelf");
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
const cabinet = read("src/components/business-app/sound/BusinessSoundStudio.tsx");
const copy = read("src/lib/business-app/guest-coffee/copy.ts");
assert.doesNotMatch(cabinet + copy, /осталось\s+\d|осталось\s*\{|remaining/i, "no countdown in the UI");
assert.match(cabinet, /GUEST_COFFEE_REPORT_INTERVAL_MS/);
assert.match(cabinet, /keepalive/, "pending seconds are flushed when the page is hidden");
// No fake connect modal (Sergey 17.10.2026): «Подключить» is a link into the real point-creation path.
assert.doesNotMatch(cabinet, /<dialog|showModal/);
assert.match(cabinet, /href=\{BUSINESS_CONNECT_HREF\}/);
assert.match(read("src/lib/business-app/access.ts"), /BUSINESS_CONNECT_HREF = "\/onboarding\?type=cafe"/);
assert.match(cabinet, /BusinessPlayerControls/, "shared Business player controls");
assert.match(cabinet, /BusinessSoundSettings/, "shared sound settings");

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
  let calls: string[] = [];
  const deps = (used: number | null, issued: number | null = used) => ({
    loadShelf: async () => shelf,
    isStillFree: async () => stillFree,
    peekUsage: async () => {
      calls.push("peek");
      return used;
    },
    issueLease: async (trackSeconds: number) => {
      calls.push("issue");
      leases.push(trackSeconds);
      return issued;
    },
    sign: async () => {
      calls.push("sign");
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
  // Order: read-only peek → sign → atomic issue (charge). Exhausted at peek → nothing signed or charged.
  calls = [];
  await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t0" }, deps(100));
  assert.deepEqual(calls, ["peek", "sign", "issue"]);
  calls = [];
  await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t0" }, deps(1800));
  assert.deepEqual(calls, ["peek"], "exhausted: neither signed nor charged");
  // Race: peek still ok, authoritative issue says exhausted → the signed URL is discarded.
  assert.deepEqual(await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t0" }, deps(1790, 1800)), { ok: false, reason: "no_access", limit: "exhausted" });
  // Signing failure → no lease is opened or charged.
  for (const reason of ["storage_unavailable", "audio_missing"]) {
    calls = [];
    leases = [];
    await handleGuestCoffeeTrackUrl({ audioItemId: "j-morning-t1" }, { ...deps(10), sign: async () => { calls.push("sign"); return { ok: false as const, reason }; } });
    assert.deepEqual(calls, ["peek", "sign"], `sign failed (${reason}) → issue never called`);
    assert.deepEqual(leases, []);
  }
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
  assert.match(copy, /7 дней – в подарок/);
// Typography (as in the atlas, #900): visible texts use the en dash, never the em dash.
for (const file of [
  "src/lib/business-app/guest-coffee/copy.ts",
  "src/components/business-app/sound/BusinessSoundStudio.tsx",
  "src/components/business-app/sound/BusinessSoundSettings.tsx",
  "src/components/business-app/sound/BusinessMusicSection.tsx",
  "src/components/business-app/BusinessGuestStatus.tsx",
  "src/components/business-app/BusinessAppShell.tsx",
  "src/components/business-app/BusinessSidebar.tsx",
  "src/components/business-app/BusinessBottomNav.tsx",
  "src/components/business-app/BusinessPlayerControls.tsx",
  "src/lib/business-app/access.ts",
  "src/app/business-app/music/page.tsx",
  "src/app/business-app/guest/coffee/page.tsx",
  "src/lib/business-app/guest-coffee/catalog.ts",
  "src/lib/business-app/guest-coffee/atmosphere.ts",
  // Sergey 17.10: en dashes everywhere visible – the Home page and the onboarding wizard of this flow too.
  "src/components/business-app/BusinessHomePage.tsx",
  "src/components/business-app/BusinessOnboardingWizardPage.tsx",
  "src/lib/business-app/onboarding-wizard.ts",
  "src/lib/business-app/owner-home-signals.ts",
  // Sergey 18.10.2026 13:17: the legal documents at business.audiolad.ru/documents/<id> (edition r6.1) too,
  // both the source .md files and their verbatim site copies.
  "src/lib/business-app/client-document-content.ts",
  "src/lib/business-app/client-documents.ts",
  "src/app/business-app/documents/page.tsx",
  "src/app/business-app/documents/[id]/page.tsx",
  "docs/business/public/venue-license.md",
  "docs/business/public/program-terms.md",
  "docs/business/public/claims-procedure.md",
  "docs/business/public/claim-reply-kit.md",
]) {
  const code = read(file).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.split(" // ")[0]).join("\n");
  assert.doesNotMatch(code, /—/, `${file}: no em dash in visible text`);
}
  // Honest conversion state: no online trial activation / payment exists yet.
  assert.match(copy, /Онлайн-активация 7 дней в подарок и оплата пока не подключены – ничего не списывается/);
  assert.doesNotMatch(cabinet + read("src/components/business-app/BusinessGuestStatus.tsx"), /checkout|payment|\/api\/payments|tochka|prodamus/i, "no payment wiring in this stage");
  // Free public albums are evaluation listening, not the licensed airplay catalogue.
  assert.match(copy, /Это не каталог эфира/);
}

// ---------------------------------------------------------------- shared Jazz & Coffee theme (21546de4)
{
  // The standalone guest stylesheet is gone; the Music section uses the cabinet's own CSS.
  assert.throws(() => read("src/components/business-app/guest-coffee/guest-coffee.css"));
  assert.throws(() => read("src/components/business-app/guest-coffee/GuestCoffeeCabinet.tsx"));
  const appCss = read("src/components/business-app/business-app.css");
  const block = appCss.slice(appCss.indexOf("a8240527 – one cabinet"));
  const theme = read("src/components/business-app/theme/business-theme.css");
  const used = new Set([...block.matchAll(/var\((--biz-[\w-]+)/g)].map((m) => m[1]));
  assert.ok(used.size >= 10, "the Music section reads the shared --biz-* tokens");
  for (const name of used) assert.ok(theme.includes(`${name}:`), `${name} exists in business-theme.css`);
  const literals = block.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
  assert.deepEqual(literals, [], "no colour literals");
  assert.match(read("src/app/business-app/layout.tsx"), /data-biz-theme=\{theme\}/, "guest page renders inside the themed root");
}

// ---------------------------------------------------------------- fresh free check wiring
{
  const loader = read("src/lib/business-app/guest-coffee/load.server.ts");
  const route = read("src/app/api/business/guest/coffee/track-url/route.ts");
  assert.match(loader, /export async function isGuestCoffeePlaylistStillFree/);
  assert.match(loader, /is_free === true && row\.status === "published" && row\.catalog_visibility === "listed"/);
  assert.match(route, /isStillFree: isGuestCoffeePlaylistStillFree/, "uncached re-check right before signing");
  assert.match(route, /issueLease: \(trackSeconds\) => issueGuestCoffeeLease\(request, trackSeconds\)/);
  assert.match(route, /peekUsage: peekGuestCoffeeUsage/);
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
  assert.match(clean, /CREATE TABLE IF NOT EXISTS public\.business_guest_listening_ip_day/);
  assert.match(clean, /REVOKE ALL ON public\.business_guest_listening FROM PUBLIC, anon, authenticated;/);
  assert.match(clean, /REVOKE ALL ON public\.business_guest_listening_ip_day FROM PUBLIC, anon, authenticated;/);
  assert.match(clean, /b\.day > current_date - 30/, "rolling 30-day network window");
  assert.match(clean, new RegExp(`lease_charged_seconds = least\\(v_cap, ${GUEST_COFFEE_MIN_LEASE_CHARGE_SECONDS}\\)`), "minimum charged up front at issuance");
  const granted = [...clean.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO service_role;/g)].map((m) => m[1]).sort();
  assert.deepEqual(granted, ["business_guest_listening_issue", "business_guest_listening_peek", "business_guest_listening_report"]);
  assert.doesNotMatch(clean, /GRANT[^;]*TO (anon|authenticated|PUBLIC)/);
  assert.doesNotMatch(clean, /\b(ALTER TABLE public\.(?!business_guest_listening)|DROP |UPDATE public\.(?!business_guest_listening)|DELETE FROM (?!public\.business_guest_listening_ip_day))/i, "additive only (old buckets of its own table are pruned)");
  for (const body of clean.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)[\s\S]*?\$\$;/g)) {
    assert.match(body[0], /SET search_path = public, pg_temp/, `${body[1]}: fixed search_path`);
    const pure = body[1] === "business_guest_listening_lease_owed_" || body[1] === "business_guest_listening_effective_";
    if (body[1].endsWith("_")) assert.match(clean, new RegExp(`REVOKE ALL ON FUNCTION public\\.${body[1]}\\([^)]*\\) FROM PUBLIC, anon, authenticated, service_role;`), `${body[1]}: internal`);
    if (!pure) assert.match(body[0], /SECURITY DEFINER/, `${body[1]}: SECURITY DEFINER`);
    assert.match(clean, new RegExp(`REVOKE ALL ON FUNCTION public\\.${body[1]}\\(`), `${body[1]}: revoked from PUBLIC`);
  }
  // Constants mirror limit.ts.
  assert.match(clean, new RegExp(`\\(${GUEST_COFFEE_NETWORK_LIMIT_SECONDS} - ${GUEST_COFFEE_LIMIT_SECONDS}\\)`));
  assert.match(clean, new RegExp(`v_effective < ${GUEST_COFFEE_LIMIT_SECONDS}`));
  assert.match(clean, new RegExp(`least\\(p_device\\.lease_cap_seconds, ${GUEST_COFFEE_MIN_LEASE_CHARGE_SECONDS}\\)`));
  assert.doesNotMatch(clean, /\+ 10\b/, "no renewable per-request slack");
  for (const fn of ["peek(text, text)", "report(text, text, integer)", "issue(text, text, integer)", "settle_(text)", "effective_(integer, integer)", "network_used_(text, text)", "lease_owed_(public.business_guest_listening)", "charge_(text, text, integer, date)", "lock_(text, text)"]) {
    assert.ok(rollback.includes(`DROP FUNCTION IF EXISTS public.business_guest_listening_${fn};`), `rollback drops ${fn}`);
  }
  assert.match(rollback, /DROP TABLE IF EXISTS public\.business_guest_listening_ip_day;/);
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
    const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), D = "d".repeat(64), F = "f".repeat(64), H = "e".repeat(64);
    const G1 = "1".repeat(64), G2 = "2".repeat(64), R = "3".repeat(64), Z = "0".repeat(64);
    const OLD = "4".repeat(64), N1 = "5".repeat(64);
    const out = psql(db, [setup, migration, migration /* idempotent re-run */, `
SET ROLE service_role;
SELECT 'i1=' || public.business_guest_listening_issue('${A}', '${F}', 200);
-- burst / replayed reports right after issue: nothing beyond the 15 s charged up front
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
RESET ROLE;
-- fresh cookie for EVERY track, no reports, tracks actually played (time passes):
-- abandoned leases still count for the network → denial after 2 × 30 min.
CREATE TEMP TABLE gc_res (k text, v integer);
GRANT ALL ON gc_res TO service_role;
DO $do$
DECLARE i integer; v integer; granted integer := 0;
BEGIN
  FOR i IN 1..100 LOOP
    v := public.business_guest_listening_issue(lpad(to_hex(1000 + i), 64, 'a'), '${G1}', 200);
    EXIT WHEN v >= 1800;
    granted := granted + 1;
    UPDATE public.business_guest_listening SET lease_started_at = lease_started_at - interval '200 seconds'
    WHERE lease_ip_hash = '${G1}' AND lease_started_at IS NOT NULL;
  END LOOP;
  INSERT INTO gc_res VALUES ('played_granted', granted);
  granted := 0;
  -- instant URL harvesting with fresh cookies (no time passes): 15 s each up front
  FOR i IN 1..400 LOOP
    v := public.business_guest_listening_issue(lpad(to_hex(5000 + i), 64, 'b'), '${G2}', 200);
    EXIT WHEN v >= 1800;
    granted := granted + 1;
  END LOOP;
  INSERT INTO gc_res VALUES ('harvest_granted', granted);
END
$do$;
SELECT k || '=' || v FROM gc_res;
-- abandoned leases older than the window: device still pays, the network does not
INSERT INTO public.business_guest_listening (device_hash, lease_started_at, lease_cap_seconds, lease_charged_seconds, lease_ip_hash)
SELECT lpad(to_hex(9000 + g), 64, 'c'), now() - interval '40 days', 900, 15, '${OLD}' FROM generate_series(1, 4) g;
SET ROLE service_role;
SELECT 'old_peek=' || public.business_guest_listening_peek('${Z}', '${OLD}');
SELECT 'old_issue=' || public.business_guest_listening_issue('${N1}', '${OLD}', 200);
RESET ROLE;
SELECT 'old_net=' || coalesce(sum(used_seconds), 0) FROM public.business_guest_listening_ip_day WHERE ip_hash = '${OLD}';
SELECT 'old_dev=' || used_seconds FROM public.business_guest_listening WHERE device_hash = lpad(to_hex(9001), 64, 'c');
SELECT 'old_open=' || count(*) FROM public.business_guest_listening WHERE lease_ip_hash = '${OLD}' AND device_hash <> '${N1}';
-- two cookies created BEFORE listening on one network H
SET ROLE service_role;
SELECT 'jb=' || public.business_guest_listening_issue('${B}', '${H}', 200);
SELECT 'jc=' || public.business_guest_listening_issue('${C}', '${H}', 200);
RESET ROLE;
UPDATE public.business_guest_listening SET used_seconds = 1800, lease_started_at = NULL, lease_cap_seconds = NULL, lease_ip_hash = NULL, lease_charged_seconds = 0 WHERE device_hash IN ('${B}', '${C}');
UPDATE public.business_guest_listening SET used_seconds = 15 WHERE device_hash = '${C}';
DELETE FROM public.business_guest_listening_ip_day WHERE ip_hash = '${H}';
INSERT INTO public.business_guest_listening_ip_day VALUES ('${H}', current_date, '${B}', 1800);
SET ROLE service_role;
SELECT 'xb=' || public.business_guest_listening_issue('${B}', '${H}', 200);
RESET ROLE;
SELECT 'xblease=' || (lease_started_at IS NULL)::text FROM public.business_guest_listening WHERE device_hash = '${B}';
SET ROLE service_role;
SELECT 'xc=' || public.business_guest_listening_issue('${C}', '${H}', 200);
RESET ROLE;
UPDATE public.business_guest_listening SET lease_started_at = NULL, lease_cap_seconds = NULL, lease_ip_hash = NULL, lease_charged_seconds = 0 WHERE device_hash = '${C}';
UPDATE public.business_guest_listening_ip_day SET used_seconds = 3600 WHERE ip_hash = '${H}' AND device_hash = '${B}';
SET ROLE service_role;
SELECT 'yc=' || public.business_guest_listening_issue('${C}', '${H}', 200);
SELECT 'yd=' || public.business_guest_listening_peek('${D}', '${H}');
SELECT 'yd2=' || public.business_guest_listening_issue('${D}', '${H}', 200);
SELECT 'ye=' || public.business_guest_listening_peek('${D}', NULL);
SELECT 'z=' || public.business_guest_listening_peek('${Z}', NULL);
SELECT 'neg=' || public.business_guest_listening_report('${Z}', NULL, -5);
RESET ROLE;
-- ROLLING 30 days: usage from day -29 still counts, day -30 no longer does
INSERT INTO public.business_guest_listening_ip_day VALUES ('${R}', current_date - 29, '${Z}', 3600);
SET ROLE service_role;
SELECT 'w29=' || public.business_guest_listening_peek('${Z}', '${R}');
RESET ROLE;
UPDATE public.business_guest_listening_ip_day SET day = current_date - 30 WHERE ip_hash = '${R}';
SET ROLE service_role;
SELECT 'w30=' || public.business_guest_listening_peek('${Z}', '${R}');
RESET ROLE;
`].join("\n"));
    const val = (k: string) => Number(out.match(new RegExp(`^${k}=(\\d+)$`, "m"))?.[1]);
    assert.equal(val("i1"), 0, "new guest starts at 0 (value before the up-front charge)");
    assert.equal(val("r1"), 15, "issue charged 15 s up front; an immediate report adds nothing");
    assert.equal(val("r2"), 15, "replayed reports add nothing");
    assert.equal(val("r3"), 75, "real report credited (≤ 60 s per report)");
    assert.equal(val("r4"), 100, "cumulative credit bounded by wall clock since the lease opened");
    assert.equal(val("r5"), 100, "no renewable slack on repeated reports");
    assert.equal(val("i2"), 100, "settling an already reported lease adds nothing");
    assert.equal(val("i3"), 115, "instant skip still costs the 15 s minimum");
    assert.equal(val("p1"), 315, "peek includes what the open lease would cost now");
    assert.equal(val("i4"), 315, "no reports at all: lease settled by the server at the track length");
    assert.equal(val("i5"), 515, "…and again for every following track");
    assert.equal(val("played_granted"), 18, "fresh cookie per track + no reports: denied after 2 × 30 min of network playback");
    assert.equal(val("harvest_granted"), 240, "instant URL harvesting with fresh cookies: denied after 3600 / 15 URLs");
    assert.equal(val("old_peek"), 0, "debt of leases older than the window is not counted for the network");
    assert.equal(val("old_issue"), 0);
    assert.equal(val("old_net"), 15, "settling 40-day-old leases books nothing for the network (only the new URL's 15 s)");
    assert.equal(val("old_dev"), 885, "…but the device still pays the rest of the track (900 − 15 charged up front)");
    assert.equal(val("old_open"), 0, "expired leases of the network were settled");
    assert.equal(val("jb"), 0);
    assert.equal(val("jc"), 0);
    assert.ok(val("xb") >= 1800, "exhausted device refused");
    assert.match(out, /^xblease=true$/m, "no lease is opened for a refused URL");
    assert.equal(val("xc"), 15, "pre-created second cookie on the same network: one more session at most");
    assert.equal(val("yc"), 1815, "network allowance (2 × 30 min) used (+ C’s own 15 s) → second cookie refused too");
    assert.equal(val("yd"), 1815, "brand-new cookie on that network: refused (peek)");
    assert.ok(val("yd2") >= 1800, "brand-new cookie on that network: refused (issue)");
    assert.equal(val("ye"), 0, "another network: own meter");
    assert.equal(val("z"), 0);
    assert.equal(val("neg"), 0, "report without a lease / negative credit ignored");
    assert.equal(val("w29"), 1800, "rolling window: usage from 29 days ago still counts");
    assert.equal(val("w30"), 0, "rolling window: usage from 30 days ago no longer counts");
    // Reciprocal network change (X: lease on net A, now on B; Y: lease on B, now on A),
    // both with debt, issued concurrently in two sessions, many rounds: never a deadlock.
    {
      const NA = "6".repeat(64), NB = "7".repeat(64), X = "8".repeat(64), Y = "9".repeat(64);
      const psqlArgs = (database: string) =>
        container
          ? ["docker", ["exec", "-i", container, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"]] as const
          : ["psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", `${dsn} dbname=${database}`]] as const;
      const runAsync = (input: string) =>
        new Promise<{ code: number | null; err: string }>((resolve) => {
          const [cmd, args] = psqlArgs(db);
          const child = spawn(cmd, [...args], { stdio: ["pipe", "ignore", "pipe"] });
          let err = "";
          child.stderr.on("data", (d) => (err += String(d)));
          child.on("close", (code) => resolve({ code, err }));
          child.stdin.end(input);
        });
      for (let round = 0; round < 25; round++) {
        psql(db, `
DELETE FROM public.business_guest_listening WHERE device_hash IN ('${X}', '${Y}');
INSERT INTO public.business_guest_listening (device_hash, lease_started_at, lease_cap_seconds, lease_charged_seconds, lease_ip_hash) VALUES
  ('${X}', now() - interval '100 seconds', 200, 15, '${NA}'),
  ('${Y}', now() - interval '100 seconds', 200, 15, '${NB}');`);
        const [rx, ry] = await Promise.all([
          runAsync(`SET ROLE service_role; SELECT public.business_guest_listening_issue('${X}', '${NB}', 200); SELECT pg_sleep(0.01); SELECT public.business_guest_listening_report('${X}', '${NB}', 5);`),
          runAsync(`SET ROLE service_role; SELECT public.business_guest_listening_issue('${Y}', '${NA}', 200); SELECT pg_sleep(0.01); SELECT public.business_guest_listening_report('${Y}', '${NA}', 5);`),
        ]);
        assert.equal(rx.code, 0, `round ${round} X: ${rx.err}`);
        assert.equal(ry.code, 0, `round ${round} Y: ${ry.err}`);
        assert.doesNotMatch(rx.err + ry.err, /deadlock/i);
      }
      const books = psql(db, `SELECT ip_hash = '${NA}', sum(used_seconds) FROM public.business_guest_listening_ip_day WHERE ip_hash IN ('${NA}', '${NB}') AND device_hash IN ('${X}', '${Y}') GROUP BY 1 ORDER BY 1;`).trim().split("\n");
      assert.equal(books.length, 2, "each lease was booked on the network it was issued to");
    }
    for (const role of ["anon", "authenticated"]) {
      for (const call of [
        `SELECT public.business_guest_listening_issue('${A}', NULL, 1);`,
        `SELECT public.business_guest_listening_report('${A}', NULL, 1);`,
        `SELECT public.business_guest_listening_peek('${A}', NULL);`,
        `SELECT public.business_guest_listening_charge_('${A}', NULL, 100, current_date);`,
        `SELECT public.business_guest_listening_lock_('${A}', NULL);`,
        `SELECT public.business_guest_listening_settle_('${A}');`,
        "SELECT * FROM public.business_guest_listening;",
        "SELECT * FROM public.business_guest_listening_ip_day;",
      ]) {
        assert.throws(() => psql(db, `SET ROLE ${role}; ${call}`), /permission denied/, `${role}: ${call}`);
      }
    }
    for (const call of [`business_guest_listening_charge_('${A}', NULL, 100, current_date)`, `business_guest_listening_settle_('${A}')`, `business_guest_listening_lock_('${A}', NULL)`]) {
      assert.throws(() => psql(db, `SET ROLE service_role; SELECT public.${call};`), /permission denied/, `internal helper not callable even by service_role: ${call}`);
    }
    assert.throws(() => psql(db, `SET ROLE service_role; SELECT public.business_guest_listening_issue('bad', NULL, 1);`), /invalid_device_hash/);
    assert.throws(() => psql(db, `SET ROLE service_role; SELECT public.business_guest_listening_issue('${A}', 'bad', 1);`), /invalid_ip_hash/);
    psql(db, rollback);
    assert.equal(psql(db, "SELECT to_regclass('public.business_guest_listening') IS NULL AND to_regclass('public.business_guest_listening_ip_day') IS NULL;").trim(), "t", "rollback drops both tables");
    assert.equal(psql(db, "SELECT count(*) FROM pg_proc WHERE proname LIKE 'business_guest_listening%';").trim(), "0", "rollback drops every function");
    console.log("business-guest-coffee-unit: ok (incl. real PostgreSQL scenarios)");
  } finally {
    psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  }
}
