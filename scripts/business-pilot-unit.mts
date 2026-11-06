import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadBusinessPilotSlots, loadBusinessVenueSlots, normalizeBusinessVenueSlotLimit } from "../src/lib/business-app/pilot-slots";
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
// Same rule for every organization: existing halls plus one «add» slot up to the system limit.
const slots = businessPilotSlots(rows, 3);
assert.equal(slots.length, 3);
assert.equal(slots[2].location, null, "next empty slot creates no fake active location");
assert.equal(businessPilotSlots([rows[0]], 3).length, 2, "one hall at start: one add button, no extra reserve");
assert.equal(businessPilotSlots([...rows, { ...rows[0], id: "three" }], 3).length, 3, "no add button at cap");
assert.equal(businessPilotSlots([...rows, { ...rows[0], id: "three" }], 3)[2].location?.id, "three");
assert.equal(businessPilotSlots([...rows, { ...rows[0], id: "three" }], 5).length, 4, "raised limit offers the fourth hall");
assert.equal(businessPilotSlots([...rows, { ...rows[0], id: "three" }], 2).length, 3, "lowered limit never hides existing halls");
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

// Code may ship before the migration. Missing RPC, bad values, read errors and transport
// failures keep the single-hall cabinet; the limit itself comes from one system row, no flag.
function slotsDb(limit: { data: unknown; error: { message: string } | null }, count: { count: number | null; error: { message: string } | null } = { count: 1, error: null }) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "business_venue_slot_limit");
      assert.deepEqual(args, { p_organization_id: "org" });
      return limit;
    },
    from(table: string) {
      assert.equal(table, "business_locations");
      return { select(column: string, options: unknown) {
        assert.equal(column, "id"); assert.deepEqual(options, { count: "exact", head: true });
        return { eq: async (key: string, id: string) => { assert.equal(key, "organization_id"); assert.equal(id, "org"); return count; } };
      } };
    },
  } as unknown as Parameters<typeof loadBusinessVenueSlots>[0];
}
for (const limit of [
  { data: null, error: { message: "function business_venue_slot_limit does not exist" } },
  { data: 3, error: { message: "read failed" } },
  { data: null, error: null },
  { data: 0, error: null },
  { data: "x", error: null },
]) assert.deepEqual(await loadBusinessVenueSlots(slotsDb(limit), "org"), { limit: 1, multiVenue: false });
assert.deepEqual(await loadBusinessVenueSlots(slotsDb({ data: 3, error: null }, { count: null, error: { message: "count failed" } }), "org"), { limit: 1, multiVenue: false });
assert.deepEqual(await loadBusinessVenueSlots({ rpc() { throw new Error("transport"); } } as unknown as Parameters<typeof loadBusinessVenueSlots>[0], "org"), { limit: 1, multiVenue: false });
// Default 3 for an organization without any special flag: the RPC is the only input.
assert.deepEqual(await loadBusinessVenueSlots(slotsDb({ data: 3, error: null }), "org"), { limit: 3, multiVenue: false }, "one hall, add button offered");
assert.deepEqual(await loadBusinessVenueSlots(slotsDb({ data: 3, error: null }, { count: 2, error: null }), "org"), { limit: 3, multiVenue: true });
assert.equal(await loadBusinessPilotSlots(slotsDb({ data: 3, error: null }, { count: 3, error: null }), "org"), true);
assert.equal(await loadBusinessPilotSlots(slotsDb({ data: 3, error: null }), "org"), false, "single hall keeps the existing path");
// Raising the system row (or a per-organization override) changes the number with no code change.
assert.deepEqual(await loadBusinessVenueSlots(slotsDb({ data: 5, error: null }), "org"), { limit: 5, multiVenue: false });
assert.equal(normalizeBusinessVenueSlotLimit(10), 10);
assert.equal(normalizeBusinessVenueSlotLimit("5"), 5);
assert.equal(normalizeBusinessVenueSlotLimit(99), 10, "schema ceiling");
const pilotSource = readFileSync(new URL("../src/lib/business-app/pilot-slots.ts", import.meta.url), "utf8");
assert.doesNotMatch(pilotSource, /pilot_location_limit/, "no per-client pilot flag gates halls");
const readSource = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
for (const file of ["domain.ts", "point-device.server.ts", "location-access.server.ts"]) {
  const source = readSource("src/lib/business-app/" + file);
  assert.match(source, /loadBusiness(Pilot|Venue)Slots\(/, file + " uses the optional slot reader");
  assert.doesNotMatch(source, /\.select\([^)]*pilot_location_limit/, file + " main reads work before migration");
}
assert.match(readSource("src/lib/business-app/location-access.server.ts"), /if \(!await loadBusinessPilotSlots\(db, location.organization_id\)\) return null/);
assert.match(readSource("src/lib/business-app/domain.ts"), /memberships.some\(\(row\) => row.role === "owner"\)/);
for (const file of ["src/lib/business-workspace/load.server.ts", "src/app/api/business/workspace/state/route.ts"]) {
  assert.doesNotMatch(readSource(file), /loadBusinessOwnerHomeContext/, "workspace must not load owner health/live signals");
}
const context = readSource("src/lib/business-app/location-context.server.ts");
assert.match(context, /eq\("user_id", userId\)/);
assert.match(context, /eq\("organization_id", organizationId\)/);
assert.match(context, /selectBusinessLocation\(locations \?\? \[\], pilotSlots \?/);
assert.doesNotMatch(context, /\.rpc\(/);
console.log("business-pilot-unit: systemic default-3 limit, raisable cap, optional-RPC fallback, scoped lightweight selection, canPay regression: PASS");
