import assert from "node:assert/strict";
import { selectBusinessLocation, businessPilotSlots } from "../src/lib/business-app/location-selection";
import { deriveBusinessPointState } from "../src/lib/business-app/owner-home-signals";
import { playbackStorageKey, clampWorkspacePlayback } from "../src/lib/business-workspace/playback";
import { workspaceControllerKey } from "../src/lib/business-workspace/access-deadline";
import { postPointReport } from "../src/lib/business-app/cabinet-player-client";
import { resolveCustomerAccess } from "../src/lib/access-grants/policy";
import { BUSINESS_PLAN_MONTHLY_PRICE_RUB } from "../src/lib/business/plan";

const rows = [
  { id: "one", name: "Стритфуд 1", status: "active" },
  { id: "two", name: "Стритфуд 2", status: "active" },
];
assert.equal(selectBusinessLocation(rows)?.id, "one", "legacy first location");
assert.equal(selectBusinessLocation(rows, "two")?.id, "two", "owner switches to second");
assert.equal(selectBusinessLocation(rows, "one")?.id, "one", "owner switches back");
assert.equal(selectBusinessLocation(rows, "foreign")?.id, "one", "foreign/stale cookie grants no authority");
assert.equal(selectBusinessLocation([{ ...rows[0], status: "closed" }]), null);
const slots = businessPilotSlots(rows);
assert.equal(slots.length, 3);
assert.equal(slots[2].location, null, "reserve creates no fake active location");
assert.equal(businessPilotSlots([...rows, { ...rows[0], id: "three" }])[2].location?.id, "three");
const players = [
  { playerId: "p1", playerCode: "P1", displayName: null, healthStatus: "offline", secondsSinceHeartbeat: 600, locationId: "one" },
  { playerId: "p2", playerCode: "P2", displayName: null, healthStatus: "online", secondsSinceHeartbeat: 1, locationId: "two" },
  { playerId: "unassigned", playerCode: "P3", displayName: null, healthStatus: "online", secondsSinceHeartbeat: 0, locationId: null },
];
assert.equal(deriveBusinessPointState({ players, locationId: "one" }).primaryHealthStatus, "offline");
assert.equal(deriveBusinessPointState({ players, locationId: "two" }).primaryHealthStatus, "online");
assert.equal(deriveBusinessPointState({ players, locationId: "three" }).primaryHealthStatus, "none");
const storage = new Map<string, unknown>();
storage.set(playbackStorageKey("cafe", "one"), clampWorkspacePlayback({ index: 3, positionSec: 42 }, 5));
storage.set(playbackStorageKey("cafe", "two"), clampWorkspacePlayback({ index: 1, positionSec: 2 }, 5));
assert.equal((storage.get(playbackStorageKey("cafe", "one")) as { positionSec: number }).positionSec, 42);
assert.equal(playbackStorageKey("cafe"), "audiolad-business-workspace-playback:cafe", "legacy storage preserved");
assert.notEqual(workspaceControllerKey({ spaceId: "cafe", tracks: [], playbackScope: "one" }), workspaceControllerKey({ spaceId: "cafe", tracks: [], playbackScope: "two" }));
const payload = { kind: "playback" as const, report: { state: "playing" as const, audioItemId: "00000000-0000-4000-8000-000000000021", playingConfirmed: true, errorCode: null }, sample: { eventId: "e", sessionId: "s", seq: 2, positionMs: 12345 } };
let sent: Record<string, unknown> = {};
await postPointReport(payload, (async (_url, init) => {
  assert.equal(init?.credentials, "same-origin");
  sent = JSON.parse(String(init?.body));
  return { json: async () => ({ ok: true, data: null }) } as Response;
}) as typeof fetch);
assert.deepEqual(sent.sample, payload.sample);
assert.equal(sent.locationId, undefined, "device never chooses attribution");
assert.equal(sent.playerId, undefined);
// A shared trial clock never restarts when another slot is activated.
const now = new Date("2026-11-06T12:00:00Z");
const trial = { emailHash: null, userId: "owner", kind: "business_new_client" as const, startsAt: now.toISOString(), endsAt: "2026-11-13T12:00:00Z" };
const first = resolveCustomerAccess({ now, emailConfirmed: true, grant: trial, paidUntil: "2026-12-06T12:00:00Z" });
const second = resolveCustomerAccess({ now, emailConfirmed: true, grant: trial, paidUntil: null });
assert.equal(first.mode, "paid");
assert.equal(second.mode, "trial");
assert.equal(second.endsAt, trial.endsAt, "second location cannot inherit first payment");
assert.equal(resolveCustomerAccess({ now: new Date("2026-11-20"), emailConfirmed: true, grant: trial, paidUntil: null }).player, false);
assert.deepEqual([1, 2, 3].map((n) => n * BUSINESS_PLAN_MONTHLY_PRICE_RUB), [799, 1598, 2397]);
console.log("business-pilot-unit: owner switching, reserve, health/state isolation, device evidence payload, trial/payment, legacy: PASS");
