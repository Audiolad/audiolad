import { isCoursePublication } from "@/lib/course-content/validators";
import { isRatingListenAccessMode } from "@/lib/listen/preview-access";
import type { ListenAccess } from "@/lib/listen/types";

/**
 * Stage 1 accrues only catalog listenables (practice / music / audio_post).
 * Courses keep existing access / clip / progress rules; eligibility is FOLLOW-UP.
 */
export function isListenStatsProductKind(
  productKind: string | null | undefined,
): boolean {
  return (
    productKind == null ||
    productKind === "practice" ||
    productKind === "music" ||
    productKind === "audio_post"
  );
}

export function canAccrueListenStats(input: {
  userId: string | null | undefined;
  access: ListenAccess | null;
  isCourse: boolean;
  productKind?: string | null;
}): boolean {
  if (!input.userId) {
    return false;
  }

  if (input.isCourse) {
    return false;
  }

  if (!isListenStatsProductKind(input.productKind)) {
    return false;
  }

  if (!input.access || !isRatingListenAccessMode(input.access.mode)) {
    return false;
  }

  return true;
}

/**
 * Rating eligibility stamp: entitled, author_preview, or legal catalog_preview.
 * catalog_preview still never grants full audio or progress. Courses remain
 * Stage 1 follow-up. Short preview does not invent a separate eligibility path.
 */
export function canBecomeRatingEligible(access: ListenAccess): boolean {
  return isRatingListenAccessMode(access.mode);
}

export function isCourseListenStatsFollowUp(
  publicationClass: string | null | undefined,
  productKind: string | null | undefined,
): boolean {
  return isCoursePublication(publicationClass, productKind);
}
