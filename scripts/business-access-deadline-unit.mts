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
function setup(initial: WorkspacePageModel) {
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
    onStatus: (next) => { adopted.push(next); },
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
assert.match(workspace, /player.accessModel/);
assert.doesNotMatch(workspace, /release\(\)|setTimeout\(check/);
console.log("business access deadline: ok");
