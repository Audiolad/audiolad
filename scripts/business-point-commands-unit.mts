import assert from "node:assert/strict";

import { isPointCommandId, isPointCommandType, pointCommandAction, runPointCommands } from "../src/lib/business-app/point-commands";

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
assert.match(player, /status === "playing" && !audio.paused/);
assert.match(player, /await fadeRef.current.fadeOut\(\)/);
assert.match(route, /p_claim_id: body.claimId/);
assert.doesNotMatch(player, /audiolad\.point\.applied-commands/);

console.log("business-point-commands-unit: ok");
