import {
  isPracticeCatalogListed,
  isPracticePublished,
  type ProductAccessReason,
} from "@/lib/products/access";
import type { ListenAccess, ListenAccessMode } from "@/lib/listen/types";

export type ListenApiPurpose =
  | "full_audio"
  | "preview_audio"
  | "progress"
  | "listen_stats"
  | "rating";

export type ListenApiDecision =
  | { ok: true; access: ListenAccess; useServiceRoleStorage: boolean }
  | { ok: false; error: "forbidden" };

export function isCatalogStorefrontPreviewEligible(practice: {
  status: string | null | undefined;
  is_catalog_listed?: boolean | null;
  catalog_visibility?: string | null;
}): boolean {
  return (
    isPracticePublished(practice.status) && isPracticeCatalogListed(practice)
  );
}

export function isFullListenAccessMode(mode: ListenAccessMode): boolean {
  return mode === "entitled" || mode === "author_preview";
}

/**
 * Trusted MEDIA-TIME / rating gate only. Must stay out of full-access
 * checks: full_audio, signed full Storage URL, practice_audio_progress.
 */
export function isRatingListenAccessMode(mode: ListenAccessMode): boolean {
  return (
    mode === "entitled" ||
    mode === "author_preview" ||
    mode === "catalog_preview"
  );
}

export function isCatalogPreviewApiPurpose(purpose: ListenApiPurpose): boolean {
  return (
    purpose === "preview_audio" ||
    purpose === "listen_stats" ||
    purpose === "rating"
  );
}

export function canWritePracticeProgress(access: ListenAccess): boolean {
  return isFullListenAccessMode(access.mode);
}

export function shouldUseServiceRoleStorageForReason(
  reason: ProductAccessReason,
): boolean {
  return reason === "free" || reason === "guest_promo";
}

/**
 * Server source of truth for listen API audio vs progress vs listen-stats.
 * Client `preview=1` / playbackMode never grant full audio, progress writes,
 * or listen-stats accrual. Legal catalog_preview is minted only when the
 * backend already authorizes storefront preview — never from client flags.
 * Course lesson audio is never opened as full audio by catalog preview.
 * A published listed course may mint catalog_preview only for preview_audio;
 * the clip layer still requires a configured L1 30–90s window and fails closed.
 * Rating PUT and listen-stats use rating-listen access, not full-listen access.
 */
export function resolveListenApiDecision(input: {
  purpose: ListenApiPurpose;
  isCourse: boolean;
  courseAllowed: boolean;
  canListen: boolean;
  accessReason: ProductAccessReason;
  catalogPreviewEligible: boolean;
  listenAccess: ListenAccess | null;
}): ListenApiDecision {
  if (input.isCourse) {
    if (input.courseAllowed) {
      if (!input.listenAccess || !isFullListenAccessMode(input.listenAccess.mode)) {
        return { ok: false, error: "forbidden" };
      }

      return {
        ok: true,
        access: input.listenAccess,
        // Course lesson assets stay private and may still be draft while the
        // entitled buyer already has canonical course access.
        useServiceRoleStorage: true,
      };
    }

    if (input.purpose === "preview_audio" && input.catalogPreviewEligible) {
      return {
        ok: true,
        access: { mode: "catalog_preview" },
        useServiceRoleStorage: true,
      };
    }

    return { ok: false, error: "forbidden" };
  }

  if (input.canListen) {
    if (!input.listenAccess || !isFullListenAccessMode(input.listenAccess.mode)) {
      return { ok: false, error: "forbidden" };
    }

    return {
      ok: true,
      access: input.listenAccess,
      useServiceRoleStorage: shouldUseServiceRoleStorageForReason(
        input.accessReason,
      ),
    };
  }

  if (
    isCatalogPreviewApiPurpose(input.purpose) &&
    input.catalogPreviewEligible
  ) {
    return {
      ok: true,
      access: { mode: "catalog_preview" },
      useServiceRoleStorage: input.purpose === "preview_audio",
    };
  }

  return { ok: false, error: "forbidden" };
}
