import assert from "node:assert/strict";

import {
  latestVenueProfile,
  recordVenueSound,
  resetVenueSoundWrites,
  serialVenueWrite,
} from "../src/lib/business-app/venue-sound-writes";

type Profile = { character: string; direction: string };
const OLD = { character: "cozy", direction: "jazz" } as unknown as Parameters<typeof recordVenueSound>[1];
const NEW = { character: "lively", direction: "pop" } as unknown as Parameters<typeof recordVenueSound>[1];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Collapse/reopen: builder A confirms a rebuild whose save is slow; builder B (reopened,
// seeded from the old row, version 3) saves hours meanwhile. B must run after A and keep A's atmosphere.
{
  resetVenueSoundWrites();
  const rows: { profile: Profile; at: number }[] = [];
  let version = 3;
  const a = serialVenueWrite("loc-1", async () => {
    await wait(30);
    version += 1;
    rows.push({ profile: NEW as unknown as Profile, at: Date.now() });
    recordVenueSound("loc-1", NEW, version);
    return null;
  });
  // Builder B mounts with the server seed (OLD, v3) while A is in flight.
  const b = serialVenueWrite("loc-1", async () => {
    const keep = latestVenueProfile("loc-1", OLD, 3).profile;
    version += 1;
    rows.push({ profile: keep as unknown as Profile, at: Date.now() });
    recordVenueSound("loc-1", keep, version);
    return null;
  });
  await Promise.all([a, b]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].profile, NEW, "the slow rebuild lands first");
  assert.deepEqual(rows[1].profile, NEW, "the hours save keeps the rebuilt atmosphere");
}

// A failed write does not block the chain.
{
  resetVenueSoundWrites();
  const order: string[] = [];
  const failed = serialVenueWrite("loc-1", async () => {
    order.push("a");
    throw new Error("network");
  });
  const next = serialVenueWrite("loc-1", async () => {
    order.push("b");
    return "ok";
  });
  await assert.rejects(failed);
  assert.equal(await next, "ok");
  assert.deepEqual(order, ["a", "b"]);
}

// A page rendered from a newer row (another device) wins over this tab's older save.
{
  resetVenueSoundWrites();
  recordVenueSound("loc-1", NEW, 5);
  assert.deepEqual(latestVenueProfile("loc-1", OLD, 4), { profile: NEW, known: true });
  assert.deepEqual(latestVenueProfile("loc-1", OLD, 6), { profile: OLD, known: false });
  assert.deepEqual(latestVenueProfile("loc-2", OLD, 0), { profile: OLD, known: false }, "per venue");
  // An older version never replaces a newer one.
  recordVenueSound("loc-1", OLD, 4);
  assert.deepEqual(latestVenueProfile("loc-1", OLD, 0).profile, NEW);
}

console.log("business venue sound writes: ok");
