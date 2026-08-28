#!/usr/bin/env npx tsx
/**
 * Save-access regression for author product PATCH / create / submit.
 * Exercises requirePracticeAccess + authorizePracticeAuthorAssignment
 * with the support-mode mock harness.
 * No network, no Supabase credentials, no mutations.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ACTING_AUTHOR_ID,
  AUTHOR_USER_ID,
  OTHER_AUTHOR_ID,
  OWNER_ID,
  PRACTICE_ID,
  createActingMembership,
  createPractice,
  createQueryClient,
  createSupportExecution,
  resetState,
  state,
} from "./lib/author-practice-access-test-state.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

type MembershipLookup = { authorId: string; userId: string };

function membershipLookups() {
  return state.membershipLookups as MembershipLookup[];
}

const { AuthorAccessError, authorizePracticeAuthorAssignment, requirePracticeAccess } =
  await import("../src/lib/author-products/auth");

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

async function expectAssignment(
  input: {
    currentAuthorId: string;
    nextAuthorId: string;
    realUserId: string;
  },
  expected: { assign: boolean } | { code: string; status: number },
) {
  const supabase = createQueryClient() as unknown as SupabaseClient;
  try {
    const result = await authorizePracticeAuthorAssignment({
      ...input,
      supabase,
    });
    if ("code" in expected) {
      throw new Error(`expected ${expected.code}, got assign=${result.assign}`);
    }
    assert.equal(result.assign, expected.assign);
    return result;
  } catch (error) {
    if (!("code" in expected)) {
      throw error;
    }
    assert.ok(error instanceof AuthorAccessError, String(error));
    assert.equal(error.code, expected.code);
    assert.equal(error.status, expected.status);
    return null;
  }
}

const patch = read("src/app/api/author/products/[id]/route.ts");
assert.match(patch, /authorizePracticeAuthorAssignment/);
assert.match(patch, /requirePracticeMutationAccess\(id\)/);
assert.doesNotMatch(patch, /eq\("user_id", user\.id\)/);

// Ordinary author opens and keeps their own draft author_id (create/edit/text-only/MP3).
resetState({
  userId: AUTHOR_USER_ID,
  execution: null,
  practices: { [PRACTICE_ID]: createPractice() },
  realMemberships: [
    { authorId: ACTING_AUTHOR_ID, userId: AUTHOR_USER_ID, role: "owner" },
  ],
});
const ownDraft = await expectAccess(PRACTICE_ID, "ok");
assert.equal(ownDraft?.practice.author_id, ACTING_AUTHOR_ID);
await expectAssignment(
  {
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: ACTING_AUTHOR_ID,
    realUserId: AUTHOR_USER_ID,
  },
  { assign: false },
);
assert.equal(
  membershipLookups().filter(
    (lookup) =>
      lookup.userId === AUTHOR_USER_ID && lookup.authorId === ACTING_AUTHOR_ID,
  ).length,
  1,
  "ordinary same-author save must not re-query author_members after practice access",
);

// Ordinary author can move a draft into another workspace they belong to.
resetState({
  userId: AUTHOR_USER_ID,
  execution: null,
  practices: { [PRACTICE_ID]: createPractice() },
  realMemberships: [
    { authorId: ACTING_AUTHOR_ID, userId: AUTHOR_USER_ID, role: "owner" },
    { authorId: OTHER_AUTHOR_ID, userId: AUTHOR_USER_ID, role: "editor" },
  ],
});
await expectAssignment(
  {
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: OTHER_AUTHOR_ID,
    realUserId: AUTHOR_USER_ID,
  },
  { assign: true },
);

// Ordinary author cannot take another author's product.
resetState({
  userId: AUTHOR_USER_ID,
  execution: null,
  practices: {
    [PRACTICE_ID]: createPractice({ author_id: OTHER_AUTHOR_ID }),
  },
  realMemberships: [
    { authorId: ACTING_AUTHOR_ID, userId: AUTHOR_USER_ID, role: "owner" },
  ],
});
await expectAccess(PRACTICE_ID, { code: "forbidden", status: 403 });
await expectAssignment(
  {
    currentAuthorId: OTHER_AUTHOR_ID,
    nextAuthorId: OTHER_AUTHOR_ID,
    realUserId: AUTHOR_USER_ID,
  },
  { assign: false },
);

// Support mode: acting author's product opens and draft author_id is accepted
// even when the real platform owner is not in author_members.
resetState({
  userId: OWNER_ID,
  execution: createSupportExecution(),
  practices: { [PRACTICE_ID]: createPractice({ status: "draft" }) },
  realMemberships: [],
  actingMembership: createActingMembership(),
});
const supportDraft = await expectAccess(PRACTICE_ID, "ok");
assert.equal(supportDraft?.user.id, OWNER_ID);
assert.equal(supportDraft?.practice.author_id, ACTING_AUTHOR_ID);
await expectAssignment(
  {
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: ACTING_AUTHOR_ID,
    realUserId: OWNER_ID,
  },
  { assign: false },
);
assert.equal(
  membershipLookups().filter((lookup) => lookup.userId === OWNER_ID).length,
  0,
  "support save must not check author_members for the real admin",
);

// Support mode can save after existing MP3 / replaced MP3: same author_id path.
await expectAssignment(
  {
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: ACTING_AUTHOR_ID,
    realUserId: OWNER_ID,
  },
  { assign: false },
);

// Support mode cannot assign another author's space.
await expectAssignment(
  {
    currentAuthorId: ACTING_AUTHOR_ID,
    nextAuthorId: OTHER_AUTHOR_ID,
    realUserId: OWNER_ID,
  },
  { code: "forbidden", status: 403 },
);

// Another author's product is denied in support mode.
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

// Expired / revoked support proof becomes normal context → denied.
resetState({
  userId: OWNER_ID,
  execution: null,
  practices: { [PRACTICE_ID]: createPractice() },
  realMemberships: [],
});
await expectAccess(PRACTICE_ID, { code: "forbidden", status: 403 });

// Missing support cookie is the same as no support mode.
resetState({
  userId: OWNER_ID,
  execution: null,
  practices: { [PRACTICE_ID]: createPractice() },
  realMemberships: [],
});
await expectAccess(PRACTICE_ID, { code: "forbidden", status: 403 });

// Real admin without support mode cannot edit another author's product.
resetState({
  userId: OWNER_ID,
  execution: null,
  practices: { [PRACTICE_ID]: createPractice() },
  realMemberships: [],
});
const adminDenied = await expectAccess(PRACTICE_ID, {
  code: "forbidden",
  status: 403,
});
assert.equal(adminDenied, null);
assert.ok(
  membershipLookups().some(
    (lookup) =>
      lookup.userId === OWNER_ID && lookup.authorId === ACTING_AUTHOR_ID,
  ),
);

console.log("author-product-save-access-unit: ok");
