import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACCESS_REFRESH_MS, ACCESS_TOLERANCE_MS, ACCESS_MIN_CHECK_MS,
  createAccessDeadline, workspaceAudioDeadline, workspaceControllerKey,
} from "../src/lib/business-workspace/access-deadline";
import { workspaceItems, workspacePlaybackDeadline, type WorkspacePageModel } from "../src/lib/business-workspace/model";
import { SpaOnlinePlayer } from "../src/lib/business-app/spa-online-player";

const T0 = Date.parse("2026-11-04T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
function model(deadline: number, patch: Partial<WorkspacePageModel> = {}): WorkspacePageModel {
  return {
    spaceId: "cafe", spaceTitle: "Кофейня", spaceEnabled: true, status: "paid",
    daysLeft: 1, endsAtLabel: null, endsAt: iso(deadline), playbackUntil: iso(deadline),
    priceLabel: "", periodLabel: "", needsVenue: false, playback: null,
    helpHref: "", rightsHref: "", onboardingHref: "", signUpHref: "", signInHref: "", cafeHref: "",
    tracks: [{ audioItemId: "track-1", title: "Музыка", durationSeconds: 180,
      authorId: null, authorName: null, albumTitle: null, shelf: "cafe" }], ...patch,
  };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup(initial: WorkspacePageModel, onStatus?: (next: WorkspacePageModel) => void) {
  let now = T0;
  let sequence = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let status = initial;
  let fetcher: () => Promise<WorkspacePageModel> = async () => status;
  let requests = 0;
  let stops = 0;
  const adopted: WorkspacePageModel[] = [];
  const clock = {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = ++sequence;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id: unknown) => { timers.delete(id as number); },
  };
  const access = createAccessDeadline(initial, {
    ...clock,
    fetchStatus: () => { requests++; return fetcher(); },
    onStatus: (next) => { adopted.push(next); onStatus?.(next); },
    onExpired: () => { stops++; },
  });
  return {
    access, clock, adopted,
    get requests() { return requests; }, get stops() { return stops; },
    get now() { return now; },
    respond(next: WorkspacePageModel) { status = next; fetcher = async () => status; },
    fetchWith(next: () => Promise<WorkspacePageModel>) { fetcher = next; },
    async advance(target: number) {
      assert.ok(target >= now);
      for (let count = 0; count < 10_000; count++) {
        const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry || entry[1].at > target) { now = target; await flush(); return; }
        now = entry[1].at;
        timers.delete(entry[0]);
        entry[1].fn();
        await flush();
      }
      assert.fail("timer storm");
    },
  };
}

// Paid on another device exactly at the local deadline: wait for the response, then re-arm.
{
  const deadline = T0 + 120_000;
  const w = setup(model(deadline));
  await w.advance(deadline - 1);
  assert.equal(w.requests, 2, "initial refresh plus the check one minute before expiry");
  let resolve!: (value: WorkspacePageModel) => void;
  w.fetchWith(() => new Promise((done) => { resolve = done; }));
  await w.advance(deadline);
  assert.equal(w.stops, 0, "no stop before the server responds");
  const renewed = model(deadline + 3_600_000);
  resolve(renewed);
  await flush();
  assert.equal(w.stops, 0);
  assert.equal(w.adopted.at(-1)?.playbackUntil, renewed.playbackUntil);
  w.respond(renewed);
  await w.advance(deadline + ACCESS_REFRESH_MS);
  assert.equal(w.stops, 0, "the new deadline is armed");
  w.access.dispose();
}

// Gift ends without payment: server confirmation closes immediately, without tolerance.
{
  const deadline = T0 + 120_000;
  const w = setup(model(deadline, { status: "trial" }));
  await w.advance(deadline - 1);
  w.respond(model(deadline, { status: "offer", tracks: [] }));
  await w.advance(deadline);
  assert.equal(w.stops, 1);
  assert.equal(w.access.allowsPlayback(), false);
  w.access.dispose();
}

