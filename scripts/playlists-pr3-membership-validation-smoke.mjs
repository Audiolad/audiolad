/**
 * PR3.1 membership request validation smoke (no network, no secrets).
 * Run from repo root:
 *   npx --yes tsx scripts/playlists-pr3-membership-validation-smoke.mjs
 */

import {
  isUuid,
  parseMembershipPutBody,
} from "../src/lib/playlists/validation.ts";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

const practiceId = "11111111-1111-4111-8111-111111111111";
const playlistA = "22222222-2222-4222-8222-222222222222";
const playlistB = "33333333-3333-4333-8333-333333333333";

assert(isUuid(practiceId), "uuid helper");

let parsed = parseMembershipPutBody({
  practiceId,
  playlistIds: [playlistA, playlistB],
});
assert(parsed.ok === true, "valid body");
assert(parsed.ok && parsed.playlistIds.length === 2, "two ids");

parsed = parseMembershipPutBody({ practiceId, playlistIds: [] });
assert(parsed.ok === true && parsed.playlistIds.length === 0, "empty array ok");

parsed = parseMembershipPutBody({
  practiceId,
  playlistIds: [playlistA, playlistA],
});
assert(parsed.ok === false, "duplicate ids rejected");

parsed = parseMembershipPutBody({
  practiceId: "not-a-uuid",
  playlistIds: [],
});
assert(parsed.ok === false, "bad practiceId");

parsed = parseMembershipPutBody({
  practiceId,
  playlistIds: ["nope"],
});
assert(parsed.ok === false, "bad playlist id");

parsed = parseMembershipPutBody({
  practiceId,
  playlistIds: [playlistA],
  extra: true,
});
assert(parsed.ok === false, "unknown fields");

parsed = parseMembershipPutBody({
  practiceId,
  playlistIds: Array.from({ length: 51 }, (_, i) => {
    const hex = (i + 1).toString(16).padStart(12, "0");
    return `44444444-4444-4444-8444-${hex}`;
  }),
});
assert(parsed.ok === false, "max 50 ids");

console.log("PR3_MEMBERSHIP_VALIDATION_SMOKE_PASS");
