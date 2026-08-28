import {
  MAX_AUDIO_BYTES,
  getAudioUploadErrorMessage,
  validateMp3FileClient,
} from "@/lib/author-products/limits";
import {
  PRODUCT_KIND,
  normalizeProductKind,
} from "@/lib/author-products/product-kind";
import { isCoursePublication } from "@/lib/author-products/publication-class";
import {
  PUBLICATION_FILE_MAX_PDF_BYTES,
  PUBLICATION_FILE_PDF_MIME,
  type CourseLessonBlockType,
} from "@/lib/course-content/types";

export { MAX_AUDIO_BYTES, PUBLICATION_FILE_MAX_PDF_BYTES };

const COURSE_BUILDER_PDF_MAX_MB = PUBLICATION_FILE_MAX_PDF_BYTES / (1024 * 1024);
const COURSE_BUILDER_AUDIO_MAX_MB = MAX_AUDIO_BYTES / (1024 * 1024);

export const COURSE_BUILDER_PDF_HINT = `PDF — до ${COURSE_BUILDER_PDF_MAX_MB} МБ`;
export const COURSE_BUILDER_AUDIO_HINT = `Аудио — до ${COURSE_BUILDER_AUDIO_MAX_MB} МБ`;
export const COURSE_BUILDER_PDF_TOO_LARGE =
  `PDF-файл должен быть не больше ${COURSE_BUILDER_PDF_MAX_MB} МБ.`;
export const COURSE_BUILDER_PDF_WRONG_TYPE = "Можно загрузить только PDF-файл.";
export const COURSE_BUILDER_AUDIO_TOO_LARGE =
  `Аудиофайл должен быть не больше ${COURSE_BUILDER_AUDIO_MAX_MB} МБ.`;
export const COURSE_BUILDER_AUDIO_WRONG_TYPE = "Загрузите аудиофайл в формате MP3.";

export function validateCourseBuilderPdfFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; code: "invalid_file_type" | "invalid_file_size" } {
  if (file.type.trim().toLowerCase() !== PUBLICATION_FILE_PDF_MIME) {
    return { ok: false, code: "invalid_file_type" };
  }

  if (file.size <= 0 || file.size > PUBLICATION_FILE_MAX_PDF_BYTES) {
    return { ok: false, code: "invalid_file_size" };
  }

  return { ok: true };
}

export function getCourseBuilderPdfErrorMessage(
  code: "invalid_file_type" | "invalid_file_size",
): string {
  return code === "invalid_file_size"
    ? COURSE_BUILDER_PDF_TOO_LARGE
    : COURSE_BUILDER_PDF_WRONG_TYPE;
}

export function validateCourseBuilderAudioFile(file: File): string | null {
  const sharedError = validateMp3FileClient(file);

  if (!sharedError) {
    return null;
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return COURSE_BUILDER_AUDIO_TOO_LARGE;
  }

  return COURSE_BUILDER_AUDIO_WRONG_TYPE;
}

export function getCourseBuilderAudioUploadError(
  code: string | undefined,
  status: number,
  message?: string,
): string {
  if (code === "invalid_file_size" || status === 413) {
    return COURSE_BUILDER_AUDIO_TOO_LARGE;
  }

  if (code === "invalid_file_type") {
    return COURSE_BUILDER_AUDIO_WRONG_TYPE;
  }

  return getAudioUploadErrorMessage(code, status, message);
}

export const COURSE_BUILDER_SECTION_TITLE = "Содержание курса";
export const COURSE_BUILDER_EMPTY_TITLE = "Добавьте первый урок курса";
export const COURSE_BUILDER_ADD_LESSON_LABEL = "Добавить урок";
export const COURSE_BUILDER_COMPLETION_CTA_TITLE = "Что дальше";
export const COURSE_BUILDER_LEGACY_AUDIO_NOTICE =
  "У этого курса остались аудиозаписи в старом списке треков. Они не переносятся в уроки автоматически.";

export const COURSE_PUBLISH_MISSING_CONTENT_CODE = "missing_course_content";
export const COURSE_PUBLISH_MISSING_CONTENT_MESSAGE =
  "Добавьте хотя бы один урок с содержимым.";
export const COURSE_PUBLISH_MISSING_LESSONS_CODE = "missing_course_lessons";
export const COURSE_PUBLISH_MISSING_LESSONS_MESSAGE =
  "Добавьте хотя бы один урок.";
export const COURSE_PUBLISH_EMPTY_LESSON_CODE = "empty_course_lesson";
export const COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE = "incomplete_course_audio";
export const COURSE_PUBLISH_MISSING_FILE_CODE = "missing_course_file";
export const COURSE_PUBLISH_EMPTY_LESSON_FALLBACK =
  "Один из уроков курса пока не содержит готового материала.";