// Navigation/payment supersedes every outcome of an older in-flight request.
for (const stale of ["offer", "paid", "network", "unavailable"] as const) {
  const deadline = T0 + 120_000;
  const renewed = model(deadline + 3_600_000);
  const w = setup(model(deadline));
  let resolve!: (value: WorkspacePageModel) => void;
  let reject!: (reason: Error) => void;
  w.fetchWith(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
  const pending = w.access.refresh();
  await flush();
  assert.equal(w.access.update(renewed), true);
  if (stale === "network") reject(new Error("offline"));
  else resolve(model(deadline, { status: stale, tracks: [] }));
  await pending;
  assert.equal(w.stops, 0, stale);
  assert.equal(w.adopted.length, 0, "superseded responses never overwrite the provider model");
  assert.equal(w.access.allowsPlayback(), true);
  // A stale failure must not impose backoff on the newer access revision either.
  w.respond(renewed);
  await w.advance(T0 + ACCESS_MIN_CHECK_MS);
  await w.access.refresh();
  assert.equal(w.requests, 2);
  await w.advance(deadline + ACCESS_TOLERANCE_MS);
  assert.equal(w.stops, 0, "the renewed deadline survives the old tolerance boundary");
  w.access.dispose();
}

// Navigation conflicts require one fresh status round-trip, independently of the catalog.
for (const patch of [
  { status: "offer" as const },
  { status: "anonymous" as const },
  { status: "unconfirmed" as const },
  { spaceEnabled: false },
  { playbackUntil: iso(T0) },
]) {
  const w = setup(model(T0 + 3_600_000));
  const denied = model(T0 + 3_600_000, { ...patch, tracks: [] });
  w.respond(denied);
  assert.equal(w.access.update(denied), false);
  assert.equal(w.stops, 0, "navigation alone cannot stop playback");
  assert.equal(w.access.allowsPlayback(), true);
  await flush();
  assert.equal(w.requests, 1, "verification bypasses the periodic interval");
  assert.equal(w.stops, 1, "fresh confirmation stops promptly after one round-trip");
  assert.equal(w.access.allowsPlayback(), false);
  w.access.dispose();
}
{
  const w = setup(model(T0 + 3_600_000));
  assert.equal(w.access.update(model(T0, { status: "unavailable", tracks: [] })), false);
  assert.equal(w.stops, 0, "an HTTP-200 outage is not a navigation denial");
  assert.equal(w.access.allowsPlayback(), true);
  await w.access.refresh();
  assert.equal(w.requests, 0, "navigation outages share failure backoff");
  await w.advance(T0 + ACCESS_MIN_CHECK_MS);
  assert.equal(w.requests, 1, "retry without another navigation");
  assert.equal(w.stops, 0);
  w.access.dispose();
}

// Focus/online shortly before expiry cannot postpone the mandatory deadline check.
for (const event of ["focus", "online"] as const) {
  const deadline = T0 + 120_000;
  const w = setup(model(deadline));
  await w.advance(deadline - 5_000);
  await w.access.refresh();
  const before = w.requests;
  w.respond(model(deadline, { status: "offer", tracks: [] }));
  await w.advance(deadline - 1);
  assert.equal(w.stops, 0);
  await w.advance(deadline);
  assert.equal(w.requests, before + 1, event);
  assert.equal(w.stops, 1, "server-confirmed expiry at the real deadline");
  w.access.dispose();
}

// The deadline exemption still deduplicates a pending focus/online request.
{
  const deadline = T0 + 120_000;
  const w = setup(model(deadline));
  await w.advance(deadline - 5_000);
  let resolve!: (value: WorkspacePageModel) => void;
  w.fetchWith(() => new Promise((done) => { resolve = done; }));
  const pending = w.access.refresh();
  await flush();
  const before = w.requests;
  await w.advance(deadline);
  assert.equal(w.access.refresh(), pending);
  assert.equal(w.requests, before);
  assert.equal(w.stops, 0);
  w.respond(model(deadline, { status: "offer", tracks: [] }));
  resolve(model(deadline, { status: "offer", tracks: [] }));
  await pending;
  await flush();
  assert.equal(w.requests, before + 1, "pre-deadline denial needs a fresh check");
  assert.equal(w.stops, 1);
  w.access.dispose();
}

// Renewal between a pre-deadline snapshot and delivery must survive the old response.
for (const status of ["paid", "offer"] as const) {
  const deadline = T0 + 120_000;
  const renewed = model(deadline + 3_600_000);
  const w = setup(model(deadline));
  await w.advance(deadline - 5_000);
  let resolveOld!: (value: WorkspacePageModel) => void;
  let resolveFresh!: (value: WorkspacePageModel) => void;
  w.fetchWith(() => new Promise((done) => { resolveOld = done; }));
  const pending = w.access.refresh();
  await flush();
  const before = w.requests;
  await w.advance(deadline + 1);
  w.fetchWith(() => new Promise((done) => { resolveFresh = done; }));
  resolveOld(model(deadline, { status }));
  await pending;
  await flush();
  assert.equal(w.requests, before + 1, "fresh request starts after elapsed snapshot delivery");
  assert.equal(w.stops, 0, "elapsed pre-deadline snapshot is not confirmed expiry");
  assert.equal(w.access.allowsPlayback(), true);
  resolveFresh(renewed);
  await flush();
  assert.equal(w.adopted.at(-1)?.playbackUntil, renewed.playbackUntil);
  w.respond(renewed);
  await w.advance(deadline + ACCESS_TOLERANCE_MS);
  assert.equal(w.stops, 0);
  w.access.dispose();
}

// Provider ordering: publish renewal, then reject stale navigation before model/manifest adoption.
for (const stale of [
  model(T0 - 1),
  model(T0 + 120_000, { status: "offer", tracks: [] }),
  model(T0 + 120_000),
]) {
  const renewed = model(T0 + 7_200_000);
  let providerModel = model(T0 + 3_600_000);
  const w = setup(providerModel, (next) => { providerModel = next; });
  w.respond(renewed);
  await w.access.refresh();
  assert.equal(providerModel, renewed);
  let resolve!: (value: WorkspacePageModel) => void;
  w.fetchWith(() => new Promise((done) => { resolve = done; }));
  // Mirror the provider's synchronous guard, also asserted against its source below.
  const adoptNavigation = (next: WorkspacePageModel) => {
    if (!w.access.update(next)) return;
    providerModel = next;
  };
  adoptNavigation(stale);
  adoptNavigation(stale);
  await flush();
  assert.equal(w.requests, 2, "navigation conflict bypasses rate limit and deduplicates");
  assert.equal(providerModel, renewed, "provider never publishes the stale model to its manifest");
  assert.equal(w.stops, 0);
  assert.equal(w.access.allowsPlayback(), true);
  resolve(renewed);
  await flush();
  assert.equal(providerModel, renewed);
  w.respond(renewed);
  await w.advance(T0 + 3_600_000 + ACCESS_TOLERANCE_MS);
  assert.equal(w.stops, 0, "neither scheduler nor provider rolls back the renewed deadline");
  w.access.dispose();
}

// Status snapshots cannot silently shorten an accepted future window either.
{
  const renewed = model(T0 + 7_200_000);
  const earlier = model(T0 + 3_600_000);
  const w = setup(renewed);
  let resolveOld!: (value: WorkspacePageModel) => void;
  let resolveFresh!: (value: WorkspacePageModel) => void;
  w.fetchWith(() => new Promise((done) => { resolveOld = done; }));
  const pending = w.access.refresh();
  await flush();
  w.fetchWith(() => new Promise((done) => { resolveFresh = done; }));
  resolveOld(earlier);
  await pending;
  await flush();
  assert.equal(w.requests, 2);
  assert.equal(w.adopted.length, 0, "unverified shortening is never published");
  assert.equal(w.stops, 0);
  resolveFresh(renewed);
  await flush();
  assert.equal(w.adopted.at(-1), renewed);
  w.access.dispose();
}

// A navigation conflict invalidates a status request already in flight, even in the same ms.
{
  const renewed = model(T0 + 7_200_000);
  const w = setup(model(T0 + 3_600_000));
  w.respond(renewed);
  await w.access.refresh();
  await w.advance(T0 + ACCESS_MIN_CHECK_MS);
  let resolveOld!: (value: WorkspacePageModel) => void;
  let resolveFresh!: (value: WorkspacePageModel) => void;
  w.fetchWith(() => new Promise((done) => { resolveOld = done; }));
  const pending = w.access.refresh();
  await flush();
  const denied = model(T0, { status: "offer", tracks: [] });
  assert.equal(w.access.update(denied), false);
  w.fetchWith(() => new Promise((done) => { resolveFresh = done; }));
  resolveOld(denied);
  await pending;
  await flush();
  assert.equal(w.requests, 3);
  assert.equal(w.stops, 0, "request preceding the conflict cannot confirm it");
  resolveFresh(denied);
  await flush();
  assert.equal(w.stops, 1, "fresh status denial confirms stale navigation denial");
  w.access.dispose();
}

// A different navigation conflict arriving during verification requires a newer request.
{
  const w = setup(model(T0 + 7_200_000));
  let resolveOld!: (value: WorkspacePageModel) => void;
  let resolveFresh!: (value: WorkspacePageModel) => void;
  w.fetchWith(() => new Promise((done) => { resolveOld = done; }));
  assert.equal(w.access.update(model(T0 + 3_600_000)), false);
  await flush();
  const denied = model(T0, { status: "offer", tracks: [] });
  assert.equal(w.access.update(denied), false);
  w.fetchWith(() => new Promise((done) => { resolveFresh = done; }));
  resolveOld(denied);
  await flush();
  assert.equal(w.requests, 2);
  assert.equal(w.stops, 0, "verification preceding the new conflict is superseded");
  resolveFresh(denied);
  await flush();
  assert.equal(w.stops, 1);
  w.access.dispose();
}

// A failed pre-deadline event keeps its retry backoff when crossing the deadline.
{
  const deadline = T0 + 120_000;
  const w = setup(model(deadline));
  await w.advance(deadline - 5_000);
  w.fetchWith(() => Promise.reject(new Error("offline")));
  await w.access.refresh();
  const before = w.requests;
  await w.advance(deadline);
  await w.access.refresh();
  assert.equal(w.requests, before, "deadline/focus/online respect failure backoff");
  assert.equal(w.stops, 0);
  w.respond(model(deadline + 3_600_000));
  await w.advance(deadline + 5_000);
  assert.equal(w.requests, before + 1);
  assert.equal(w.stops, 0);
  w.access.dispose();
}

// An active status with an elapsed playback deadline is also confirmed expiry.
{
  const deadline = T0 + 120_000;
  const w = setup(model(deadline));
  await w.advance(deadline);
  assert.equal(w.stops, 1);
  w.access.dispose();
}

// Periodic/focus renewal, including gift conversion: unchanged controller key and source.
for (const event of ["periodic", "focus"] as const) {
  const initial = model(T0 + 3_600_000, { status: "trial" });
  const renewed = model(T0 + 7_200_000);
  const w = setup(initial);
  let plays = 0;
  let pauses = 0;
  let fades = 0;
  let signs = 0;
  let controllers = 0;
  const audio = {
    src: "", currentTime: 0,
    async play() { plays++; }, pause() { pauses++; }, load() {},
    removeAttribute() { this.src = ""; },
    async fadeOutForSwitch() { fades++; return true; },
  };
  const controllerKey = workspaceControllerKey(initial);
  const ctl = new SpaOnlinePlayer({
    ...w.clock, audio, onChange() {},
    sign: async () => { signs++; return { ok: true, data: { url: "https://example.com/audio" } }; },
  }, workspaceItems(initial.tracks, workspaceAudioDeadline(initial)));
  controllers++;
  await ctl.playIndex(0);
  audio.currentTime = 42;
  const before = { plays, pauses, fades, signs, src: audio.src };
  await w.advance(T0);
  w.respond(renewed);
  if (event === "periodic") await w.advance(T0 + ACCESS_REFRESH_MS);
  else { await w.advance(T0 + ACCESS_MIN_CHECK_MS); await w.access.refresh(); }
  const latest = w.adopted.at(-1)!;
  if (workspaceControllerKey(latest) !== controllerKey) controllers++;
  await ctl.applyManifest(workspaceItems(latest.tracks, workspaceAudioDeadline(latest)));
  assert.equal(controllers, 1);
  assert.equal(ctl.status, "playing");
  assert.equal(audio.currentTime, 42);
  assert.deepEqual({ plays, pauses, fades, signs, src: audio.src }, before);
  assert.equal(ctl.current?.playableUntil?.getTime(), Date.parse(latest.playbackUntil!) + ACCESS_TOLERANCE_MS);
  await w.advance(Date.parse(initial.playbackUntil!) + ACCESS_TOLERANCE_MS);
  assert.equal(ctl.status, "playing", "the old engine hard-stop was cancelled");
  assert.equal(w.stops, 0);
  assert.deepEqual({ plays, pauses, fades, signs, src: audio.src }, before);
  ctl.dispose();
  w.access.dispose();
}

// A failed deadline check, denied next-track sign, then verified renewal recovers
// the SAME controller at the selected queue successor (including autoplay refusal).
for (const autoplayBlocked of [false, true]) {
  const deadline = T0 + 120_000;
  const base = model(deadline);
  const initial = { ...base, tracks: [base.tracks[0],
    { ...base.tracks[0], audioItemId: "track-2" },
    { ...base.tracks[0], audioItemId: "track-3" }] };
  const renewed = { ...initial, endsAt: iso(deadline + 3_600_000), playbackUntil: iso(deadline + 3_600_000) };
  const box: { ctl?: SpaOnlinePlayer } = {};
  let recovery: Promise<void> = Promise.resolve();
  const w = setup(initial, (next) => {
    recovery = box.ctl!.restoreVerifiedAccess(workspaceItems(initial.tracks, workspaceAudioDeadline(next)));
  });
  let allowed = true;
  let blocked = false;
  let plays = 0;
  const signed: string[] = [];
  const audio = {
    src: "", currentTime: 0, paused: true,
    async play() {
      plays++;
      if (blocked) throw new Error("NotAllowedError");
      this.paused = false;
    },
    pause() { this.paused = true; }, load() {},
    removeAttribute() { this.src = ""; this.currentTime = 0; },
  };
  const ctl = box.ctl = new SpaOnlinePlayer({
    ...w.clock, audio, onChange() {},
    nextIndex: (current) => current === 0 ? 2 : 0,
    sign: async (id) => {
      signed.push(id);
      return allowed ? { ok: true, data: { url: `https://example.com/${id}` } }
        : { ok: false, reason: "no_access" };
    },
  }, workspaceItems(initial.tracks, workspaceAudioDeadline(initial)));
  await ctl.toggle();
  await w.advance(deadline - 1);
  w.fetchWith(() => Promise.reject(new Error("offline")));
  await w.advance(deadline);
  assert.equal(w.stops, 0);
  allowed = false;
  await ctl.onEnded();
  assert.equal(ctl.status, "no_access");
  assert.equal(audio.paused, true);
  assert.deepEqual(signed, ["track-1", "track-3"]);
  // Navigation/model effects alone must never clear a denial or lose the intent.
  await ctl.applyManifest(workspaceItems(renewed.tracks, workspaceAudioDeadline(renewed)));
  await ctl.toggle();
  assert.equal(ctl.status, "no_access");
  assert.equal(plays, 1);
  allowed = true;
  blocked = autoplayBlocked;
  w.respond(renewed);
  await w.advance(deadline + ACCESS_MIN_CHECK_MS);
  await recovery;
  assert.equal(w.stops, 0);
  assert.equal(workspaceControllerKey(initial), workspaceControllerKey(renewed));
  assert.equal(ctl.current?.audioItemId, "track-3", "resume the denied queue successor");
  assert.deepEqual(signed, ["track-1", "track-3", "track-3"], "renewal re-signs automatically");
  assert.equal(plays, 2, "no user click is needed to resume");
  assert.equal(ctl.status, autoplayBlocked ? "paused" : "playing");
  if (autoplayBlocked) {
    assert.equal(audio.paused, true);
    assert.equal(ctl.needsGesture, true, "autoplay refusal asks for the «Включить музыку» tap");
    blocked = false;
  } else {
    await ctl.toggle();
    assert.equal(ctl.status, "paused");
  }
  await ctl.toggle();
  assert.equal(ctl.status, "playing", "Play works after verified renewal");
  assert.equal(audio.paused, false);
  ctl.dispose();
  w.access.dispose();
}

// A user-paused hall stays paused when a denied controller regains access.
{
  const initial = model(T0 + 120_000);
  const w = setup(initial);
  let plays = 0;
  const ctl = new SpaOnlinePlayer({
    ...w.clock, onChange() {},
    audio: { src: "", currentTime: 0, async play() { plays++; }, pause() {}, load() {},
      removeAttribute() { this.src = ""; } },
    sign: async () => ({ ok: true, data: { url: "https://example.com/audio" } }),
  }, workspaceItems(initial.tracks, workspaceAudioDeadline(initial)));
  await ctl.toggle();
  await ctl.toggle();
  await ctl.applyManifest(null);
  await ctl.applyManifest(null);
  await ctl.restoreVerifiedAccess(workspaceItems(initial.tracks, workspaceAudioDeadline(initial)));
  assert.equal(ctl.status, "paused");
  assert.equal(plays, 1, "renewal respects the user's pause");
  await ctl.playIndex(0);
  assert.equal(ctl.status, "playing");
  assert.equal(plays, 2);
  ctl.dispose();
  w.access.dispose();
}

// The contract end is not the audio deadline, including when already in grace.
{
  const endsAt = T0 + 120_000;
  const playbackUntil = endsAt + 3_600_000;
  const initial = model(endsAt, { status: "grace", playbackUntil: iso(playbackUntil) });
  assert.equal(workspacePlaybackDeadline(initial), iso(playbackUntil));
  const w = setup(initial);
  await w.advance(endsAt + 1);
  assert.equal(w.stops, 0);
  assert.equal(w.access.allowsPlayback(), true);
  assert.equal(w.requests, 1, "no check or stop at the contract end");
  w.access.dispose();
}

// Network/backend failure: retries with a cap, never shifts the tolerance window.
for (const failure of ["network", "unavailable", "hung"] as const) {
  const deadline = T0 + 120_000;
  const w = setup(model(deadline));
  await w.advance(deadline - 1);
  w.fetchWith(() => failure === "network" ? Promise.reject(new Error("offline"))
    : failure === "hung" ? new Promise<WorkspacePageModel>(() => {})
    : Promise.resolve(model(deadline, { status: "unavailable" })));
  await w.advance(deadline);
  assert.equal(w.stops, 0);
  assert.equal(w.access.allowsPlayback(), true);
  await w.advance(deadline + ACCESS_TOLERANCE_MS - 1);
  assert.equal(w.stops, 0);
  if (failure !== "hung") assert.ok(w.requests > 3 && w.requests < 40);
  await w.advance(deadline + ACCESS_TOLERANCE_MS);
  assert.equal(w.stops, 1);
  assert.equal(w.access.allowsPlayback(), false);
  w.access.dispose();
}

// Focus/visible/online share one in-flight request and a 10-second minimum interval.
{
  const w = setup(model(T0 + 3_600_000));
  let resolve!: (value: WorkspacePageModel) => void;
  w.fetchWith(() => new Promise((done) => { resolve = done; }));
  const first = w.access.refresh();
  const second = w.access.refresh();
  assert.equal(first, second);
  await flush();
  assert.equal(w.requests, 1);
  resolve(model(T0 + 7_200_000));
  await first;
  await Promise.all([w.access.refresh(), w.access.refresh()]);
  assert.equal(w.requests, 1);
  await w.advance(T0 + ACCESS_MIN_CHECK_MS);
  w.respond(model(T0 + 7_200_000));
  await w.access.refresh();
  assert.equal(w.requests, 2);
  w.access.dispose();
}

// A disposed provider ignores late responses and leaves no playback callbacks behind.
{
  const w = setup(model(T0 + 3_600_000));
  let resolve!: (value: WorkspacePageModel) => void;
  w.fetchWith(() => new Promise((done) => { resolve = done; }));
  const pending = w.access.refresh();
  await flush();
  w.access.dispose();
  resolve(model(T0, { status: "offer" }));
  await pending;
  assert.equal(w.stops, 0);
  assert.equal(w.adopted.length, 0);
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const player = read("src/components/business-app/workspace/BusinessCabinetPlayer.tsx");
const workspace = read("src/components/business-app/workspace/BusinessWorkspace.tsx");
assert.doesNotMatch(player, /workspacePlaybackAllowed\(current\.endsAt/);
assert.match(player, /workspaceControllerKey\(model\)/);
assert.match(player, /window.addEventListener\("online", refresh\)/);
assert.match(player, /document.visibilityState === "visible"/);
const statusHandler = player.split("onStatus: (next) => {")[1]?.split("onExpired:")[0];
assert.ok(statusHandler);
assert.match(statusHandler, /workspacePlaybackAllowed\(workspacePlaybackDeadline\(updated\), Date.now\(\)\)/);
assert.match(statusHandler, /restoreVerifiedAccess\(items\)/);
assert.match(statusHandler, /if \(ctl\?\.status === "no_access"\) seekRef.current = 0/);
assert.match(workspace, /player.accessModel/);
assert.match(workspace, /useLayoutEffect\(\(\) => \{\s*adopt\(initialModel\);/);
const adoption = player.split("const adopt = useCallback")[1]?.split("const release = useCallback")[0];
assert.ok(adoption);
assert.match(adoption, /if \(access && !access\.update\(next\)\) return;/);
assert.ok(adoption.indexOf("access.update(next)") < adoption.indexOf("next.tracks.length === 0"),
  "server access is reconciled before catalog adoption");
assert.doesNotMatch(player, /accessRef\.current\?\.update\(model\)/,
  "internal access publications must not invalidate their own requests");
assert.doesNotMatch(workspace, /release\(\)|setTimeout\(check/);
console.log("business access deadline: ok");
