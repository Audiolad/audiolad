import {
  collectCourseLevel1AudioItemIds,
  isCourseLessonEligibleForStorefrontPreview,
  isCourseStorefrontPreviewAudioReady,
} from "@/lib/course-content/storefront-preview";
import {
  fromAudioPreviewWindowColumns,
  isConfiguredStorefrontPreviewWindow,
  validateAudioPreviewWindow,
} from "@/lib/listen/preview-window";

import { CourseBuilderError } from "@/lib/author-products/course-builder-shared";
import type { CourseBuilderLessonDto } from "@/lib/author-products/course-builder-shared";

export const COURSE_STOREFRONT_PREVIEW_SECTION_TITLE = "Прослушать фрагмент";
export const COURSE_STOREFRONT_PREVIEW_HINT =
  "Короткий фрагмент (30–90 секунд) на публичной странице курса. Можно выбрать только аудио первого уровня. Полные уроки и материалы второго уровня не открываются.";
export const COURSE_STOREFRONT_PREVIEW_EMPTY =
  "Добавьте опубликованное аудио в урок первого уровня, чтобы настроить фрагмент.";
export const COURSE_STOREFRONT_PREVIEW_AUDIO_LABEL = "Аудио первого уровня";
export const COURSE_STOREFRONT_PREVIEW_START_LABEL = "Начало, сек";
export const COURSE_STOREFRONT_PREVIEW_END_LABEL = "Конец, сек";
export const COURSE_STOREFRONT_PREVIEW_SAVE_LABEL = "Сохранить фрагмент";
export const COURSE_STOREFRONT_PREVIEW_CLEAR_LABEL = "Убрать фрагмент";
export const COURSE_STOREFRONT_PREVIEW_NONE_LABEL = "Не показывать фрагмент";

export type CourseStorefrontPreviewCandidate = {
  audioItemId: string;
  title: string;
  lessonTitle: string;
  durationSeconds: number | null;
};

export type CourseStorefrontPreviewDto = {
  audio_item_id: string | null;
  preview_start_ms: number | null;
  preview_end_ms: number | null;
  candidates: CourseStorefrontPreviewCandidate[];
};

export type CourseStorefrontPreviewWrite =
  | { ok: true; clear: true }
  | {
      ok: true;
      clear: false;
      audioItemId: string;
      previewStartMs: number;
      previewEndMs: number;
    }
  | { ok: false; reason: string };

export function listCourseStorefrontPreviewCandidates(
  lessons: readonly CourseBuilderLessonDto[],
): CourseStorefrontPreviewCandidate[] {
  const candidates: CourseStorefrontPreviewCandidate[] = [];

  for (const lesson of lessons) {
    if (!isCourseLessonEligibleForStorefrontPreview(lesson.required_access_level)) {
      continue;
    }

    for (const block of lesson.blocks) {
      const audio = block.type === "audio" ? block.audio : null;
      const audioItemId = audio?.id?.trim() || block.asset_id?.trim() || "";

      if (
        !audioItemId ||
        !audio ||
        !isCourseStorefrontPreviewAudioReady(audio)
      ) {
        continue;
      }

      candidates.push({
        audioItemId,
        title: audio.title.trim() || "Аудио",
        lessonTitle: lesson.title.trim() || "Урок",
        durationSeconds: audio.duration_seconds,
      });
    }
  }

  return candidates;
}

export function resolveCourseStorefrontPreviewDto(
  lessons: readonly CourseBuilderLessonDto[],
): CourseStorefrontPreviewDto {
  const candidates = listCourseStorefrontPreviewCandidates(lessons);
  const candidateIds = new Set(candidates.map((item) => item.audioItemId));
  const level1Ids = collectCourseLevel1AudioItemIds(lessons);

  for (const lesson of lessons) {
    for (const block of lesson.blocks) {
      const audio = block.type === "audio" ? block.audio : null;
      const audioItemId = audio?.id?.trim() || "";

      if (
        !audioItemId ||
        !candidateIds.has(audioItemId) ||
        !level1Ids.has(audioItemId)
      ) {
        continue;
      }

      const window = fromAudioPreviewWindowColumns({
        preview_start_ms: audio?.preview_start_ms ?? null,
        preview_end_ms: audio?.preview_end_ms ?? null,
      });

      if (isConfiguredStorefrontPreviewWindow(window)) {
        return {
          audio_item_id: audioItemId,
          preview_start_ms: window.previewStartMs,
          preview_end_ms: window.previewEndMs,
          candidates,
        };
      }
    }
  }

  return {
    audio_item_id: null,
    preview_start_ms: null,
    preview_end_ms: null,
    candidates,
  };
}

function parseOptionalInteger(value: unknown): number | null | undefined {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return undefined;
}

export function parseCourseStorefrontPreviewWrite(
  body: unknown,
  candidateIds: ReadonlySet<string>,
): CourseStorefrontPreviewWrite {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "invalid_request" };
  }

  const record = body as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(record, "audio_item_id")) {
    return { ok: false, reason: "invalid_request" };
  }

  const rawAudioItemId = record.audio_item_id;

  if (rawAudioItemId === null) {
    return { ok: true, clear: true };
  }

  if (typeof rawAudioItemId !== "string") {
    return { ok: false, reason: "invalid_request" };
  }

  const audioItemId = rawAudioItemId.trim();

  if (!audioItemId) {
    return { ok: true, clear: true };
  }

  if (!candidateIds.has(audioItemId)) {
    return { ok: false, reason: "storefront_preview_not_playable" };
  }

  const startMs = parseOptionalInteger(
    record.preview_start_ms ??
      (record.start_seconds != null
        ? Number(record.start_seconds) * 1000
        : null),
  );
  const endMs = parseOptionalInteger(
    record.preview_end_ms ??
      (record.end_seconds != null ? Number(record.end_seconds) * 1000 : null),
  );

  if (startMs === undefined || endMs === undefined) {
    return { ok: false, reason: "preview_window_not_integer_ms" };
  }

  const validated = validateAudioPreviewWindow({
    previewStartMs: startMs,
    previewEndMs: endMs,
  });

  if (!validated.ok) {
    return { ok: false, reason: validated.reason };
  }

  if (
    validated.window.previewStartMs == null ||
    validated.window.previewEndMs == null
  ) {
    return { ok: false, reason: "preview_window_incomplete" };
  }

  return {
    ok: true,
    clear: false,
    audioItemId,
    previewStartMs: validated.window.previewStartMs,
    previewEndMs: validated.window.previewEndMs,
  };
}

export function courseStorefrontPreviewWriteOrThrow(
  body: unknown,
  candidateIds: ReadonlySet<string>,
) {
  const parsed = parseCourseStorefrontPreviewWrite(body, candidateIds);

  if (!parsed.ok) {
    throw new CourseBuilderError(parsed.reason, 400);
  }

  return parsed;
}
