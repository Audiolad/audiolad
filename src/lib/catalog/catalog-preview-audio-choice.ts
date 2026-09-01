import {
  fromAudioPreviewWindowColumns,
  isConfiguredStorefrontPreviewWindow,
} from "@/lib/listen/preview-window";

export type CatalogPreviewAudioChoiceInput = {
  id: string;
  is_preview?: boolean | null;
  preview_start_ms?: number | null;
  preview_end_ms?: number | null;
};

export type CatalogPreviewAudioChoiceResult<T> =
  | { ok: true; row: T | null }
  | { ok: false; reason: "unavailable" };

/**
 * Pick the storefront preview audio row.
 * A requested audioItemId must belong to the already-scoped product rows
 * (fail closed). Courses still require a configured 30–90s window.
 */
export function chooseCatalogPreviewAudioRow<
  T extends CatalogPreviewAudioChoiceInput,
>(
  rows: readonly T[],
  options: {
    isCourse: boolean;
    audioItemId?: string | null;
  },
): CatalogPreviewAudioChoiceResult<T> {
  const requestedId = options.audioItemId?.trim() || null;

  if (requestedId) {
    const match = rows.find((item) => item.id === requestedId) ?? null;

    if (!match) {
      return { ok: false, reason: "unavailable" };
    }

    if (
      options.isCourse &&
      !isConfiguredStorefrontPreviewWindow(fromAudioPreviewWindowColumns(match))
    ) {
      return { ok: false, reason: "unavailable" };
    }

    return { ok: true, row: match };
  }

  let chosen =
    rows.find((item) =>
      isConfiguredStorefrontPreviewWindow(fromAudioPreviewWindowColumns(item)),
    ) ?? null;

  if (!chosen && !options.isCourse) {
    chosen = rows.find((item) => item.is_preview === true) ?? rows[0] ?? null;
  }

  if (options.isCourse && !chosen) {
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, row: chosen };
}
