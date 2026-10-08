/**
 * Pure helpers for the author product «Предпросмотр» / publish flow.
 *
 * Incident 7e416c9a (2026-10-08): the preview CTA saves the product first.
 * When that save failed validation (HTTP 400) the pre-opened preview tab was
 * closed and the reason was only rendered far away from the button, so the
 * author was silently bounced back to the editor. These helpers make the
 * failure reason concrete and keep the optional MP4 export out of the gate.
 */

export const PREVIEW_SAVE_FAILED_PREFIX = "Не удалось открыть предпросмотр";

const PREVIEW_SAVE_FAILED_FALLBACK_REASON = "проверьте отмеченные поля.";

export function formatPreviewSaveFailureMessage(
  reason: string | null | undefined,
): string {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.startsWith(PREVIEW_SAVE_FAILED_PREFIX)) {
    return trimmed;
  }
  return `${PREVIEW_SAVE_FAILED_PREFIX}: ${trimmed || PREVIEW_SAVE_FAILED_FALLBACK_REASON}`;
}

function firstNonEmpty(values: Iterable<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

export function firstProductSaveFailureReason(input: {
  error?: string | null;
  promoError?: string | null;
  topicError?: string | null;
  fieldErrors?: Record<string, string | null | undefined>;
  audioFieldErrors?: Record<
    string,
    { title?: string | null; description?: string | null } | null | undefined
  >;
}): string | null {
  const audioMessages: Array<string | null | undefined> = [];
  for (const entry of Object.values(input.audioFieldErrors ?? {})) {
    audioMessages.push(entry?.title, entry?.description);
  }

  return firstNonEmpty([
    input.error,
    input.promoError,
    input.topicError,
    ...Object.values(input.fieldErrors ?? {}),
    ...audioMessages,
  ]);
}

/** Server `validatePromoRecommendation` codes (audio-post recommendation block). */
export function isPromoRecommendationErrorCode(
  code: string | null | undefined,
): boolean {
  return typeof code === "string" && code.startsWith("promo_");
}

/**
 * The actions error sits next to «Предпросмотр» / «Опубликовать» /
 * «Отправить на модерацию». It must be visible in every state that renders
 * one of those CTAs, including bypass-moderation drafts and unpublished rows.
 */
export function shouldShowProductActionsError(input: {
  isDraft: boolean;
  isUnpublished: boolean;
  needsChanges: boolean;
}): boolean {
  return input.isDraft || input.isUnpublished || input.needsChanges;
}

export const PRODUCT_VIDEO_EXPORT_STATES = [
  "none",
  "queued",
  "processing",
  "completed",
  "failed",
] as const;

export type ProductVideoExportState =
  (typeof PRODUCT_VIDEO_EXPORT_STATES)[number];

/**
 * Contract: the optional MP4 export (AuthorProductVideoExport) is an
 * independent stage. No render state (none / queued / processing /
 * completed+downloaded / failed) may gate preview or ordinary publishing of a
 * ready audio product, and preview/publish must not start, cancel or
 * duplicate a render. Normal audio/cover/metadata/rights/moderation checks
 * stay where they are; they never read video export state.
 */
export function canOpenPreviewOrPublishDespiteVideoExport(
  state: ProductVideoExportState,
): true {
  void state;
  return true;
}
