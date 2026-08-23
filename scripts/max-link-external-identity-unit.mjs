#!/usr/bin/env node
/**
 * Mocked RPC tests for linkExternalIdentity.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  linkExternalIdentity,
  setLinkExternalIdentityForTests,
} from "../src/lib/max/link-external-identity.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

setLinkExternalIdentityForTests(null);

const helperSource = readFileSync(
  join(repoRoot, "src/lib/max/link-external-identity.ts"),
  "utf8",
);
assert.match(helperSource, /import "server-only"/);
assert.match(helperSource, /createServiceRoleClient/);
assert.match(helperSource, /link_external_identity/);
assert.doesNotMatch(helperSource, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(helperSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(helperSource, /auth\.users|signUp|signInWithPassword|createUser/);
assert.doesNotMatch(helperSource, /initData|MAX_BOT_TOKEN/);

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

const linked = createRpcClient(() => ({
  data: [{ status: "linked" }],
  error: null,
}));
const linkedResult = await linkExternalIdentity(
  MAX_EXTERNAL_IDENTITY_PROVIDER,
  "101",
  USER_A,
  { client: linked.client },
);
assert.deepEqual(linkedResult, { ok: true, status: "linked" });
assert.deepEqual(linked.calls[0], {
  name: "link_external_identity",
  args: {
    p_provider: "max",
    p_provider_user_id: "101",
    p_user_id: USER_A,
  },
});
assert.equal(JSON.stringify(linkedResult).includes(USER_A), false);

const already = createRpcClient(() => ({
  data: [{ status: "already_linked_same_user" }],
  error: null,
}));
assert.deepEqual(
  await linkExternalIdentity("max", "101", USER_A, { client: already.client }),
  { ok: true, status: "already_linked_same_user" },
);

const identity = createRpcClient(() => ({
  data: [{ status: "identity_already_linked" }],
  error: null,
}));
assert.deepEqual(
  await linkExternalIdentity("max", "101", USER_A, { client: identity.client }),
  { ok: false, reason: "identity_conflict" },
);

const userConflict = createRpcClient(() => ({
  data: [{ status: "user_already_has_max_identity" }],
  error: null,
}));
assert.deepEqual(
  await linkExternalIdentity("max", "101", USER_A, {
    client: userConflict.client,
  }),
  { ok: false, reason: "user_conflict" },
);

const uniqueUser = createRpcClient(() => ({
  data: null,
  error: {
    code: "23505",
    message:
      'duplicate key value violates unique constraint "external_identities_provider_linked_user_uidx"',
  },
}));
const uniqueUserResult = await linkExternalIdentity("max", "101", USER_A, {
  client: uniqueUser.client,
});
assert.deepEqual(uniqueUserResult, { ok: false, reason: "user_conflict" });
assert.equal(JSON.stringify(uniqueUserResult).includes("23505"), false);
assert.equal(
  JSON.stringify(uniqueUserResult).includes("external_identities"),
  false,
);
assert.equal(JSON.stringify(uniqueUserResult).includes(USER_A), false);

const uniqueIdentity = createRpcClient(() => ({
  data: null,
  error: {
    code: "23505",
    message:
      'duplicate key value violates unique constraint "external_identities_provider_user_unique"',
  },
}));
const uniqueIdentityResult = await linkExternalIdentity("max", "101", USER_A, {
  client: uniqueIdentity.client,
});
assert.deepEqual(uniqueIdentityResult, {
  ok: false,
  reason: "identity_conflict",
});
assert.equal(JSON.stringify(uniqueIdentityResult).includes("23505"), false);

const dbFail = createRpcClient(() => ({
  data: null,
  error: { message: "db_down" },
}));
const dbFailResult = await linkExternalIdentity("max", "101", USER_A, {
  client: dbFail.client,
});
assert.deepEqual(dbFailResult, { ok: false, reason: "storage_error" });
assert.equal(JSON.stringify(dbFailResult).includes("101"), false);

const emptyProvider = await linkExternalIdentity("   ", "101", USER_A, {
  client: createRpcClient(() => {
    throw new Error("rpc must not run for empty provider");
  }).client,
});
assert.deepEqual(emptyProvider, { ok: false, reason: "storage_error" });

const emptyId = await linkExternalIdentity("max", "", USER_A, {
  client: createRpcClient(() => {
    throw new Error("rpc must not run for empty id");
  }).client,
});
assert.deepEqual(emptyId, { ok: false, reason: "storage_error" });

const badUser = await linkExternalIdentity("max", "101", "not-a-uuid", {
  client: createRpcClient(() => {
    throw new Error("rpc must not run for invalid user id");
  }).client,
});
assert.deepEqual(badUser, { ok: false, reason: "storage_error" });
assert.equal(JSON.stringify(badUser).includes("not-a-uuid"), false);

const malformed = createRpcClient(() => ({
  data: [{ unexpected: true }],
  error: null,
}));
assert.deepEqual(
  await linkExternalIdentity("max", "101", USER_A, { client: malformed.client }),
  { ok: false, reason: "storage_error" },
);

const invalidArgs = createRpcClient(() => ({
  data: [{ status: "invalid_args" }],
  error: null,
}));
assert.deepEqual(
  await linkExternalIdentity("max", "101", USER_A, {
    client: invalidArgs.client,
  }),
  { ok: false, reason: "storage_error" },
);

console.log("max-link-external-identity-unit: ok");
