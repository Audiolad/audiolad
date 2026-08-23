#!/usr/bin/env node
/**
 * POST /api/max/session/link — host, HMAC, session, conflict mapping.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_SESSION_LINK_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  isAllowedMaxLinkOrigin,
  MAX_LINK_BODY_MAX_BYTES,
  POST,
  setGetRequestUserForTests,
  setLinkExternalIdentityForTests,
} from "../src/app/api/max/session/link/route.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FICTIONAL_BOT_TOKEN = "test-max-bot-token-not-real-0001";

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

function currentInitData(extra = {}) {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "route-test-query",
    user: '{"id":101,"first_name":"Route"}',
    ...extra,
  });
}

function maxRequest(body, { host = MAX_HOSTNAME, headers = {}, raw } = {}) {
  const payload =
    raw !== undefined
      ? raw
      : typeof body === "string"
        ? body
        : JSON.stringify(body);
  return new Request(`${MAX_ORIGIN}${MAX_SESSION_LINK_PATH}`, {
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

const linkCalls = [];
const getUserCalls = [];

setLinkExternalIdentityForTests(async (provider, providerUserId, userId) => {
  linkCalls.push({ provider, providerUserId, userId });
  return { ok: true, status: "linked" };
});
setGetRequestUserForTests(async () => {
  getUserCalls.push("session");
  return { id: USER_A };
});

try {
  const valid = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData(),
        user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        max_user_id: "999",
        user: { id: "should-be-ignored" },
      }),
    ),
  );
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body, { ok: true, linked: true });
  assert.equal("data" in valid.body, false);
  assert.equal("reason" in valid.body, false);
  assert.equal("provider_user_id" in valid.body, false);
  assert.equal(JSON.stringify(valid.body).includes("101"), false);
  assert.equal(JSON.stringify(valid.body).includes(USER_A), false);
  assert.equal(JSON.stringify(valid.body).includes("cccccccc"), false);
  assert.equal(linkCalls.length, 1);
  assert.deepEqual(linkCalls[0], {
    provider: MAX_EXTERNAL_IDENTITY_PROVIDER,
    providerUserId: "101",
    userId: USER_A,
  });
  assert.equal(getUserCalls.length, 1);

  setLinkExternalIdentityForTests(async (provider, providerUserId, userId) => {
    linkCalls.push({ provider, providerUserId, userId });
    return { ok: true, status: "already_linked_same_user" };
  });
  const idempotent = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(idempotent.status, 200);
  assert.deepEqual(idempotent.body, { ok: true, linked: true });

  setLinkExternalIdentityForTests(async (provider, providerUserId, userId) => {
    linkCalls.push({ provider, providerUserId, userId });
    return { ok: true, status: "linked" };
  });

  const linkCountAfterValid = linkCalls.length;
  const getUserAfterValid = getUserCalls.length;
  setGetRequestUserForTests(async () => {
    getUserCalls.push("none");
    return null;
  });
  const noSession = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(noSession.status, 401);
  assert.deepEqual(noSession.body, { ok: false, reason: "unauthenticated" });
  assert.equal(JSON.stringify(noSession.body).includes(USER_A), false);
  assert.equal(linkCalls.length, linkCountAfterValid, "no session must not link");
  assert.equal(getUserCalls.length, getUserAfterValid + 1);

  setGetRequestUserForTests(async () => {
    getUserCalls.push("session");
    return { id: USER_A };
  });

  const invalid = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData().replace(/hash=[0-9a-f]+/, "hash=ff"),
      }),
    ),
  );
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.ok, false);
  assert.equal(invalid.body.reason, "invalid_hash");
  assert.equal(JSON.stringify(invalid.body).includes(FICTIONAL_BOT_TOKEN), false);
  assert.equal(
    linkCalls.length,
    linkCountAfterValid,
    "invalid HMAC must not link",
  );
  assert.equal(
    getUserCalls.length,
    getUserAfterValid + 1,
    "invalid HMAC must not read session",
  );

  const expired = await readJson(
    await POST(
      maxRequest({
        initData: signInitData({
          auth_date: String(Math.floor(Date.now() / 1000) - 4000),
          user: '{"id":101,"first_name":"Route"}',
        }),
      }),
    ),
  );
  assert.equal(expired.status, 401);
  assert.equal(expired.body.reason, "expired");
  assert.equal(linkCalls.length, linkCountAfterValid, "expired HMAC must not link");

  setLinkExternalIdentityForTests(async (provider, providerUserId, userId) => {
    linkCalls.push({ provider, providerUserId, userId });
    return { ok: false, reason: "identity_conflict" };
  });
  const identityConflict = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(identityConflict.status, 409);
  assert.deepEqual(identityConflict.body, {
    ok: false,
    reason: "identity_already_linked",
  });
  assert.equal(JSON.stringify(identityConflict.body).includes(USER_A), false);
  assert.equal(JSON.stringify(identityConflict.body).includes("101"), false);

  setLinkExternalIdentityForTests(async (provider, providerUserId, userId) => {
    linkCalls.push({ provider, providerUserId, userId });
    return { ok: false, reason: "user_conflict" };
  });
  const userConflict = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(userConflict.status, 409);
  assert.deepEqual(userConflict.body, {
    ok: false,
    reason: "user_already_has_max_identity",
  });

  setLinkExternalIdentityForTests(async (provider, providerUserId, userId) => {
    linkCalls.push({ provider, providerUserId, userId });
    return { ok: false, reason: "storage_error" };
  });
  const storageFail = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(storageFail.status, 503);
  assert.deepEqual(storageFail.body, {
    ok: false,
    reason: "storage_unavailable",
  });

  const empty = await readJson(await POST(maxRequest("", { raw: "" })));
  assert.equal(empty.status, 400);
  assert.equal(empty.body.reason, "invalid_request");

  const oversized = await readJson(
    await POST(maxRequest("x".repeat(MAX_LINK_BODY_MAX_BYTES + 1))),
  );
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.reason, "payload_too_large");

  const apex = await readJson(
    await POST(
      maxRequest(
        { initData: currentInitData() },
        {
          host: "audiolad.ru",
          headers: { origin: "https://audiolad.ru" },
        },
      ),
    ),
  );
  assert.equal(apex.status, 404);
  assert.equal(apex.body.reason, "forbidden_host");

  assert.equal(
    isAllowedMaxLinkOrigin(
      new Request(`${MAX_ORIGIN}${MAX_SESSION_LINK_PATH}`, {
        headers: { "sec-fetch-site": "cross-site", origin: MAX_ORIGIN },
      }),
    ),
    false,
  );

  const crossSite = await readJson(
    await POST(
      maxRequest(
        { initData: currentInitData() },
        { headers: { "sec-fetch-site": "cross-site" } },
      ),
    ),
  );
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.body.reason, "forbidden_origin");
} finally {
  setLinkExternalIdentityForTests(null);
  setGetRequestUserForTests(null);
  if (previousToken === undefined) {
    delete process.env.MAX_BOT_TOKEN;
  } else {
    process.env.MAX_BOT_TOKEN = previousToken;
  }
}

const routeSource = readFileSync(
  join(repoRoot, "src/app/api/max/session/link/route.ts"),
  "utf8",
);
assert.match(routeSource, /process\.env\.MAX_BOT_TOKEN/);
assert.match(routeSource, /verifyMaxInitData/);
assert.match(routeSource, /createClientFromRequest/);
assert.match(routeSource, /getUser\(\)/);
assert.match(routeSource, /linkExternalIdentity/);
assert.match(routeSource, /linked: true/);
assert.doesNotMatch(routeSource, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(routeSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(routeSource, /auth\.users|signUp|signInWithPassword/);
assert.doesNotMatch(routeSource, /cookie.*domain|Domain\s*:/i);
assert.match(routeSource, /initData/);
assert.doesNotMatch(
  routeSource.replace(/createClientFromRequest\(request\)/, ""),
  /parsed.*user_id|body\.user_id|max_user_id/,
);

const helperSource = readFileSync(
  join(repoRoot, "src/lib/max/link-external-identity.ts"),
  "utf8",
);
assert.doesNotMatch(`${routeSource}\n${helperSource}`, /CREATE TABLE|alter table/i);

console.log("max-session-link-route-unit: ok");
