import type { ProductAccessResult } from "@/lib/products/access";
import { isPracticePublished } from "@/lib/products/access";

export const PRACTICE_PUBLISH_PREVIEW_QUERY_VALUE = "publish";
export const PRACTICE_PUBLISH_LISTENER_VIEW_QUERY_VALUE = "listener";

export function isPublishPreviewQuery(
  previewParam: string | null | undefined,
): boolean {
  return previewParam === PRACTICE_PUBLISH_PREVIEW_QUERY_VALUE;
}

export function isPublishListenerViewQuery(
  viewParam: string | null | undefined,
): boolean {
  return viewParam === PRACTICE_PUBLISH_LISTENER_VIEW_QUERY_VALUE;
}

/**
 * Publish-preview mode is available only to author workspace members
 * (same membership gate as listen/edit ownership on the practice page)
 * and only while the practice is not publicly published.
 * Published + ?preview=publish must not activate draft-preview UI.
 */
export function canActivatePublishPreviewMode(input: {
  previewParam: string | null | undefined;
  practiceStatus: string | null | undefined;
  access: Pick<ProductAccessResult, "isAuthorMember">;
}): boolean {
  return (
    isPublishPreviewQuery(input.previewParam) &&
    !isPracticePublished(input.practiceStatus) &&
    input.access.isAuthorMember
  );
}

/**
 * Clean listener-view of an unpublished product. Reuses publish-preview access
 * (owner/editor membership only) and never changes product status.
 * Guests / other workspaces cannot activate this via URL params alone.
 */
export function canActivatePublishListenerViewMode(input: {
  previewParam: string | null | undefined;
  viewParam: string | null | undefined;
  practiceStatus: string | null | undefined;
  access: Pick<ProductAccessResult, "isAuthorMember">;
}): boolean {
  return (
    canActivatePublishPreviewMode(input) &&
    isPublishListenerViewQuery(input.viewParam)
  );
}

/** First publication has never received published_at. */
export function requiresPublishPreviewBeforePublish(
  publishedAt: string | null | undefined,
): boolean {
  return publishedAt == null || publishedAt.trim() === "";
}

/**
 * Publish button visibility mirrors existing author mutation membership:
 * any author_members row that grants practice page ownership
 * (reason "author_owner" for owner|editor) may publish via the API.
 */
export function canPublishFromPublishPreview(
  access: Pick<ProductAccessResult, "isAuthorMember">,
): boolean {
  return access.isAuthorMember;
}

export function shouldIndexPracticePage(
  practiceStatus: string | null | undefined,
): boolean {
  return isPracticePublished(practiceStatus);
}

export function shouldTrackPracticeListenerAnalytics(input: {
  practiceStatus: string | null | undefined;
  publishPreviewMode: boolean;
}): boolean {
  return (
    isPracticePublished(input.practiceStatus) && !input.publishPreviewMode
  );
}

export const PUBLISH_PREVIEW_NOT_READY_MESSAGE =
  "Продукт пока не готов к публикации";

export function isPublishNotReadyResponse(payload: {
  publishReady?: boolean;
  error?: string;
}): boolean {
  if (payload.publishReady === false) {
    return true;
  }

  return payload.error === "publish_not_ready";
}
