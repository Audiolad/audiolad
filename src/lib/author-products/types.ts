import { getProductPriceLabel } from "@/lib/products/price-format";
import type { AuthorAccessStatus } from "@/lib/authors/access";
import {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
} from "@/lib/authors/access";
import type {
  MusicUsagePermission,
  ProductKind,
} from "@/lib/author-products/product-kind";
import { normalizeProductKind } from "@/lib/author-products/product-kind";
import {
  getVisibleAuthorProductStatus,
  getVisibleAuthorProductStatusClassName,
  getVisibleAuthorProductStatusLabel,
} from "@/lib/author-products/moderation";

import { RECOMMENDED_PAID_PRICES_RUB } from "@/lib/pricing/money";

/** Recommended chips only. Authors may enter any integer ruble amount in range. */
export const PAID_PRICE_OPTIONS = RECOMMENDED_PAID_PRICES_RUB;

export type { MusicUsagePermission, ProductKind };

export const PRACTICE_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  UNPUBLISHED: "unpublished",
} as const;

export type PracticeStatus =
  (typeof PRACTICE_STATUS)[keyof typeof PRACTICE_STATUS];

export type AuthorMemberRole = "owner" | "editor";

export type AuthorWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: AuthorMemberRole;
  accessStatus: AuthorAccessStatus;
  canBypassProductModeration: boolean;
};

export type AudioItemRow = {
  id: string;
  practice_id: string;
  title: string;
  description: string | null;
  audio_path: string | null;
  cover_url: string | null;
  cover_image?: unknown;
  duration_seconds: number | null;
  original_file_name: string | null;
  file_size_bytes: number | null;
  position: number;
  is_preview: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PracticeRow = {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  product_kind: ProductKind;
  music_usage_permission: MusicUsagePermission | null;
  duration_minutes: number | null;
  price: number;
  is_free: boolean;
  is_catalog_listed: boolean;
  cover_url: string | null;
  cover_image?: unknown;
  use_shared_cover: boolean;
  audio_url: string | null;
  status: string;
  moderation_status: string;
  moderation_attempt: number;
  moderation_submitted_at: string | null;
  moderation_review_comment: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
  currency: string;
  published_at: string | null;
  listening_notice_enabled: boolean;
  listening_notice_title: string;
  listening_notice_text: string;
  promo_enabled: boolean;
  promo_title: string | null;
  promo_text: string | null;
  promo_button_text: string | null;
  promo_url: string | null;
  promo_open_in_new_tab: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthorProductListItem = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  product_kind: ProductKind;
  price: number;
  is_free: boolean;
  status: string;
  moderation_status: string;
  moderation_submitted_at: string | null;
  moderation_review_comment: string | null;
  moderation_attempt: number;
  cover_url: string | null;
  cover_image?: unknown;
  updated_at: string;
  audio_count: number;
};

export function coercePracticeRow(
  row: Omit<
    PracticeRow,
    | "product_kind"
    | "music_usage_permission"
    | "is_catalog_listed"
    | "moderation_status"
    | "moderation_attempt"
    | "moderation_submitted_at"
    | "moderation_review_comment"
    | "deleted_at"
    | "deleted_by"
    | "deletion_reason"
    | "promo_enabled"
    | "promo_title"
    | "promo_text"
    | "promo_button_text"
    | "promo_url"
    | "promo_open_in_new_tab"
  > & {
    product_kind?: string | null;
    music_usage_permission?: string | null;
    moderation_status?: string | null;
    moderation_attempt?: number | null;
    moderation_submitted_at?: string | null;
    moderation_review_comment?: string | null;
    deleted_at?: string | null;
    deleted_by?: string | null;
    deletion_reason?: string | null;
    is_catalog_listed?: boolean | null;
    promo_enabled?: boolean | null;
    promo_title?: string | null;
    promo_text?: string | null;
    promo_button_text?: string | null;
    promo_url?: string | null;
    promo_open_in_new_tab?: boolean | null;
  },
): PracticeRow {
  return {
    ...row,
    product_kind: normalizeProductKind(row.product_kind),
    music_usage_permission:
      row.music_usage_permission === "listen_only" ||
      row.music_usage_permission === "platform_reuse_allowed"
        ? row.music_usage_permission
        : null,
    moderation_status: row.moderation_status ?? "not_submitted",
    moderation_attempt: row.moderation_attempt ?? 0,
    moderation_submitted_at: row.moderation_submitted_at ?? null,
    moderation_review_comment: row.moderation_review_comment ?? null,
    deleted_at: row.deleted_at ?? null,
    deleted_by: row.deleted_by ?? null,
    deletion_reason: row.deletion_reason ?? null,
    is_catalog_listed: row.is_catalog_listed !== false,
    promo_enabled: row.promo_enabled === true,
    promo_title: row.promo_title ?? null,
    promo_text: row.promo_text ?? null,
    promo_button_text: row.promo_button_text ?? null,
    promo_url: row.promo_url ?? null,
    promo_open_in_new_tab: row.promo_open_in_new_tab === true,
  };
}

export type AuthorProductDetail = {
  practice: PracticeRow;
  audio_items: AudioItemRow[];
  /** True when entitlements or paid orders lock destructive content edits. */
  contentLockedAfterSale: boolean;
  /** True when a paid order blocks soft delete (narrower than content lock). */
  deleteLockedAfterPaidPurchase: boolean;
};

/**
 * Author-facing status label from technical fields.
 * Prefer passing moderationStatus; bare lifecycle status is accepted for
 * backward-compatible call sites that only have practice.status.
 */
export function getStatusLabel(
  status: string,
  moderationStatus?: string | null,
  deletedAt?: string | null,
): string {
  return getVisibleAuthorProductStatusLabel(
    getVisibleAuthorProductStatus({
      status,
      moderationStatus,
      deletedAt,
    }),
  );
}

export function getStatusClassName(
  status: string,
  moderationStatus?: string | null,
  deletedAt?: string | null,
): string {
  return getVisibleAuthorProductStatusClassName(
    getVisibleAuthorProductStatus({
      status,
      moderationStatus,
      deletedAt,
    }),
  );
}

export function formatPriceLabel(price: number, isFree: boolean): string {
  return getProductPriceLabel(price, isFree);
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export {
  authorAccessAllowsContentMutations,
  authorAccessAllowsPaidProducts,
};
