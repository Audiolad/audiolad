#!/usr/bin/env node
/**
 * Learner UX on multi-level courses: overflow, draft-course audio,
 * PDF new-tab, entitled vs storefront presentation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  canPlayCourseAudioItem,
  canDownloadCoursePublicationFile,
  groupLearnerCourse,
} from "../src/lib/course-content/index.ts";
import {
  COURSE_LEARNER_FILE_VIEWER_BACK_LABEL,
  buildCourseLearnerFileReturnHref,
  buildCourseLearnerFileEmbedSrc,
  buildCourseLearnerFileViewerPath,
  COURSE_LEARNER_PDF_EMBED_FRAGMENT,
  resolveCourseLearnerFileHttpMode,
  resolvePracticeFileViewerRoute,
  wantsProtectedFileDocumentOpen,
} from "../src/lib/course-content/learner-file-http.ts";
import { presentCourseAudioTitle } from "../src/lib/course-content/course-audio-title.ts";
import CourseLearnerFileViewerModule, {
  CourseLearnerFileViewerDenied,
  buildCourseLearnerFileViewerViewModel,
} from "../src/components/products/course-learner/CourseLearnerFileViewer.tsx";
import {
  shouldApplyEntitledPublishedAudioFilter,
  shouldEnforcePublishedAudioItemForEntitledSignedUrl,
  shouldFilterEntitledListenTracksToPublishedStatus,
} from "../src/lib/listen/course-audio-status.ts";
import { resolveListenApiDecision } from "../src/lib/listen/preview-access.ts";
import {
  COURSE_LEARNER_CONTENTS_ANCHOR_ID,
  COURSE_LEARNER_OPEN_CTA_LABEL,
  PRODUCT_UNAVAILABLE_CTA_LABEL,
  buildPracticeAccessPresentation,
} from "../src/lib/products/practice-access-ui.ts";
import { PUBLIC_PRODUCT_DESCRIPTION_HEADING } from "../src/lib/products/product-copy.ts";
import CourseLearnerContentModule from "../src/components/products/course-learner/CourseLearnerContent.tsx";
import CourseLearnerFileDownloadModule from "../src/components/products/course-learner/CourseLearnerFileDownload.tsx";
import {
  COURSE_LEARNER_AUDIO_ITEM_LABEL,
  COURSE_LEARNER_FILE_ITEM_LABEL,
} from "../src/components/products/course-learner/CourseLearnerItemTypeIcon.tsx";
import { collectLockedLessonItemKinds } from "../src/lib/course-content/learner-dto.ts";

const CourseLearnerContent =
  CourseLearnerContentModule.default ?? CourseLearnerContentModule;
const CourseLearnerFileDownload =
  CourseLearnerFileDownloadModule.default ?? CourseLearnerFileDownloadModule;
const CourseLearnerFileViewer =
  CourseLearnerFileViewerModule.default ?? CourseLearnerFileViewerModule;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LONG_PDF_NAME =
  "Коды_Женской_Притягательности_Для_работы_с_собой.pdf";

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
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

function coursePractice(overrides = {}) {
  return {
    id: "course-1",
    slug: "kody-zhenskoy-prityagatelnosti",
    audio_url: null,
    author_id: "author-1",
    price: 4900,
    is_free: false,
    format: "курс",
    status: "draft",
    is_catalog_listed: false,
    ...overrides,
  };
}

function presentation(overrides = {}) {
  return buildPracticeAccessPresentation({
    access: productAccess(),
    practice: coursePractice(),
    authorSlug: "zoya-petrova",
    paymentsConfigured: true,
    isAuthenticated: false,
    isCourse: true,
    ...overrides,
  });
}

function testDraftCourseAudioGates() {
  assert.equal(shouldFilterEntitledListenTracksToPublishedStatus(true), false);
  assert.equal(shouldFilterEntitledListenTracksToPublishedStatus(false), true);
  assert.equal(
    shouldEnforcePublishedAudioItemForEntitledSignedUrl(true),
    false,
  );
  assert.equal(
    shouldEnforcePublishedAudioItemForEntitledSignedUrl(false),
    true,
  );
  assert.equal(
    shouldApplyEntitledPublishedAudioFilter({
      isCourse: true,
      accessMode: "entitled",
    }),
    false,
    "entitled L1 on a draft course must still receive lesson audio tracks",
  );
  assert.equal(
    shouldApplyEntitledPublishedAudioFilter({
      isCourse: false,
      accessMode: "entitled",
    }),
    true,
    "flat products keep the published audio_item rule",
  );
  assert.equal(
    shouldApplyEntitledPublishedAudioFilter({
      isCourse: true,
      accessMode: "author_preview",
    }),
    false,
  );

  const signedAudio = read("src/lib/listen/signed-audio.ts");
  assert.match(signedAudio, /canPlayCourseAudioItem/);
  assert.match(signedAudio, /shouldEnforcePublishedAudioItemForEntitledSignedUrl/);
  assert.match(signedAudio, /createServiceRoleClient/);
  assert.doesNotMatch(
    signedAudio,
    /mode === "author_preview"[\s\S]{0,80}isCourse/,
  );

  const sessionLoader = read("src/lib/listen/load-session-payload.ts");
  assert.match(sessionLoader, /shouldApplyEntitledPublishedAudioFilter/);
  assert.doesNotMatch(
    sessionLoader,
    /if \(accessMode === "entitled"\) \{\s*query = query\.eq\("status", "published"\)/,
  );

  const pageShared = read("src/lib/listen/page-shared.tsx");
  assert.match(pageShared, /shouldApplyEntitledPublishedAudioFilter/);
}

function testListenApiDecisionKeepsLevelEnforcement() {
  const entitled = { mode: "entitled" };
  const courseEntitled = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: true,
    courseAllowed: true,
    canListen: false,
    accessReason: "granted",
    catalogPreviewEligible: false,
    listenAccess: entitled,
  });
  assert.equal(courseEntitled.ok, true);
  if (courseEntitled.ok) {
    assert.equal(courseEntitled.access.mode, "entitled");
    assert.equal(courseEntitled.useServiceRoleStorage, true);
    assert.notEqual(courseEntitled.access.mode, "author_preview");
  }

  const stranger = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: true,
    courseAllowed: false,
    canListen: false,
    accessReason: "not_authenticated",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(stranger.ok, false, "stranger must not get course assets");

  const preview = resolveListenApiDecision({
    purpose: "preview_audio",
    isCourse: true,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(preview.ok, true, "published listed course may mint catalog_preview");
  if (preview.ok) {
    assert.equal(preview.access.mode, "catalog_preview");
    assert.equal(preview.useServiceRoleStorage, true);
  }

  const unpublishedPreview = resolveListenApiDecision({
    purpose: "preview_audio",
    isCourse: true,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: false,
    listenAccess: null,
  });
  assert.equal(
    unpublishedPreview.ok,
    false,
    "unpublished course has no public storefront preview",
  );

  const previewFull = resolveListenApiDecision({
    purpose: "full_audio",
    isCourse: true,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(previewFull.ok, false, "catalog preview still cannot open full course audio");
}

const FILE_ID = "55555555-5555-4555-8555-555555555555";
const AUTHOR_SLUG = "zoya-petrova";
const PRODUCT_SLUG = "kody-zhenskoy-prityagatelnosti";

function testPdfOpensInAppViewer() {
  assert.equal(
    resolveCourseLearnerFileHttpMode(
      new Request("https://audiolad.ru/file", {
        headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
      }),
    ),
    "document",
  );
  assert.equal(
    resolveCourseLearnerFileHttpMode(
      new Request("https://audiolad.ru/file", {
        headers: { "sec-fetch-dest": "iframe" },
      }),
    ),
    "embed",
  );
  assert.equal(
    resolveCourseLearnerFileHttpMode(
      new Request("https://audiolad.ru/file?raw=1", {
        headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
      }),
    ),
    "document",
    "query overrides must not turn top-level navigation into a raw PDF",
  );
  assert.equal(
    resolveCourseLearnerFileHttpMode(
      new Request("https://audiolad.ru/file", {
        headers: { accept: "application/json" },
      }),
    ),
    "json",
  );
  assert.equal(
    wantsProtectedFileDocumentOpen(
      new Request("https://audiolad.ru/file", {
        headers: { accept: "application/json" },
      }),
    ),
    false,
  );

  assert.equal(
    buildCourseLearnerFileViewerPath(AUTHOR_SLUG, PRODUCT_SLUG, FILE_ID),
    `/practice/${AUTHOR_SLUG}/${PRODUCT_SLUG}/file/${FILE_ID}`,
  );
  assert.equal(
    buildCourseLearnerFileReturnHref(AUTHOR_SLUG, PRODUCT_SLUG),
    `/practice/${AUTHOR_SLUG}/${PRODUCT_SLUG}#${COURSE_LEARNER_CONTENTS_ANCHOR_ID}`,
  );
  assert.deepEqual(
    resolvePracticeFileViewerRoute([AUTHOR_SLUG, PRODUCT_SLUG, "file", FILE_ID]),
    { authorSlug: AUTHOR_SLUG, productSlug: PRODUCT_SLUG, fileId: FILE_ID },
  );
  assert.equal(
    resolvePracticeFileViewerRoute([AUTHOR_SLUG, PRODUCT_SLUG]),
    null,
  );

  const markup = renderToStaticMarkup(
    createElement(CourseLearnerFileDownload, {
      authorSlug: AUTHOR_SLUG,
      productSlug: PRODUCT_SLUG,
      block: {
        id: "file-1",
        type: "file",
        position: 0,
        fileId: FILE_ID,
        filename: LONG_PDF_NAME,
        mime: "application/pdf",
        sizeBytes: 12000,
      },
    }),
  );

  assert.match(
    markup,
    new RegExp(`/practice/${AUTHOR_SLUG}/${PRODUCT_SLUG}/file/${FILE_ID}`),
  );
  assert.doesNotMatch(markup, /\/api\/listen\/product\//);
  assert.doesNotMatch(markup, /target="_blank"/);
  assert.doesNotMatch(markup, /window\.open/);
  assert.match(markup, /break-all/);
  assert.match(markup, /min-w-0/);
  assert.match(markup, /max-w-full/);
  assert.match(markup, /data-course-item-kind="file"/);
  assert.match(markup, new RegExp(COURSE_LEARNER_FILE_ITEM_LABEL));
  assert.match(markup, new RegExp(LONG_PDF_NAME));

  const source = read(
    "src/components/products/course-learner/CourseLearnerFileDownload.tsx",
  );
  assert.doesNotMatch(source, /window\.open|useState|fetch\(/);
  assert.doesNotMatch(source, /target="_blank"/);
  assert.match(source, /buildCourseLearnerFileViewerPath/);

  const viewer = renderToStaticMarkup(
    createElement(
      CourseLearnerFileViewer,
      buildCourseLearnerFileViewerViewModel({
        authorSlug: AUTHOR_SLUG,
        productSlug: PRODUCT_SLUG,
        fileId: FILE_ID,
        filename: LONG_PDF_NAME,
      }),
    ),
  );
  assert.match(viewer, new RegExp(COURSE_LEARNER_FILE_VIEWER_BACK_LABEL));
  assert.match(
    viewer,
    new RegExp(`/practice/${AUTHOR_SLUG}/${PRODUCT_SLUG}#${COURSE_LEARNER_CONTENTS_ANCHOR_ID}`),
  );
  assert.match(viewer, /data-course-learner-file-viewer="ready"/);
  assert.match(viewer, /<iframe/);
  assert.match(viewer, /data-course-learner-pdf-frame="true"/);
  assert.match(viewer, /absolute inset-0/);
  assert.match(viewer, /max-w-full/);
  assert.match(viewer, /min-w-0/);
  assert.match(viewer, /overflow-hidden/);
  assert.match(viewer, /overflow-x-clip/);
  assert.match(
    viewer,
    new RegExp(
      `src="/api/listen/product/${AUTHOR_SLUG}/${PRODUCT_SLUG}/file/${FILE_ID}#${COURSE_LEARNER_PDF_EMBED_FRAGMENT}"`,
    ),
  );
  assert.equal(
    buildCourseLearnerFileEmbedSrc(AUTHOR_SLUG, PRODUCT_SLUG, FILE_ID),
    `/api/listen/product/${AUTHOR_SLUG}/${PRODUCT_SLUG}/file/${FILE_ID}#${COURSE_LEARNER_PDF_EMBED_FRAGMENT}`,
  );
  assert.doesNotMatch(viewer, /<a[^>]+href="[^"]*\/api\/listen\/product\//);
  assert.doesNotMatch(viewer, /[?&]raw=1/);
  assert.doesNotMatch(viewer, /Открыть PDF отдельно/);
  assert.doesNotMatch(viewer, /target="_blank"/);
  assert.doesNotMatch(viewer, /window\.location|signedUrl|storage_path/);
  assert.doesNotMatch(viewer, /<meta http-equiv="refresh"/i);
  assert.match(viewer, new RegExp(LONG_PDF_NAME));

  const viewerSource = read(
    "src/components/products/course-learner/CourseLearnerFileViewer.tsx",
  );
  assert.doesNotMatch(viewerSource, /Открыть PDF отдельно/);
  assert.doesNotMatch(viewerSource, /openSeparately|raw:\s*true|[?&]raw=1/);
  assert.doesNotMatch(viewerSource, /target="_blank"/);

  const denied = renderToStaticMarkup(
    createElement(CourseLearnerFileViewerDenied, {
      authorSlug: AUTHOR_SLUG,
      productSlug: PRODUCT_SLUG,
      message: "Нет доступа к этому документу.",
    }),
  );
  assert.match(denied, new RegExp(COURSE_LEARNER_FILE_VIEWER_BACK_LABEL));
  assert.match(
    denied,
    new RegExp(`/practice/${AUTHOR_SLUG}/${PRODUCT_SLUG}#${COURSE_LEARNER_CONTENTS_ANCHOR_ID}`),
  );

  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  assert.match(page, /resolvePracticeFileViewerRoute/);
  assert.match(page, /CourseLearnerFileViewerPage/);
  assert.doesNotMatch(page, /redirect\(signed\.url/);

  const viewerPage = read(
    "src/components/products/course-learner/CourseLearnerFileViewerPage.tsx",
  );
  assert.match(viewerPage, /loadCourseLearnerFileViewer/);
  assert.doesNotMatch(viewerPage, /redirect\(|signed\.url|storage_path/);

  const route = read(
    "src/app/api/listen/product/[slug]/[productSlug]/file/[fileId]/route.ts",
  );
  assert.match(route, /signLearnerPublicationFile/);
  assert.match(route, /resolveCourseLearnerFileHttpMode/);
  assert.match(route, /buildCourseLearnerFileViewerPath/);
  assert.match(route, /createInlinePdfProxyResponse/);
  assert.match(route, /NextResponse\.redirect/);
  assert.doesNotMatch(route, /NextResponse\.redirect\(signed\.url/);

  const fileHttp = read("src/lib/course-content/learner-file-http.ts");
  assert.doesNotMatch(fileHttp, /COURSE_LEARNER_FILE_RAW_QUERY|Открыть PDF отдельно/);
  assert.doesNotMatch(fileHttp, /searchParams\.get\(/);
  assert.match(fileHttp, /sec-fetch-dest/);
}

function testLongFilenameDoesNotEscapeCard() {
  const course = {
    publicationId: "course-ui",
    accessLevel: 1,
    privileged: false,
    levels: [],
    lessons: [
      {
        id: "l1",
        title: "Очень длинное название урока для проверки переноса на узком экране",
        position: 0,
        requiredAccessLevel: 1,
        locked: false,
        blocks: [
          {
            id: "pdf-1",
            type: "file",
            position: 0,
            fileId: "55555555-5555-4555-8555-555555555555",
            filename: LONG_PDF_NAME,
            mime: "application/pdf",
            sizeBytes: 1,
          },
        ],
      },
    ],
  };

  const markup = renderToStaticMarkup(
    createElement(CourseLearnerContent, {
      course,
      authorSlug: "zoya-petrova",
      productSlug: "kody-zhenskoy-prityagatelnosti",
    }),
  );

  assert.match(markup, new RegExp(`id="${COURSE_LEARNER_CONTENTS_ANCHOR_ID}"`));
  assert.match(markup, /min-w-0/);
  assert.match(markup, /max-w-full/);
  assert.match(markup, /break-all/);
  assert.match(markup, new RegExp(LONG_PDF_NAME));
  assert.doesNotMatch(markup, /overflow-x-hidden/);

  const content = read(
    "src/components/products/course-learner/CourseLearnerContent.tsx",
  );
  assert.match(content, /min-w-0 max-w-full/);
  assert.doesNotMatch(content, /overflow-x-hidden/);
}

function testItemTypeAffordances() {
  const course = {
    publicationId: "course-ui",
    accessLevel: 1,
    privileged: false,
    levels: [
      {
        level: 1,
        title: "Работа с собой",
        description: null,
        upgradePrice: null,
        currency: "RUB",
      },
      {
        level: 2,
        title: "Работа с другими людьми",
        description: "Как выстраивать контакт",
        upgradePrice: 2222,
        currency: "RUB",
        upgradeAction: {
          kind: "course_upgrade",
          practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          targetAccessLevel: 2,
        },
      },
    ],
    lessons: [
      {
        id: "l1",
        title: "Материал 1.1",
        position: 0,
        requiredAccessLevel: 1,
        locked: false,
        blocks: [
          {
            id: "pdf-1",
            type: "file",
            position: 0,
            fileId: FILE_ID,
            filename: LONG_PDF_NAME,
            mime: "application/pdf",
            sizeBytes: 1,
          },
        ],
      },
      {
        id: "l2",
        title: "Материал 2.1",
        position: 1,
        requiredAccessLevel: 2,
        locked: true,
        itemKinds: ["audio", "file"],
      },
    ],
  };

  const markup = renderToStaticMarkup(
    createElement(CourseLearnerContent, {
      course,
      authorSlug: AUTHOR_SLUG,
      productSlug: PRODUCT_SLUG,
    }),
  );

  assert.match(markup, /data-course-item-kind="audio"/);
  assert.match(markup, /data-course-item-kind="file"/);
  assert.match(markup, new RegExp(`${COURSE_LEARNER_FILE_ITEM_LABEL}:`));
  assert.match(markup, />Аудио</);
  assert.match(markup, />Документ</);
  assert.match(markup, new RegExp(LONG_PDF_NAME));
  assert.match(markup, /break-all/);
  assert.doesNotMatch(markup, /audioItemId|signedUrl|storage_path/);

  const audioSource = read(
    "src/components/products/course-learner/CourseLearnerAudioBlock.tsx",
  );
  const iconSource = read(
    "src/components/products/course-learner/CourseLearnerItemTypeIcon.tsx",
  );
  assert.match(audioSource, /CourseLearnerItemTypeIcon/);
  assert.match(audioSource, /kind="audio"/);
  assert.match(audioSource, /COURSE_LEARNER_AUDIO_ITEM_LABEL/);
  assert.match(iconSource, new RegExp(COURSE_LEARNER_AUDIO_ITEM_LABEL));

  assert.deepEqual(
    collectLockedLessonItemKinds([
      {
        id: "t",
        lesson_id: "l2",
        type: "text",
        position: 0,
        asset_id: null,
        payload: { text: "secret" },
      },
      {
        id: "a",
        lesson_id: "l2",
        type: "audio",
        position: 1,
        asset_id: "secret-audio",
        payload: {},
      },
      {
        id: "f",
        lesson_id: "l2",
        type: "file",
        position: 2,
        asset_id: "secret-file",
        payload: {},
      },
    ]),
    ["audio", "file"],
  );
}

function testEntitledCoursePresentationMatrix() {
  const entitledL1 = presentation({
    access: productAccess({
      canListen: false,
      canAcquire: false,
      reason: "granted",
      accessSource: "access_link",
      hasEntitlement: true,
      accessLevel: 1,
    }),
    isAuthenticated: true,
  });
  assert.equal(entitledL1.primaryAction.kind, "open_course");
  if (entitledL1.primaryAction.kind === "open_course") {
    assert.equal(entitledL1.primaryAction.label, COURSE_LEARNER_OPEN_CTA_LABEL);
    assert.equal(
      entitledL1.primaryAction.href,
      `#${COURSE_LEARNER_CONTENTS_ANCHOR_ID}`,
    );
  }
  assert.notEqual(entitledL1.primaryAction.kind, "buy");
  assert.notEqual(entitledL1.primaryAction.label, PRODUCT_UNAVAILABLE_CTA_LABEL);
  assert.equal(entitledL1.showProductAbout, false);
  assert.equal(entitledL1.statusBadge, "Доступ открыт");

  const entitledL2 = presentation({
    access: productAccess({
      canListen: true,
      canAcquire: false,
      reason: "purchased",
      accessSource: "purchase",
      hasEntitlement: true,
      accessLevel: 2,
    }),
    practice: coursePractice({ status: "published", is_catalog_listed: true }),
    isAuthenticated: true,
  });
  assert.equal(entitledL2.primaryAction.kind, "open_course");
  assert.equal(entitledL2.showProductAbout, false);
  assert.notEqual(entitledL2.primaryAction.label, PRODUCT_UNAVAILABLE_CTA_LABEL);

  const publicVisitor = presentation({
    access: productAccess({
      canListen: false,
      canAcquire: true,
      reason: "not_authenticated",
    }),
    practice: coursePractice({
      status: "published",
      is_catalog_listed: true,
    }),
    isAuthenticated: false,
  });
  assert.equal(publicVisitor.primaryAction.kind, "buy");
  assert.equal(publicVisitor.showProductAbout, true);
  assert.notEqual(publicVisitor.primaryAction.kind, "open_course");

  const authenticatedNoAccess = presentation({
    access: productAccess({
      canListen: false,
      canAcquire: true,
      reason: "payment_required",
    }),
    practice: coursePractice({
      status: "published",
      is_catalog_listed: true,
    }),
    isAuthenticated: true,
  });
  assert.equal(authenticatedNoAccess.primaryAction.kind, "buy");
  assert.equal(authenticatedNoAccess.showProductAbout, true);

  const authorPreview = presentation({
    access: productAccess({
      canListen: true,
      canAcquire: false,
      reason: "author_owner",
      isAuthorMember: true,
      hasEntitlement: false,
      accessLevel: null,
    }),
    isAuthenticated: true,
  });
  assert.notEqual(authorPreview.primaryAction.kind, "open_course");
  assert.equal(authorPreview.showAuthorToolbar, true);
  assert.equal(authorPreview.showProductAbout, true);

  const publishPreview = presentation({
    access: productAccess({
      canListen: true,
      canAcquire: false,
      reason: "author_owner",
      isAuthorMember: true,
    }),
    publishPreviewMode: true,
    isAuthenticated: true,
  });
  assert.equal(publishPreview.showPublishPreviewBanner, true);
  assert.equal(publishPreview.showProductAbout, true);
  assert.notEqual(publishPreview.primaryAction.kind, "open_course");

  assert.equal(PUBLIC_PRODUCT_DESCRIPTION_HEADING, "О продукте");

  const pageContent = read(
    "src/components/products/practice-page/PracticePageContent.tsx",
  );
  assert.match(pageContent, /showProductAbout/);
  assert.match(pageContent, /ProductCopySections/);
}

function testLockedLevelStillRedactedInUi() {
  const markup = renderToStaticMarkup(
    createElement(CourseLearnerContent, {
      authorSlug: "zoya-petrova",
      productSlug: "kody-zhenskoy-prityagatelnosti",
      course: {
        publicationId: "course-ui",
        accessLevel: 1,
        privileged: false,
        levels: [
          {
            level: 2,
            title: "Работа с другими людьми",
            description: "Как выстраивать контакт",
            upgradePrice: 2222,
            currency: "RUB",
            upgradeAction: {
              kind: "course_upgrade",
              label: "Открыть второй уровень",
              practiceId: "course-1",
              targetAccessLevel: 2,
            },
          },
        ],
        lessons: [
          {
            id: "l2",
            title: "Материал 2.1",
            position: 0,
            requiredAccessLevel: 2,
            locked: true,
          },
        ],
      },
    }),
  );

  assert.match(markup, /Уровень 2/);
  assert.match(markup, /Как выстраивать контакт/);
  assert.match(markup, /Открыть второй уровень/);
  assert.doesNotMatch(markup, /audioItemId|fileId|signedUrl|storage_path/);
  assert.doesNotMatch(markup, /L2_SECRET/);

  const grouped = groupLearnerCourse({
    publicationId: "course-ui",
    accessLevel: 1,
    privileged: false,
    levels: [
      {
        level: 2,
        title: "Работа с другими людьми",
        description: "Как выстраивать контакт",
        upgradePrice: 2222,
        currency: "RUB",
      },
    ],
    lessons: [
      {
        id: "l2",
        title: "Материал 2.1",
        position: 0,
        requiredAccessLevel: 2,
        locked: true,
      },
    ],
  });
  assert.equal(grouped.kind, "grouped");
}

function testAssetHelpersStayImported() {
  assert.equal(typeof canPlayCourseAudioItem, "function");
  assert.equal(typeof canDownloadCoursePublicationFile, "function");
}

testDraftCourseAudioGates();
testListenApiDecisionKeepsLevelEnforcement();
function testCourseAudioTitlePresentation() {
  assert.equal(
    presentCourseAudioTitle(
      "Методика открытия системы для работы с собой",
      1,
    ),
    "Методика открытия системы для работы с собой",
  );
  assert.equal(presentCourseAudioTitle("   ", 3), "Аудио 3");
  assert.equal(presentCourseAudioTitle(null, 1), "Аудио 1");
}

testPdfOpensInAppViewer();
testCourseAudioTitlePresentation();
testLongFilenameDoesNotEscapeCard();
testItemTypeAffordances();
testEntitledCoursePresentationMatrix();
testLockedLevelStillRedactedInUi();
testAssetHelpersStayImported();

console.log("course-learner-ux-unit: ok");
