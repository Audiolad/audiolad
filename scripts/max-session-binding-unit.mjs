#!/usr/bin/env node
/**
 * Server-side MAX session binding: exact AudioLad user match, no leaked IDs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveMaxSessionBinding,
  setResolveMaxSessionBindingForTests,
} from "../src/lib/max/session-binding.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const MAX_ID = "101";
const REQUEST = new Request("https://max.audiolad.ru/api/max/session/verify", {
  method: "POST",
});

setResolveMaxSessionBindingForTests(null);

const helperSource = readFileSync(
  join(repoRoot, "src/lib/max/session-binding.ts"),
  "utf8",
);
assert.match(helperSource, /import "server-only"/);
assert.match(helperSource, /createClientFromRequest/);
assert.match(helperSource, /createServiceRoleClient/);
assert.match(helperSource, /external_identities/);
assert.match(helperSource, /select\("user_id"\)/);
assert.doesNotMatch(helperSource, /linkExternalIdentity|link_external_identity/);
assert.doesNotMatch(helperSource, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(helperSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(helperSource, /MAX_BOT_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(helperSource, /auth\.admin|generateLink|signUp|createUser/);

function assertNoIdentityLeak(result) {
  const encoded = JSON.stringify(result);
  assert.equal(encoded.includes(USER_A), false);
  assert.equal(encoded.includes(USER_B), false);
  assert.equal(encoded.includes(MAX_ID), false);
  assert.equal("userId" in result, false);
  assert.equal("user_id" in result, false);
  assert.equal("provider_user_id" in result, false);
  assert.equal("email" in result, false);
  assert.equal("initData" in result, false);
}

function authClient(user, { error = null, throwOnGetUser = false } = {}) {
  return {
    auth: {
      async getUser() {
        if (throwOnGetUser) {
          throw new Error("auth_unavailable");
        }
        return { data: { user }, error };
      },
    },
  };
}

function identityClient(handler) {
  const calls = [];
  return {
    calls,
    client: {
      from(table) {
        return {
          select(columns) {
            return {
              eq(column, value) {
                const filters = [{ column, value }];
                return {
                  eq(nextColumn, nextValue) {
                    filters.push({ column: nextColumn, value: nextValue });
                    return {
                      async maybeSingle() {
                        calls.push({ table, columns, filters });
                        return handler({ table, columns, filters });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

const noSessionLookup = identityClient(() => {
  throw new Error("identity lookup must not run without a session");
});
const noSession = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () => authClient(null),
  getIdentityClient: () => noSessionLookup.client,
});
assert.deepEqual(noSession, { ok: true, sessionMatches: false });
assert.equal(noSessionLookup.calls.length, 0);
assertNoIdentityLeak(noSession);

const matchingLookup = identityClient(() => ({
  data: { user_id: USER_A, email: "hidden@example.test" },
  error: null,
}));
const matching = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () => authClient({ id: USER_A }),
  getIdentityClient: () => matchingLookup.client,
});
assert.deepEqual(matching, { ok: true, sessionMatches: true });
assert.deepEqual(matchingLookup.calls, [
  {
    table: "external_identities",
    columns: "user_id",
    filters: [
      { column: "provider", value: "max" },
      { column: "provider_user_id", value: MAX_ID },
    ],
  },
]);
assertNoIdentityLeak(matching);
assert.equal(JSON.stringify(matching).includes("hidden@example.test"), false);

const wrongLookup = identityClient(() => ({
  data: { user_id: USER_A },
  error: null,
}));
const wrong = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () => authClient({ id: USER_B }),
  getIdentityClient: () => wrongLookup.client,
});
assert.deepEqual(wrong, { ok: true, sessionMatches: false });
assert.equal(wrongLookup.calls.length, 1);
assertNoIdentityLeak(wrong);

const missingLookup = identityClient(() => ({ data: null, error: null }));
const missing = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () => authClient({ id: USER_A }),
  getIdentityClient: () => missingLookup.client,
});
assert.deepEqual(missing, { ok: true, sessionMatches: false });
assertNoIdentityLeak(missing);

const nullUserLookup = identityClient(() => ({
  data: { user_id: null },
  error: null,
}));
const nullUser = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () => authClient({ id: USER_A }),
  getIdentityClient: () => nullUserLookup.client,
});
assert.deepEqual(nullUser, { ok: true, sessionMatches: false });
assertNoIdentityLeak(nullUser);

const dbFailure = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () => authClient({ id: USER_A }),
  getIdentityClient: () =>
    identityClient(() => ({
      data: null,
      error: { message: "permission denied for table external_identities" },
    })).client,
});
assert.deepEqual(dbFailure, { ok: false, reason: "storage_unavailable" });
assertNoIdentityLeak(dbFailure);
assert.equal(
  JSON.stringify(dbFailure).includes("external_identities"),
  false,
);

const thrownLookup = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () => authClient({ id: USER_A }),
  getIdentityClient: () =>
    identityClient(() => {
      throw new Error("connection reset");
    }).client,
});
assert.deepEqual(thrownLookup, { ok: false, reason: "storage_unavailable" });
assertNoIdentityLeak(thrownLookup);

const authErrorLookup = identityClient(() => {
  throw new Error("identity lookup must not run when getUser fails");
});
const authError = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () =>
    authClient({ id: USER_A }, { error: { message: "invalid jwt" } }),
  getIdentityClient: () => authErrorLookup.client,
});
assert.deepEqual(authError, { ok: true, sessionMatches: false });
assert.equal(authErrorLookup.calls.length, 0);
assertNoIdentityLeak(authError);

const authThrowLookup = identityClient(() => {
  throw new Error("identity lookup must not run when getUser throws");
});
const authThrow = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () =>
    authClient(null, { throwOnGetUser: true }),
  getIdentityClient: () => authThrowLookup.client,
});
assert.deepEqual(authThrow, { ok: true, sessionMatches: false });
assert.equal(authThrowLookup.calls.length, 0);
assertNoIdentityLeak(authThrow);

const unauthenticatedLookup = identityClient(() => {
  throw new Error("identity lookup must not run when unauthenticated");
});
const unauthenticated = await resolveMaxSessionBinding(REQUEST, "max", MAX_ID, {
  getRequestAuthClient: async () => authClient({ id: "" }),
  getIdentityClient: () => unauthenticatedLookup.client,
});
assert.deepEqual(unauthenticated, { ok: true, sessionMatches: false });
assert.equal(unauthenticatedLookup.calls.length, 0);

console.log("max-session-binding-unit: ok");
