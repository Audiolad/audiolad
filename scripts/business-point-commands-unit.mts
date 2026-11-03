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

// A batch of three "next" commands starts them back to back (the player supersedes the
// earlier ones like rapid presses); a following pause waits for the switch to finish.
{
  const log: string[] = [];
  let status = "playing";
  let release: () => void = () => {};
  const pending: Promise<void>[] = [];
  const run = runPointCommands(["next_track", "next_track", "bogus", "next_track", "pause"], {
    status: () => status,
    next: () => {
      log.push("next");
      const p = new Promise<void>((resolve) => { release = resolve; });
      pending.push(p);
      return p;
    },
    toggle: async () => { log.push(`toggle:${status}`); status = "paused"; },
    stopped: () => false,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, ["next", "next", "next"], "no await between consecutive next commands");
  release();
  await run;
  assert.deepEqual(log, ["next", "next", "next", "toggle:playing"]);
  assert.equal(pending.length, 3);
}
{
  const log: string[] = [];
  await runPointCommands(["resume", "next_track"], {
    status: () => "playing",
    next: async () => { log.push("next"); },
    toggle: async () => { log.push("toggle"); },
    stopped: () => false,
  });
  assert.deepEqual(log, ["next"], "resume while playing is a no-op");
  let stop = false;
  await runPointCommands(["next_track", "next_track"], {
    status: () => "playing",
    next: async () => { log.push("next2"); stop = true; },
    toggle: async () => {},
    stopped: () => stop,
  });
  assert.deepEqual(log, ["next", "next2"], "stopped poll runs nothing more");
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
assert.doesNotMatch(player, /audiolad\.point\.applied-commands/);

console.log("business-point-commands-unit: ok");
