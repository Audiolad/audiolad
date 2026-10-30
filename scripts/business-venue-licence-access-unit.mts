/** The licence and cabinet must resolve the same identity graph and paid clock. */
import assert from "node:assert/strict";

import { peekAccessPeriodsWith, peekChromeAccessWith, type PeekEdge, type PeekReader } from "../src/lib/access-grants/peek-closure";
import { BUSINESS_NEW_CLIENT_GRANT_KIND, type GrantRow } from "../src/lib/access-grants/policy";
import { presentVenueLicence } from "../src/lib/business-app/venue-licence/present";

const owner = { userId: "current-owner", emailHash: "current-email" };
const now = new Date("2026-10-28T12:00:00Z");
const previousGift: GrantRow = {
  userId: "previous-account", emailHash: "previous-email", kind: BUSINESS_NEW_CLIENT_GRANT_KIND,
  startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-31T00:00:00Z",
};
// The previous grant is reachable only through identity bindings, not a direct owner match.
const identities: PeekEdge[] = [
  { userId: owner.userId, emailHash: "bridge-email" },
  { userId: "previous-account", emailHash: "bridge-email" },
];
type Paid = { userId: string; emailHash: string; until: string };
function fakeReader(grants: GrantRow[], paid: Paid[] = []): PeekReader {
  return {
    async edges(users, hashes) {
      return [...identities, ...grants].filter((row) => users.includes(row.userId) || hashes.includes(row.emailHash));
    },
    async grants(users, hashes) {
      assert.ok(users.includes("previous-account"), "walk access_grant_identities to the previous account");
      assert.ok(hashes.includes("previous-email"), "also walk grant identity edges");
      return grants.filter((row) => users.includes(row.userId) || hashes.includes(row.emailHash));
    },
    async paidStamps(emailHash, userId) {
      assert.equal(userId, owner.userId, "paid access uses the owner's account, not the entire closure");
      assert.equal(emailHash, owner.emailHash, "paid access also uses the owner's own email hash");
      return paid.filter((row) => row.userId === userId || row.emailHash === emailHash).map((row) => row.until);
    },
  };
}
function licence(periods: Awaited<ReturnType<typeof peekAccessPeriodsWith>>) {
  return presentVenueLicence({
    publicId: "a".repeat(32), place: { locationName: "Кофейня" }, now,
    ...periods, paidPeriod: null,
  });
}
const linkedReader = fakeReader([previousGift]);
const linked = await peekAccessPeriodsWith(linkedReader, owner);
assert.deepEqual(linked.grant, previousGift);
assert.equal(licence(linked).status, "trial");
assert.deepEqual(await peekChromeAccessWith(linkedReader, owner, now), { mode: "trial", endsAt: previousGift.endsAt });

const laterGift: GrantRow = { ...previousGift, userId: owner.userId, emailHash: owner.emailHash,
  startsAt: "2026-10-20T00:00:00Z", endsAt: "2026-11-19T00:00:00Z" };
const tiedLaterEnd = { ...previousGift, endsAt: "2026-11-01T00:00:00Z" };
const tiedHash = { ...previousGift, emailHash: "zzzz-email" };
for (const grants of [[laterGift, tiedHash, tiedLaterEnd, previousGift], [previousGift, tiedLaterEnd, tiedHash, laterGift]]) {
  const periods = await peekAccessPeriodsWith(fakeReader(grants), owner);
  assert.deepEqual(periods.grant, previousGift, "earliest starts_at, then ends_at, then email_hash wins regardless of row order");
}

const expiredGift = { ...previousGift, startsAt: "2026-09-01T00:00:00Z", endsAt: "2026-10-01T00:00:00Z" };
const expiredReader = fakeReader([laterGift, expiredGift]);
assert.equal(licence(await peekAccessPeriodsWith(expiredReader, owner)).status, "expired", "a newer grant must not extend the earliest gift");
assert.equal((await peekChromeAccessWith(expiredReader, owner, now)).mode, "offer");

const paidReader = fakeReader([previousGift], [
  { ...owner, until: "2026-11-15T00:00:00Z" },
  { userId: "another-account", emailHash: owner.emailHash, until: "2026-12-01T00:00:00Z" },
  { userId: "previous-account", emailHash: "previous-email", until: "2027-05-01T00:00:00Z" },
]);
const paid = await peekAccessPeriodsWith(paidReader, owner);
assert.equal(paid.paidUntil, "2026-12-01T00:00:00Z", "latest own-account or own-email payment wins; unrelated closure payments do not count");
assert.equal(licence(paid).status, "paid");
assert.deepEqual(await peekChromeAccessWith(paidReader, owner, now), { mode: "paid", endsAt: paid.paidUntil });

// An email-less account can still recover its existing gift through user identity edges.
const noEmailReader: PeekReader = {
  ...fakeReader([previousGift]),
  async paidStamps(emailHash, userId) {
    assert.equal(emailHash, null);
    assert.equal(userId, owner.userId);
    return [];
  },
};
assert.deepEqual((await peekAccessPeriodsWith(noEmailReader, { ...owner, emailHash: null })).grant, previousGift);
console.log("business-venue-licence-access-unit: ok");
