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
  | "listen_stats";

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
 * or listen-stats accrual. Course lesson audio is never opened by catalog preview.
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
    if (!input.courseAllowed) {
      return { ok: false, error: "forbidden" };
    }

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
    input.purpose === "preview_audio" &&
    input.catalogPreviewEligible
  ) {
    return {
      ok: true,
      access: { mode: "catalog_preview" },
      useServiceRoleStorage: true,
    };
  }

  return { ok: false, error: "forbidden" };
}
