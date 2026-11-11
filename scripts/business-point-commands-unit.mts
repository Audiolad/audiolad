import assert from "node:assert/strict";

import { isPointCommandId, isPointCommandType, pointCommandAction, pointCommandApplied, runPointCommands, waitWhileLoading } from "../src/lib/business-app/point-commands";
import { startWakeTicker } from "../src/lib/business-app/wake-ticker";

assert.equal(isPointCommandType("pause"), true);
assert.equal(isPointCommandType("set_atmosphere"), false);
assert.equal(isPointCommandId("6f1e8c0a-4b2d-4c3e-8a11-0b9c7d6e5f40"), true);
assert.equal(isPointCommandId("not-a-command"), false);

assert.equal(pointCommandAction("playing", "pause"), "toggle");
assert.equal(pointCommandAction("paused", "pause"), "none");
assert.equal(pointCommandAction("paused", "resume"), "toggle");
assert.equal(pointCommandAction("playing", "resume"), "none");
assert.equal(pointCommandAction("playing", "next_track"), "next");

const command = (type = "next_track") => ({
  id: "6f1e8c0a-4b2d-4c3e-8a11-0b9c7d6e5f40", type,
  claim_id: "7f1e8c0a-4b2d-4c3e-8a11-0b9c7d6e5f40",
  claim_until: new Date(Date.now() + 30_000).toISOString(),
});
const log: string[] = [];
let status = "playing";
const runner = () => ({
  ready: () => true,
  status: () => status,
  stopped: () => false,
  next: async () => { log.push("next"); },
  toggle: async () => { log.push("toggle"); status = status === "playing" ? "paused" : "playing"; },
  applied: async () => true,
  ack: async (row: { type: string }) => { log.push(`ack:${row.type}`); },
});
{
  let release = () => {};
  const run = runPointCommands([command(), command("pause")], {
    ...runner(), next: () => new Promise<void>((resolve) => { log.push("next"); release = resolve; }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, ["next"], "no ack or later apply while the first apply is pending");
  release(); await run;
  assert.deepEqual(log, ["next", "ack:next_track", "toggle", "ack:pause"]);
}
log.length = 0;
await runPointCommands([command("pause")], runner());
assert.deepEqual(log, ["ack:pause"], "already paused is an applied no-op");
for (const failure of ["throw", "result", "timeout", "stop", "not-ready", "expired", "invalid", "ack"]) {
  log.length = 0;
  let stop = false;
  const row = command();
  if (failure === "expired") row.claim_until = new Date(Date.now() - 1).toISOString();
  if (failure === "invalid") row.claim_id = "bad";
  const run = runPointCommands([row], {
    ...runner(),
    stopped: () => stop,
    ready: () => failure !== "not-ready",
    next: async (signal: AbortSignal) => {
      log.push("next");
      if (failure === "throw") throw new Error("audio failure");
      if (failure === "stop") stop = true;
      if (failure === "timeout") await new Promise<void>((resolve) => signal.addEventListener("abort", () => { log.push("cancel"); resolve(); }));
    },
    applied: async () => failure !== "result",
    ack: async () => { log.push("ack"); if (failure === "ack") throw new Error("network"); },
  }, 10);
  if (["throw", "result", "timeout", "stop", "ack"].includes(failure)) await assert.rejects(run);
  else await run;
  assert.equal(log.includes("ack"), failure === "ack", `${failure}: no false ack`);
  if (failure === "timeout") assert.ok(log.includes("cancel"));
}
// An apply that resolves after timeout still cannot acknowledge or start a later row.
{
  log.length = 0;
  let release = () => {};
  await assert.rejects(runPointCommands([command(), command()], {
    ...runner(), next: () => new Promise<void>((resolve) => { release = resolve; }),
  }, 5), /timeout/);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, []);
}

// Resume / next while the hall is still loading the track: wait for it, do not fail into the lease.
{
  let st = "loading";
  let slept = 0;
  await waitWhileLoading(() => st, 1_000, 100, async (ms) => { slept += ms; if (slept >= 300) st = "playing"; });
  assert.equal(slept, 300);
  st = "loading"; slept = 0;
  await waitWhileLoading(() => st, 500, 100, async (ms) => { slept += ms; });
  assert.equal(slept, 500, "bounded wait");
  slept = 0;
  await waitWhileLoading(() => "paused", 500, 100, async (ms) => { slept += ms; });
  assert.equal(slept, 0);
}

// Command poll ticker: worker-backed wake-ups plus a fallback interval, one call per period.
{
  let t = 0;
  let intervalFn: (() => void) | null = null;
  let cleared = false;
  let terminated = false;
  const worker = { onmessage: null as ((e: unknown) => void) | null, period: 0, postMessage(v: unknown) { this.period = Number(v); }, terminate() { terminated = true; } };
  let calls = 0;
  const stop = startWakeTicker(() => { calls++; }, 5_000, {
    now: () => t,
    createWorker: () => worker,
    setInterval: (fn) => { intervalFn = fn; return 1; },
    clearInterval: () => { cleared = true; },
  });
  assert.equal(worker.period, 5_000);
  t = 5_000; worker.onmessage?.({}); intervalFn!();
  assert.equal(calls, 1, "worker and interval share one gap guard");
  t = 10_000; worker.onmessage?.({});
  assert.equal(calls, 2, "worker alone keeps polling (hidden tab)");
  t = 15_000; intervalFn!();
  assert.equal(calls, 3, "interval alone keeps polling (no worker)");
  stop();
  assert.ok(cleared && terminated && worker.onmessage === null);
  let fallbackCalls = 0;
  let fallback: (() => void) | null = null;
  startWakeTicker(() => { fallbackCalls++; }, 5_000, {
    now: () => 0, createWorker: () => { throw new Error("blocked"); }, setInterval: (fn) => { fallback = fn; return 1; }, clearInterval: () => {},
  });
  fallback!();
  assert.equal(fallbackCalls, 1, "no worker: plain interval");
}

const route = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../src/app/api/business/point/route.ts", import.meta.url), "utf8"),
);
assert.match(route, /enqueue_business_point_command/);
assert.match(route, /claim_business_point_commands/);
assert.match(route, /ack_business_point_command/);
assert.doesNotMatch(route, /Domain=/);

