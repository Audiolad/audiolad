#!/usr/bin/env node
/**
 * Pure MAX WebAppData / initData verifier — official HMAC algorithm.
 * https://dev.max.ru/docs/webapps/validation
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_INIT_DATA_FUTURE_SKEW_SECONDS,
  MAX_INIT_DATA_MAX_AGE_SECONDS,
  MAX_INIT_DATA_MAX_BYTES,
  verifyMaxInitData,
} from "../src/lib/max/verify-init-data.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const FICTIONAL_BOT_TOKEN = "test-max-bot-token-not-real-0001";

/**
 * Precomputed independently of verifyMaxInitData (Node HMAC over the official
 * launch_params). Do not regenerate this string from the verifier under test.
 */
const HARD_CODED_INIT_DATA =
  "user=%7B%22id%22%3A67890%2C%22first_name%22%3A%22Max%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3Anull%2C%22language_code%22%3A%22ru%22%2C%22photo_url%22%3Anull%7D&start_param=promo-spring&hash=2fe2bdd656fba5a8e0803c0efb50cbb5fbe417beea7e932a92298606cb925f62&chat=%7B%22id%22%3A12345%2C%22type%22%3A%22DIALOG%22%7D&auth_date=1700000000&query_id=4c0ab423-342b-4e45-aea4-2747dbc500cd";

const HARD_CODED_NOW = 1_700_000_010;

function signInitData(fields, token = FICTIONAL_BOT_TOKEN) {
  const entries = Object.entries(fields).filter(([key]) => key !== "hash");
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const launchParams = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey)
    .update(launchParams)
    .digest("hex");
  return `${entries
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&")}&hash=${hash}`;
}

function assertReject(raw, token, reason, options) {
  const result = verifyMaxInitData(raw, token, options);
  assert.equal(result.ok, false, `expected ${reason}, got ${JSON.stringify(result)}`);
  assert.equal(result.reason, reason);
}

// Hard-coded fixture — not a round-trip of verifyMaxInitData.
const hardCoded = verifyMaxInitData(HARD_CODED_INIT_DATA, FICTIONAL_BOT_TOKEN, {
  nowSeconds: HARD_CODED_NOW,
});
assert.equal(hardCoded.ok, true);
assert.deepEqual(hardCoded.data, {
  query_id: "4c0ab423-342b-4e45-aea4-2747dbc500cd",
  auth_date: 1_700_000_000,
  start_param: "promo-spring",
  user: {
    id: "67890",
    first_name: "Max",
    last_name: "User",
    language_code: "ru",
  },
  chat: {
    id: "12345",
    type: "DIALOG",
  },
});
assert.equal(typeof hardCoded.data.user.id, "string");

const minimal = signInitData({
  auth_date: "1700000000",
  user: '{"id":42,"first_name":"Ada"}',
});
const minimalResult = verifyMaxInitData(minimal, FICTIONAL_BOT_TOKEN, {
  nowSeconds: HARD_CODED_NOW,
});
assert.equal(minimalResult.ok, true);
assert.deepEqual(minimalResult.data, {
  auth_date: 1_700_000_000,
  user: { id: "42", first_name: "Ada" },
});
assert.equal(minimalResult.data.query_id, undefined);
assert.equal(minimalResult.data.chat, undefined);
assert.equal(minimalResult.data.start_param, undefined);

const largeId = signInitData({
  auth_date: "1700000000",
  query_id: "replay-later",
  user: '{"id":9007199254740993,"first_name":"Wide"}',
});
const largeIdResult = verifyMaxInitData(largeId, FICTIONAL_BOT_TOKEN, {
  nowSeconds: HARD_CODED_NOW,
});
assert.equal(largeIdResult.ok, true);
assert.equal(largeIdResult.data.user.id, "9007199254740993");
assert.equal(largeIdResult.data.query_id, "replay-later");
assert.equal(
  Number("9007199254740993") === 9007199254740993,
  false,
  "this id is wider than Number.MAX_SAFE_INTEGER and must not be stored via Number()",
);
assert.equal(Number.isSafeInteger(9007199254740993), false);
assert.notEqual(largeIdResult.data.user.id, String(Number("9007199254740993")));

const largeIdAsString = signInitData({
  auth_date: "1700000000",
  user: '{"id":"9007199254740993","first_name":"Wide"}',
});
const largeIdAsStringResult = verifyMaxInitData(
  largeIdAsString,
  FICTIONAL_BOT_TOKEN,
  { nowSeconds: HARD_CODED_NOW },
);
assert.equal(largeIdAsStringResult.ok, true);
assert.equal(largeIdAsStringResult.data.user.id, "9007199254740993");

const scientificId = signInitData({
  auth_date: "1700000000",
  user: '{"id":1e21,"first_name":"Sci"}',
});
assertReject(scientificId, FICTIONAL_BOT_TOKEN, "missing_user_id", {
  nowSeconds: HARD_CODED_NOW,
});

const uuidId = signInitData({
  auth_date: "1700000000",
  user: '{"id":"550e8400-e29b-41d4-a716-446655440000","first_name":"Uuid"}',
});
assertReject(uuidId, FICTIONAL_BOT_TOKEN, "missing_user_id", {
  nowSeconds: HARD_CODED_NOW,
});

