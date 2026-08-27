#!/usr/bin/env node
/**
 * Course public PDP + author preview=publish.
 * Preview is the public product page, not /learn, and must not leak lessons.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isCoursePublication } from "../src/lib/author-products/publication-class";
import {
  canAccessCourseContent,
  evaluateCourseContentAccess,
  type ProductAccessResult,
} from "../src/lib/products/access";
import { buildPracticePublishPreviewPath } from "../src/lib/products/paths";
import {
  canActivatePublishPreviewMode,
  canRevealPublicProductPage,
} from "../src/lib/products/publish-preview";
import { shouldLoadPublicAudioItemsOnProductPage } from "../src/lib/products/public-audio-items";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function memberAccess(
  overrides: Partial<ProductAccessResult> = {},
): ProductAccessResult {
  return {
    canListen: true,
    canAcquire: false,
    isPubliclyListed: false,
    reason: "author_owner",
    isAuthorMember: true,
    accessSource: null,
    hasEntitlement: false,
    ...overrides,
  };
}

function strangerAccess(): ProductAccessResult {
  return {
    canListen: false,
    canAcquire: false,
    isPubliclyListed: false,
    reason: "not_authenticated",
    isAuthorMember: false,
    accessSource: null,
    hasEntitlement: false,
  };
}

function entitledAccess(): ProductAccessResult {
  return {
    canListen: true,
    canAcquire: false,
    isPubliclyListed: true,
    reason: "purchased",
    isAuthorMember: false,
    accessSource: "purchase",
    hasEntitlement: true,
  };
}

function testPreviewUrlStaysOnPublicPdp() {
  assert.equal(
    buildPracticePublishPreviewPath(
      "sergey-and-zoya",
      "25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditatsiy",
    ),
    "/practice/sergey-and-zoya/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditatsiy?preview=publish",
  );

  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  const openFn = form.slice(
    form.indexOf("async function openPublishPreviewTab"),
    form.indexOf("async function publishProduct"),
  );
  assert.match(openFn, /buildPracticePublishPreviewPath\(authorSlug, productSlug\)/);
  assert.doesNotMatch(openFn, /\/learn/);
}

function testCourseIsNotTreatedAsLegacyPractice() {
  assert.equal(isCoursePublication("course", "practice"), true);
  assert.equal(isCoursePublication("practice", "practice"), false);
  assert.equal(isCoursePublication(null, "practice"), false);

  assert.equal(
    shouldLoadPublicAudioItemsOnProductPage("course", "practice"),
    false,
    "course PDP must not load flat audio_items",
  );
  assert.equal(
    shouldLoadPublicAudioItemsOnProductPage("practice", "practice"),
    true,
    "ordinary practice still loads public audio items",
  );
  assert.equal(
    shouldLoadPublicAudioItemsOnProductPage(null, "practice"),
    true,
    "legacy NULL + practice still loads audio items",
  );
  assert.equal(
    shouldLoadPublicAudioItemsOnProductPage("audiobook", "practice"),
    true,
  );
  assert.equal(
    shouldLoadPublicAudioItemsOnProductPage("release", "music"),
    true,
  );
}

function testScenarioADraftCourseAuthorPreview() {
  const access = memberAccess();
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "draft",
      access,
    }),
    true,
    "A: draft course + author reveals the public PDP",
  );
  assert.equal(
    canActivatePublishPreviewMode({
      previewParam: "publish",
      practiceStatus: "draft",
      access,
    }),
    true,
    "A: draft course + author + ?preview=publish activates preview chrome",
  );
}

function testScenarioBDraftHiddenFromStrangers() {
  const access = strangerAccess();
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "draft",
      access,
    }),
    false,
    "B: draft course is not public without author membership",
  );
  assert.equal(
    canActivatePublishPreviewMode({
      previewParam: "publish",
      practiceStatus: "draft",
      access,
    }),
    false,
    "B: stranger cannot activate ?preview=publish",
  );
  assert.equal(
    canActivatePublishPreviewMode({
      previewParam: undefined,
      practiceStatus: "draft",
      access: memberAccess(),
    }),
    false,
    "B: author without preview query stays out of draft-preview chrome",
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "unpublished",
      access: entitledAccess(),
    }),
    true,
    "B: entitled buyer can still open an unpublished product they own",
  );
}

function testScenarioCPublishedCourseLoads() {
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: strangerAccess(),
    }),
    true,
    "C: published course PDP is public",
  );
  assert.equal(
    canActivatePublishPreviewMode({
      previewParam: "publish",
      practiceStatus: "published",
      access: memberAccess(),
    }),
    false,
    "C: published + ?preview=publish does not turn on draft preview UI",
  );
}

function testScenarioDPracticePreviewUnchanged() {
  const access = memberAccess();
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "draft",
      access,
    }),
    true,
    "D: draft practice + author still reveals PDP",
  );
  assert.equal(
    canActivatePublishPreviewMode({
      previewParam: "publish",
      practiceStatus: "draft",
      access,
    }),
    true,
    "D: ordinary practice preview still works",
  );
  assert.equal(
    shouldLoadPublicAudioItemsOnProductPage("practice", "practice"),
    true,
    "D: practice preview still loads public audio items",
  );
}

function testScenarioECourseContentNotOnPdp() {
  assert.equal(
    shouldLoadPublicAudioItemsOnProductPage("course", "practice"),
    false,
  );

  const freeCourseAccess = evaluateCourseContentAccess({
    userId: "listener-1",
    publicationClass: "course",
    productKind: "practice",
    access: {
      ...strangerAccess(),
      canListen: true,
      reason: "free",
      isPubliclyListed: true,
    },
    isPlatformAdmin: false,
  });
  assert.equal(
    freeCourseAccess,
    false,
    "E: canListen / is_free does not open course lessons",
  );

  const entitled = evaluateCourseContentAccess({
    userId: "buyer-1",
    publicationClass: "course",
    productKind: "practice",
    access: entitledAccess(),
    isPlatformAdmin: false,
  });
  assert.equal(entitled, true, "E: entitlement still opens course content");

  assert.equal(typeof canAccessCourseContent, "function");
}

function testPageLoaderContracts() {
  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const lookup = read("src/lib/products/lookup.ts");
  const audio = read("src/lib/products/public-audio-items.ts");
  const access = read("src/lib/products/access.ts");

  assert.match(page, /canRevealPublicProductPage/);
  assert.match(page, /shouldLoadPublicAudioItemsOnProductPage/);
  assert.match(page, /canActivatePublishPreviewMode/);
  assert.match(page, /loadPublicAudioItems/);
  assert.match(
    page,
    /publicationClass: practice\.publication_class/,
    "PDP passes publication_class into the audio-item loader",
  );
  assert.doesNotMatch(page, /\/learn/);
  assert.doesNotMatch(page, /course_lessons/);
  assert.doesNotMatch(page, /publication_files/);
  assert.doesNotMatch(page, /canAccessCourseContent/);

  assert.match(
    lookup,
    /authors!practices_author_id_fkey!inner/,
    "author+slug lookup uses an inner author embed so course shares a slug filter with practice",
  );
  assert.match(lookup, /publication_class/);
  assert.doesNotMatch(
    lookup,
    /eq\("product_kind"/,
    "lookup must not require product_kind=practice",
  );
  assert.doesNotMatch(
    lookup,
    /eq\("publication_class"/,
    "lookup must not filter out publication_class=course",
  );

  assert.match(audio, /isCoursePublication/);
  assert.match(audio, /shouldLoadPublicAudioItemsOnProductPage/);

  assert.match(access, /export async function canAccessCourseContent/);
  assert.match(access, /never opened by price \/ is_free/);
  assert.doesNotMatch(page, /app\/api\/learn/);
  assert.equal(existsSync(join(root, "src/app/learn")), false);
}

testPreviewUrlStaysOnPublicPdp();
testCourseIsNotTreatedAsLegacyPractice();
testScenarioADraftCourseAuthorPreview();
testScenarioBDraftHiddenFromStrangers();
testScenarioCPublishedCourseLoads();
testScenarioDPracticePreviewUnchanged();
testScenarioECourseContentNotOnPdp();
testPageLoaderContracts();

console.log("course-pdp-preview-unit: ok");
