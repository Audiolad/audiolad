#!/usr/bin/env node
/**
 * Phase 2 learner access: entitlement matrix, DTO redaction, audio/PDF
 * association gates. No live database.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeEntitlementAccessLevel,
  resolveProductAccess,
} from "../src/lib/products/access.ts";
import {
  canAccessCourseAssetAssociation,
  canAccessRequiredLevel,
  canDownloadCoursePublicationFile,
  canPlayCourseAudioItem,
  evaluateCourseLearnerAccess,
  resolveCourseLearnerAccess,
  groupLearnerCourse,
  serializeLearnerCourse,
  toLearnerCourse,
} from "../src/lib/course-content/index.ts";
import { loadCourseLearnerContent } from "../src/lib/course-content/learner-content.ts";
import { signLearnerPublicationFile } from "../src/lib/course-content/learner-file-sign.ts";
import {
  COURSE_ACCESS_LEVELS_TEST_L1_TITLE,
  COURSE_ACCESS_LEVELS_TEST_L2_TITLE,
  COURSE_ACCESS_LEVELS_TEST_L2_UPGRADE_PRICE,
  createCourseAccessLevelsTestCatalog,
} from "../src/lib/author-products/course-access-levels-fixture.ts";
import CourseLearnerContentModule from "../src/components/products/course-learner/CourseLearnerContent.tsx";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const CourseLearnerContent =
  CourseLearnerContentModule.default ?? CourseLearnerContentModule;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function futureExpiry() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function pastExpiry() {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

function coursePractice(overrides = {}) {
  return {
    id: "course-1",
    author_id: "author-1",
    is_free: false,
    status: "published",
    is_catalog_listed: true,
    product_kind: "practice",
    publication_class: "course",
    ...overrides,
  };
}

function practiceProduct(overrides = {}) {
  return {
    id: "practice-1",
    author_id: "author-1",
    is_free: true,
    status: "published",
    is_catalog_listed: true,
    product_kind: "practice",
    publication_class: "practice",
    ...overrides,
  };
}

function productAccess(overrides = {}) {
  return {
    canListen: false,
    canAcquire: true,
    isPubliclyListed: true,
    reason: "payment_required",
    isAuthorMember: false,
    accessSource: null,
    hasEntitlement: false,
    accessLevel: null,
    ...overrides,
  };
}

function applyFilters(rows, filters) {
  return rows.filter((row) => filters.every((filter) => filter(row)));
}

function createQuery(getRows, error = null) {
  const filters = [];
  const chain = {
    select() {
      return chain;
    },
    eq(column, value) {
      filters.push((row) => row[column] === value);
      return chain;
    },
    in(column, values) {
      const set = new Set(values);
      filters.push((row) => set.has(row[column]));
      return chain;
    },
    order() {
      return chain;
    },
    maybeSingle() {
      const rows = applyFilters(getRows(), filters);
      return Promise.resolve({ data: rows[0] ?? null, error });
    },
    then(onFulfilled, onRejected) {
      const rows = applyFilters(getRows(), filters);
      return Promise.resolve({ data: rows, error }).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

function mockUserSupabase({ membership = null, entitlement = null } = {}) {
  return {
    from(table) {
      const rows =
        table === "author_members"
          ? membership
            ? [membership]
            : []
          : table === "user_practices"
            ? entitlement
              ? [entitlement]
              : []
            : [];
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        in() {
          return chain;
        },
        order() {
          return chain;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: rows, error: null }).then(
            onFulfilled,
            onRejected,
          );
        },
      };
      return chain;
    },
  };
}

const AUDIO_A = "11111111-1111-4111-8111-111111111111";
const AUDIO_B = "22222222-2222-4222-8222-222222222222";
const AUDIO_C = "33333333-3333-4333-8333-333333333333";
const AUDIO_X = "44444444-4444-4444-8444-444444444444";
const FILE_L1 = "55555555-5555-4555-8555-555555555555";
const FILE_L2 = "66666666-6666-4666-8666-666666666666";
const FILE_ORPHAN = "77777777-7777-4777-8777-777777777777";
const LESSON_L1 = "lesson-l1";
const LESSON_L2 = "lesson-l2";
const LESSON_L3 = "lesson-l3";
const SECRET_L2_TEXT = "L2_SECRET_TEXT_MUST_NOT_LEAK";
const SECRET_L2_PATH = "publications/course-1/files/l2-secret.pdf";

function fixtureRows() {
  return {
    lessons: [
      {
        id: LESSON_L1,
        publication_id: "course-1",
        title: "Урок 1",
        position: 0,
        required_access_level: 1,
      },
      {
        id: LESSON_L2,
        publication_id: "course-1",
        title: "Урок 2",
        position: 1,
        required_access_level: 2,
      },
      {
        id: LESSON_L3,
        publication_id: "course-1",
        title: "Урок 3",
        position: 2,
        required_access_level: 3,
      },
    ],
    blocks: [
      {
        id: "block-l1-text",
        lesson_id: LESSON_L1,
        type: "text",
        position: 0,
        asset_id: null,
        payload: { text: "L1 open text" },
      },
      {
        id: "block-l1-audio",
        lesson_id: LESSON_L1,
        type: "audio",
        position: 1,
        asset_id: AUDIO_A,
        payload: {},
      },
      {
        id: "block-l1-shared",
        lesson_id: LESSON_L1,
        type: "audio",
        position: 2,
        asset_id: AUDIO_X,
        payload: {},
      },
      {
        id: "block-l1-file",
        lesson_id: LESSON_L1,
        type: "file",
        position: 3,
        asset_id: FILE_L1,
        payload: { filename: "l1.pdf" },
      },
      {
        id: "block-l2-text",
        lesson_id: LESSON_L2,
        type: "text",
        position: 0,
        asset_id: null,
        payload: { text: SECRET_L2_TEXT },
      },
      {
        id: "block-l2-audio",
        lesson_id: LESSON_L2,
        type: "audio",
        position: 1,
        asset_id: AUDIO_B,
        payload: {},
      },
      {
        id: "block-l2-shared",
        lesson_id: LESSON_L2,
        type: "audio",
        position: 2,
        asset_id: AUDIO_X,
        payload: {},
      },
      {
        id: "block-l2-file",
        lesson_id: LESSON_L2,
        type: "file",
        position: 3,
        asset_id: FILE_L2,
        payload: { filename: "l2.pdf" },
      },
      {
        id: "block-l3-text",
        lesson_id: LESSON_L3,
        type: "text",
        position: 0,
        asset_id: null,
        payload: { text: "L3 secret" },
      },
    ],
    audioItems: [
      { id: AUDIO_A, practice_id: "course-1", title: "Audio A", duration_seconds: 12 },
      { id: AUDIO_B, practice_id: "course-1", title: "Audio B", duration_seconds: 20 },
      { id: AUDIO_C, practice_id: "course-1", title: "Residual C", duration_seconds: 8 },
      { id: AUDIO_X, practice_id: "course-1", title: "Shared X", duration_seconds: 30 },
    ],
    files: [
      {
        id: FILE_L1,
        publication_id: "course-1",
        original_name: "l1.pdf",
        mime: "application/pdf",
        size_bytes: 100,
        storage_path: "publications/course-1/files/l1.pdf",
      },
      {
        id: FILE_L2,
        publication_id: "course-1",
        original_name: "l2.pdf",
        mime: "application/pdf",
        size_bytes: 200,
        storage_path: SECRET_L2_PATH,
      },
      {
        id: FILE_ORPHAN,
        publication_id: "course-1",
        original_name: "orphan.pdf",
        mime: "application/pdf",
        size_bytes: 50,
        storage_path: "publications/course-1/files/orphan.pdf",
      },
    ],
    levels: [
      {
        practice_id: "course-1",
        level: 2,
        title: "Полный курс",
        description: "Все уроки",
        upgrade_price: 1500,
        currency: "RUB",
      },
      {
        practice_id: "course-1",
        level: 3,
        title: "Мастер-уровень",
        description: null,
        upgrade_price: null,
        currency: "RUB",
      },
    ],
  };
}

function mockServiceRole(rows = fixtureRows()) {
  return {
    from(table) {
      if (table === "course_lessons") {
        return createQuery(() => rows.lessons);
      }
      if (table === "course_lesson_blocks") {
        return createQuery(() => rows.blocks);
      }
      if (table === "audio_items") {
        return createQuery(() => rows.audioItems);
      }
      if (table === "publication_files") {
        return createQuery(() => rows.files);
      }
      if (table === "practice_access_levels") {
        return createQuery(() => rows.levels);
      }
      return createQuery(() => []);
    },
    storage: {
      from() {
        return {
          createSignedUrl(path) {
            return Promise.resolve({
              data: { signedUrl: `https://signed.example/${path}?token=t` },
              error: null,
            });
          },
        };
      },
    },
  };
}

assert.equal(normalizeEntitlementAccessLevel(2), 2);
assert.equal(normalizeEntitlementAccessLevel(null), 1);
assert.equal(normalizeEntitlementAccessLevel(undefined), 1);
assert.equal(normalizeEntitlementAccessLevel(0), 1);

const l1 = evaluateCourseLearnerAccess({
  userId: "user-1",
  publicationClass: "course",
  productKind: "practice",
  access: productAccess({
    canListen: true,
    canAcquire: false,
    reason: "purchased",
    accessSource: "purchase",
    hasEntitlement: true,
    accessLevel: 1,
  }),
  isPlatformAdmin: false,
});
assert.equal(l1.canReadPrivateContent, true, "L1 entitled can read");
assert.equal(l1.accessLevel, 1);
assert.equal(l1.privileged, false);
assert.equal(canAccessRequiredLevel(l1, 1), true);
assert.equal(canAccessRequiredLevel(l1, 2), false, "L1 cannot open L2");
assert.equal(canAccessRequiredLevel(l1, 3), false);

const l2 = evaluateCourseLearnerAccess({
  userId: "user-2",
  publicationClass: "course",
  productKind: "practice",
  access: productAccess({
    canListen: true,
    reason: "purchased",
    accessSource: "purchase",
    hasEntitlement: true,
    accessLevel: 2,
  }),
  isPlatformAdmin: false,
});
assert.equal(canAccessRequiredLevel(l2, 1), true);
assert.equal(canAccessRequiredLevel(l2, 2), true);
assert.equal(canAccessRequiredLevel(l2, 3), false);

const l3 = evaluateCourseLearnerAccess({
  userId: "user-3",
  publicationClass: "course",
  productKind: "practice",
  access: productAccess({
    canListen: true,
    reason: "granted",
    accessSource: "admin",
    hasEntitlement: true,
    accessLevel: 3,
  }),
  isPlatformAdmin: false,
});
assert.equal(canAccessRequiredLevel(l3, 3), true);
assert.equal(l3.privileged, false, "admin grant is not privileged bypass");

const adminGrantL1 = evaluateCourseLearnerAccess({
  userId: "admin-grant",
  publicationClass: "course",
  productKind: "practice",
  access: productAccess({
    canListen: true,
    reason: "admin",
    accessSource: "admin",
    hasEntitlement: true,
    accessLevel: 1,
  }),
  isPlatformAdmin: false,
});
assert.equal(adminGrantL1.canReadPrivateContent, true);
assert.equal(adminGrantL1.privileged, false);
assert.equal(canAccessRequiredLevel(adminGrantL1, 1), true);
assert.equal(
  canAccessRequiredLevel(adminGrantL1, 2),
  false,
  "access_source=admin + level 1 is not unlimited",
);

const author = evaluateCourseLearnerAccess({
  userId: "author-user",
  publicationClass: "course",
  productKind: "practice",
  access: productAccess({
    canListen: true,
    reason: "author_owner",
    isAuthorMember: true,
    accessLevel: null,
  }),
  isPlatformAdmin: false,
});
assert.equal(author.privileged, true);
assert.equal(author.accessLevel, null, "author must not fake accessLevel=9999");
assert.equal(canAccessRequiredLevel(author, 3), true);

const platformAdmin = evaluateCourseLearnerAccess({
  userId: "platform-admin",
  publicationClass: "course",
  productKind: "practice",
  access: productAccess({ accessLevel: null }),
  isPlatformAdmin: true,
});
assert.equal(platformAdmin.canReadPrivateContent, true);
assert.equal(platformAdmin.privileged, true);
assert.equal(platformAdmin.accessLevel, null);
assert.equal(canAccessRequiredLevel(platformAdmin, 3), true);

const expired = evaluateCourseLearnerAccess({
  userId: "expired",
  publicationClass: "course",
  productKind: "practice",
  access: productAccess({
    reason: "payment_required",
    accessLevel: null,
  }),
  isPlatformAdmin: false,
});
assert.equal(expired.canReadPrivateContent, false);
assert.equal(canAccessRequiredLevel(expired, 1), false);

const none = evaluateCourseLearnerAccess({
  userId: null,
  publicationClass: "course",
  productKind: "practice",
  access: productAccess({ reason: "not_authenticated" }),
  isPlatformAdmin: false,
});
assert.equal(none.canReadPrivateContent, false);

const entitledAuthorAccess = await resolveProductAccess(
  mockUserSupabase({ membership: { id: "member-1" } }),
  coursePractice(),
  "author-user",
);
assert.equal(entitledAuthorAccess.reason, "author_owner");
assert.equal(entitledAuthorAccess.accessLevel, null);
assert.equal(entitledAuthorAccess.hasEntitlement, false);

const entitledL2 = await resolveProductAccess(
  mockUserSupabase({
    entitlement: {
      access_source: "purchase",
      expires_at: futureExpiry(),
      access_level: 2,
    },
  }),
  coursePractice(),
  "buyer-l2",
);
assert.equal(entitledL2.hasEntitlement, true);
assert.equal(entitledL2.accessLevel, 2);

const legacyEntitlement = await resolveProductAccess(
  mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null },
  }),
  coursePractice(),
  "legacy-buyer",
);
assert.equal(legacyEntitlement.accessLevel, 1, "legacy entitled row is level 1");

const expiredEntitlement = await resolveProductAccess(
  mockUserSupabase({
    entitlement: {
      access_source: "purchase",
      expires_at: pastExpiry(),
      access_level: 3,
    },
  }),
  coursePractice(),
  "expired-buyer",
);
assert.equal(expiredEntitlement.hasEntitlement, false);
assert.equal(expiredEntitlement.accessLevel, null);

const noUser = await resolveProductAccess(
  { from() { throw new Error("unused"); } },
  coursePractice(),
  null,
);
assert.equal(noUser.accessLevel, null);

const freePractice = await resolveProductAccess(
  { from() { throw new Error("unused"); } },
  practiceProduct(),
  null,
);
assert.equal(freePractice.reason, "free");
assert.equal(freePractice.accessLevel, null);

const resolvedL1 = await resolveCourseLearnerAccess(
  mockUserSupabase({
    entitlement: {
      access_source: "purchase",
      expires_at: null,
      access_level: 1,
    },
  }),
  coursePractice(),
  "buyer-l1",
  { isPlatformAdmin: async () => false },
);
assert.equal(resolvedL1.canReadPrivateContent, true);
assert.equal(resolvedL1.accessLevel, 1);
assert.equal(resolvedL1.canAccessRequiredLevel(2), false);

const resolvedAdminGrant = await resolveCourseLearnerAccess(
  mockUserSupabase({
    entitlement: {
      access_source: "admin",
      expires_at: null,
      access_level: 1,
    },
  }),
  coursePractice(),
  "admin-grant",
  { isPlatformAdmin: async () => false },
);
assert.equal(resolvedAdminGrant.privileged, false);
assert.equal(resolvedAdminGrant.canAccessRequiredLevel(2), false);

const resolvedPlatformAdmin = await resolveCourseLearnerAccess(
  mockUserSupabase(),
  coursePractice(),
  "platform-admin",
  { isPlatformAdmin: async () => true },
);
assert.equal(resolvedPlatformAdmin.privileged, true);
assert.equal(resolvedPlatformAdmin.accessLevel, null);
assert.equal(resolvedPlatformAdmin.canAccessRequiredLevel(3), true);

const resolvedNone = await resolveCourseLearnerAccess(
  mockUserSupabase(),
  coursePractice(),
  "stranger",
  { isPlatformAdmin: async () => false },
);
assert.equal(resolvedNone.canReadPrivateContent, false);

const resolvedExpired = await resolveCourseLearnerAccess(
  mockUserSupabase({
    entitlement: {
      access_source: "purchase",
      expires_at: pastExpiry(),
      access_level: 2,
    },
  }),
  coursePractice(),
  "expired",
  { isPlatformAdmin: async () => false },
);
assert.equal(resolvedExpired.canReadPrivateContent, false);

const resolvedPractice = await resolveCourseLearnerAccess(
  mockUserSupabase({
    entitlement: {
      access_source: "purchase",
      expires_at: null,
      access_level: 1,
    },
  }),
  practiceProduct(),
  "buyer",
  { isPlatformAdmin: async () => false },
);
assert.equal(resolvedPractice.canReadPrivateContent, false);

const rows = fixtureRows();
const l1Course = toLearnerCourse({
  publicationId: "course-1",
  access: l1,
  lessons: rows.lessons,
  blocks: rows.blocks,
  audioAssets: new Map(rows.audioItems.map((item) => [item.id, item])),
  fileAssets: new Map(rows.files.map((file) => [file.id, file])),
  levels: rows.levels,
});
const serializedL1 = JSON.stringify(serializeLearnerCourse(l1Course));
assert.equal(l1Course.lessons[0].locked, false);
assert.equal(l1Course.lessons[1].locked, true);
assert.equal(l1Course.lessons[2].locked, true);
assert.ok(!("blocks" in l1Course.lessons[1]));
assert.doesNotMatch(serializedL1, new RegExp(SECRET_L2_TEXT));
assert.doesNotMatch(serializedL1, new RegExp(AUDIO_B));
assert.doesNotMatch(serializedL1, new RegExp(FILE_L2));
assert.doesNotMatch(serializedL1, /L2_SECRET|l2-secret|signedUrl|storage_path|audio_path/);
assert.match(serializedL1, new RegExp(AUDIO_A));
assert.match(serializedL1, /L1 open text/);
assert.equal(l1Course.levels.length, 2);
assert.equal(l1Course.levels[0].upgradePrice, 1500);

const emptyLevels = toLearnerCourse({
  publicationId: "course-1",
  access: l1,
  lessons: [rows.lessons[0]],
  blocks: rows.blocks.filter((block) => block.lesson_id === LESSON_L1),
  audioAssets: new Map(rows.audioItems.map((item) => [item.id, item])),
  fileAssets: new Map(),
  levels: [],
});
assert.deepEqual(emptyLevels.levels, [], "empty catalog stays empty — no synthetic L1 row");

const l2Course = toLearnerCourse({
  publicationId: "course-1",
  access: l2,
  lessons: rows.lessons,
  blocks: rows.blocks,
  audioAssets: new Map(rows.audioItems.map((item) => [item.id, item])),
  fileAssets: new Map(rows.files.map((file) => [file.id, file])),
  levels: rows.levels,
});
assert.equal(l2Course.lessons[1].locked, false);
assert.match(JSON.stringify(l2Course), new RegExp(SECRET_L2_TEXT));
assert.equal(l2Course.lessons[2].locked, true);

assert.equal(
  canAccessCourseAssetAssociation(l1, [
    { blockId: "b1", lessonId: LESSON_L1, requiredAccessLevel: 1 },
    { blockId: "b2", lessonId: LESSON_L2, requiredAccessLevel: 2 },
  ]),
  true,
  "shared asset X: L1 allowed via accessible association, not MAX level",
);
assert.equal(
  canAccessCourseAssetAssociation(l1, [
    { blockId: "b2", lessonId: LESSON_L2, requiredAccessLevel: 2 },
  ]),
  false,
);
assert.equal(canAccessCourseAssetAssociation(l1, []), false);

const loadedL1 = await loadCourseLearnerContent({
  supabase: mockUserSupabase({
    entitlement: {
      access_source: "purchase",
      expires_at: null,
      access_level: 1,
    },
  }),
  serviceRole: mockServiceRole(),
  userId: "buyer-l1",
  practice: coursePractice(),
  options: { isPlatformAdmin: async () => false },
});
assert.equal(loadedL1.ok, true);
if (loadedL1.ok) {
  const json = JSON.stringify(loadedL1.course);
  assert.equal(loadedL1.course.lessons[1].locked, true);
  assert.doesNotMatch(json, new RegExp(SECRET_L2_TEXT));
  assert.doesNotMatch(json, new RegExp(AUDIO_B));
  assert.doesNotMatch(json, new RegExp(SECRET_L2_PATH));
  assert.doesNotMatch(json, new RegExp(FILE_L2));
}

const loadedNone = await loadCourseLearnerContent({
  supabase: mockUserSupabase(),
  serviceRole: mockServiceRole(),
  userId: "stranger",
  practice: coursePractice(),
  options: { isPlatformAdmin: async () => false },
});
assert.equal(loadedNone.ok, false);
assert.equal(loadedNone.reason, "forbidden");

const loadedAnon = await loadCourseLearnerContent({
  supabase: mockUserSupabase(),
  serviceRole: mockServiceRole(),
  userId: null,
  practice: coursePractice(),
});
assert.equal(loadedAnon.ok, false);
assert.equal(loadedAnon.reason, "unauthenticated");

const loadedPractice = await loadCourseLearnerContent({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  userId: "buyer",
  practice: practiceProduct(),
});
assert.equal(loadedPractice.ok, false);
assert.equal(loadedPractice.reason, "not_course");

const loadedExpired = await loadCourseLearnerContent({
  supabase: mockUserSupabase({
    entitlement: {
      access_source: "purchase",
      expires_at: pastExpiry(),
      access_level: 2,
    },
  }),
  serviceRole: mockServiceRole(),
  userId: "expired",
  practice: coursePractice(),
  options: { isPlatformAdmin: async () => false },
});
assert.equal(loadedExpired.ok, false);
assert.equal(loadedExpired.reason, "forbidden");

const playA = await canPlayCourseAudioItem({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  practice: coursePractice(),
  userId: "buyer-l1",
  audioItemId: AUDIO_A,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(playA, true, "L1 can play A");

const playB = await canPlayCourseAudioItem({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  practice: coursePractice(),
  userId: "buyer-l1",
  audioItemId: AUDIO_B,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(playB, false, "L1 denied B by UUID");

const playC = await canPlayCourseAudioItem({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  practice: coursePractice(),
  userId: "buyer-l1",
  audioItemId: AUDIO_C,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(playC, false, "unreferenced residual C denied");

const playX = await canPlayCourseAudioItem({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  practice: coursePractice(),
  userId: "buyer-l1",
  audioItemId: AUDIO_X,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(playX, true, "shared X allowed for L1 via L1 association");

const playBL2 = await canPlayCourseAudioItem({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 2 },
  }),
  serviceRole: mockServiceRole(),
  practice: coursePractice(),
  userId: "buyer-l2",
  audioItemId: AUDIO_B,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(playBL2, true, "L2 can play B");

const playCForL2 = await canPlayCourseAudioItem({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 2 },
  }),
  serviceRole: mockServiceRole(),
  practice: coursePractice(),
  userId: "buyer-l2",
  audioItemId: AUDIO_C,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(playCForL2, false, "L2 still cannot play unreferenced C");

const playPracticeUnchanged = await canPlayCourseAudioItem({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  practice: practiceProduct(),
  userId: "buyer",
  audioItemId: AUDIO_A,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(playPracticeUnchanged, false, "helper is course-only");

const fileL1 = await canDownloadCoursePublicationFile({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  practice: coursePractice(),
  userId: "buyer-l1",
  fileId: FILE_L1,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(fileL1, true);

const fileL2 = await canDownloadCoursePublicationFile({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  practice: coursePractice(),
  userId: "buyer-l1",
  fileId: FILE_L2,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(fileL2, false, "L1 denied L2 PDF UUID");

const fileOrphan = await canDownloadCoursePublicationFile({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  practice: coursePractice(),
  userId: "buyer-l1",
  fileId: FILE_ORPHAN,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(fileOrphan, false, "unreferenced PDF denied");

const signedL2 = await signLearnerPublicationFile({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  userId: "buyer-l1",
  practice: coursePractice(),
  fileId: FILE_L2,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(signedL2.ok, false);
assert.equal(signedL2.reason, "forbidden");

const signedL1 = await signLearnerPublicationFile({
  supabase: mockUserSupabase({
    entitlement: { access_source: "purchase", expires_at: null, access_level: 1 },
  }),
  serviceRole: mockServiceRole(),
  userId: "buyer-l1",
  practice: coursePractice(),
  fileId: FILE_L1,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(signedL1.ok, true);
if (signedL1.ok) {
  assert.match(signedL1.url, /l1\.pdf/);
}

const signedExpired = await signLearnerPublicationFile({
  supabase: mockUserSupabase({
    entitlement: {
      access_source: "purchase",
      expires_at: pastExpiry(),
      access_level: 2,
    },
  }),
  serviceRole: mockServiceRole(),
  userId: "expired",
  practice: coursePractice(),
  fileId: FILE_L1,
  options: { isPlatformAdmin: async () => false },
});
assert.equal(signedExpired.ok, false);

function lockedLesson(id, title, requiredAccessLevel, position = 0) {
  return {
    id,
    title,
    position,
    requiredAccessLevel,
    locked: true,
  };
}

function unlockedTextLesson(id, title, requiredAccessLevel, position, text) {
  return {
    id,
    title,
    position,
    requiredAccessLevel,
    locked: false,
    blocks: [{ id: `${id}-text`, type: "text", position: 0, text }],
  };
}

function levelRow(level, title, overrides = {}) {
  return {
    level,
    title,
    description: overrides.description ?? null,
    upgradePrice: overrides.upgradePrice ?? null,
    currency: overrides.currency ?? "RUB",
    upgradeAction: overrides.upgradeAction,
  };
}

function sampleCourse({ levels, lessons, accessLevel = 1, privileged = false }) {
  return {
    publicationId: "course-ui",
    accessLevel,
    privileged,
    levels,
    lessons,
  };
}

function countOccurrences(haystack, needle) {
  if (!needle) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

function renderLearnerCourse(course) {
  return renderToStaticMarkup(
    createElement(CourseLearnerContent, {
      course,
      authorSlug: "anna",
      productSlug: "course",
    }),
  );
}

const l2Level = levelRow(2, "Работа с другими людьми", {
  description: "Как выстраивать контакт",
  upgradePrice: 2222,
  upgradeAction: { href: "/future-upgrade-l2" },
});
const l1Level = levelRow(1, "Работа с собой", {
  description: "Базовый контур",
});

const threeLockedL2 = sampleCourse({
  accessLevel: 1,
  levels: [l2Level],
  lessons: [
    lockedLesson("l2-a", "Материал 2.1", 2, 0),
    lockedLesson("l2-b", "Материал 2.2", 2, 1),
    lockedLesson("l2-c", "Материал 2.3", 2, 2),
  ],
});

const lockedL2View = groupLearnerCourse(threeLockedL2);
assert.equal(lockedL2View.kind, "grouped");
assert.equal(lockedL2View.groups.length, 1);
assert.equal(lockedL2View.groups[0].chrome?.heading, "Уровень 2. Работа с другими людьми");
assert.equal(lockedL2View.groups[0].chrome?.description, "Как выстраивать контакт");
assert.match(lockedL2View.groups[0].chrome?.upgradePriceLabel ?? "", /Доплата/);
assert.match(lockedL2View.groups[0].chrome?.upgradePriceLabel ?? "", /2/);
assert.equal(lockedL2View.groups[0].chrome?.upgradeAction?.href, "/future-upgrade-l2");
assert.equal(lockedL2View.groups[0].chrome?.upgradeAction?.label, "Открыть второй уровень");
assert.equal(lockedL2View.groups[0].lessons.length, 3);

const lockedL2Markup = renderLearnerCourse(threeLockedL2);
assert.equal(countOccurrences(lockedL2Markup, "Уровень 2. Работа с другими людьми"), 1);
assert.equal(countOccurrences(lockedL2Markup, "Как выстраивать контакт"), 1);
assert.equal(countOccurrences(lockedL2Markup, "Доплата"), 1);
assert.equal(countOccurrences(lockedL2Markup, "Открыть второй уровень"), 1);
assert.equal(countOccurrences(lockedL2Markup, "/future-upgrade-l2"), 1);
assert.match(lockedL2Markup, /Материал 2\.1/);
assert.match(lockedL2Markup, /Материал 2\.2/);
assert.match(lockedL2Markup, /Материал 2\.3/);
assert.doesNotMatch(lockedL2Markup, /L2_SECRET|audioItemId|fileId|signedUrl|storage_path/);

const threeUnlockedL2 = sampleCourse({
  accessLevel: 2,
  privileged: true,
  levels: [l2Level],
  lessons: [
    unlockedTextLesson("l2-a", "Материал 2.1", 2, 0, "L2 open A"),
    unlockedTextLesson("l2-b", "Материал 2.2", 2, 1, "L2 open B"),
    unlockedTextLesson("l2-c", "Материал 2.3", 2, 2, "L2 open C"),
  ],
});
const unlockedL2View = groupLearnerCourse(threeUnlockedL2);
assert.equal(unlockedL2View.kind, "grouped");
assert.equal(unlockedL2View.groups.length, 1);
assert.equal(unlockedL2View.groups[0].chrome?.heading, "Уровень 2. Работа с другими людьми");
assert.equal(unlockedL2View.groups[0].chrome?.upgradePriceLabel, null);
assert.equal(unlockedL2View.groups[0].chrome?.upgradeAction, null);
assert.equal(
  unlockedL2View.groups[0].lessons.every((lesson) => lesson.locked === false),
  true,
);

const unlockedL2Markup = renderLearnerCourse(threeUnlockedL2);
assert.equal(countOccurrences(unlockedL2Markup, "Уровень 2. Работа с другими людьми"), 1);
assert.equal(countOccurrences(unlockedL2Markup, "Доплата"), 0);
assert.equal(countOccurrences(unlockedL2Markup, "Открыть второй уровень"), 0);
assert.match(unlockedL2Markup, /L2 open A/);
assert.match(unlockedL2Markup, /L2 open B/);
assert.match(unlockedL2Markup, /L2 open C/);

const bothLevelsCourse = sampleCourse({
  accessLevel: 1,
  levels: [l1Level, l2Level],
  lessons: [
    unlockedTextLesson("l1-a", "Материал 1.1", 1, 0, "L1 open"),
    lockedLesson("l2-a", "Материал 2.1", 2, 1),
    lockedLesson("l2-b", "Материал 2.2", 2, 2),
  ],
});
const bothLevelsView = groupLearnerCourse(bothLevelsCourse);
assert.equal(bothLevelsView.kind, "grouped");
assert.equal(bothLevelsView.groups.length, 2);
assert.equal(bothLevelsView.groups[0].requiredAccessLevel, 1);
assert.equal(bothLevelsView.groups[1].requiredAccessLevel, 2);
assert.equal(bothLevelsView.groups[0].chrome?.heading, "Уровень 1. Работа с собой");
assert.equal(bothLevelsView.groups[1].chrome?.heading, "Уровень 2. Работа с другими людьми");

const bothLevelsMarkup = renderLearnerCourse(bothLevelsCourse);
assert.equal(countOccurrences(bothLevelsMarkup, "Уровень 1. Работа с собой"), 1);
assert.equal(countOccurrences(bothLevelsMarkup, "Уровень 2. Работа с другими людьми"), 1);
assert.equal(countOccurrences(bothLevelsMarkup, 'data-learner-level="1"'), 1);
assert.equal(countOccurrences(bothLevelsMarkup, 'data-learner-level="2"'), 1);

const authorFixture = createCourseAccessLevelsTestCatalog();
const authorFixtureCourse = sampleCourse({
  accessLevel: 1,
  levels: authorFixture.access_levels.map((row) =>
    levelRow(row.level, row.title, {
      description: row.description,
      upgradePrice: row.upgrade_price,
      upgradeAction:
        row.level === 2 ? { href: "/future-upgrade-l2" } : undefined,
    }),
  ),
  lessons: authorFixture.lessons.map((lesson) =>
    lesson.required_access_level === 1
      ? unlockedTextLesson(
          lesson.id,
          lesson.title,
          1,
          lesson.position,
          `L1 open ${lesson.title}`,
        )
      : lockedLesson(
          lesson.id,
          lesson.title,
          2,
          lesson.position,
        ),
  ),
});
const authorFixtureView = groupLearnerCourse(authorFixtureCourse);
assert.equal(authorFixtureView.kind, "grouped");
assert.equal(authorFixtureView.groups.length, 2);
assert.equal(authorFixtureView.groups[0].lessons.length, 3);
assert.equal(authorFixtureView.groups[1].lessons.length, 3);
assert.equal(
  authorFixtureView.groups[0].chrome?.heading,
  `Уровень 1. ${COURSE_ACCESS_LEVELS_TEST_L1_TITLE}`,
);
assert.equal(
  authorFixtureView.groups[1].chrome?.heading,
  `Уровень 2. ${COURSE_ACCESS_LEVELS_TEST_L2_TITLE}`,
);
const authorFixtureMarkup = renderLearnerCourse(authorFixtureCourse);
assert.equal(countOccurrences(authorFixtureMarkup, "Доплата"), 1);
assert.match(authorFixtureMarkup, /2\s222/);
assert.equal(COURSE_ACCESS_LEVELS_TEST_L2_UPGRADE_PRICE, 2222);

const implicitL1Course = sampleCourse({
  accessLevel: 1,
  levels: [l2Level],
  lessons: [
    unlockedTextLesson("l1-a", "Материал 1.1", 1, 0, "Implicit L1 body"),
    lockedLesson("l2-a", "Материал 2.1", 2, 1),
  ],
});
const implicitL1View = groupLearnerCourse(implicitL1Course);
assert.equal(implicitL1View.kind, "grouped");
assert.equal(implicitL1View.groups.length, 2);
assert.equal(implicitL1View.groups[0].catalog, null);
assert.equal(implicitL1View.groups[0].chrome, null);
assert.equal(implicitL1View.groups[1].chrome?.heading, "Уровень 2. Работа с другими людьми");

const implicitL1Markup = renderLearnerCourse(implicitL1Course);
assert.doesNotMatch(implicitL1Markup, /Уровень 1/);
assert.equal(countOccurrences(implicitL1Markup, "Уровень 2. Работа с другими людьми"), 1);
assert.match(implicitL1Markup, /Implicit L1 body/);
assert.equal(countOccurrences(implicitL1Markup, "Доплата"), 1);

const legacyCourse = sampleCourse({
  accessLevel: 1,
  levels: [],
  lessons: [
    unlockedTextLesson("legacy-1", "Первый урок", 1, 0, "Legacy body"),
    unlockedTextLesson("legacy-2", "Второй урок", 1, 1, "Legacy body 2"),
  ],
});
const legacyView = groupLearnerCourse(legacyCourse);
assert.equal(legacyView.kind, "flat");
assert.equal("groups" in legacyView, false);

const legacyMarkup = renderLearnerCourse(legacyCourse);
assert.doesNotMatch(legacyMarkup, /Уровень/);
assert.doesNotMatch(legacyMarkup, /Доплата/);
assert.doesNotMatch(legacyMarkup, /Открыть второй уровень|Открыть уровень/);
assert.doesNotMatch(legacyMarkup, /data-learner-level/);
assert.match(legacyMarkup, /Первый урок/);
assert.match(legacyMarkup, /Legacy body/);

const noHrefLocked = sampleCourse({
  accessLevel: 1,
  levels: [levelRow(2, "Работа с другими людьми", { upgradePrice: 2222 })],
  lessons: [lockedLesson("l2-a", "Материал 2.1", 2, 0)],
});
const noHrefMarkup = renderLearnerCourse(noHrefLocked);
assert.match(noHrefMarkup, /Доплата/);
assert.doesNotMatch(noHrefMarkup, /<a /);
assert.doesNotMatch(noHrefMarkup, /Открыть второй уровень/);

const lockedGroupSource = toLearnerCourse({
  publicationId: "course-1",
  access: l1,
  lessons: [
    {
      id: "group-l2-a",
      publication_id: "course-1",
      title: "Locked A",
      position: 0,
      required_access_level: 2,
    },
    {
      id: "group-l2-b",
      publication_id: "course-1",
      title: "Locked B",
      position: 1,
      required_access_level: 2,
    },
    {
      id: "group-l2-c",
      publication_id: "course-1",
      title: "Locked C",
      position: 2,
      required_access_level: 2,
    },
  ],
  blocks: [
    {
      id: "group-l2-text",
      lesson_id: "group-l2-a",
      type: "text",
      position: 0,
      asset_id: null,
      payload: { text: SECRET_L2_TEXT },
    },
    {
      id: "group-l2-audio",
      lesson_id: "group-l2-b",
      type: "audio",
      position: 0,
      asset_id: AUDIO_B,
      payload: {},
    },
    {
      id: "group-l2-file",
      lesson_id: "group-l2-c",
      type: "file",
      position: 0,
      asset_id: FILE_L2,
      payload: { filename: "l2.pdf" },
    },
  ],
  audioAssets: new Map(rows.audioItems.map((item) => [item.id, item])),
  fileAssets: new Map(rows.files.map((file) => [file.id, file])),
  levels: rows.levels,
});
const serializedLockedGroup = JSON.stringify(serializeLearnerCourse(lockedGroupSource));
assert.equal(lockedGroupSource.lessons.every((lesson) => lesson.locked), true);
assert.ok(lockedGroupSource.lessons.every((lesson) => !("blocks" in lesson)));
assert.doesNotMatch(serializedLockedGroup, new RegExp(SECRET_L2_TEXT));
assert.doesNotMatch(serializedLockedGroup, /"text"\s*:/);
assert.doesNotMatch(serializedLockedGroup, /"audioItemId"\s*:/);
assert.doesNotMatch(serializedLockedGroup, /"fileId"\s*:/);
assert.doesNotMatch(serializedLockedGroup, /storage_path|storagePath|signedUrl|signed_url|audio_path/);
assert.doesNotMatch(serializedLockedGroup, new RegExp(AUDIO_B));
assert.doesNotMatch(serializedLockedGroup, new RegExp(FILE_L2));
assert.doesNotMatch(serializedLockedGroup, new RegExp(SECRET_L2_PATH));

const ui = read("src/components/products/course-learner/CourseLearnerContent.tsx");
assert.match(ui, /groupLearnerCourse/);
assert.match(ui, /chrome\.upgradeAction/);
assert.match(ui, /upgradePriceLabel/);
assert.doesNotMatch(ui, /showLevelChrome/);
assert.doesNotMatch(ui, /levelForLesson/);
assert.doesNotMatch(ui, /checkout|tochka|order_kind/i);

const groupsSource = read("src/lib/course-content/learner-groups.ts");
assert.match(groupsSource, /Доплата/);
assert.match(groupsSource, /Открыть второй уровень/);
assert.match(groupsSource, /kind: "flat"/);
assert.doesNotMatch(groupsSource, /checkout|tochka|order_kind/i);

const page = read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx");
assert.match(page, /loadCourseLearnerContent/);
assert.match(page, /skipPrivateCourseOutline/);
assert.doesNotMatch(page, /from\("course_lessons"\)/);
assert.doesNotMatch(page, /app\/api\/learn/);

const signedAudio = read("src/lib/listen/signed-audio.ts");
assert.match(signedAudio, /canPlayCourseAudioItem/);
assert.match(signedAudio, /isCoursePublication/);

const sessionLoader = read("src/lib/listen/load-session-payload.ts");
assert.match(sessionLoader, /listAccessibleCourseAudioItemIds/);
assert.match(sessionLoader, /isCoursePublication[\s\S]*return \[\]/);

const pageShared = read("src/lib/listen/page-shared.tsx");
assert.match(pageShared, /listAccessibleCourseAudioItemIds/);

const fileRoute = read(
  "src/app/api/listen/product/[slug]/[productSlug]/file/[fileId]/route.ts",
);
assert.match(fileRoute, /signLearnerPublicationFile/);
assert.match(fileRoute, /getPracticeByAuthorAndSlug/);
assert.doesNotMatch(fileRoute, /canAccessCourseContent\(/);

assert.equal(existsSync(join(root, "src/app/learn")), false);
assert.equal(existsSync(join(root, "src/app/api/learn")), false);

const migrations = [
  "supabase/migrations/20260923120100_course_access_levels_foundation.sql",
  "src/lib/course-content/learner-content.ts",
  "src/lib/course-content/learner-assets.ts",
];
for (const relative of migrations) {
  const source = read(relative);
  assert.doesNotMatch(source, /GRANT SELECT ON TABLE public\.course_lessons TO (anon|authenticated)/);
  assert.doesNotMatch(source, /GRANT SELECT ON TABLE public\.course_lesson_blocks TO (anon|authenticated)/);
  assert.doesNotMatch(source, /GRANT SELECT ON TABLE public\.publication_files TO (anon|authenticated)/);
  assert.doesNotMatch(source, /GRANT SELECT ON TABLE public\.practice_access_levels TO (anon|authenticated)/);
}

assert.equal(typeof loadCourseLearnerContent, "function");
assert.equal(typeof signLearnerPublicationFile, "function");

console.log("course-learner-access-unit: ok");
