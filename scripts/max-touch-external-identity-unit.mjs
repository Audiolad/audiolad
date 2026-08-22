#!/usr/bin/env node
/**
 * Mocked RPC tests for touchExternalIdentity.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_EXTERNAL_IDENTITY_PROVIDER,
  setTouchExternalIdentityForTests,
  touchExternalIdentity,
} from "../src/lib/max/touch-external-identity.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

setTouchExternalIdentityForTests(null);

const helperSource = readFileSync(
  join(repoRoot, "src/lib/max/touch-external-identity.ts"),
  "utf8",
);
assert.match(helperSource, /import "server-only"/);
assert.match(helperSource, /createServiceRoleClient/);
assert.match(helperSource, /touch_external_identity/);
assert.doesNotMatch(helperSource, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(helperSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(helperSource, /auth\.users|signUp|signInWithPassword|createUser/);

function createRpcClient(handler) {
  const calls = [];
  return {
    calls,
    client: {
      async rpc(name, args) {
        calls.push({ name, args });
        return handler({ name, args, callIndex: calls.length });
      },
    },
  };
}

function createMemoryIdentityStore(seed = []) {
  const rows = new Map(
    seed.map((row) => [`${row.provider}:${row.provider_user_id}`, { ...row }]),
  );
  const calls = [];
  return {
    rows,
    calls,
    client: {
      async rpc(name, args) {
        calls.push({ name, args });
        const key = `${args.p_provider}:${args.p_provider_user_id}`;
        const now = Date.now();
        const existing = rows.get(key);
        if (!existing) {
          rows.set(key, {
            provider: args.p_provider,
            provider_user_id: args.p_provider_user_id,
            user_id: null,
            linked_at: null,
            last_verified_at: now,
          });
          return { data: [{ linked: false }], error: null };
        }
        existing.last_verified_at = now + 1;
        return { data: [{ linked: existing.user_id != null }], error: null };
      },
    },
  };
}

const store = createMemoryIdentityStore();
const firstResult = await touchExternalIdentity(
  MAX_EXTERNAL_IDENTITY_PROVIDER,
  "101",
  { client: store.client },
);
assert.deepEqual(firstResult, { ok: true, linked: false });
assert.equal(store.rows.size, 1);
assert.deepEqual(store.calls[0], {
  name: "touch_external_identity",
  args: { p_provider: "max", p_provider_user_id: "101" },
});
const firstVerifiedAt = store.rows.get("max:101").last_verified_at;

const secondResult = await touchExternalIdentity("max", "101", {
  client: store.client,
});
assert.deepEqual(secondResult, { ok: true, linked: false });
assert.equal(store.rows.size, 1, "same MAX id must stay one row");
assert.ok(
  store.rows.get("max:101").last_verified_at > firstVerifiedAt,
  "repeat touch updates last_verified_at",
);

const linkedFixture = createMemoryIdentityStore([
  {
    provider: "max",
    provider_user_id: "101",
    user_id: "11111111-1111-4111-8111-111111111111",
    linked_at: "2026-01-01T00:00:00.000Z",
    last_verified_at: 1,
  },
]);
const linkedResult = await touchExternalIdentity("max", "101", {
  client: linkedFixture.client,
});
assert.deepEqual(linkedResult, { ok: true, linked: true });
assert.equal(linkedFixture.rows.size, 1);
assert.equal(
  linkedFixture.rows.get("max:101").user_id,
  "11111111-1111-4111-8111-111111111111",
);
assert.equal(
  linkedFixture.rows.get("max:101").linked_at,
  "2026-01-01T00:00:00.000Z",
);

const otherResult = await touchExternalIdentity("max", "202", {
  client: store.client,
});
assert.deepEqual(otherResult, { ok: true, linked: false });
assert.equal(store.rows.size, 2, "different MAX id inserts a new row");
assert.equal(store.calls[2].args.p_provider_user_id, "202");

const dbFail = createRpcClient(() => ({
  data: null,
  error: { message: "db_down" },
}));
const dbFailResult = await touchExternalIdentity("max", "101", {
  client: dbFail.client,
});
assert.deepEqual(dbFailResult, { ok: false, reason: "storage_unavailable" });
assert.equal(JSON.stringify(dbFailResult).includes("101"), false);

const emptyProvider = await touchExternalIdentity("   ", "101", {
  client: createRpcClient(() => {
    throw new Error("rpc must not run for empty provider");
  }).client,
});
assert.deepEqual(emptyProvider, { ok: false, reason: "storage_unavailable" });

const emptyId = await touchExternalIdentity("max", "", {
  client: createRpcClient(() => {
    throw new Error("rpc must not run for empty id");
  }).client,
});
assert.deepEqual(emptyId, { ok: false, reason: "storage_unavailable" });

const malformed = createRpcClient(() => ({
  data: [{ unexpected: true }],
  error: null,
}));
const malformedResult = await touchExternalIdentity("max", "101", {
  client: malformed.client,
});
assert.deepEqual(malformedResult, { ok: false, reason: "storage_unavailable" });

console.log("max-touch-external-identity-unit: ok");
