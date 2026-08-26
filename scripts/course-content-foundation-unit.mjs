#!/usr/bin/env node
/**
 * Phase 2A Course Content Foundation: access helper, validators, listen gate.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePublicationClass } from "../src/lib/author-products/publication-class.ts";
import {
  canAccessCourseContent,
  evaluateCourseContentAccess,
  resolveProductAccess,
} from "../src/lib/products/access.ts";
import {
  PUBLICATION_FILE_LIMITS,
  PUBLICATION_FILE_PDF_MIME,
  PUBLICATION_FILES_BUCKET,
  buildPublicationFileStoragePath,
  isCourseLessonBlockType,
  isCoursePublication,
  isPublicationFilePdfMime,
  signPublicationFileIfAllowed,
  validateCourseLessonBlock,
  validateCourseParentClass,
} from "../src/lib/course-content/index.ts";
import { PERSONAL_MATERIAL_LIMITS } from "../src/lib/personal-materials/types.ts";

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
    is_free: true,
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

function deniedAccess(overrides = {}) {
  return {
    canListen: false,
    canAcquire: true,
    isPubliclyListed: true,
    reason: "payment_required",
    isAuthorMember: false,
    accessSource: null,
    hasEntitlement: false,
    ...overrides,
  };
}

function mockSupabase({ membership = null, entitlement = null } = {}) {
  return {
    from(table) {
      const result =
        table === "author_members"
          ? { data: membership, error: null }
          : table === "user_practices"
            ? { data: entitlement, error: null }
            : { data: null, error: null };
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(result);
        },
      };
      return chain;
    },
  };
}

assert.equal(
  resolvePublicationClass("course", "practice"),
  "course",
  "adapter still prefers publication_class",
);
assert.equal(
  resolvePublicationClass(null, "practice"),
  "practice",
  "legacy NULL+practice stays practice",
);
assert.equal(isCoursePublication("course", "practice"), true);
assert.equal(isCoursePublication(null, "practice"), false);
assert.equal(isCoursePublication("practice", "practice"), false);

const freeByLink = deniedAccess({
  canListen: true,
  canAcquire: false,
  reason: "free",
});

assert.equal(
  evaluateCourseContentAccess({
    userId: "user-1",
    publicationClass: "course",
    productKind: "practice",
    access: {
      ...freeByLink,
      hasEntitlement: true,
      reason: "granted",
      accessSource: "free_claim",
    },
    isPlatformAdmin: false,
  }),
  true,
  "1. course + free_claim entitlement",
);

assert.equal(
  evaluateCourseContentAccess({
    userId: "user-1",
    publicationClass: "course",
    productKind: "practice",
    access: {
      ...freeByLink,
      hasEntitlement: true,
      reason: "purchased",
      accessSource: "purchase",
    },
    isPlatformAdmin: false,
  }),
  true,
  "1. course + purchase entitlement",
);

assert.equal(
  evaluateCourseContentAccess({
    userId: "user-1",
    publicationClass: "course",
    productKind: "practice",
    access: freeByLink,
    isPlatformAdmin: false,
  }),
  false,
  "2. free course without grant",
);

assert.equal(
  evaluateCourseContentAccess({
    userId: null,
    publicationClass: "course",
    productKind: "practice",
    access: freeByLink,
    isPlatformAdmin: false,
  }),
  false,
  "no user",
);

assert.equal(
  evaluateCourseContentAccess({
    userId: "user-1",
    publicationClass: "course",
    productKind: "practice",
    access: {
      ...freeByLink,
      reason: "guest_promo",
    },
    isPlatformAdmin: false,
  }),
  false,
  "guest_promo is not course access",
);

assert.equal(
  evaluateCourseContentAccess({
    userId: "author-1",
    publicationClass: "course",
    productKind: "practice",
    access: {
      ...freeByLink,
      reason: "author_owner",
      isAuthorMember: true,
    },
    isPlatformAdmin: false,
  }),
  true,
  "5. author",
);

assert.equal(
  evaluateCourseContentAccess({
    userId: "admin-1",
    publicationClass: "course",
    productKind: "practice",
    access: deniedAccess(),
    isPlatformAdmin: true,
  }),
  true,
  "6. platform-admin helper true",
);

assert.equal(
  evaluateCourseContentAccess({
    userId: "admin-1",
    publicationClass: "course",
    productKind: "practice",
    access: {
      ...deniedAccess(),
      canListen: true,
      canAcquire: false,
      reason: "admin",
      accessSource: "admin",
      hasEntitlement: true,
    },
    isPlatformAdmin: false,
  }),
  true,
  "admin entitlement source is also allowed",
);

assert.equal(
  evaluateCourseContentAccess({
    userId: "user-1",
    publicationClass: "practice",
    productKind: "practice",
    access: {
      ...freeByLink,
      hasEntitlement: true,
      accessSource: "purchase",
    },
    isPlatformAdmin: false,
  }),
  false,
  "course-only: practice class is not course content",
);

const anonFreePractice = await resolveProductAccess(
  {
    from() {
      throw new Error("anonymous free practice must not hit supabase");
    },
  },
  practiceProduct(),
  null,
);
assert.equal(anonFreePractice.canListen, true, "7. practice free-by-link canListen");
assert.equal(anonFreePractice.reason, "free");
assert.equal(anonFreePractice.hasEntitlement, false);

const practiceCourseAccess = await canAccessCourseContent(
  { from() { throw new Error("unused"); } },
  practiceProduct(),
  "user-1",
  { isPlatformAdmin: async () => false },
);
assert.equal(practiceCourseAccess, false, "7. practice is not course content");

const anonFreeCourse = await resolveProductAccess(
  {
    from() {
      throw new Error("anonymous free course must not hit supabase");
    },
  },
  coursePractice(),
  null,
);
assert.equal(
  anonFreeCourse.canListen,
  true,
  "8. course free-by-link canListen may stay true",
);
assert.equal(anonFreeCourse.reason, "free");
assert.equal(anonFreeCourse.hasEntitlement, false);

const courseWithoutGrant = await canAccessCourseContent(
  mockSupabase(),
  coursePractice(),
  "user-1",
  { isPlatformAdmin: async () => false },
);
assert.equal(courseWithoutGrant, false, "8. course free-by-link without grant");

const courseAfterFreeClaim = await canAccessCourseContent(
  mockSupabase({
    entitlement: { access_source: "free_claim", expires_at: null },
  }),
  coursePractice(),
  "user-1",
  { isPlatformAdmin: async () => false },
);
assert.equal(courseAfterFreeClaim, true, "3. free course after free_claim");

const paidCourseAfterPurchase = await canAccessCourseContent(
  mockSupabase({
    entitlement: { access_source: "purchase", expires_at: futureExpiry() },
  }),
  coursePractice({ is_free: false }),
  "user-1",
  { isPlatformAdmin: async () => false },
);
assert.equal(paidCourseAfterPurchase, true, "4. paid course after purchase");

const expiredGrant = await canAccessCourseContent(
  mockSupabase({
    entitlement: { access_source: "purchase", expires_at: pastExpiry() },
  }),
  coursePractice({ is_free: false }),
  "user-1",
  { isPlatformAdmin: async () => false },
);
assert.equal(expiredGrant, false, "expired entitlement is not access");

const authorAccess = await canAccessCourseContent(
  mockSupabase({ membership: { id: "member-1" } }),
  coursePractice({ is_free: false }),
  "author-user",
  { isPlatformAdmin: async () => false },
);
assert.equal(authorAccess, true, "5. author member");

let platformAdminCalled = false;
const adminAccess = await canAccessCourseContent(
  mockSupabase(),
  coursePractice({ is_free: false }),
  "admin-user",
  {
    isPlatformAdmin: async () => {
      platformAdminCalled = true;
      return true;
    },
  },
);
assert.equal(adminAccess, true, "6. platform-admin mocked true");
assert.equal(platformAdminCalled, true, "uses existing isPlatformAdmin helper hook");

const noUser = await canAccessCourseContent(
  { from() { throw new Error("unused"); } },
  coursePractice(),
  null,
);
assert.equal(noUser, false, "no user denied");

assert.equal(isCourseLessonBlockType("audio"), true);
assert.equal(isCourseLessonBlockType("text"), true);
assert.equal(isCourseLessonBlockType("file"), true);
assert.equal(isCourseLessonBlockType("quiz"), false);
assert.equal(isCourseLessonBlockType("section"), false);

assert.equal(
  validateCourseLessonBlock({
    type: "text",
    assetId: null,
    payload: { text: "Hello" },
  }).ok,
  true,
);
assert.equal(
  validateCourseLessonBlock({
    type: "text",
    assetId: "asset-1",
    payload: { text: "Hello" },
  }).ok,
  false,
);
assert.equal(
  validateCourseLessonBlock({
    type: "audio",
    assetId: "audio-1",
    payload: { title: "meta" },
  }).ok,
  true,
);
assert.equal(
  validateCourseLessonBlock({ type: "audio", assetId: null, payload: null }).ok,
  false,
);
assert.equal(
  validateCourseLessonBlock({
    type: "file",
    assetId: "file-1",
    payload: { filename: "notes.pdf", mime: "application/pdf", size: 12 },
  }).ok,
  true,
);
assert.equal(
  validateCourseLessonBlock({ type: "video", assetId: null, payload: null }).ok,
  false,
);

assert.equal(isPublicationFilePdfMime("application/pdf"), true);
assert.equal(isPublicationFilePdfMime("application/zip"), false);
assert.equal(PUBLICATION_FILE_PDF_MIME, "application/pdf");
assert.equal(
  PUBLICATION_FILE_LIMITS.maxPdfBytes,
  PERSONAL_MATERIAL_LIMITS.maxPdfBytes,
);
assert.equal(PUBLICATION_FILES_BUCKET, "publication-files");
assert.notEqual(PUBLICATION_FILES_BUCKET, "personal-materials");
assert.notEqual(PUBLICATION_FILES_BUCKET, "practice-audio");

assert.equal(
  validateCourseParentClass("course").ok,
  true,
);
assert.equal(validateCourseParentClass("practice").ok, false);
assert.equal(validateCourseParentClass(null).ok, false);

const deniedSign = await signPublicationFileIfAllowed({
  allowed: false,
  storagePath: "publications/p/files/f.pdf",
  sign: async () => ({ signedUrl: "https://example.test/signed" }),
});
assert.equal(deniedSign.ok, false);
assert.equal(deniedSign.reason, "forbidden");

const allowedSign = await signPublicationFileIfAllowed({
  allowed: true,
  storagePath: "publications/p/files/f.pdf",
  sign: async (bucket) => {
    assert.equal(bucket, "publication-files");
    return { signedUrl: "https://example.test/signed" };
  },
});
assert.equal(allowedSign.ok, true);
assert.equal(allowedSign.url, "https://example.test/signed");

assert.match(
  buildPublicationFileStoragePath(
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ),
  /^publications\/11111111-1111-4111-8111-111111111111\/files\/22222222-2222-4222-8222-222222222222\.pdf$/,
);

const accessSrc = read("src/lib/products/access.ts");
assert.match(accessSrc, /export async function canAccessCourseContent/);
assert.match(accessSrc, /isPlatformAdmin/);
assert.match(accessSrc, /hasEntitlement/);
assert.match(accessSrc, /author_owner/);
assert.match(accessSrc, /accessSource === "admin"/);
assert.match(accessSrc, /never opened by price \/ is_free/);

const listenAccess = read("src/lib/listen/access.ts");
assert.match(listenAccess, /canAccessCourseContent/);
assert.match(listenAccess, /isCoursePublication/);

const listenApi = read("src/lib/listen/api-context.ts");
assert.match(listenApi, /canAccessCourseContent/);
assert.match(listenApi, /isCoursePublication/);
assert.match(
  listenApi,
  /if \(!isCourse && !productAccess\.canListen\)/,
  "catalog preview=1 must not bypass course access",
);

const signedAudio = read("src/lib/listen/signed-audio.ts");
assert.match(signedAudio, /loadListenApiContext/);

const pageShared = read("src/lib/listen/page-shared.tsx");
assert.match(pageShared, /publication_class/);
assert.match(pageShared, /canAccessCourseContent/);

const sessionLoader = read("src/lib/listen/load-session-payload.ts");
assert.match(sessionLoader, /publication_class/);
assert.match(sessionLoader, /canAccessCourseContent/);

const catalogPlay = read("src/lib/catalog/catalog-playback.ts");
assert.match(catalogPlay, /resolvePublicationClass/);
assert.match(catalogPlay, /isConfiguredStorefrontPreviewWindow/);
assert.match(
  catalogPlay,
  /isCourse && !chosen/,
  "course catalog play without entitlement does not fall back to first lesson track",
);

const lookup = read("src/lib/products/lookup.ts");
assert.match(lookup, /publication_class/);

assert.equal(existsSync(join(root, "src/app/learn")), false);
assert.equal(existsSync(join(root, "src/app/api/learn")), false);
assert.match(
  read("src/lib/course-content/storage.ts"),
  /No public learner download route/,
);
assert.doesNotMatch(accessSrc, /app\/api\/learn/);

const ctaTypes = read("src/lib/course-content/types.ts");
assert.match(ctaTypes, /CourseCompletionCta/);
assert.doesNotMatch(ctaTypes, /promo_/);
assert.match(ctaTypes, /never grants read/);

console.log("course-content-foundation-unit: ok");
