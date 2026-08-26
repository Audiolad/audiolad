#!/usr/bin/env node
/**
 * Phase 2A Author Course Builder: visibility, APIs, DnD, CTA, publish gate.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertBlockBelongsToLesson,
  assertLessonBelongsToCourse,
  countCoursePublishContentFromLessons,
  COURSE_BUILDER_ADD_LESSON_LABEL,
  COURSE_BUILDER_COMPLETION_CTA_TITLE,
  COURSE_BUILDER_EMPTY_TITLE,
  COURSE_BUILDER_SECTION_TITLE,
  COURSE_PUBLISH_MISSING_CONTENT_CODE,
  defaultCourseLessonTitle,
  evaluateCoursePublishContentGate,
  nextCoursePosition,
  resolveCourseBuilderPanes,
  shouldCreateDefaultAudioItem,
  shouldShowPracticeListeningNotice,
  shouldShowSharedTrackCoverToggle,
  shouldSkipFlatAudioPublishRequirement,
  validateCourseCompletionCtaInput,
} from "../src/lib/author-products/course-builder-shared.ts";
import { isCoursePublication } from "../src/lib/author-products/publication-class.ts";
import { evaluatePublishReadiness } from "../src/lib/author-products/publish.ts";
import { validatePositionReorderBatch } from "../src/lib/author-products/reorder-batch.ts";
import { validateCourseLessonBlock } from "../src/lib/course-content/validators.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

assert.equal(isCoursePublication("course", "practice"), true);
assert.equal(isCoursePublication(null, "practice"), false);
assert.equal(isCoursePublication("practice", "practice"), false);
assert.equal(isCoursePublication("audiobook", "practice"), false);
assert.equal(isCoursePublication("release", "music"), false);
assert.equal(isCoursePublication("post", "audio_post"), false);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /isCoursePublication/);
assert.match(form, /AuthorCourseBuilder/);
assert.match(form, /Содержание курса|COURSE_BUILDER_SECTION_TITLE|isCourse \? \(/);
assert.match(
  form,
  /isCourse \? \([\s\S]*AuthorCourseBuilder/,
  "course builder is gated by isCoursePublication",
);
assert.match(
  form,
  /isCourse \? null : \([\s\S]*Содержание аудиопродукта/,
  "flat audio tracklist is hidden for courses",
);
assert.doesNotMatch(
  form,
  /AuthorCourseBuilder[\s\S]{0,80}productKind === PRODUCT_KIND.PRACTICE/,
);
assert.doesNotMatch(form, /convert.*audio_items|Автоматически перенести/);
assert.match(form, /shouldShowPracticeListeningNotice/);
assert.match(form, /shouldShowSharedTrackCoverToggle/);
assert.match(form, /shouldCreateDefaultAudioItem/);
assert.doesNotMatch(
  form,
  /productKind === PRODUCT_KIND\.PRACTICE \? \([\s\S]{0,220}Рекомендации перед прослушиванием/,
  "listening recommendations must not use the raw PRACTICE gate",
);
assert.doesNotMatch(
  form,
  /productKind !== PRODUCT_KIND\.AUDIO_POST \? \([\s\S]{0,220}Использовать общую обложку для всех треков/,
  "shared-cover toggle must not use the raw non-post gate",
);

const builder = read("src/components/author-dashboard/AuthorCourseBuilder.tsx");
assert.match(builder, /data-author-course-builder/);
assert.match(builder, /COURSE_BUILDER_SECTION_TITLE/);
assert.match(builder, /COURSE_BUILDER_EMPTY_TITLE/);
assert.match(builder, /COURSE_BUILDER_ADD_LESSON_LABEL/);
assert.match(builder, /COURSE_BUILDER_COMPLETION_CTA_TITLE/);
assert.match(builder, /COURSE_BUILDER_LEGACY_AUDIO_NOTICE/);
assert.equal(COURSE_BUILDER_SECTION_TITLE, "Содержание курса");
assert.equal(COURSE_BUILDER_EMPTY_TITLE, "Добавьте первый урок курса");
assert.equal(COURSE_BUILDER_ADD_LESSON_LABEL, "Добавить урок");
assert.equal(COURSE_BUILDER_COMPLETION_CTA_TITLE, "Что дальше");
assert.match(builder, /lg:grid-cols-\[minmax\(240px,320px\)_minmax\(0,1fr\)\]/);
assert.match(builder, /hidden lg:block/);
assert.match(builder, /resolveCourseBuilderPanes/);
assert.match(builder, /setMobileEditorOpen\(false\)/);
assert.match(builder, /К списку уроков/);
assert.match(builder, /usePointerReorder/);
assert.match(builder, /AudioDragHandle/);
assert.match(builder, /Добавить аудио/);
assert.match(builder, /Добавить текст/);
assert.match(builder, /Добавить PDF/);
assert.match(builder, /course_completion_ctas|completion-cta/);
assert.match(builder, /\/api\/author\/products\/\$\{.*\}\/audio\/\$\{.*\}\/upload/);
assert.match(builder, /\/api\/author\/products\/\$\{practiceId\}\/course\/files\//);
assert.doesNotMatch(builder, /promo_/);
assert.doesNotMatch(builder, /@dnd-kit/);
assert.doesNotMatch(builder, /dataTransfer\.getData/);
assert.doesNotMatch(builder, /WYSIWYG|markdown|Markdown/);
assert.doesNotMatch(builder, /\/learn/);

const pointer = read("src/components/author-dashboard/usePointerReorder.ts");
assert.match(pointer, /draggingIdRef/);
assert.match(pointer, /setDraggingId/);
assert.doesNotMatch(pointer, /dataTransfer\.getData/);

assert.equal(defaultCourseLessonTitle(0), "Урок 1");
assert.equal(nextCoursePosition([]), 0);
assert.equal(nextCoursePosition([{ position: 0 }, { position: 2 }]), 3);

assert.deepEqual(
  assertLessonBelongsToCourse({
    lessonPublicationId: "course-1",
    courseId: "course-1",
  }),
  { ok: true },
);
assert.equal(
  assertLessonBelongsToCourse({
    lessonPublicationId: "course-2",
    courseId: "course-1",
  }).ok,
  false,
);
assert.equal(
  assertBlockBelongsToLesson({
    blockLessonId: "lesson-1",
    lessonId: "lesson-2",
  }).ok,
  false,
);
assert.equal(
  assertBlockBelongsToLesson({
    blockLessonId: "lesson-1",
    lessonId: "lesson-1",
  }).ok,
  true,
);

const reorderOk = validatePositionReorderBatch(
  ["a", "b", "c"],
  [
    { id: "c", position: 0 },
    { id: "a", position: 1 },
    { id: "b", position: 2 },
  ],
);
assert.equal(reorderOk.ok, true);
assert.deepEqual(
  reorderOk.ok ? reorderOk.ordered.map((item) => item.id) : [],
  ["c", "a", "b"],
);

assert.equal(
  validatePositionReorderBatch(["a", "b"], [{ id: "a", position: 0 }]).ok,
  false,
);
assert.equal(
  validatePositionReorderBatch(
    ["a", "b"],
    [
      { id: "a", position: 0 },
      { id: "other", position: 1 },
    ],
  ).ok,
  false,
);

assert.equal(
  validateCourseLessonBlock({
    type: "text",
    assetId: null,
    payload: { text: "абзац\nвторая строка" },
  }).ok,
  true,
);
assert.equal(
  validateCourseLessonBlock({
    type: "audio",
    assetId: "audio-1",
    payload: {},
  }).ok,
  true,
);
assert.equal(
  validateCourseLessonBlock({
    type: "file",
    assetId: "file-1",
    payload: { filename: "notes.pdf" },
  }).ok,
  true,
);

const ctaOk = validateCourseCompletionCtaInput({
  title: "Дальше",
  description: "Продолжите",
  button_text: "Открыть",
  url: "https://audiolad.ru/school",
  enabled: true,
});
assert.equal(ctaOk.ok, true);
if (ctaOk.ok) {
  assert.equal(ctaOk.value.button_text, "Открыть");
  assert.equal(ctaOk.value.enabled, true);
}

assert.equal(
  validateCourseCompletionCtaInput({
    promo_title: "nope",
    enabled: true,
  }).ok,
  false,
);

assert.deepEqual(
  countCoursePublishContentFromLessons([
    { blocks: [{}, {}] },
    { blocks: [{}] },
  ]),
  { lessonCount: 2, blockCount: 3 },
);

assert.equal(
  evaluateCoursePublishContentGate({
    publicationClass: "course",
    productKind: "practice",
    publishedAt: null,
    lessonCount: 0,
    blockCount: 0,
  }).ok,
  false,
);
assert.equal(
  evaluateCoursePublishContentGate({
    publicationClass: "course",
    productKind: "practice",
    publishedAt: null,
    lessonCount: 1,
    blockCount: 0,
  }).code,
  COURSE_PUBLISH_MISSING_CONTENT_CODE,
);
assert.equal(
  evaluateCoursePublishContentGate({
    publicationClass: "course",
    productKind: "practice",
    publishedAt: null,
    lessonCount: 1,
    blockCount: 1,
  }).ok,
  true,
);
assert.equal(
  evaluateCoursePublishContentGate({
    publicationClass: "course",
    productKind: "practice",
    publishedAt: "2026-01-01T00:00:00.000Z",
    lessonCount: 0,
    blockCount: 0,
  }).ok,
  true,
);
assert.equal(
  evaluateCoursePublishContentGate({
    publicationClass: "practice",
    productKind: "practice",
    publishedAt: null,
    lessonCount: 0,
    blockCount: 0,
  }).ok,
  true,
);
assert.equal(
  shouldSkipFlatAudioPublishRequirement({
    publicationClass: "course",
    productKind: "practice",
    blockCount: 1,
  }),
  true,
);
assert.equal(
  shouldSkipFlatAudioPublishRequirement({
    publicationClass: "course",
    productKind: "practice",
    blockCount: 0,
  }),
  false,
);

assert.equal(shouldCreateDefaultAudioItem("course"), false);
assert.equal(shouldCreateDefaultAudioItem("practice"), true);
assert.equal(shouldCreateDefaultAudioItem("audiobook"), true);
assert.equal(shouldCreateDefaultAudioItem("release"), true);
assert.equal(shouldCreateDefaultAudioItem("post"), true);
assert.equal(shouldCreateDefaultAudioItem(null), true);

assert.equal(
  shouldShowPracticeListeningNotice("practice", "practice"),
  true,
);
assert.equal(
  shouldShowPracticeListeningNotice("course", "practice"),
  false,
);
assert.equal(
  shouldShowPracticeListeningNotice("audiobook", "practice"),
  true,
  "audiobook keeps the current PRACTICE listening-notice semantics",
);
assert.equal(shouldShowPracticeListeningNotice("release", "music"), false);
assert.equal(shouldShowPracticeListeningNotice("post", "audio_post"), false);

assert.equal(
  shouldShowSharedTrackCoverToggle("practice", "practice"),
  true,
);
assert.equal(shouldShowSharedTrackCoverToggle("course", "practice"), false);
assert.equal(
  shouldShowSharedTrackCoverToggle("audiobook", "practice"),
  true,
);
assert.equal(shouldShowSharedTrackCoverToggle("release", "music"), true);
assert.equal(shouldShowSharedTrackCoverToggle("post", "audio_post"), false);

assert.deepEqual(
  resolveCourseBuilderPanes({
    mobileEditorOpen: false,
    selectedLessonId: null,
  }),
  { showList: true, showEditor: false },
  "empty course / no selection: list only",
);
assert.deepEqual(
  resolveCourseBuilderPanes({
    mobileEditorOpen: false,
    selectedLessonId: "lesson-1",
  }),
  { showList: true, showEditor: false },
  "entering the builder or returning to the list keeps the editor closed",
);
assert.deepEqual(
  resolveCourseBuilderPanes({
    mobileEditorOpen: true,
    selectedLessonId: "lesson-1",
  }),
  { showList: false, showEditor: true },
  "tapping a lesson opens only that editor on mobile",
);
assert.deepEqual(
  resolveCourseBuilderPanes({
    mobileEditorOpen: false,
    selectedLessonId: "lesson-2",
  }),
  { showList: true, showEditor: false },
  "deleting the open lesson returns to the list without a dangling editor",
);
assert.deepEqual(
  resolveCourseBuilderPanes({
    mobileEditorOpen: true,
    selectedLessonId: null,
  }),
  { showList: true, showEditor: false },
  "editor cannot stay open without a selected lesson",
);

const products = read("src/lib/author-products/products.ts");
assert.match(products, /shouldCreateDefaultAudioItem/);
assert.match(
  products,
  /if \(!shouldCreateDefaultAudioItem\(publicationClass\)\)/,
);
assert.match(products, /audio_items: \[\]/);

function coursePractice(overrides = {}) {
  return {
    id: "course-1",
    author_id: "author-1",
    title: "Курс",
    slug: "kurs",
    subtitle: null,
    description: "Описание курса.",
    format: "Курс",
    product_kind: "practice",
    publication_class: "course",
    music_usage_permission: null,
    duration_minutes: 10,
    price: 0,
    is_free: true,
    is_catalog_listed: true,
    cover_url: "https://cdn.example/cover.jpg",
    use_shared_cover: true,
    audio_url: null,
    status: "draft",
    moderation_status: "not_submitted",
    moderation_attempt: 0,
    moderation_submitted_at: null,
    moderation_review_comment: null,
    deleted_at: null,
    deleted_by: null,
    deletion_reason: null,
    currency: "RUB",
    published_at: null,
    listening_notice_enabled: false,
    listening_notice_title: "",
    listening_notice_text: "",
    promo_enabled: false,
    promo_title: null,
    promo_text: null,
    promo_button_text: null,
    promo_url: null,
    promo_open_in_new_tab: false,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function audioItem(overrides = {}) {
  return {
    id: "audio-1",
    practice_id: "course-1",
    title: "Аудио 1",
    description: null,
    audio_path: "practices/c/audio.mp3",
    cover_url: null,
    duration_seconds: 90,
    original_file_name: "audio.mp3",
    file_size_bytes: 1000,
    position: 1,
    is_preview: false,
    status: "draft",
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

const unpublishedEmpty = evaluatePublishReadiness(coursePractice(), [], {
  activeTopicCount: 1,
  courseContent: { lessonCount: 0, blockCount: 0 },
});
assert.equal(unpublishedEmpty.ok, false);
assert.equal(
  unpublishedEmpty.requirements.find((item) => item.key === "course_content")?.ok,
  false,
  "unpublished course without lessons fails the new content gate",
);

const unpublishedWithContent = evaluatePublishReadiness(coursePractice(), [], {
  activeTopicCount: 1,
  courseContent: { lessonCount: 1, blockCount: 1 },
});
assert.equal(unpublishedWithContent.ok, true);
assert.equal(
  unpublishedWithContent.requirements.some(
    (item) => item.key === "audio" && item.ok,
  ),
  true,
  "text/PDF course does not require flat audio_items",
);

const legacyPublished = evaluatePublishReadiness(
  coursePractice({ published_at: "2026-01-01T00:00:00.000Z" }),
  [audioItem()],
  {
    activeTopicCount: 1,
    courseContent: { lessonCount: 0, blockCount: 0 },
  },
);
assert.equal(legacyPublished.ok, true);

const practiceDraft = evaluatePublishReadiness(
  coursePractice({
    id: "practice-1",
    publication_class: "practice",
    slug: "praktika",
    title: "Практика",
  }),
  [],
  { activeTopicCount: 1 },
);
assert.equal(practiceDraft.ok, false);
assert.notEqual(practiceDraft.firstFailure?.code, COURSE_PUBLISH_MISSING_CONTENT_CODE);

const server = read("src/lib/author-products/course-builder.ts");
assert.match(server, /requirePracticeMutationAccess/);
assert.match(server, /assertPracticePublicContentEditableForActor/);
assert.match(server, /validateCourseParentClass/);
assert.match(server, /assertLessonBelongsToCourse/);
assert.match(server, /assertBlockBelongsToLesson/);
assert.match(server, /validatePositionReorderBatch/);
assert.match(server, /course_completion_ctas/);
assert.match(server, /PUBLICATION_FILES_BUCKET/);
assert.match(server, /validatePublicationPdfUpload/);
assert.match(server, /cleanupUnusedCourseAssets/);
assert.match(server, /createServiceRoleClient/);
assert.doesNotMatch(server, /promo_/);
assert.doesNotMatch(server, /app\/learn/);

const lessonRoutes = [
  "src/app/api/author/products/[id]/course/lessons/route.ts",
  "src/app/api/author/products/[id]/course/lessons/reorder/route.ts",
  "src/app/api/author/products/[id]/course/lessons/[lessonId]/route.ts",
  "src/app/api/author/products/[id]/course/lessons/[lessonId]/blocks/route.ts",
  "src/app/api/author/products/[id]/course/lessons/[lessonId]/blocks/reorder/route.ts",
  "src/app/api/author/products/[id]/course/lessons/[lessonId]/blocks/[blockId]/route.ts",
  "src/app/api/author/products/[id]/course/completion-cta/route.ts",
  "src/app/api/author/products/[id]/course/files/[fileId]/route.ts",
];

for (const relativePath of lessonRoutes) {
  assert.equal(existsSync(join(root, relativePath)), true, relativePath);
  const source = read(relativePath);
  assert.match(
    source,
    /requireCourseBuilder|requireCourseLesson|requireCourseBlock/,
  );
  assert.doesNotMatch(source, /\/learn/);
}

const reorderLessons = read(
  "src/app/api/author/products/[id]/course/lessons/reorder/route.ts",
);
assert.match(reorderLessons, /parseReorderItemsPayload/);
assert.match(reorderLessons, /items/);

const reorderBlocks = read(
  "src/app/api/author/products/[id]/course/lessons/[lessonId]/blocks/reorder/route.ts",
);
assert.match(reorderBlocks, /parseReorderItemsPayload/);

const ctaRoute = read(
  "src/app/api/author/products/[id]/course/completion-cta/route.ts",
);
assert.match(ctaRoute, /export async function GET/);
assert.match(ctaRoute, /export async function PUT/);
assert.match(ctaRoute, /upsertCourseCompletionCta/);
assert.doesNotMatch(ctaRoute, /promo_/);

const publishSrc = read("src/lib/author-products/publish.ts");
assert.match(publishSrc, /evaluateCoursePublishContentGate/);
assert.match(publishSrc, /shouldSkipFlatAudioPublishRequirement/);
assert.match(publishSrc, /course_content/);

const publishRoute = read("src/app/api/author/products/[id]/publish/route.ts");
assert.match(publishRoute, /countCoursePublishContent/);
const submitRoute = read(
  "src/app/api/author/products/[id]/submit-for-moderation/route.ts",
);
assert.match(submitRoute, /countCoursePublishContent/);

assert.equal(existsSync(join(root, "src/app/learn")), false);
assert.equal(existsSync(join(root, "src/app/api/learn")), false);
assert.doesNotMatch(read("src/lib/author-products/course-builder.ts"), /drip|quiz|certificate|homework/);
assert.doesNotMatch(builder, /course_sections|course_modules/);

const catalogCard = read("src/components/catalog/cards/CatalogCardView.tsx");
assert.doesNotMatch(catalogCard, /AuthorCourseBuilder/);
assert.doesNotMatch(catalogCard, /course_lessons/);

console.log("author-course-builder-unit: ok");
