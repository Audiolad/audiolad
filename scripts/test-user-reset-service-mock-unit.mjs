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
    calls.sequence.push("cleanupPrivateAudio");
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
    deletes: [],
    storageRemoves: [],
    rpc: [],
    sequence: [],
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
        calls.sequence.push(`delete:${this.#table}`);
        calls.deletes.push(this.#table);
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
          calls.sequence.push("deleteUser");
          calls.deleteUser.push(userId);
          if (scenario.deleteUserError) {
            return { error: scenario.deleteUserError };
          }
          scenario.authUserMissing = true;
          return { error: null };
        },
      },
    },
    storage: {
      from(bucket) {
        return {
          async remove(paths) {
            calls.sequence.push(`storage:${bucket}`);
            calls.storageRemoves.push({ bucket, paths });
            return { error: null };
          },
        };
      },
    },
    async rpc(fn, args) {
      calls.sequence.push("rpc");
      calls.rpc.push({ fn, args });
      if (scenario.rpcError) {
        return { data: null, error: scenario.rpcError };
      }
      return {
        data: scenario.rpcData ?? {
          ok: true,
          dbCleanupCompleted: true,
          alreadyClean: false,
          targetUserId,
          counts: {
            inviteeReferrals: scenario.dbCounts?.inviteeReferrals ?? 1,
            attributions: scenario.dbCounts?.attributions ?? 1,
            ownedAuthors: scenario.dbCounts?.ownedAuthors ?? 2,
            authorMembers: scenario.dbCounts?.authorMembers ?? 2,
            authorApplications: scenario.dbCounts?.authorApplications ?? 1,
            capacityGrants: 0,
            partnerBonusCleared: scenario.dbCounts?.partnerBonusCleared ?? 1,
          },
        },
        error: null,
      };
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
  assert(result.result.deletedCounts.authUserDeleted === true, "authUserDeleted");
  assert(
    !service.calls.tables.includes("analytics_first_touches"),
    "reset does not manually delete analytics_first_touches",
  );
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
  assert(service.calls.rpc.length === 1, "phase 1 RPC called once");
  assert(
    service.calls.rpc[0].fn === "reset_allowlisted_test_user_db",
    "phase 1 RPC name",
  );
  assert(
    service.calls.rpc[0].args.p_target_user_id === service.targetUserId,
    "phase 1 RPC receives target user id",
  );
  assert(
    service.calls.sequence.indexOf("rpc") <
      service.calls.sequence.indexOf("cleanupPrivateAudio"),
    "phase 1 RPC runs before non-FK cleanup",
  );
  assert(
    service.calls.sequence.indexOf("cleanupPrivateAudio") <
      service.calls.sequence.indexOf("deleteUser"),
    "non-FK cleanup runs before auth delete",
  );
  assert(result.result.deletedCounts.dbCleanupCompleted === true, "db cleanup completed");
  assert(result.result.deletedCounts.ownedAuthors === 2, "owned authors counted");
  assert(result.result.deletedCounts.authUserDeleted === true, "auth user deleted after db cleanup");
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

function assertPartialCleanupAfterPhase1(result, service, label) {
  assert(result.ok, `${label} wrapper ok`);
  assert(result.result.status === "partial", `${label} status is partial`);
  assert(result.result.errorCode === "cleanup_failed", `${label} error code`);
  assert(
    result.result.deletedCounts.dbCleanupCompleted === true,
    `${label} keeps committed phase 1`,
  );
  assert(service.calls.deleteUser.length === 0, `${label} does not delete auth user`);
  assert(service.calls.rpc.length === 1, `${label} ran phase 1 once`);
  assert(
    service.calls.sequence.indexOf("rpc") >= 0 &&
      service.calls.sequence.indexOf("rpc") <
        service.calls.sequence.findIndex(
          (step) => step === "cleanupPrivateAudio" || step.startsWith("delete:"),
        ),
    `${label} runs the RPC before non-FK cleanup`,
  );
  assert(
    result.result.message.includes("очищена") &&
      result.result.message.includes("повторить"),
    `${label} says cleaned data can be retried`,
  );
  const audit = service.calls.auditInserts.at(-1);
  assert(audit?.payload?.status === "partial", `${label} audit status is partial`);
  assert(audit?.payload?.error_code === "cleanup_failed", `${label} audit error code`);
  assert(
    audit?.payload?.counts?.deleted?.dbCleanupCompleted === true,
    `${label} audit records committed phase 1`,
  );
}

async function testDeleteUserSkippedOnCleanupFailure() {
  const scenario = {
    counts: {
      analytics_events: 0,
      analytics_sessions: 0,
    },
    emailContacts: [],
    failDeleteOn: "email_outbox",
  };
  const service = createMockService(scenario);

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

  assertPartialCleanupAfterPhase1(result, service, "email cleanup failure");
  assert(
    service.calls.sequence.includes("delete:email_outbox"),
    "email cleanup was attempted after phase 1",
  );

  scenario.failDeleteOn = null;
  scenario.dbCounts = {
    inviteeReferrals: 0,
    attributions: 0,
    ownedAuthors: 0,
    authorMembers: 0,
    authorApplications: 0,
    partnerBonusCleared: 0,
  };

  const retry = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls),
    },
  );

  assert(retry.ok, "email cleanup retry ok");
  assert(retry.result.status === "success", "email cleanup retry completes");
  assert(retry.result.deletedCounts.dbCleanupCompleted === true, "retry phase 1 stays complete");
  assert(retry.result.deletedCounts.authUserDeleted === true, "retry deletes auth user");
  assert(service.calls.rpc.length === 2, "retry calls phase 1 again");
  assert(service.calls.deleteUser.length === 1, "retry is the first auth delete");
  assert(
    service.calls.sequence.lastIndexOf("rpc") < service.calls.sequence.lastIndexOf("deleteUser"),
    "retry still runs phase 1 before auth delete",
  );
}

