#!/usr/bin/env node
/**
 * POST /api/max/session/verify — host, origin, env fail-closed, body limits.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_HOSTNAME, MAX_ORIGIN, MAX_SESSION_VERIFY_PATH } from "../src/lib/max/host.ts";
import { setLinkExternalIdentityForTests } from "../src/lib/max/link-external-identity.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  isAllowedMaxVerifyOrigin,
  MAX_VERIFY_BODY_MAX_BYTES,
  POST,
  setTouchExternalIdentityForTests,
} from "../src/app/api/max/session/verify/route.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  return new Request(`${MAX_ORIGIN}${MAX_SESSION_VERIFY_PATH}`, {
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

const touchCalls = [];
const linkCalls = [];
setTouchExternalIdentityForTests(async (provider, providerUserId) => {
  touchCalls.push({ provider, providerUserId });
  return { ok: true, linked: false };
});
setLinkExternalIdentityForTests(async (provider, providerUserId, userId) => {
  linkCalls.push({ provider, providerUserId, userId });
  return { ok: true, status: "linked" };
});

try {
  const valid = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body, { ok: true, linked: false });
  assert.equal("data" in valid.body, false);
  assert.equal("reason" in valid.body, false);
  assert.equal("provider_user_id" in valid.body, false);
  assert.equal(JSON.stringify(valid.body).includes("101"), false);
  assert.equal(touchCalls.length, 1);
  assert.deepEqual(touchCalls[0], {
    provider: MAX_EXTERNAL_IDENTITY_PROVIDER,
    providerUserId: "101",
  });

  setTouchExternalIdentityForTests(async () => ({ ok: true, linked: true }));
  const linked = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(linked.status, 200);
  assert.deepEqual(linked.body, { ok: true, linked: true });
  setTouchExternalIdentityForTests(async (provider, providerUserId) => {
    touchCalls.push({ provider, providerUserId });
    return { ok: true, linked: false };
  });

  const touchCountAfterValid = touchCalls.length;
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
  assert.doesNotMatch(JSON.stringify(invalid.body), /expected|hmac|signature/i);
  assert.equal(touchCalls.length, touchCountAfterValid, "invalid HMAC must not touch");

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
  assert.equal(touchCalls.length, touchCountAfterValid, "expired HMAC must not touch");

  const empty = await readJson(await POST(maxRequest("", { raw: "" })));
  assert.equal(empty.status, 400);
  assert.equal(empty.body.ok, false);
  assert.equal(empty.body.reason, "invalid_request");
  assert.equal(touchCalls.length, touchCountAfterValid, "empty body must not touch");

  const missingField = await readJson(await POST(maxRequest({})));
  assert.equal(missingField.status, 400);
  assert.equal(missingField.body.reason, "invalid_request");
  assert.equal(touchCalls.length, touchCountAfterValid);

  const oversized = await readJson(
    await POST(maxRequest("x".repeat(MAX_VERIFY_BODY_MAX_BYTES + 1))),
  );
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.reason, "payload_too_large");
  assert.equal(touchCalls.length, touchCountAfterValid);

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
  assert.equal(touchCalls.length, touchCountAfterValid);

  assert.equal(
    isAllowedMaxVerifyOrigin(
      new Request(`${MAX_ORIGIN}${MAX_SESSION_VERIFY_PATH}`, {
        headers: { "sec-fetch-site": "cross-site", origin: MAX_ORIGIN },
      }),
    ),
    false,
  );
  assert.equal(
    isAllowedMaxVerifyOrigin(
      new Request(`${MAX_ORIGIN}${MAX_SESSION_VERIFY_PATH}`, {
        headers: { "sec-fetch-site": "same-origin", origin: MAX_ORIGIN },
      }),
    ),
    true,
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
  assert.equal(touchCalls.length, touchCountAfterValid);

  delete process.env.MAX_BOT_TOKEN;
  const missingEnv = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(missingEnv.status, 503);
  assert.equal(missingEnv.body.ok, false);
  assert.equal(missingEnv.body.reason, "service_unavailable");
  assert.equal(missingEnv.body.ok === true, false);

  process.env.MAX_BOT_TOKEN = "   ";
  const blankEnv = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(blankEnv.status, 503);
  assert.equal(touchCalls.length, touchCountAfterValid);

  process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;
  setTouchExternalIdentityForTests(async (provider, providerUserId) => {
    touchCalls.push({ provider, providerUserId });
    return { ok: false, reason: "storage_unavailable" };
  });
  const storageFail = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(storageFail.status, 503);
  assert.deepEqual(storageFail.body, {
    ok: false,
    reason: "storage_unavailable",
  });
  assert.equal(storageFail.body.ok === true, false);
  assert.equal(touchCalls.length, touchCountAfterValid + 1);
  assert.equal(linkCalls.length, 0, "verify must not call link");
} finally {
  setTouchExternalIdentityForTests(null);
  setLinkExternalIdentityForTests(null);
  if (previousToken === undefined) {
    delete process.env.MAX_BOT_TOKEN;
  } else {
    process.env.MAX_BOT_TOKEN = previousToken;
  }
}

const routeSource = readFileSync(
  join(repoRoot, "src/app/api/max/session/verify/route.ts"),
  "utf8",
);
assert.match(routeSource, /process\.env\.MAX_BOT_TOKEN/);
assert.match(routeSource, /touchExternalIdentity/);
assert.match(routeSource, /linked: touch\.linked/);
assert.doesNotMatch(routeSource, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(routeSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(routeSource, /createServiceRoleClient|createClient\(/);
assert.doesNotMatch(routeSource, /createClientFromRequest|getUser\(/);
assert.doesNotMatch(
  routeSource,
  /linkExternalIdentity|link_external_identity|link-external-identity|session\/link/,
);
assert.doesNotMatch(routeSource, /auth\.users|signUp|signInWithPassword/);

const maxTree = [
  "src/lib/max/verify-init-data.ts",
  "src/lib/max/host.ts",
  "src/lib/max/proxy-policy.ts",
  "src/lib/max/bridge.ts",
  "src/lib/max/touch-external-identity.ts",
  "src/lib/max/session-http.ts",
  "src/components/max/MaxBridgeScript.tsx",
  "src/components/max/MaxMiniAppScreen.tsx",
  "src/app/api/max/session/verify/route.ts",
]
  .map((relative) => readFileSync(join(repoRoot, relative), "utf8"))
  .join("\n");

assert.doesNotMatch(maxTree, /NEXT_PUBLIC_MAX_BOT/);
assert.doesNotMatch(maxTree, /\b\d{8,}:[A-Za-z0-9_-]{20,}\b/);
assert.doesNotMatch(maxTree, /supabase\/migrations|CREATE TABLE/i);
assert.doesNotMatch(
  readFileSync(join(repoRoot, "src/lib/max/verify-init-data.ts"), "utf8"),
  /external_identities|createServiceRoleClient|@\/lib\/supabase/,
);

console.log("max-session-verify-route-unit: ok");
