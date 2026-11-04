import assert from "node:assert/strict";
import { businessAccessPrincipal } from "../src/lib/access-grants/principal";
import { createPeekReader } from "../src/lib/access-grants/peek-reader.server";
import { earliestGrant, peekAccessPeriodsWith, peekChromeAccessWith } from "../src/lib/access-grants/peek-closure";
import { resolveCustomerAccess } from "../src/lib/access-grants/policy";
import { handleWorkspaceTrackUrl } from "../src/lib/business-workspace/routes";
import { BUSINESS_GIFT_MS, BUSINESS_GRACE_MS } from "../src/lib/business/plan";

const guest = { id: "guest", is_anonymous: true };
assert.equal(businessAccessPrincipal(null, true), null);
assert.equal(businessAccessPrincipal(guest, false), null);
assert.equal(businessAccessPrincipal({ id: "email", email: "owner@example.invalid" }, true), null);
assert.equal(businessAccessPrincipal({ ...guest, email: "owner@example.invalid", email_confirmed_at: "now" }, false), null);
const principal = businessAccessPrincipal(guest, true)!;
assert.deepEqual(principal, { userId: "guest", kind: "guest", emailHash: null });
const email = { id: "email", email: "owner@example.invalid", email_confirmed_at: "now" };
assert.deepEqual(businessAccessPrincipal(email, false), businessAccessPrincipal(email, true));
assert.equal(businessAccessPrincipal(email, false)?.kind, "email");
const start = new Date("2026-11-02T08:00:00Z");
const end = new Date(start.getTime() + BUSINESS_GIFT_MS).toISOString();
const rows = [
  { email_hash: null, user_id: "guest", kind: "business_new_client", starts_at: start.toISOString(), ends_at: end },
  { email_hash: null, user_id: "other", kind: "business_new_client", starts_at: start.toISOString(), ends_at: end },
];
const paidRows: Array<{ email_hash: string | null; user_id: string; kind: string; paid_until: string }> = [];
const reads: string[] = [];
// Minimal structural query fake exercises the real nullable grant/edge decoders.
const db = {
  from(table: string) {
    reads.push(table);
    let result: Array<Record<string, unknown>> = table === "access_grants" ? [...rows] : table === "access_paid_periods" ? [...paidRows] : [];
    type Query = {
      select: () => Query;
      in: (column: string, values: string[]) => Query;
      eq: (column: string, value: string) => Query;
      then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) => Promise<unknown>;
    };
    const query: Query = {
      select: () => query,
      in: (column: string, values: string[]) => { result = result.filter((row) => values.includes(String(row[column]))); return query; },
      eq: (column: string, value: string) => { result = result.filter((row) => row[column] === value); return query; },
      then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) => Promise.resolve(resolve({ data: result, error: null })),
    };
    return query;
  },
};
const reader = createPeekReader(db as unknown as Parameters<typeof createPeekReader>[0]);
assert.deepEqual(await reader.edges(["guest"], []), [], "NULL grants never become email edges");
reads.length = 0;
const periods = await peekAccessPeriodsWith(reader, principal);
assert.equal(periods.grant?.emailHash, null);
assert.equal(periods.grant?.userId, "guest");
assert.deepEqual(reads, ["access_grants", "access_paid_periods"], "guest lookup uses only own user id, no email closure");
assert.equal(periods.paidUntil, null);
const live = resolveCustomerAccess({ now: start, emailConfirmed: true, ...periods });
assert.equal(live.mode, "trial"); assert.equal(live.player, true); assert.equal(live.playbackUntil, end);
const grace = resolveCustomerAccess({ now: new Date(end), emailConfirmed: true, ...periods });
assert.equal(grace.mode, "grace"); assert.equal(grace.player, true);
assert.equal(grace.playbackUntil, new Date(Date.parse(end) + BUSINESS_GRACE_MS).toISOString());
assert.equal(resolveCustomerAccess({ now: new Date(Date.parse(end) + BUSINESS_GRACE_MS), emailConfirmed: true, ...periods }).player, false);
assert.equal(resolveCustomerAccess({ now: start, emailConfirmed: false, ...periods }).player, false);
assert.deepEqual(await peekChromeAccessWith(reader, principal, start), { mode: "trial", endsAt: end });
assert.equal(earliestGrant([periods.grant!, { ...periods.grant!, emailHash: "a" }])?.emailHash, "a", "NULLS LAST matches SQL resolver ties");
const audioItemId = "253821e0-0000-4000-8000-000000000003";
let signed = 0;
const signing = {
  access: async (): Promise<"open" | "closed"> => live.player ? "open" : "closed",
  allowedIds: async () => [audioItemId],
  sign: async () => { signed++; return { ok: true as const, url: "https://example.invalid/audio" }; },
};
assert.equal((await handleWorkspaceTrackUrl({ audioItemId }, signing)).ok, true);
assert.equal(signed, 1, "a guest's live NULL-hash gift passes the workspace signing gate");
assert.equal((await handleWorkspaceTrackUrl({ audioItemId }, { ...signing, access: async () => "closed" })).ok, false);
assert.equal(signed, 1, "closed access never signs audio");
// A subscription settled without an email is stored by account and must keep playback after the gift.
const paidEnd = new Date(Date.parse(end) + 30 * 24 * 3600 * 1000).toISOString();
paidRows.push(
  { email_hash: null, user_id: "guest", kind: "business_new_client", paid_until: paidEnd },
  { email_hash: null, user_id: "other", kind: "business_new_client", paid_until: new Date(Date.parse(paidEnd) + 86400000).toISOString() },
);
const paid = await peekAccessPeriodsWith(reader, principal);
assert.equal(paid.paidUntil, paidEnd, "guest paid period is read by own user id only");
const afterGift = resolveCustomerAccess({ now: new Date(Date.parse(end) + BUSINESS_GRACE_MS + 1000), emailConfirmed: true, ...paid });
assert.equal(afterGift.mode, "paid"); assert.equal(afterGift.player, true);
assert.deepEqual(await peekChromeAccessWith(reader, principal, new Date(Date.parse(end) + BUSINESS_GRACE_MS + 1000)), { mode: "paid", endsAt: paidEnd });
console.log("business-guest-principal-unit: ok");
