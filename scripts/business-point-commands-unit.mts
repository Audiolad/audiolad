import assert from "node:assert/strict";

import { isPointCommandId, isPointCommandType, pointCommandAction } from "../src/lib/business-app/point-commands";

assert.equal(isPointCommandType("pause"), true);
assert.equal(isPointCommandType("set_atmosphere"), false);
assert.equal(isPointCommandId("6f1e8c0a-4b2d-4c3e-8a11-0b9c7d6e5f40"), true);
assert.equal(isPointCommandId("not-a-command"), false);

assert.equal(pointCommandAction("playing", "pause"), "toggle");
assert.equal(pointCommandAction("paused", "pause"), "none");
assert.equal(pointCommandAction("paused", "resume"), "toggle");
assert.equal(pointCommandAction("playing", "resume"), "none");
assert.equal(pointCommandAction("playing", "next_track"), "next");

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
