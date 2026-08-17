import assert from "node:assert/strict";

import {
  STUDIO_GUEST_COOKIE_NAME,
  buildStudioGuestCookieOptions,
  createGuestToken,
  getStudioGuestTtlDays,
  guestTokenHashesEqual,
  hashGuestToken,
} from "../src/lib/studio/guest-policy";

const token = createGuestToken();
assert.ok(token.length >= 40);
assert.notEqual(token, createGuestToken());
const hash = hashGuestToken(token);
assert.equal(hash.length, 64);
assert.match(hash, /^[0-9a-f]{64}$/);
assert.equal(guestTokenHashesEqual(hash, hashGuestToken(token)), true);
assert.equal(guestTokenHashesEqual(hash, hashGuestToken("other-token")), false);

assert.equal(STUDIO_GUEST_COOKIE_NAME, "audiolad_studio_guest");
assert.equal(getStudioGuestTtlDays({}), 7);
assert.equal(getStudioGuestTtlDays({ STUDIO_GUEST_TTL_DAYS: "14" }), 14);
assert.equal(getStudioGuestTtlDays({ STUDIO_GUEST_TTL_DAYS: "nope" }), 7);

const options = buildStudioGuestCookieOptions({ ttlDays: 7, secure: true });
assert.equal(options.name, "audiolad_studio_guest");
assert.equal(options.httpOnly, true);
assert.equal(options.path, "/");
assert.equal(options.sameSite, "lax");
assert.equal(options.secure, true);
assert.equal(options.maxAge, 7 * 24 * 60 * 60);

console.log("studio-guest-session-unit: ok");
