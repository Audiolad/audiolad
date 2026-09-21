import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

import {
  createPartnerAttributionToken,
  hashPartnerAttributionToken,
  isPartnerAttributionTokenShape,
} from "../src/lib/author-partner/token";

test("createPartnerAttributionToken returns opaque 64-char hex without ids", () => {
  const token = createPartnerAttributionToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(token.includes("-"), false);
  assert.notEqual(token, createPartnerAttributionToken());
});

test("hashPartnerAttributionToken is stable sha256 hex", () => {
  const token = "a" + "b".repeat(63);
  const hash = hashPartnerAttributionToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hashPartnerAttributionToken(token), hash);
  assert.notEqual(hash, token);
  assert.equal(hash, createHash("sha256").update(token, "utf8").digest("hex"));
});

test("isPartnerAttributionTokenShape rejects malformed values", () => {
  assert.equal(isPartnerAttributionTokenShape(undefined), false);
  assert.equal(isPartnerAttributionTokenShape(""), false);
  assert.equal(isPartnerAttributionTokenShape("xyz"), false);
  assert.equal(isPartnerAttributionTokenShape("A".repeat(64)), false);
  assert.equal(isPartnerAttributionTokenShape("a".repeat(64)), true);
  assert.equal(isPartnerAttributionTokenShape(randomBytes(32).toString("hex")), true);
});
