import { normalizeRequiredAccessLevel } from "@/lib/course-content/learner-dto";
import {
  fromAudioPreviewWindowColumns,
  isConfiguredStorefrontPreviewWindow,
  type AudioPreviewWindowColumns,
} from "@/lib/listen/preview-window";

/** Storefront preview may use only material available at Level 1. */
export const COURSE_STOREFRONT_PREVIEW_MAX_ACCESS_LEVEL = 1;

export function isCourseLessonEligibleForStorefrontPreview(
  requiredAccessLevel: unknown,
): boolean {
  return (
    normalizeRequiredAccessLevel(requiredAccessLevel) <=
    COURSE_STOREFRONT_PREVIEW_MAX_ACCESS_LEVEL
  );
}

export function collectCourseLevel1AudioItemIds(
  lessons: ReadonlyArray<{
    required_access_level?: number | null;
    blocks?: ReadonlyArray<{
      type?: string | null;
      asset_id?: string | null;
    }>;
  }>,
): Set<string> {
  const ids = new Set<string>();

  for (const lesson of lessons) {
    if (!isCourseLessonEligibleForStorefrontPreview(lesson.required_access_level)) {
      continue;
    }

    for (const block of lesson.blocks ?? []) {
      if (block.type !== "audio") {
        continue;
      }

      const assetId = block.asset_id?.trim();
      if (assetId) {
        ids.add(assetId);
      }
    }
  }

  return ids;
}

/**
 * After `publish_audio_product`, every course lesson audio_item is
 * `published`. Catalog preview and author candidates share this gate so
 * the cabinet cannot save a fragment the storefront then rejects.
 */
export function isCourseStorefrontPreviewAudioReady(audio: {
  audio_path?: string | null;
  status?: string | null;
}): boolean {
  return Boolean(audio.audio_path?.trim()) && audio.status === "published";
}

export function isCourseStorefrontPreviewClipEligible(
  audioItemId: string,
  row: Partial<AudioPreviewWindowColumns> | null | undefined,
  level1AudioItemIds: ReadonlySet<string>,
): boolean {
  const id = audioItemId.trim();

  return (
    Boolean(id) &&
    level1AudioItemIds.has(id) &&
    isConfiguredStorefrontPreviewWindow(fromAudioPreviewWindowColumns(row))
  );
}

export type CourseStorefrontPreviewAvailabilityAudio = {
  id: string;
  audio_path?: string | null;
  status?: string | null;
  preview_start_ms?: number | null;
  preview_end_ms?: number | null;
};

/**
 * Public PDP / buy-CTA gate. True only when catalog preview would
 * actually serve a configured L1 clip. Exposes no lesson ids or paths.
 */
export function resolveCourseStorefrontPreviewAvailable(input: {
  published: boolean;
  catalogListed: boolean;
  audioRows: readonly CourseStorefrontPreviewAvailabilityAudio[];
  level1AudioItemIds: ReadonlySet<string>;
}): boolean {
  if (!input.published || !input.catalogListed) {
    return false;
  }

  return input.audioRows.some(
    (row) =>
      isCourseStorefrontPreviewAudioReady(row) &&
      isCourseStorefrontPreviewClipEligible(
        row.id,
        row,
        input.level1AudioItemIds,
      ),
  );
}

/**
 * `null` = not a course, keep ordinary paid-practice preview CTA.
 * `false` = course without a playable storefront clip — hide the button.
 */
export function shouldShowPaidBuyPreviewCta(
  courseStorefrontPreviewAvailable: boolean | null,
): boolean {
  return courseStorefrontPreviewAvailable !== false;
}
