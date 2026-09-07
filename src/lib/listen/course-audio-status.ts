import type { ListenAccessMode } from "@/lib/listen/types";

/**
 * Course lesson audio is referenced from course_lesson_blocks and stays
 * `audio_items.status = draft` until the parent course is published.
 * Entitled buyers may already open that unpublished course — the listen
 * session / signed URL must follow the same entitlement + level gate, not
 * the flat-product "published audio_item" rule.
 *
 * Author preview is unchanged (it never required published items).
 * Non-course entitled listen still requires published items.
 */
export function shouldFilterEntitledListenTracksToPublishedStatus(
  isCourse: boolean,
): boolean {
  return !isCourse;
}

export function shouldEnforcePublishedAudioItemForEntitledSignedUrl(
  isCourse: boolean,
): boolean {
  return !isCourse;
}

export function shouldApplyEntitledPublishedAudioFilter(input: {
  isCourse: boolean;
  accessMode: ListenAccessMode;
}): boolean {
  return (
    input.accessMode === "entitled" &&
    shouldFilterEntitledListenTracksToPublishedStatus(input.isCourse)
  );
}