async function testPrivateAudioCleanupFailureStopsAuthDelete() {
  const scenario = {
    counts: {
      analytics_events: 0,
      analytics_sessions: 0,
    },
    emailContacts: [],
    authUserMissing: false,
  };
  const service = createMockService(scenario);

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

  assertPartialCleanupAfterPhase1(result, service, "private audio cleanup failure");
  assert(
    service.calls.cleanupPrivateAudio.length === 1 &&
      service.calls.cleanupPrivateAudio[0] === service.targetUserId,
    "failing private-audio cleanup still receives the target user id",
  );
  assert(
    service.calls.sequence.indexOf("rpc") <
      service.calls.sequence.indexOf("cleanupPrivateAudio"),
    "private-audio cleanup starts only after phase 1",
  );

  scenario.dbCounts = {
    inviteeReferrals: 0,
    attributions: 0,
    ownedAuthors: 0,
    authorMembers: 0,
    authorApplications: 0,
    partnerBonusCleared: 0,
  };

  const retry = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls),
    },
  );

  assert(retry.ok, "private audio retry ok");
  assert(retry.result.status === "success", "private audio retry completes");
  assert(retry.result.deletedCounts.dbCleanupCompleted === true, "retry phase 1 stays complete");
  assert(retry.result.deletedCounts.authUserDeleted === true, "retry deletes auth user");
  assert(service.calls.rpc.length === 2, "retry calls phase 1 again");
  assert(service.calls.deleteUser.length === 1, "retry is the first auth delete");
  assert(service.calls.cleanupPrivateAudio.length === 2, "retry repeats private-audio cleanup");
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
    service.calls.sequence.indexOf("rpc") <
      service.calls.sequence.indexOf("cleanupPrivateAudio") &&
      service.calls.sequence.indexOf("cleanupPrivateAudio") <
        service.calls.sequence.indexOf("deleteUser"),
    "non-FK cleanup sits between phase 1 success and auth delete",
  );
  assert(result.result.deletedCounts.dbCleanupCompleted === true, "db cleanup kept after auth failure");
  assert(result.result.deletedCounts.authUserDeleted === false, "auth user not deleted");
  assert(
    result.result.message.includes("повторить"),
    "partial result says the reset can be retried",
  );
}

async function testPhase2RetryAfterDbCleanup() {
  const scenario = {
    counts: {
      analytics_events: 0,
      analytics_sessions: 0,
    },
    emailContacts: [],
    deleteUserError: { message: "auth delete failed" },
  };
  const service = createMockService(scenario);

  const first = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls),
    },
  );

  assert(first.result.status === "partial", "first attempt stays partial");
  assert(first.result.deletedCounts.dbCleanupCompleted === true, "first attempt finished phase 1");
  assert(service.calls.deleteUser.length === 1, "first attempt called deleteUser");

  scenario.deleteUserError = null;
  scenario.dbCounts = {
    inviteeReferrals: 0,
    attributions: 0,
    ownedAuthors: 0,
    authorMembers: 0,
    authorApplications: 0,
    partnerBonusCleared: 0,
  };

  const second = await resetAllowlistedTestUser(
    service,
    {
      actorUserId: service.actorUserId,
      confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
    },
    {
      cleanupPrivateAudioStorageForUser: createFakeCleanup(service.calls),
    },
  );

  assert(second.ok, "retry ok");
  assert(second.result.status === "success", "retry completes auth delete");
  assert(second.result.deletedCounts.authUserDeleted === true, "retry deletes auth user");
  assert(second.result.deletedCounts.dbCleanupCompleted === true, "retry phase 1 is idempotent");
  assert(service.calls.rpc.length === 2, "phase 1 RPC is safe to call again");
  assert(service.calls.deleteUser.length === 2, "deleteUser retried");
}