assertReject(
  HARD_CODED_INIT_DATA.replace("%3A67890", "%3A67891"),
  FICTIONAL_BOT_TOKEN,
  "invalid_hash",
  { nowSeconds: HARD_CODED_NOW },
);
assertReject(
  HARD_CODED_INIT_DATA.replace("%22Max%22", "%22Mix%22"),
  FICTIONAL_BOT_TOKEN,
  "invalid_hash",
  { nowSeconds: HARD_CODED_NOW },
);
assertReject(
  HARD_CODED_INIT_DATA.replace("auth_date=1700000000", "auth_date=1700000001"),
  FICTIONAL_BOT_TOKEN,
  "invalid_hash",
  { nowSeconds: HARD_CODED_NOW },
);
assertReject(HARD_CODED_INIT_DATA.replace(/hash=[0-9a-f]+/, "hash=00"), FICTIONAL_BOT_TOKEN, "invalid_hash", {
  nowSeconds: HARD_CODED_NOW,
});
assertReject(HARD_CODED_INIT_DATA, "different-fictional-bot-token-0002", "invalid_hash", {
  nowSeconds: HARD_CODED_NOW,
});

assertReject("", FICTIONAL_BOT_TOKEN, "empty_init_data");
assertReject("user=%7B%7D&auth_date=1", FICTIONAL_BOT_TOKEN, "missing_hash");
assertReject(
  "hash=abc&user=%7B%7D&hash=def&auth_date=1",
  FICTIONAL_BOT_TOKEN,
  "duplicate_hash",
);
assertReject(
  "user=%7B%22id%22%3A1%7D&user=%7B%22id%22%3A2%7D&auth_date=1&hash=00",
  FICTIONAL_BOT_TOKEN,
  "duplicate_key",
);
assertReject(
  "auth_date=1&query_id=a&query_id=b&hash=00",
  FICTIONAL_BOT_TOKEN,
  "duplicate_key",
);
assertReject("user=%ZZ&auth_date=1&hash=00", FICTIONAL_BOT_TOKEN, "malformed_encoding");
assertReject("user%7B%7D&auth_date=1&hash=00", FICTIONAL_BOT_TOKEN, "malformed_encoding");

const malformedUser = signInitData({
  auth_date: "1700000000",
  user: "{",
});
assertReject(malformedUser, FICTIONAL_BOT_TOKEN, "malformed_user", {
  nowSeconds: HARD_CODED_NOW,
});

const missingUser = signInitData({
  auth_date: "1700000000",
  query_id: "no-user",
});
assertReject(missingUser, FICTIONAL_BOT_TOKEN, "missing_user", {
  nowSeconds: HARD_CODED_NOW,
});

const missingUserId = signInitData({
  auth_date: "1700000000",
  user: '{"first_name":"NoId"}',
});
assertReject(missingUserId, FICTIONAL_BOT_TOKEN, "missing_user_id", {
  nowSeconds: HARD_CODED_NOW,
});

const invalidAuth = signInitData({
  auth_date: "not-a-date",
  user: '{"id":1}',
});
assertReject(invalidAuth, FICTIONAL_BOT_TOKEN, "invalid_auth_date", {
  nowSeconds: HARD_CODED_NOW,
});

const ttlBase = {
  auth_date: "1700000000",
  user: '{"id":7}',
};
const ttlSigned = signInitData(ttlBase);
assert.equal(
  verifyMaxInitData(ttlSigned, FICTIONAL_BOT_TOKEN, {
    nowSeconds: 1_700_000_000 + MAX_INIT_DATA_MAX_AGE_SECONDS,
  }).ok,
  true,
  "TTL exact boundary must still be accepted",
);
assertReject(
  ttlSigned,
  FICTIONAL_BOT_TOKEN,
  "expired",
  { nowSeconds: 1_700_000_000 + MAX_INIT_DATA_MAX_AGE_SECONDS + 1 },
);

const futureExact = signInitData({
  auth_date: String(1_700_000_000 + MAX_INIT_DATA_FUTURE_SKEW_SECONDS),
  user: '{"id":7}',
});
assert.equal(
  verifyMaxInitData(futureExact, FICTIONAL_BOT_TOKEN, {
    nowSeconds: 1_700_000_000,
  }).ok,
  true,
  "future skew exact boundary must be accepted",
);

const futureBeyond = signInitData({
  auth_date: String(1_700_000_000 + MAX_INIT_DATA_FUTURE_SKEW_SECONDS + 1),
  user: '{"id":7}',
});
assertReject(futureBeyond, FICTIONAL_BOT_TOKEN, "future", {
  nowSeconds: 1_700_000_000,
});

assertReject("x".repeat(MAX_INIT_DATA_MAX_BYTES + 1), FICTIONAL_BOT_TOKEN, "payload_too_large");
assertReject(HARD_CODED_INIT_DATA, "", "missing_token", { nowSeconds: HARD_CODED_NOW });

const verifierSource = readFileSync(
  join(repoRoot, "src/lib/max/verify-init-data.ts"),
  "utf8",
);
assert.match(verifierSource, /import "server-only"/);
assert.match(verifierSource, /timingSafeEqual/);
assert.doesNotMatch(verifierSource, /from ["']@\/lib\/supabase|from ["']@supabase/);
assert.doesNotMatch(verifierSource, /createServiceRoleClient|touch_external_identity/);
assert.doesNotMatch(verifierSource, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(verifierSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(
  verifierSource,
  /expectedHex\s*===|===\s*parsed\.hash|providedHex\s*===|originalHash/,
);
assert.doesNotMatch(
  verifierSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
  /\binitDataUnsafe\b/,
);

console.log("max-verify-init-data-unit: ok");
