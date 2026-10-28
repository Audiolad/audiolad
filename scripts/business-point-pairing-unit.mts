import assert from "node:assert/strict";

import {
  BUSINESS_POINT_COOKIE,
  isPointToken,
  normalizePointCode,
  pointCookieOptions,
} from "../src/lib/business-app/point-session";

assert.equal(BUSINESS_POINT_COOKIE, "al-point");
assert.equal(normalizePointCode(" AbCdef1234 "), "abcdef1234");
assert.equal(normalizePointCode("код"), null);
assert.equal(isPointToken("a".repeat(64)), true);
assert.equal(isPointToken("g".repeat(64)), false);

const options = pointCookieOptions(true);
assert.equal(options.httpOnly, true);
assert.equal(options.secure, true);
assert.equal(options.path, "/");
assert.equal("domain" in options, false);

console.log("business-point-pairing-unit: ok");