async function testDbBlockerSkipsAuthDelete() {
  const service = createMockService({
    counts: {
      analytics_events: 0,
      analytics_sessions: 0,
    },
    emailContacts: [],
    rpcError: {
      code: "P0001",
      message: "allowlisted_test_user_reset_blocked",
      details: "test_as_referrer",
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

  assert(result.ok, "db blocker wrapper ok");
  assert(result.result.status === "failed", "db blocker fails closed");
  assert(result.result.errorCode === "blocked", "db blocker code");
  assert(
    result.result.blockers?.some((row) => row.code === "test_as_referrer"),
    "referrer blocker surfaced",
  );
  assert(service.calls.rpc.length === 1, "phase 1 RPC attempted");
  assert(service.calls.deleteUser.length === 0, "auth delete skipped when phase 1 blocks");
  assert(result.result.deletedCounts.dbCleanupCompleted === false, "rolled-back phase 1 is not complete");
  assert(service.calls.cleanupPrivateAudio.length === 0, "private audio skipped when phase 1 blocks");
  assert(
    !service.calls.deletes.some((table) =>
      [
        "email_outbox",
        "email_contacts",
        "email_consents",
        "email_preferences",
        "email_delivery_events",
        "analytics_events",
        "analytics_sessions",
      ].includes(table),
    ),
    "email and analytics cleanup skipped when phase 1 blocks",
  );
}

const NON_FK_DELETE_TABLES = [
  "email_outbox",
  "email_contacts",
  "email_consents",
  "email_preferences",
  "email_delivery_events",
  "analytics_events",
  "analytics_sessions",
];

async function testRpcBlockerSkipsNonFkCleanup() {
  const targetUserId = randomUUID();
  const service = createMockService({
    targetUserId,
    counts: {
      analytics_events: 4,
      analytics_sessions: 2,
    },
    rpcError: {
      code: "P0001",
      message: "allowlisted_test_user_reset_blocked",
      details: "composite_fk:hidden_pair.user_id",
    },
    targetProfile: {
      id: targetUserId,
      role: LISTENER_ROLE,
      full_name: "Reset Test",
      email: TEST_USER_RESET_EMAIL,
      avatar_path: `${targetUserId}/11111111-1111-4111-8111-111111111111.webp`,
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

  assert(result.ok, "rpc blocker wrapper ok");
  assert(result.result.status === "failed", "rpc blocker status");
  assert(result.result.errorCode === "blocked", "rpc blocker error code");
  assert(
    result.result.blockers?.some((row) => row.code === "db_reset_blocked"),
    "composite FK blocker is explicit",
  );
  assert(
    result.result.blockers?.some((row) =>
      row.message.includes("composite_fk:hidden_pair.user_id"),
    ),
    "composite FK detail is returned",
  );
  assert(service.calls.rpc.length === 1, "phase 1 RPC was called");
  assert(
    service.calls.rpc[0].fn === "reset_allowlisted_test_user_db",
    "blocked call used the phase 1 RPC",
  );
  assert(service.calls.deleteUser.length === 0, "auth delete was not called");
  assert(
    service.calls.cleanupPrivateAudio.length === 0,
    "private-audio cleanup was not called",
  );
  assert(service.calls.storageRemoves.length === 0, "avatar cleanup was not called");
  assert(
    !service.calls.deletes.some((table) => NON_FK_DELETE_TABLES.includes(table)),
    "email and analytics cleanup was not called",
  );
  assert(
    !service.calls.sequence.includes("cleanupPrivateAudio"),
    "non-FK cleanup sequence did not start",
  );
  assert(result.result.deletedCounts.dbCleanupCompleted === false, "phase 1 did not commit");
  assert(result.result.deletedCounts.avatarRemoved === false, "avatar flag stays false");
  assert(result.result.deletedCounts.analyticsEvents === 0, "analytics events were not deleted");
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
  await testPhase2RetryAfterDbCleanup();
  await testDbBlockerSkipsAuthDelete();
  await testRpcBlockerSkipsNonFkCleanup();
  await testRepeatRunAlreadyResetSafe();
  console.log("test-user-reset-service-mock-unit: ok");
}

main().catch((error) => {
  console.error("test-user-reset-service-mock-unit failed:", error.message ?? error);
  process.exit(1);
});
