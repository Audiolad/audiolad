#!/usr/bin/env npx tsx
/**
 * Page-access regression for author-dashboard product edit.
 * Exercises requirePracticeAccess — the support-aware gate the page must use.
 * No network, no Supabase credentials, no mutations.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTING_AUTHOR_ID,
  AUTHOR_USER_ID,
  OTHER_AUTHOR_ID,
  OWNER_ID,
  PRACTICE_ID,
  createActingMembership,
  createPractice,
  createSupportExecution,
  resetState,
  state,
} from "./lib/author-practice-access-test-state.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const page = read("src/app/(platform)/author-dashboard/products/[id]/page.tsx");
const helper = read("src/lib/author-products/dashboard-edit-page.ts");
const auth = read("src/lib/author-products/auth.ts");

assert.match(page, /loadAuthorDashboardProductEditData/);
assert.match(page, /listAuthorWorkspacesForUser/);
assert.doesNotMatch(page, /from\("author_members"\)/);
assert.doesNotMatch(page, /eq\("user_id", userId\)/);
assert.doesNotMatch(page, /eq\("user_id", user\.id\)/);
assert.doesNotMatch(page, /requirePracticeMutationAccess/);
assert.doesNotMatch(page, /INSERT INTO public\.author_members/);
assert.match(page, /topicFormData=\{topicFormData\}/);
assert.match(page, /loadAuthorProductTopicFormData|loadAuthorDashboardProductEditData/);

assert.match(helper, /requirePracticeAccess\(practiceId\)/);
assert.match(helper, /getAuthorProductDetail\(access\.supabase, practiceId\)/);
assert.match(helper, /loadAuthorProductTopicFormData\(\s*access\.supabase/);
assert.doesNotMatch(helper, /requirePracticeMutationAccess/);
assert.doesNotMatch(helper, /from\("author_members"\)/);
assert.doesNotMatch(helper, /createServiceRoleClient/);
assert.doesNotMatch(helper, /SUPABASE_SERVICE_ROLE_KEY/);

assert.match(auth, /peekAuthorExecutionContext/);
assert.match(auth, /getAuthorDataClient/);
assert.match(auth, /requestedAuthorMatchesSupport/);
assert.match(auth, /loadActingAuthorMembership/);
assert.doesNotMatch(auth, /SET request\.jwt\.claim\.sub/);
assert.doesNotMatch(auth, /auth\.uid\(\)\s*=\s*acting_user_id/);

const { AuthorAccessError, requirePracticeAccess } = await import(
  "../src/lib/author-products/auth.ts"
);
const {
  loadAuthorDashboardProductEditData,
  mapAuthorDashboardProductEditError,
} = await import("../src/lib/author-products/dashboard-edit-page.ts");

async function expectAccess(
  practiceId: string,
  expected: { code?: string; status?: number } | "ok",
) {
  try {
    const result = await requirePracticeAccess(practiceId);
    if (expected === "ok") {
      return result;
    }
    throw new Error(`expected ${expected.code}, got success`);
  } catch (error) {
    if (expected === "ok") {
      throw error;
    }
    assert.ok(error instanceof AuthorAccessError, String(error));
    assert.equal(error.code, expected.code);
    assert.equal(error.status, expected.status);
    return null;
  }
}

// ordinary author opens their own product
resetState({
  userId: AUTHOR_USER_ID,
  execution: null,
  practices: { [PRACTICE_ID]: createPractice() },
  realMemberships: [
    { authorId: ACTING_AUTHOR_ID, userId: AUTHOR_USER_ID, role: "owner" },
  ],
});
const ownDraft = await expectAccess(PRACTICE_ID, "ok");
assert.equal(ownDraft?.user.id, AUTHOR_USER_ID);
assert.equal(ownDraft?.practice.author_id, ACTING_AUTHOR_ID);
assert.equal(ownDraft?.practice.status, "draft");
assert.equal(ownDraft?.role, "owner");

// platform owner in support mode opens the acting author's product
// even when the real admin is not in author_members
resetState({
  userId: OWNER_ID,
  execution: createSupportExecution(),
  practices: { [PRACTICE_ID]: createPractice({ status: "draft" }) },
  realMemberships: [],
  actingMembership: createActingMembership(),
});
const supportDraft = await expectAccess(PRACTICE_ID, "ok");
assert.equal(supportDraft?.user.id, OWNER_ID, "auth.uid() stays the real admin");
assert.equal(supportDraft?.practice.author_id, ACTING_AUTHOR_ID);
assert.equal(supportDraft?.role, "owner");
assert.equal(
  state.membershipLookups.filter((lookup) => lookup.userId === OWNER_ID).length,
  0,
  "support path must not check author_members for the real admin",
);

// page-access regression: support context + real admin not a member +
// product belongs to actingAuthorId → authorization succeeds
assert.equal(
  state.realMemberships.some((row) => row.userId === OWNER_ID),
  false,
);
assert.equal(supportDraft?.practice.id, PRACTICE_ID);

// published product opens in support mode
resetState({
  userId: OWNER_ID,
  execution: createSupportExecution(),
  practices: {
    [PRACTICE_ID]: createPractice({
      status: "published",
      published_at: "2026-08-01T00:00:00.000Z",
      moderation_status: "approved",
    }),
  },
  realMemberships: [],
  actingMembership: createActingMembership(),
});
const supportPublished = await expectAccess(PRACTICE_ID, "ok");
assert.equal(supportPublished?.practice.status, "published");
assert.equal(supportPublished?.user.id, OWNER_ID);

// draft product opens in support mode (explicit)
resetState({
  userId: OWNER_ID,
  execution: createSupportExecution(),
  practices: { [PRACTICE_ID]: createPractice({ status: "draft" }) },
  realMemberships: [],
  actingMembership: createActingMembership(),
});
const supportDraftAgain = await expectAccess(PRACTICE_ID, "ok");
assert.equal(supportDraftAgain?.practice.status, "draft");

// support mode cannot open a product of another author space
resetState({
  userId: OWNER_ID,
  execution: createSupportExecution(),
  practices: {
    [PRACTICE_ID]: createPractice({ author_id: OTHER_AUTHOR_ID }),
  },
  realMemberships: [],
  actingMembership: createActingMembership(),
});
await expectAccess(PRACTICE_ID, { code: "forbidden", status: 403 });

// platform owner without support mode cannot open someone else's product
resetState({
  userId: OWNER_ID,
  execution: null,
  practices: { [PRACTICE_ID]: createPractice() },
  realMemberships: [],
});
await expectAccess(PRACTICE_ID, { code: "forbidden", status: 403 });
assert.ok(
  state.membershipLookups.some(
    (lookup) =>
      lookup.userId === OWNER_ID && lookup.authorId === ACTING_AUTHOR_ID,
  ),
  "normal path still checks the real user's membership",
);

// deleted product stays 404
resetState({
  userId: AUTHOR_USER_ID,
  execution: null,
  practices: {
    [PRACTICE_ID]: createPractice({ deleted_at: "2026-08-01T00:00:00.000Z" }),
  },
  realMemberships: [
    { authorId: ACTING_AUTHOR_ID, userId: AUTHOR_USER_ID, role: "owner" },
  ],
});
await expectAccess(PRACTICE_ID, { code: "not_found", status: 404 });

resetState({
  userId: OWNER_ID,
  execution: createSupportExecution(),
  practices: {
    [PRACTICE_ID]: createPractice({ deleted_at: "2026-08-01T00:00:00.000Z" }),
  },
  realMemberships: [],
  actingMembership: createActingMembership(),
});
await expectAccess(PRACTICE_ID, { code: "not_found", status: 404 });

// nonexistent product stays 404
resetState({
  userId: AUTHOR_USER_ID,
  execution: null,
  practices: {},
  realMemberships: [
    { authorId: ACTING_AUTHOR_ID, userId: AUTHOR_USER_ID, role: "owner" },
  ],
});
await expectAccess(PRACTICE_ID, { code: "not_found", status: 404 });

resetState({
  userId: OWNER_ID,
  execution: createSupportExecution(),
  practices: {},
  realMemberships: [],
  actingMembership: createActingMembership(),
});
await expectAccess(PRACTICE_ID, { code: "not_found", status: 404 });

assert.equal(
  mapAuthorDashboardProductEditError(new AuthorAccessError("unauthorized", 401)),
  "unauthorized",
);
assert.equal(
  mapAuthorDashboardProductEditError(new AuthorAccessError("forbidden", 403)),
  "not_found",
);
assert.equal(
  mapAuthorDashboardProductEditError(new AuthorAccessError("not_found", 404)),
  "not_found",
);
assert.equal(mapAuthorDashboardProductEditError(new Error("boom")), null);

void loadAuthorDashboardProductEditData;

console.log("author-product-edit-page-access-unit: ok");
