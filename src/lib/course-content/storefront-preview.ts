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
