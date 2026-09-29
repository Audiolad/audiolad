#!/usr/bin/env node
/**
 * POST /api/max/session/unlink — HMAC, host, origin, idempotent identity delete.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_SESSION_UNLINK_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  isAllowedMaxUnlinkOrigin,
  MAX_UNLINK_BODY_MAX_BYTES,
  POST,
  setUnlinkExternalIdentityForTests,
} from "../src/app/api/max/session/unlink/route.ts";
import {
  POST as verifyPost,
  setResolveMaxNativeUserForTests,
  setResolveMaxSessionBindingForTests,
  setResolveMaxStartTargetForTests,
  setTouchExternalIdentityForTests,
} from "../src/app/api/max/session/verify/route.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICTIONAL_BOT_TOKEN = "test-max-bot-token-not-real-0001";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

function currentInitData(userId = "101", extra = {}) {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "unlink-route-test",
    user: JSON.stringify({ id: Number(userId), first_name: "Route" }),
    ...extra,
  });
}

function maxRequest(body, { host = MAX_HOSTNAME, headers = {}, raw, path = MAX_SESSION_UNLINK_PATH } = {}) {
  const payload =
    raw !== undefined
      ? raw
      : typeof body === "string"
        ? body
        : JSON.stringify(body);
  return new Request(`${MAX_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      host,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: payload,
  });
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

const previousToken = process.env.MAX_BOT_TOKEN;
process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;

const linkedIds = new Set(["101", "202"]);
const unlinkCalls = [];

setUnlinkExternalIdentityForTests(async (provider, providerUserId) => {
  unlinkCalls.push({ provider, providerUserId });
  if (provider === MAX_EXTERNAL_IDENTITY_PROVIDER) {
    linkedIds.delete(providerUserId);
  }
  return { ok: true };
});

try {
  const valid = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData("101"),
        user_id: USER_B,
        max_user_id: "202",
        providerUserId: "202",
        userId: USER_B,
      }),
    ),
  );
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body, { ok: true, linked: false });
  assert.equal("user_id" in valid.body, false);
  assert.equal("provider_user_id" in valid.body, false);
  assert.equal(JSON.stringify(valid.body).includes("101"), false);
  assert.equal(JSON.stringify(valid.body).includes(USER_A), false);
  assert.equal(JSON.stringify(valid.body).includes(USER_B), false);
  assert.equal(unlinkCalls.length, 1);
  assert.deepEqual(unlinkCalls[0], {
    provider: MAX_EXTERNAL_IDENTITY_PROVIDER,
    providerUserId: "101",
  });
  assert.equal(linkedIds.has("101"), false);
  assert.equal(linkedIds.has("202"), true, "another MAX identity stays linked");

  const repeat = await readJson(
    await POST(maxRequest({ initData: currentInitData("101") })),
  );
  assert.equal(repeat.status, 200);
  assert.deepEqual(repeat.body, { ok: true, linked: false });
  assert.equal(unlinkCalls.length, 2);
  assert.deepEqual(unlinkCalls[1], {
    provider: MAX_EXTERNAL_IDENTITY_PROVIDER,
    providerUserId: "101",
  });
  assert.equal(linkedIds.has("202"), true);

  setTouchExternalIdentityForTests(async (_provider, providerUserId) => ({
    ok: true,
    linked: linkedIds.has(providerUserId),
  }));
  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: USER_B }));
  setResolveMaxSessionBindingForTests(async () => ({
    ok: true,
    sessionMatches: false,
  }));
  setResolveMaxStartTargetForTests(async () => null);

  const reverify = await readJson(
    await verifyPost(maxRequest({ initData: currentInitData("101") })),
  );
  assert.equal(reverify.status, 200);
  assert.equal(reverify.body.ok, true);
  assert.equal(reverify.body.linked, false);
  assert.equal(reverify.body.maxAuthenticated, false);
  assert.equal(JSON.stringify(reverify.body).includes("101"), false);
  assert.equal(JSON.stringify(reverify.body).includes(USER_B), false);

  const otherStillLinked = await readJson(
    await verifyPost(maxRequest({ initData: currentInitData("202") })),
  );
  assert.equal(otherStillLinked.status, 200);
  assert.equal(otherStillLinked.body.linked, true);
  assert.equal(otherStillLinked.body.maxAuthenticated, true);
  assert.equal(JSON.stringify(otherStillLinked.body).includes(USER_B), false);
  assert.equal(JSON.stringify(otherStillLinked.body).includes("202"), false);

  const callsAfterValid = unlinkCalls.length;
  const invalid = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData("101").replace(/hash=[0-9a-f]+/, "hash=ff"),
        max_user_id: "202",
      }),
    ),
  );
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.reason, "invalid_hash");
  assert.equal(unlinkCalls.length, callsAfterValid);
  assert.equal(linkedIds.has("202"), true);

  const expired = await readJson(
    await POST(
      maxRequest({
        initData: signInitData({
          auth_date: String(Math.floor(Date.now() / 1000) - 4000),
          user: '{"id":202,"first_name":"Other"}',
        }),
      }),
    ),
  );
  assert.equal(expired.status, 401);
  assert.equal(expired.body.reason, "expired");
  assert.equal(unlinkCalls.length, callsAfterValid);
  assert.equal(linkedIds.has("202"), true);

  const future = await readJson(
    await POST(
      maxRequest({
        initData: signInitData({
          auth_date: String(Math.floor(Date.now() / 1000) + 10_000),
          user: '{"id":202,"first_name":"Other"}',
        }),
      }),
    ),
  );
  assert.equal(future.status, 401);
  assert.equal(future.body.reason, "future");
  assert.equal(unlinkCalls.length, callsAfterValid);

  const apex = await readJson(
    await POST(
      maxRequest(
        { initData: currentInitData("202") },
        {
          host: "audiolad.ru",
          headers: { origin: "https://audiolad.ru" },
        },
      ),
    ),
  );
  assert.equal(apex.status, 404);
  assert.equal(apex.body.reason, "forbidden_host");
  assert.equal(unlinkCalls.length, callsAfterValid);

  assert.equal(
    isAllowedMaxUnlinkOrigin(
      new Request(`${MAX_ORIGIN}${MAX_SESSION_UNLINK_PATH}`, {
        headers: { "sec-fetch-site": "cross-site", origin: MAX_ORIGIN },
      }),
    ),
    false,
  );
  const crossSite = await readJson(
    await POST(
      maxRequest(
        { initData: currentInitData("202") },
        { headers: { "sec-fetch-site": "cross-site" } },
      ),
    ),
  );
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.body.reason, "forbidden_origin");
  assert.equal(unlinkCalls.length, callsAfterValid);

  const oversized = await readJson(
    await POST(maxRequest("x".repeat(MAX_UNLINK_BODY_MAX_BYTES + 1))),
  );
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.reason, "payload_too_large");
  assert.equal(unlinkCalls.length, callsAfterValid);

  delete process.env.MAX_BOT_TOKEN;
  const missingEnv = await readJson(
    await POST(maxRequest({ initData: currentInitData("202") })),
  );
  assert.equal(missingEnv.status, 503);
  assert.equal(missingEnv.body.reason, "service_unavailable");
  assert.equal(unlinkCalls.length, callsAfterValid);

  process.env.MAX_BOT_TOKEN = "   ";
  const blankEnv = await readJson(
    await POST(maxRequest({ initData: currentInitData("202") })),
  );
  assert.equal(blankEnv.status, 503);
  assert.equal(unlinkCalls.length, callsAfterValid);
  process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;

  setUnlinkExternalIdentityForTests(async () => ({
    ok: false,
    reason: "storage_unavailable",
  }));
  const storageFail = await readJson(
    await POST(maxRequest({ initData: currentInitData("202") })),
  );
  assert.equal(storageFail.status, 503);
  assert.deepEqual(storageFail.body, {
    ok: false,
    reason: "storage_unavailable",
  });
  assert.equal(linkedIds.has("202"), true);
} finally {
  setUnlinkExternalIdentityForTests(null);
  setTouchExternalIdentityForTests(null);
  setResolveMaxNativeUserForTests(null);
  setResolveMaxSessionBindingForTests(null);
  setResolveMaxStartTargetForTests(null);
  if (previousToken === undefined) {
    delete process.env.MAX_BOT_TOKEN;
  } else {
    process.env.MAX_BOT_TOKEN = previousToken;
  }
}

const routeSource = readFileSync(
  join(repoRoot, "src/app/api/max/session/unlink/route.ts"),
  "utf8",
);
const helperSource = readFileSync(
  join(repoRoot, "src/lib/max/unlink-external-identity.ts"),
  "utf8",
);
assert.match(routeSource, /process\.env\.MAX_BOT_TOKEN/);
assert.match(routeSource, /verifyMaxInitData/);
assert.match(routeSource, /unlinkExternalIdentity/);
assert.match(routeSource, /result\.data\.user\.id/);
assert.match(routeSource, /linked: false/);
assert.doesNotMatch(routeSource, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(routeSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(routeSource, /auth\.admin|deleteUser|signUp|signInWithPassword/);
assert.doesNotMatch(routeSource, /max_user_id|body\.user_id|parsed\.user_id|providerUserId/);
assert.doesNotMatch(routeSource, /createClientFromRequest|getUser\(/);
assert.doesNotMatch(routeSource, /from\("profiles"\)|from\("purchases"\)|auth\.users/);
assert.doesNotMatch(`${routeSource}\n${helperSource}`, /CREATE TABLE|alter table/i);
assert.match(helperSource, /\.eq\("provider_user_id"/);
assert.doesNotMatch(helperSource, /\.eq\("user_id"/);

console.log("max-session-unlink-route-unit: ok");