export const COURSE_PUBLISH_INCOMPLETE_AUDIO_FALLBACK =
  "В одном из уроков курса аудио ещё не загружено.";
export const COURSE_PUBLISH_MISSING_FILE_FALLBACK =
  "В одном из уроков курса не прикреплён PDF-файл.";
export const COURSE_PUBLISH_NOT_READY_FALLBACK =
  "Продукт ещё не готов к публикации. Проверьте обязательные поля, тему и материалы курса.";

export type CourseBuilderAudioAsset = {
  id: string;
  title: string;
  duration_seconds: number | null;
  original_file_name: string | null;
  audio_path: string | null;
};

export type CourseBuilderFileAsset = {
  id: string;
  original_name: string;
  size_bytes: number;
  mime: string;
};

export type CourseBuilderBlockDto = {
  id: string;
  lesson_id: string;
  type: CourseLessonBlockType;
  position: number;
  asset_id: string | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
  audio: CourseBuilderAudioAsset | null;
  file: CourseBuilderFileAsset | null;
};

export type CourseBuilderLessonDto = {
  id: string;
  publication_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
  blocks: CourseBuilderBlockDto[];
};

export type CourseCompletionCtaDto = {
  publication_id: string;
  title: string | null;
  description: string | null;
  button_text: string | null;
  url: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CourseBuilderSnapshot = {
  lessons: CourseBuilderLessonDto[];
  completion_cta: CourseCompletionCtaDto | null;
  orphan_audio_item_count: number;
};

export type CoursePublishLessonInput = {
  id?: string | null;
  title?: string | null;
  blocks?: ReadonlyArray<{
    type?: string | null;
    asset_id?: string | null;
    payload?: unknown;
    audio?: CourseBuilderAudioAsset | null;
    file?: (CourseBuilderFileAsset & { storage_path?: string | null }) | null;
  }>;
};

export type CoursePublishContentSnapshot = {
  lessonCount: number;
  blockCount: number;
  lessons?: readonly CoursePublishLessonInput[];
};

export type CourseLessonReadinessFailure = {
  ok: false;
  code:
    | typeof COURSE_PUBLISH_MISSING_LESSONS_CODE
    | typeof COURSE_PUBLISH_EMPTY_LESSON_CODE
    | typeof COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE
    | typeof COURSE_PUBLISH_MISSING_FILE_CODE;
  message: string;
  lessonTitle: string | null;
  lessonId: string | null;
};

export type CourseLessonReadinessResult =
  | { ok: true }
  | CourseLessonReadinessFailure;

export type CourseCompletionCtaInput = {
  title: string | null;
  description: string | null;
  button_text: string | null;
  url: string | null;
  enabled: boolean;
};

export function defaultCourseLessonTitle(indexFromZero: number): string {
  return `Урок ${indexFromZero + 1}`;
}

export function nextCoursePosition(
  existing: ReadonlyArray<{ position: number }>,
): number {
  if (existing.length === 0) {
    return 0;
  }

  return Math.max(...existing.map((item) => item.position)) + 1;
}

export function assertLessonBelongsToCourse(input: {
  lessonPublicationId: string | null | undefined;
  courseId: string;
}): { ok: true } | { ok: false; reason: "lesson_not_in_course" } {
  if (!input.lessonPublicationId || input.lessonPublicationId !== input.courseId) {
    return { ok: false, reason: "lesson_not_in_course" };
  }

  return { ok: true };
}

export function assertBlockBelongsToLesson(input: {
  blockLessonId: string | null | undefined;
  lessonId: string;
}): { ok: true } | { ok: false; reason: "block_not_in_lesson" } {
  if (!input.blockLessonId || input.blockLessonId !== input.lessonId) {
    return { ok: false, reason: "block_not_in_lesson" };
  }

  return { ok: true };
}

function readCourseTextPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const text = (payload as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

export function isValidCourseTextBlock(payload: unknown): boolean {
  return readCourseTextPayload(payload).trim() !== "";
}

export function isValidCourseAudioAsset(
  audio:
    | Pick<CourseBuilderAudioAsset, "title" | "audio_path" | "duration_seconds">
    | null
    | undefined,
): boolean {
  return Boolean(
    audio &&
      audio.title?.trim() &&
      audio.audio_path?.trim() &&
      audio.duration_seconds &&
      audio.duration_seconds > 0,
  );
}

export function isValidCourseFileAsset(
  file:
    | (Pick<CourseBuilderFileAsset, "original_name" | "size_bytes"> & {
        storage_path?: string | null;
      })
    | null
    | undefined,
): boolean {
  if (!file || !file.original_name?.trim() || !(file.size_bytes > 0)) {
    return false;
  }

  if ("storage_path" in file && file.storage_path != null) {
    return Boolean(file.storage_path.trim());
  }

  return true;
}

export function formatEmptyCourseLessonMessage(title?: string | null): string {
  const trimmed = title?.trim();
  return trimmed
    ? `В уроке «${trimmed}» пока нет содержимого.`
    : COURSE_PUBLISH_EMPTY_LESSON_FALLBACK;
}

export function formatIncompleteCourseAudioMessage(
  title?: string | null,
): string {
  const trimmed = title?.trim();
  return trimmed
    ? `В уроке «${trimmed}» аудио ещё не загружено.`
    : COURSE_PUBLISH_INCOMPLETE_AUDIO_FALLBACK;
}

export function formatMissingCourseFileMessage(title?: string | null): string {
  const trimmed = title?.trim();
  return trimmed
    ? `В уроке «${trimmed}» не прикреплён PDF-файл.`
    : COURSE_PUBLISH_MISSING_FILE_FALLBACK;
}

/**
 * Per-lesson semantic content for publication_class=course.
 * Matches assert_practice_moderation_ready v4: every lesson needs ≥1 valid
 * nonempty text / ready audio / real file block. Row counts are not enough.
 */
export function evaluateCourseLessonsReadiness(
  lessons: ReadonlyArray<CoursePublishLessonInput> | null | undefined,
): CourseLessonReadinessResult {
  const list = lessons ?? [];

  if (list.length === 0) {
    return {
      ok: false,
      code: COURSE_PUBLISH_MISSING_LESSONS_CODE,
      message: COURSE_PUBLISH_MISSING_LESSONS_MESSAGE,
      lessonTitle: null,
      lessonId: null,
    };
  }

  for (const lesson of list) {
    const blocks = lesson.blocks ?? [];
    const hasValidBlock = blocks.some((block) => {
      if (block.type === "text") {
        return isValidCourseTextBlock(block.payload);
      }

      if (block.type === "audio") {
        return isValidCourseAudioAsset(block.audio);
      }

      if (block.type === "file") {
        return isValidCourseFileAsset(block.file);
      }

      return false;
    });

    if (hasValidBlock) {
      continue;
    }

    const lessonTitle = lesson.title?.trim() || null;
    const lessonId = lesson.id ?? null;

    if (blocks.some((block) => block.type === "audio")) {
      return {
        ok: false,
        code: COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE,
        message: formatIncompleteCourseAudioMessage(lessonTitle),
        lessonTitle,
        lessonId,
      };
    }

    if (blocks.some((block) => block.type === "file")) {
      return {
        ok: false,
        code: COURSE_PUBLISH_MISSING_FILE_CODE,
        message: formatMissingCourseFileMessage(lessonTitle),
        lessonTitle,
        lessonId,
      };
    }

    return {
      ok: false,
      code: COURSE_PUBLISH_EMPTY_LESSON_CODE,
      message: formatEmptyCourseLessonMessage(lessonTitle),
      lessonTitle,
      lessonId,
    };
  }

  return { ok: true };
}

/**
 * Author-form / TS publish gate for course content.
 *
 * publishedAt skip: already-published courses can republish / start-editing
 * without re-blocking the client on empty snapshot counts (legacy published
 * courses may predate course_lessons). SQL assert_practice_moderation_ready
 * still validates lessons on every submit/publish RPC.
 */
export function evaluateCoursePublishContentGate(input: {
  publicationClass: string | null | undefined;
  productKind: string | null | undefined;
  publishedAt: string | null | undefined;
  lessonCount?: number;
  blockCount?: number;
  lessons?: ReadonlyArray<CoursePublishLessonInput> | null;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (!isCoursePublication(input.publicationClass, input.productKind)) {
    return { ok: true };
  }

  if (input.publishedAt) {
    return { ok: true };
  }

  const semantic = evaluateCourseLessonsReadiness(input.lessons);

  if (semantic.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    code: semantic.code,
    message: semantic.message,
  };
}

export function shouldSkipFlatAudioPublishRequirement(input: {
  publicationClass: string | null | undefined;
  productKind: string | null | undefined;
  blockCount?: number;
}): boolean {
  void input.blockCount;
  return isCoursePublication(input.publicationClass, input.productKind);
}

/** New `publication_class=course` drafts do not get the shared empty audio slot. */
export function shouldCreateDefaultAudioItem(
  publicationClass: string | null | undefined,
): boolean {
  return publicationClass !== "course";
}

/** Practice-only listening recommendations. Audiobook keeps current PRACTICE gate. */
export function shouldShowPracticeListeningNotice(
  publicationClass: string | null | undefined,
  productKind: string | null | undefined,
): boolean {
  return (
    normalizeProductKind(productKind) === PRODUCT_KIND.PRACTICE &&
    !isCoursePublication(publicationClass, productKind)
  );
}

/** Flat-tracklist shared-cover toggle. Hidden for course; unchanged for audiobook. */
export function shouldShowSharedTrackCoverToggle(
  publicationClass: string | null | undefined,
  productKind: string | null | undefined,
): boolean {
  return (
    normalizeProductKind(productKind) !== PRODUCT_KIND.AUDIO_POST &&
    !isCoursePublication(publicationClass, productKind)
  );
}

/**
 * Mobile: list XOR editor via a single `mobileEditorOpen` flag.
 * Desktop CSS still shows both panes (`hidden lg:block` when the other is active).
 */
export function resolveCourseBuilderPanes(input: {
  mobileEditorOpen: boolean;
  selectedLessonId: string | null | undefined;
}): { showList: boolean; showEditor: boolean } {
  const showEditor =
    Boolean(input.selectedLessonId) && input.mobileEditorOpen;
  const showList = !showEditor;

  return { showList, showEditor };
}

export function countCoursePublishContentFromLessons(
  lessons: ReadonlyArray<CoursePublishLessonInput>,
): CoursePublishContentSnapshot {
  return {
    lessonCount: lessons.length,
    blockCount: lessons.reduce(
      (sum, lesson) => sum + (lesson.blocks?.length ?? 0),
      0,
    ),
    lessons,
  };
}

function readOptionalCtaText(
  record: Record<string, unknown>,
  key: string,
): { ok: true; value: string | null } | { ok: false } {
  if (!(key in record) || record[key] == null) {
    return { ok: true, value: null };
  }

  if (typeof record[key] !== "string") {
    return { ok: false };
  }

  const trimmed = record[key].trim();
  return { ok: true, value: trimmed ? trimmed : null };
}

export function validateCourseCompletionCtaInput(
  body: unknown,
):
  | { ok: true; value: CourseCompletionCtaInput }
  | { ok: false; reason: "invalid_request" } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "invalid_request" };
  }

  const record = body as Record<string, unknown>;

  if (
    "promo_enabled" in record ||
    "promo_title" in record ||
    "promo_text" in record ||
    "promo_button_text" in record ||
    "promo_url" in record
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  if ("enabled" in record && typeof record.enabled !== "boolean") {
    return { ok: false, reason: "invalid_request" };
  }

  const title = readOptionalCtaText(record, "title");
  const description = readOptionalCtaText(record, "description");
  const buttonText = readOptionalCtaText(record, "button_text");
  const url = readOptionalCtaText(record, "url");

  if (!title.ok || !description.ok || !buttonText.ok || !url.ok) {
    return { ok: false, reason: "invalid_request" };
  }

  return {
    ok: true,
    value: {
      title: title.value,
      description: description.value,
      button_text: buttonText.value,
      url: url.value,
      enabled: record.enabled === true,
    },
  };
}

export function getCourseBuilderErrorMessage(code: string | undefined): string {
  switch (code) {
    case "course_content_parent_must_be_course":
      return "Конструктор курса доступен только для публикации с типом «Курс».";
    case "lesson_not_in_course":
    case "block_not_in_lesson":
    case "not_found":
      return "Урок или блок не найден.";
    case "invalid_request":
      return "Некорректный запрос.";
    case "invalid_reorder":
      return "Не удалось сохранить порядок. Обновите страницу и попробуйте снова.";
    case "missing_title":
      return "Укажите название урока.";
    case COURSE_PUBLISH_MISSING_CONTENT_CODE:
      return COURSE_PUBLISH_MISSING_CONTENT_MESSAGE;
    case COURSE_PUBLISH_MISSING_LESSONS_CODE:
      return COURSE_PUBLISH_MISSING_LESSONS_MESSAGE;
    case COURSE_PUBLISH_EMPTY_LESSON_CODE:
      return COURSE_PUBLISH_EMPTY_LESSON_FALLBACK;
    case COURSE_PUBLISH_INCOMPLETE_AUDIO_CODE:
      return COURSE_PUBLISH_INCOMPLETE_AUDIO_FALLBACK;
    case COURSE_PUBLISH_MISSING_FILE_CODE:
      return COURSE_PUBLISH_MISSING_FILE_FALLBACK;
    case "invalid_file_type":
      return COURSE_BUILDER_PDF_WRONG_TYPE;
    case "invalid_file_size":
      return COURSE_BUILDER_PDF_TOO_LARGE;
    default:
      return "Не удалось сохранить содержимое курса.";
  }
}

export { isCoursePublication };
