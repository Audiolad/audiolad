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
import {
  isAllowedMaxVerifyOrigin,
  MAX_VERIFY_BODY_MAX_BYTES,
  POST,
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

try {
  const valid = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body, { ok: true });
  assert.equal("data" in valid.body, false);
  assert.equal("reason" in valid.body, false);

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

  const empty = await readJson(await POST(maxRequest("", { raw: "" })));
  assert.equal(empty.status, 400);
  assert.equal(empty.body.ok, false);
  assert.equal(empty.body.reason, "invalid_request");

  const missingField = await readJson(await POST(maxRequest({})));
  assert.equal(missingField.status, 400);
  assert.equal(missingField.body.reason, "invalid_request");

  const oversized = await readJson(
    await POST(maxRequest("x".repeat(MAX_VERIFY_BODY_MAX_BYTES + 1))),
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
} finally {
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
assert.doesNotMatch(routeSource, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(routeSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(routeSource, /external_identities|supabase|createClient/);

const maxTree = [
  "src/lib/max/verify-init-data.ts",
  "src/lib/max/host.ts",
  "src/lib/max/proxy-policy.ts",
  "src/lib/max/bridge.ts",
  "src/components/max/MaxBridgeScript.tsx",
  "src/components/max/MaxMiniAppScreen.tsx",
  "src/app/api/max/session/verify/route.ts",
]
  .map((relative) => readFileSync(join(repoRoot, relative), "utf8"))
  .join("\n");

assert.doesNotMatch(maxTree, /NEXT_PUBLIC_MAX_BOT/);
assert.doesNotMatch(maxTree, /\b\d{8,}:[A-Za-z0-9_-]{20,}\b/);
assert.doesNotMatch(maxTree, /supabase\/migrations|CREATE TABLE|external_identities/i);

console.log("max-session-verify-route-unit: ok");
