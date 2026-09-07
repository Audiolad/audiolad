import { isCoursePublication } from "@/lib/course-content/validators";
import {
  isFullListenAccessMode,
} from "@/lib/listen/preview-access";
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

  if (!input.access || !isFullListenAccessMode(input.access.mode)) {
    return false;
  }

  return true;
}

/**
 * Rating eligibility stamp is allowed on full legal listen access only.
 * Author owners use `author_preview` and now follow the same 30s MEDIA-TIME
 * rule as listeners. catalog_preview / clip never become eligible.
 */
export function canBecomeRatingEligible(access: ListenAccess): boolean {
  return isFullListenAccessMode(access.mode);
}

export function isCourseListenStatsFollowUp(
  publicationClass: string | null | undefined,
  productKind: string | null | undefined,
): boolean {
  return isCoursePublication(publicationClass, productKind);
}
