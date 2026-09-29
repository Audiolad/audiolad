#!/usr/bin/env node
/**
 * Mocked delete tests for unlinkExternalIdentity.
 * Deletes only provider=max + verified provider_user_id.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  setUnlinkExternalIdentityForTests,
  unlinkExternalIdentity,
} from "../src/lib/max/unlink-external-identity.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

setUnlinkExternalIdentityForTests(null);

const helperSource = readFileSync(
  join(repoRoot, "src/lib/max/unlink-external-identity.ts"),
  "utf8",
);
assert.match(helperSource, /import "server-only"/);
assert.match(helperSource, /createServiceRoleClient/);
assert.match(helperSource, /from\("external_identities"\)/);
assert.match(helperSource, /\.delete\(\)/);
assert.match(helperSource, /\.eq\("provider", trimmedProvider\)/);
assert.match(helperSource, /\.eq\("provider_user_id", trimmedProviderUserId\)/);
assert.match(helperSource, /MAX_EXTERNAL_IDENTITY_PROVIDER/);
assert.doesNotMatch(helperSource, /\.eq\("user_id"/);
assert.doesNotMatch(helperSource, /auth\.admin|deleteUser|from\("profiles"\)|purchases|library_items|listening_progress/);
assert.doesNotMatch(helperSource, /NEXT_PUBLIC_MAX/);
assert.doesNotMatch(helperSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(helperSource, /initData|MAX_BOT_TOKEN/);
assert.doesNotMatch(helperSource, /CREATE TABLE|alter table/i);

function createStore(seed) {
  const state = seed.map((row) => ({ ...row }));
  const calls = [];
  const client = {
    from(table) {
      if (table !== "external_identities") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        delete() {
          return {
            eq(column, value) {
              if (column !== "provider") {
                throw new Error(`unexpected column ${column}`);
              }
              return {
                async eq(column2, value2) {
                  if (column2 !== "provider_user_id") {
                    throw new Error(`unexpected column ${column2}`);
                  }
                  calls.push({ provider: value, providerUserId: value2 });
                  for (let index = state.length - 1; index >= 0; index -= 1) {
                    const row = state[index];
                    if (
                      row.provider === value &&
                      row.provider_user_id === value2
                    ) {
                      state.splice(index, 1);
                    }
                  }
                  return {
                    error: null,
                    data: [{ user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { state, calls, client };
}

const store = createStore([
  {
    provider: "max",
    provider_user_id: "101",
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  },
  {
    provider: "max",
    provider_user_id: "202",
    user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  },
  {
    provider: "telegram",
    provider_user_id: "101",
    user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  },
]);

const deleted = await unlinkExternalIdentity(
  MAX_EXTERNAL_IDENTITY_PROVIDER,
  "101",
  { client: store.client },
);
assert.deepEqual(deleted, { ok: true });
assert.equal(JSON.stringify(deleted).includes("aaaaaaaa"), false);
assert.deepEqual(store.calls, [{ provider: "max", providerUserId: "101" }]);
assert.equal(
  store.state.some(
    (row) => row.provider === "max" && row.provider_user_id === "101",
  ),
  false,
);
assert.equal(
  store.state.some(
    (row) => row.provider === "max" && row.provider_user_id === "202",
  ),
  true,
);
assert.equal(
  store.state.some(
    (row) => row.provider === "telegram" && row.provider_user_id === "101",
  ),
  true,
);

const repeat = await unlinkExternalIdentity("max", "101", {
  client: store.client,
});
assert.deepEqual(repeat, { ok: true });
assert.equal(store.calls.length, 2);
assert.equal(
  store.state.some((row) => row.provider_user_id === "202"),
  true,
);

const callsBeforeReject = store.calls.length;
const otherProvider = await unlinkExternalIdentity("telegram", "101", {
  client: store.client,
});
assert.deepEqual(otherProvider, { ok: false, reason: "storage_unavailable" });
assert.equal(store.calls.length, callsBeforeReject);
assert.equal(
  store.state.some((row) => row.provider === "telegram"),
  true,
);

const emptyId = await unlinkExternalIdentity("max", "  ", {
  client: store.client,
});
assert.deepEqual(emptyId, { ok: false, reason: "storage_unavailable" });
assert.equal(store.calls.length, callsBeforeReject);

const failing = {
  from() {
    return {
      delete() {
        return {
          eq() {
            return {
              async eq() {
                return { error: { message: "permission denied for table external_identities" } };
              },
            };
          },
        };
      },
    };
  },
};
const storage = await unlinkExternalIdentity("max", "202", { client: failing });
assert.deepEqual(storage, { ok: false, reason: "storage_unavailable" });
assert.equal(JSON.stringify(storage).includes("permission"), false);
assert.equal(JSON.stringify(storage).includes("bbbbbbbb"), false);

console.log("max-unlink-external-identity-unit: ok");
