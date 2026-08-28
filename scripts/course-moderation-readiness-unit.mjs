#!/usr/bin/env node
/**
 * Course publish/moderation readiness: per-lesson semantic content.
 * Same fixtures must agree on evaluatePublishReadiness,
 * evaluateCoursePublishContentGate, and evaluateDatabaseModerationReady.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COURSE_PUBLISH_EMPTY_LESSON_CODE,
  COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE,
  COURSE_PUBLISH_MISSING_FILE_CODE,
  COURSE_PUBLISH_MISSING_LESSONS_CODE,
  COURSE_PUBLISH_MISSING_LESSONS_MESSAGE,
  COURSE_PUBLISH_NOT_READY_FALLBACK,
  countCoursePublishContentFromLessons,
  evaluateCourseLessonsReadiness,
  evaluateCoursePublishContentGate,
  formatEmptyCourseLessonMessage,
  formatIncompleteCourseAudioMessage,
  formatMissingCourseFileMessage,
  shouldSkipFlatAudioPublishRequirement,
} from "../src/lib/author-products/course-builder-shared.ts";
import {
  evaluateDatabaseModerationReady,
  listKnownTsSqlReadinessDivergences,
} from "../src/lib/author-products/database-moderation-ready.ts";
import {
  AUDIO_FIRST_PUBLISH_NOT_READY_FALLBACK,
  mapModerationRpcError,
  mapProductNotReadyUserMessage,
  mapPublishRpcError,
} from "../src/lib/author-products/moderation.ts";
import { evaluatePublishReadiness } from "../src/lib/author-products/publish.ts";
import { coercePracticeRow } from "../src/lib/author-products/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function coursePractice(overrides = {}) {
  return coercePracticeRow({
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
  });
}

function practiceProduct(overrides = {}) {
  return coursePractice({
    id: "practice-1",
    title: "Практика",
    slug: "praktika",
    format: "Медитация",
    publication_class: "practice",
    ...overrides,
  });
}

function musicProduct(overrides = {}) {
  return coursePractice({
    id: "music-1",
    title: "Трек",
    slug: "treck",
    format: "Музыка",
    product_kind: "music",
    publication_class: "release",
    music_usage_permission: "listen_only",
    ...overrides,
  });
}

function audioPostProduct(overrides = {}) {
  return coursePractice({
    id: "post-1",
    title: "Аудиопост",
    slug: "audiopost",
    format: "Аудиопост",
    product_kind: "audio_post",
    publication_class: "post",
    description: null,
    ...overrides,
  });
}

function audioItem(overrides = {}) {
  return {
    id: "audio-1",
    practice_id: "practice-1",
    title: "Аудио 1",
    description: null,
    audio_path: "practices/p/audio.mp3",
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

function textLesson(id, title, text) {
  return {
    id,
    title,
    blocks: [{ type: "text", payload: { text } }],
  };
}

function emptyLesson(id, title) {
  return { id, title, blocks: [] };
}

function fileLesson(id, title, file) {
  return {
    id,
    title,
    blocks: [{ type: "file", asset_id: file?.id ?? "missing-file", file }],
  };
}

function audioLesson(id, title, audio) {
  return {
    id,
    title,
    blocks: [{ type: "audio", asset_id: audio?.id ?? "missing-audio", audio }],
  };
}

function validFile(overrides = {}) {
  return {
    id: "file-1",
    original_name: "notes.pdf",
    size_bytes: 2048,
    mime: "application/pdf",
    storage_path: "publication-files/course-1/notes.pdf",
    ...overrides,
  };
}

function validAudio(overrides = {}) {
  return {
    id: "audio-block-1",
    title: "Урок аудио",
    duration_seconds: 120,
    original_file_name: "lesson.mp3",
    audio_path: "practices/course-1/lesson.mp3",
    ...overrides,
  };
}

function snapshotFromLessons(lessons) {
  return countCoursePublishContentFromLessons(lessons);
}

function pair(practice, audioItems, lessons) {
  const courseContent = snapshotFromLessons(lessons);
  const gate = evaluateCoursePublishContentGate({
    publicationClass: practice.publication_class,
    productKind: practice.product_kind,
    publishedAt: practice.published_at,
    lessonCount: courseContent.lessonCount,
    blockCount: courseContent.blockCount,
    lessons: courseContent.lessons,
  });
  const ts = evaluatePublishReadiness(practice, audioItems, {
    accessStatus: "free",
    activeTopicCount: 1,
    courseContent,
  });
  const db = evaluateDatabaseModerationReady({
    practice,
    audioItems,
    accessStatus: "free",
    activeTopicCount: 1,
    courseContent,
  });
  return { gate, ts, db, courseContent };
}

function assertCourseParity(label, practice, audioItems, lessons, expectedOk) {
  const { gate, ts, db } = pair(practice, audioItems, lessons);
  assert.equal(gate.ok, expectedOk, `${label}: gate.ok`);
  assert.equal(ts.ok, expectedOk, `${label}: evaluatePublishReadiness.ok`);
  assert.equal(db.ok, expectedOk, `${label}: evaluateDatabaseModerationReady.ok`);
  return { gate, ts, db };
}

// 1. 1 lesson, 1 nonempty text, 0 audio_items → READY
assertCourseParity(
  "1",
  coursePractice(),
  [],
  [textLesson("l1", "Урок 1", "Текст урока")],
  true,
);

// 2. 2 lessons, each nonempty text, 0 audio_items → READY
assertCourseParity(
  "2",
  coursePractice(),
  [],
  [
    textLesson("l1", "Урок 1", "Первый"),
    textLesson("l2", "Урок 2", "Второй"),
  ],
  true,
);

// 3. L1 text + L2 valid PDF → READY
assertCourseParity(
  "3",
  coursePractice(),
  [],
  [
    textLesson("l1", "Урок 1", "Текст"),
    fileLesson("l2", "Урок 2", validFile()),
  ],
  true,
);

// 4. L1 text + L2 valid audio → READY
assertCourseParity(
  "4",
  coursePractice(),
  [],
  [
    textLesson("l1", "Урок 1", "Текст"),
    audioLesson("l2", "Урок 2", validAudio()),
  ],
  true,
);

// 5. course, 0 lessons → NOT READY
{
  const result = assertCourseParity("5", coursePractice(), [], [], false);
  assert.equal(result.gate.code, COURSE_PUBLISH_MISSING_LESSONS_CODE);
  assert.equal(result.ts.firstFailure?.code, COURSE_PUBLISH_MISSING_LESSONS_CODE);
  assert.ok(
    result.db.checks.some(
      (check) => check.code === COURSE_PUBLISH_MISSING_LESSONS_CODE && !check.ok,
    ),
  );
}

// 6. 1 lesson, 0 blocks → NOT READY
{
  const result = assertCourseParity(
    "6",
    coursePractice(),
    [],
    [emptyLesson("l1", "Пустой урок")],
    false,
  );
  assert.equal(result.gate.code, COURSE_PUBLISH_EMPTY_LESSON_CODE);
  assert.equal(
    result.gate.message,
    formatEmptyCourseLessonMessage("Пустой урок"),
  );
}

// 7. text block "" → NOT READY
assertCourseParity(
  "7",
  coursePractice(),
  [],
  [textLesson("l1", "Урок 1", "")],
  false,
);

// 8. text block "   " → NOT READY
assertCourseParity(
  "8",
  coursePractice(),
  [],
  [textLesson("l1", "Урок 1", "   ")],
  false,
);

// 9. audio block, audio_path NULL → NOT READY
{
  const result = assertCourseParity(
    "9",
    coursePractice(),
    [],
    [audioLesson("l1", "Аудиоурок", validAudio({ audio_path: null }))],
    false,
  );
  assert.equal(result.gate.code, COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE);
}

// 10. audio_path set, duration_seconds <= 0 → NOT READY
{
  const result = assertCourseParity(
    "10",
    coursePractice(),
    [],
    [audioLesson("l1", "Аудиоурок", validAudio({ duration_seconds: 0 }))],
    false,
  );
  assert.equal(result.gate.code, COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE);
}

// 11. file block, missing asset/file → NOT READY
{
  const result = assertCourseParity(
    "11",
    coursePractice(),
    [],
    [fileLesson("l1", "PDF-урок", null)],
    false,
  );
  assert.equal(result.gate.code, COURSE_PUBLISH_MISSING_FILE_CODE);
}

// 12. 3 lessons: text + PDF + audio → READY
assertCourseParity(
  "12",
  coursePractice(),
  [],
  [
    textLesson("l1", "Урок 1", "Текст"),
    fileLesson("l2", "Урок 2", validFile()),
    audioLesson("l3", "Урок 3", validAudio()),
  ],
  true,
);

// 13. 3 lessons: 2 valid + 1 empty → NOT READY
{
  const result = assertCourseParity(
    "13",
    coursePractice(),
    [],
    [
      textLesson("l1", "Урок 1", "Текст"),
      fileLesson("l2", "Урок 2", validFile()),
      emptyLesson("l3", "Пустой"),
    ],
    false,
  );
  assert.equal(result.gate.code, COURSE_PUBLISH_EMPTY_LESSON_CODE);
  assert.equal(result.gate.message, formatEmptyCourseLessonMessage("Пустой"));
}

// Placeholder «Аудио скоро будет» is nonempty text and is READY
assertCourseParity(
  "soon-audio-text",
  coursePractice(),
  [],
  [textLesson("l1", "Урок 1", "Аудио скоро будет")],
  true,
);

// Leftover incomplete flat audio_items must not fail a valid course
assertCourseParity(
  "orphan-audio",
  coursePractice(),
  [
    audioItem({
      practice_id: "course-1",
      title: "",
      audio_path: null,
      duration_seconds: 0,
    }),
  ],
  [textLesson("l1", "Урок 1", "Текст")],
  true,
);

// Count-only snapshot is not enough for an unpublished course
{
  const ts = evaluatePublishReadiness(coursePractice(), [], {
    accessStatus: "free",
    activeTopicCount: 1,
    courseContent: { lessonCount: 1, blockCount: 1 },
  });
  const db = evaluateDatabaseModerationReady({
    practice: coursePractice(),
    audioItems: [],
    accessStatus: "free",
    activeTopicCount: 1,
    courseContent: { lessonCount: 1, blockCount: 1 },
  });
  assert.equal(ts.ok, false, "count-only TS must not be READY");
  assert.equal(db.ok, false, "count-only SQL mirror must not be READY");
}

// 14. practice, 0 audio_items → still NOT READY
{
  const ts = evaluatePublishReadiness(practiceProduct(), [], {
    accessStatus: "free",
    activeTopicCount: 1,
  });
  const db = evaluateDatabaseModerationReady({
    practice: practiceProduct(),
    audioItems: [],
    accessStatus: "free",
    activeTopicCount: 1,
  });
  assert.equal(ts.ok, false);
  assert.equal(ts.firstFailure?.code, "missing_audio");
  assert.equal(db.ok, false);
  assert.ok(
    db.checks.some((check) => check.code === "missing_audio" && !check.ok),
  );
}

// 15. practice, valid audio → READY
{
  const items = [audioItem()];
  const ts = evaluatePublishReadiness(practiceProduct(), items, {
    accessStatus: "free",
    activeTopicCount: 1,
  });
  const db = evaluateDatabaseModerationReady({
    practice: practiceProduct(),
    audioItems: items,
    accessStatus: "free",
    activeTopicCount: 1,
  });
  assert.equal(ts.ok, true, ts.firstFailure?.message);
  assert.equal(db.ok, true, db.firstFailure?.message);
}

// 16. music / audio_post keep old audio_items behavior
{
  const musicReady = evaluatePublishReadiness(
    musicProduct(),
    [audioItem({ practice_id: "music-1" })],
    { accessStatus: "free", activeTopicCount: 1 },
  );
  const musicDbReady = evaluateDatabaseModerationReady({
    practice: musicProduct(),
    audioItems: [audioItem({ practice_id: "music-1" })],
    accessStatus: "free",
    activeTopicCount: 1,
  });
  assert.equal(musicReady.ok, true, musicReady.firstFailure?.message);
  assert.equal(musicDbReady.ok, true, musicDbReady.firstFailure?.message);

  const musicMissing = evaluatePublishReadiness(musicProduct(), [], {
    accessStatus: "free",
    activeTopicCount: 1,
  });
  const musicDbMissing = evaluateDatabaseModerationReady({
    practice: musicProduct(),
    audioItems: [],
    accessStatus: "free",
    activeTopicCount: 1,
  });
  assert.equal(musicMissing.firstFailure?.code, "missing_audio");
  assert.ok(
    musicDbMissing.checks.some(
      (check) => check.code === "missing_audio" && !check.ok,
    ),
  );

  const postReady = evaluatePublishReadiness(
    audioPostProduct(),
    [audioItem({ practice_id: "post-1", title: "Аудиопост" })],
    { accessStatus: "free", activeTopicCount: 1 },
  );
  const postDbReady = evaluateDatabaseModerationReady({
    practice: audioPostProduct(),
    audioItems: [audioItem({ practice_id: "post-1", title: "Аудиопост" })],
    accessStatus: "free",
    activeTopicCount: 1,
  });
  assert.equal(postReady.ok, true, postReady.firstFailure?.message);
  assert.equal(postDbReady.ok, true, postDbReady.firstFailure?.message);

  const postMissing = evaluatePublishReadiness(audioPostProduct(), [], {
    accessStatus: "free",
    activeTopicCount: 1,
  });
  assert.equal(postMissing.firstFailure?.code, "audio_post_requires_single_audio");
}

assert.equal(
  shouldSkipFlatAudioPublishRequirement({
    publicationClass: "course",
    productKind: "practice",
    blockCount: 0,
  }),
  true,
);
assert.equal(
  shouldSkipFlatAudioPublishRequirement({
    publicationClass: "practice",
    productKind: "practice",
    blockCount: 0,
  }),
  false,
);

const divergences = listKnownTsSqlReadinessDivergences();
assert.equal(
  divergences.some((item) => item.includes("SQL всегда требует хотя бы один audio_items")),
  false,
  "documented course-audio split must be gone",
);
assert.equal(
  divergences.some((item) => item.includes("SQL не проверяет содержание курса")),
  false,
);
assert.equal(
  divergences.some((item) => item.includes("publishedAt")),
  true,
  "published-course client skip stays documented",
);

// Published course client skip vs SQL still validating lessons
{
  const published = coursePractice({
    published_at: "2026-01-01T00:00:00.000Z",
  });
  const gate = evaluateCoursePublishContentGate({
    publicationClass: "course",
    productKind: "practice",
    publishedAt: published.published_at,
    lessons: [],
  });
  const ts = evaluatePublishReadiness(published, [], {
    accessStatus: "free",
    activeTopicCount: 1,
    courseContent: snapshotFromLessons([]),
  });
  const db = evaluateDatabaseModerationReady({
    practice: published,
    audioItems: [],
    accessStatus: "free",
    activeTopicCount: 1,
    courseContent: snapshotFromLessons([]),
  });
  assert.equal(gate.ok, true, "publishedAt skip keeps republish client gate open");
  assert.equal(ts.ok, true, "TS publish readiness skips empty course content when published");
  assert.equal(db.ok, false, "SQL mirror still requires lessons on a published course");
}

// Error mapping
assert.deepEqual(
  mapProductNotReadyUserMessage({
    message: "product_not_ready",
    details: COURSE_PUBLISH_MISSING_LESSONS_CODE,
  }),
  {
    code: COURSE_PUBLISH_MISSING_LESSONS_CODE,
    message: COURSE_PUBLISH_MISSING_LESSONS_MESSAGE,
  },
);
assert.equal(
  mapProductNotReadyUserMessage({
    message: "product_not_ready",
    details: COURSE_PUBLISH_EMPTY_LESSON_CODE,
    hint: "Введение",
  }).message,
  formatEmptyCourseLessonMessage("Введение"),
);
assert.equal(
  mapProductNotReadyUserMessage({
    message: "product_not_ready",
    details: COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE,
    hint: "Урок 2",
  }).message,
  formatIncompleteCourseAudioMessage("Урок 2"),
);
assert.equal(
  mapProductNotReadyUserMessage({
    message: "product_not_ready",
    details: COURSE_PUBLISH_MISSING_FILE_CODE,
    hint: "Материалы",
  }).message,
  formatMissingCourseFileMessage("Материалы"),
);
assert.equal(
  mapProductNotReadyUserMessage({
    message: "product_not_ready",
    details: COURSE_PUBLISH_EMPTY_LESSON_CODE,
  }).message.includes("Один из уроков"),
  true,
);
assert.equal(
  mapPublishRpcError({
    message: "product_not_ready",
    details: "missing_cover",
  })?.message,
  "Загрузите обложку аудиопродукта.",
);
assert.equal(
  mapPublishRpcError({
    message: "product_not_ready",
    details: "missing_audio",
  })?.message,
  "Добавьте хотя бы одно аудио.",
);
assert.equal(
  mapPublishRpcError({
    message: "product_not_ready",
    details: "incomplete_audio",
  })?.message,
  "У одной или нескольких аудиозаписей нет названия, файла или длительности.",
);
assert.equal(
  mapPublishRpcError({
    message: "product_not_ready",
    details: "topic_min_required",
  })?.message,
  "Выберите хотя бы одну тему перед отправкой на модерацию.",
);
assert.equal(
  mapPublishRpcError("product_not_ready")?.message,
  AUDIO_FIRST_PUBLISH_NOT_READY_FALLBACK,
);
assert.equal(
  mapPublishRpcError("product_not_ready", { publicationClass: "course" })
    ?.message,
  COURSE_PUBLISH_NOT_READY_FALLBACK,
);
assert.equal(
  mapPublishRpcError({
    message: "product_not_ready",
    details: COURSE_PUBLISH_MISSING_LESSONS_CODE,
  })?.message.includes("аудио."),
  false,
  "course DETAIL must not use the audio-first banner",
);
assert.equal(
  mapModerationRpcError({
    message: "product_not_ready",
    details: COURSE_PUBLISH_MISSING_LESSONS_CODE,
  }).message,
  COURSE_PUBLISH_MISSING_LESSONS_MESSAGE,
);
assert.equal(
  mapPublishRpcError({
    message: "product_not_ready",
    details: "missing_course_lessons",
    hint: "SELECT * FROM practices",
  })?.message,
  COURSE_PUBLISH_MISSING_LESSONS_MESSAGE,
);
assert.equal(
  evaluateCourseLessonsReadiness([
    audioLesson("l1", "Только заглушка", validAudio({ audio_path: null })),
  ]).code,
  COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE,
);

const form = readFileSync(
  join(root, "src/components/author-dashboard/AuthorProductForm.tsx"),
  "utf8",
);
assert.match(form, /courseContentSnapshot\.lessons/);
assert.match(form, /courseContentCheck\.message/);

const publishSrc = readFileSync(
  join(root, "src/lib/author-products/publish.ts"),
  "utf8",
);
assert.match(publishSrc, /lessons: courseContent\?\.lessons/);
assert.match(publishSrc, /mapPublishRpcError\(error\)/);

const sqlMirror = readFileSync(
  join(root, "src/lib/author-products/database-moderation-ready.ts"),
  "utf8",
);
assert.match(sqlMirror, /20260901120000_course_moderation_readiness/);
assert.match(sqlMirror, /evaluateCourseLessonsReadiness/);
assert.doesNotMatch(
  sqlMirror,
  /SQL всегда требует хотя бы один audio_items/,
);

console.log("course-moderation-readiness-unit: ok");
