import { isCoursePublication } from "@/lib/course-content/validators";
import { isListenStatsProductKind } from "@/lib/listen/listen-stats-access";

import { isRatingsUiEnabled } from "./feature";

/**
 * PDP / mini-app rating block visibility. Eligibility gates stay on the server
 * at PUT time; this only decides whether the stars UI is rendered.
 *
 * Structured courses (publication_class=course with lesson rows) stay hidden
 * until course rating ships. Multi-track audio programs mis-tagged as course
 * without course_lessons keep the block.
 */
export function resolvePracticeRatingsUiEnabled(input: {
  publicationClass: string | null | undefined;
  productKind: string | null | undefined;
  hasStructuredCourseLessons: boolean;
  env?: { [key: string]: string | undefined };
}): boolean {
  if (!isRatingsUiEnabled(input.env)) {
    return false;
  }

  if (!isListenStatsProductKind(input.productKind)) {
    return false;
  }

  if (
    isCoursePublication(input.publicationClass, input.productKind) &&
    input.hasStructuredCourseLessons
  ) {
    return false;
  }

  return true;
}