const player = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8"),
);
assert.match(player, /action: "commands"/);
assert.match(player, /5_000/);
assert.match(player, /inFlight/);
assert.match(player, /action: "ack", id: command.id, claimId: command.claim_id/);
// The player's apply check lives in point-commands.ts (pointCommandApplied), wired to the real refs.
const commandsLib = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../src/lib/business-app/point-commands.ts", import.meta.url), "utf8"),
);
assert.match(player, /applied: pointCommandApplied\(\{\n\s*status: \(\) => ctlRef\.current\?\.status,\n\s*audio: \(\) => audioRef\.current,\n\s*fade: \(\) => fadeRef\.current,/);
assert.match(commandsLib, /status === "playing" && !audio.paused/);
assert.match(commandsLib, /if \(type === "pause" && fade\?\.fadingOut\) await fade\.fadeOut\(\);/);
assert.match(route, /p_claim_id: body.claimId/);
assert.doesNotMatch(player, /audiolad\.point\.applied-commands/);
// A command triggers a sound-settings refresh in parallel: it may only reorder upcoming
// tracks (keepCurrent), never touch the sounding source (no hard cut mid-fade).
{
  const take = player.slice(player.indexOf("const take = (sound: PointSoundUpdate) => {"), player.indexOf("const tick = async () => {", player.indexOf("const take = (sound")));
  assert.match(take, /keepCurrent: true/);
  const rebuild = player.slice(player.indexOf("const rebuildFromProfile = useCallback"), player.indexOf("}, [applyAtmosphereQueue]);"));
  assert.match(rebuild, /if \(input\.keepCurrent\) \{[^}]*return "applied";\n\s*\}\n\s*applyAtmosphereQueue\(indices\);/);
  assert.match(commandsLib, /await waitWhileLoading\(\(\) => deps\.status\(\) \?\? "idle", deps\.settleMs \?\? POINT_RESUME_SETTLE_MS, 200, deps\.sleep\);/);
}

// pointCommandApplied: resume waits out "loading"; pause waits for the fade, then confirms.
{
  let st = "loading";
  let slept = 0;
  let owner = 0;
  const audio = { paused: false };
  const applied = pointCommandApplied({
    status: () => st, audio: () => audio, fade: () => null, ownerPaused: () => { owner += 1; },
    settleMs: 1_000, sleep: async (ms) => { slept += ms; if (slept >= 400) st = "playing"; },
  });
  assert.equal(await applied("resume"), true);
  assert.equal(slept, 400);
  assert.equal(owner, 0);
  let faded = false;
  const fade = { fadingOut: true, fadeOut: async () => { faded = true; audio.paused = true; st = "paused"; return true; } };
  const pausing = pointCommandApplied({ status: () => st, audio: () => audio, fade: () => fade, ownerPaused: () => { owner += 1; } });
  assert.equal(await pausing("pause"), true);
  assert.equal(faded, true);
  assert.equal(owner, 1, "confirmed pause reaches the owner-pause hook");
}

console.log("business-point-commands-unit: ok");
