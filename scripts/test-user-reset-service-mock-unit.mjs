#!/usr/bin/env node
/**
 * Mock service tests for resetAllowlistedTestUser auth.admin.deleteUser contract.
 *
 * Fully isolated: no DB, no Storage, no network, no credentials, no Docker.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TEST_USER_RESET_CONFIRMATION_PHRASE,
  TEST_USER_RESET_EMAIL,
  TEST_USER_RESET_NORMALIZED_EMAIL,
} from "../src/lib/admin/test-user-reset/constants.ts";
import { resetAllowlistedTestUser } from "../src/lib/admin/test-user-reset/reset.ts";
import {
  LISTENER_ROLE,
  PLATFORM_OWNER_ROLE,
} from "../src/lib/auth/platform-admin.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createFakeCleanup(calls, options = {}) {
  return async (ownerUserId) => {
    calls.cleanupPrivateAudio.push(ownerUserId);
    if (options.fail) {
      throw new Error(options.failMessage ?? "fake_private_audio_cleanup_failed");
    }
    return {
      removedItems: options.removedItems ?? 0,
      removedPaths: options.removedPaths ?? 0,
    };
  };
}

function createMockService(scenario) {
  const calls = {
    deleteUser: [],
    auditInserts: [],
    tables: [],
    cleanupPrivateAudio: [],
  };

  const counts = scenario.counts ?? {};
  const targetUserId = scenario.targetUserId ?? randomUUID();
  const actorUserId = scenario.actorUserId ?? randomUUID();

  class QueryBuilder {
    #table;
    #mode = "select";
    #head = false;
    #wantCount = false;
    #filters = [];
    #orFilter = null;
    #inFilter = null;
    #updatePayload = null;

    constructor(table) {
      this.#table = table;
      calls.tables.push(table);
    }

    select(_columns, options) {
      if (options?.count === "exact" && options?.head) {
        this.#head = true;
        this.#wantCount = true;
      }
      return this;
    }

    eq(column, value) {
      this.#filters.push({ column, value });
      return this;
    }

    ilike(column, value) {
      this.#filters.push({ column, value, ilike: true });
      return this;
    }

    in(column, values) {
      this.#inFilter = { column, values };
      return this;
    }

    or(filter) {
      this.#orFilter = filter;
      return this;
    }

    update(payload) {
      this.#mode = "update";
      this.#updatePayload = payload;
      return this;
    }

    delete() {
      this.#mode = "delete";
      return this;
    }

    insert(payload) {
      calls.auditInserts.push({ table: this.#table, payload });
      return Promise.resolve({ error: null });
    }

    limit() {
      return this;
    }

    maybeSingle() {
      return Promise.resolve(this.#resolveMaybeSingle());
    }

    then(resolve, reject) {
      return Promise.resolve(this.#resolve()).then(resolve, reject);
    }

    #resolveMaybeSingle() {
      if (this.#table === "profiles") {
        const idFilter = this.#filters.find((f) => f.column === "id");
        if (idFilter?.value === actorUserId) {
          return {
            data: { role: scenario.actorRole ?? PLATFORM_OWNER_ROLE },
            error: null,
          };
        }
        if (idFilter?.value === targetUserId) {
          return {
            data:
              scenario.targetProfile ?? {
                id: targetUserId,
                role: LISTENER_ROLE,
                full_name: "Reset Test",
                email: TEST_USER_RESET_EMAIL,
                avatar_path: null,
              },
            error: null,
          };
        }
        if (this.#filters.some((f) => f.ilike && f.column === "email")) {
          if (scenario.authUserMissing) {
            return { data: null, error: null };
          }
          return {
            data: { id: targetUserId, email: TEST_USER_RESET_EMAIL },
            error: null,
          };
        }
        if (this.#filters.some((f) => f.column === "role")) {
          return {
            data: { id: actorUserId, role: scenario.actorRole ?? PLATFORM_OWNER_ROLE },
            error: null,
          };
        }
      }

      return { data: null, error: null };
    }

    #resolve() {
      if (this.#mode === "update") {
        if (scenario.failUpdateOn === this.#table) {
          return { error: { message: "update failed" } };
        }
        return { error: null };
      }

      if (this.#mode === "delete") {
        if (scenario.failDeleteOn === this.#table) {
          throw new Error(`test_user_reset_delete_${this.#table}_failed`);
        }
        return { count: scenario.deleteCounts?.[this.#table] ?? 1, error: null };
      }

      if (this.#head && this.#wantCount) {
        if (this.#table === "analytics_events" || this.#table === "analytics_sessions") {
          return { count: counts[this.#table] ?? 0, error: null };
        }
        return { count: counts[this.#table] ?? 0, error: null };
      }

      if (this.#table === "email_contacts" && this.#filters.some((f) => f.column === "normalized_email")) {
        return {
          data: scenario.emailContacts ?? [
            {
              id: randomUUID(),
              user_id: targetUserId,
              email: TEST_USER_RESET_EMAIL,
              normalized_email: TEST_USER_RESET_NORMALIZED_EMAIL,
              status: "active",
            },
          ],
          error: null,
        };
      }

      if (this.#table === "email_outbox" && this.#inFilter) {
        return { data: scenario.outboxRows ?? [{ id: randomUUID() }], error: null };
      }

      if (this.#table === "analytics_sessions" && this.#filters.some((f) => f.column === "user_id")) {
        return {
          data: scenario.analyticsSessions ?? [],
          error: null,
        };
      }

      if (this.#table === "analytics_events" && this.#filters.some((f) => f.column === "user_id")) {
        return {
          data: scenario.analyticsEvents ?? [],
          error: null,
        };
      }

      return { data: [], error: null };
    }
  }

  const service = {
    calls,
    targetUserId,
    actorUserId,
    from(table) {
      return new QueryBuilder(table);
    },
    auth: {
      admin: {
        async getUserById(id) {
          if (id !== targetUserId) {
            return { data: { user: null }, error: null };
          }
          if (scenario.authUserMissing) {
            return { data: { user: null }, error: null };
          }
          return {
            data: {
              user: {
                id: targetUserId,
                email: TEST_USER_RESET_EMAIL,
              },
            },
            error: null,
          };
        },
        async listUsers() {
          if (scenario.authUserMissing) {
            return { data: { users: [] }, error: null };
          }
          return {
            data: {
              users: [{ id: targetUserId, email: TEST_USER_RESET_EMAIL }],
            },
            error: null,
          };
        },
        async deleteUser(userId) {
          calls.deleteUser.push(userId);
          if (scenario.deleteUserError) {
            return { error: scenario.deleteUserError };
          }
          scenario.authUserMissing = true;
          return { error: null };
        },
      },
    },
  };

  return service;
}

async function testDeleteUserCalledWithTargetUuid() {
  const service = createMockService({
    counts: {
      analytics_events: 0,
      analytics_sessions: 0,
    },
    emailContacts: [],
    authUserMissing: false,
  });

  const result = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls, {
        removedItems: 2,
        removedPaths: 3,
      }),
    },
  );

  assert(result.ok, "reset ok");
  assert(result.result.status === "success", "reset success");
  assert(service.calls.deleteUser.length === 1, "deleteUser called once");
  assert(
    service.calls.deleteUser[0] === service.targetUserId,
    "deleteUser called with target UUID",
  );
  assert(
    service.calls.cleanupPrivateAudio.length === 1,
    "private audio cleanup called once",
  );
  assert(
    service.calls.cleanupPrivateAudio[0] === service.targetUserId,
    "private audio cleanup receives target user id",
  );
  assert(
    result.result.deletedCounts.privateAudioItemsRemoved === 2,
    "cleanup removedItems surfaced in deletedCounts",
  );
}

async function testDeleteUserSkippedOnBlocker() {
  const service = createMockService({
    counts: {
      orders: 1,
      analytics_events: 0,
      analytics_sessions: 0,
    },
  });

  const result = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls),
    },
  );

  assert(result.ok, "blocked wrapper ok");
  assert(result.result.status === "failed", "blocked status");
  assert(result.result.blockers?.length, "blockers returned");
  assert(service.calls.deleteUser.length === 0, "deleteUser not called on blocker");
  assert(
    service.calls.cleanupPrivateAudio.length === 0,
    "cleanup skipped when reset is blocked",
  );
}

async function testDeleteUserSkippedOnCleanupFailure() {
  const service = createMockService({
    counts: {
      analytics_events: 0,
      analytics_sessions: 0,
    },
    failDeleteOn: "email_outbox",
  });

  const result = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls),
    },
  );

  assert(result.ok, "cleanup failure wrapper ok");
  assert(result.result.status === "failed", "cleanup failure status");
  assert(result.result.errorCode === "cleanup_failed", "cleanup failure code");
  assert(service.calls.deleteUser.length === 0, "deleteUser not called after cleanup failure");
}

async function testPrivateAudioCleanupFailureStopsAuthDelete() {
  const service = createMockService({
    counts: {
      analytics_events: 0,
      analytics_sessions: 0,
    },
    emailContacts: [],
    authUserMissing: false,
  });

  const result = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls, {
        fail: true,
      }),
    },
  );

  assert(result.ok, "private audio cleanup failure wrapper ok");
  assert(result.result.status === "failed", "private audio cleanup failure status");
  assert(
    result.result.errorCode === "cleanup_failed",
    "private audio cleanup failure code",
  );
  assert(
    service.calls.cleanupPrivateAudio.length === 1 &&
      service.calls.cleanupPrivateAudio[0] === service.targetUserId,
    "failing cleanup still receives target user id once",
  );
  assert(
    service.calls.deleteUser.length === 0,
    "auth delete not called after private audio cleanup failure",
  );
}

async function testPartialWhenAuthDeleteFailsAfterCleanup() {
  const service = createMockService({
    counts: {
      analytics_events: 0,
      analytics_sessions: 0,
    },
    emailContacts: [],
    deleteUserError: { message: "auth delete failed" },
  });

  const result = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls),
    },
  );

  assert(result.ok, "partial wrapper ok");
  assert(result.result.status === "partial", "partial status after auth delete failure");
  assert(result.result.errorCode === "auth_delete_failed", "auth delete failed code");
  assert(service.calls.deleteUser.length === 1, "deleteUser attempted after cleanup");
  assert(
    service.calls.cleanupPrivateAudio.length === 1,
    "cleanup runs before failed auth delete",
  );
}

async function testRepeatRunAlreadyResetSafe() {
  const service = createMockService({
    authUserMissing: true,
    counts: {
      email_contacts: 0,
      analytics_events: 0,
      analytics_sessions: 0,
    },
    emailContacts: [],
  });

  const result = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls),
    },
  );

  assert(result.ok, "already reset ok");
  assert(result.result.alreadyReset, "already reset flagged");
  assert(service.calls.deleteUser.length === 0, "repeat run skips deleteUser");
  assert(service.calls.auditInserts.length === 0, "repeat run skips audit write");
  assert(
    service.calls.cleanupPrivateAudio.length === 0,
    "repeat run skips private audio cleanup",
  );
}

function testNoLiveCleanupOrCredentials() {
  const unitSource = readFileSync(
    path.join(REPO_ROOT, "scripts", "test-user-reset-service-mock-unit.mjs"),
    "utf8",
  );
  const resetSource = readFileSync(
    path.join(REPO_ROOT, "src", "lib", "admin", "test-user-reset", "reset.ts"),
    "utf8",
  );

  assert(
    unitSource.includes("createFakeCleanup"),
    "unit injects fake private audio cleanup",
  );
  assert(
    !unitSource.includes("@" + "supabase/supabase-js"),
    "unit does not import live supabase sdk",
  );
  assert(
    !unitSource.includes(["", "var", "www", "audiolad", ".env.local"].join("/")),
    "unit does not read production env path",
  );
  assert(
    !unitSource.includes("process.env." + "SUPABASE_SERVICE_ROLE_KEY"),
    "unit does not read service role from process.env",
  );
  assert(
    !unitSource.includes("audiolad" + ".ru"),
    "unit does not target production host",
  );
  assert(
    resetSource.includes("TestUserResetDeps"),
    "reset service exposes injectable deps",
  );
  assert(
    resetSource.includes("cleanupPrivateAudioStorageForUser ??"),
    "production default cleanup preserved via nullish coalescing",
  );
}

async function main() {
  testNoLiveCleanupOrCredentials();
  await testDeleteUserCalledWithTargetUuid();
  await testDeleteUserSkippedOnBlocker();
  await testDeleteUserSkippedOnCleanupFailure();
  await testPrivateAudioCleanupFailureStopsAuthDelete();
  await testPartialWhenAuthDeleteFailsAfterCleanup();
  await testRepeatRunAlreadyResetSafe();
  console.log("test-user-reset-service-mock-unit: ok");
}

main().catch((error) => {
  console.error("test-user-reset-service-mock-unit failed:", error.message ?? error);
  process.exit(1);
});
