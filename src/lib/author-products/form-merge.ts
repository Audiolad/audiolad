import {
  parsePracticeFormat,
} from "@/lib/author-products/format";
import {
  MUSIC_USAGE_PERMISSION,
  normalizeMusicUsagePermission,
  normalizeProductKind,
  type MusicUsagePermission,
  type ProductKind,
} from "@/lib/author-products/product-kind";
import {
  parsePublicationClass,
  type PublicationClass,
} from "@/lib/author-products/publication-class";
import {
  createDefaultListeningNoticeFormState,
} from "@/lib/products/listening-notice";
import type {
  AuthorProductDetail,
  AudioItemRow,
} from "@/lib/author-products/types";
import {
  parseCatalogVisibility,
  type CatalogVisibility,
} from "@/lib/products/catalog-visibility";

export type ProductFormSnapshot = {
  authorId: string;
  title: string;
  subtitle: string;
  description: string;
  productKind: ProductKind;
  publicationClass: PublicationClass | null;
  musicUsagePermission: MusicUsagePermission | null;
  formatPreset: string;
  customFormat: string;
  slug: string;
  isFree: boolean;
  price: number;
  isCatalogListed: boolean;
  catalogVisibility: CatalogVisibility;
  promoEnabled: boolean;
  promoTitle: string;
  promoText: string;
  promoButtonText: string;
  promoUrl: string;
  promoOpenInNewTab: boolean;
  coverUrl: string | null;
  coverVersion: string | null;
  coverImage?: unknown;
  useSharedCover: boolean;
  listeningNoticeEnabled: boolean;
  listeningNoticeTitle: string;
  listeningNoticeText: string;
  status: string;
  moderationStatus: string;
  moderationSubmittedAt: string | null;
  moderationReviewComment: string | null;
  moderationAttempt: number;
  publishedAt: string | null;
};

export function productDetailToFormSnapshot(
  product: AuthorProductDetail,
): ProductFormSnapshot {
  const practice = product.practice;
  const { preset, customFormat } = parsePracticeFormat(practice.format);
  const listeningDefaults = createDefaultListeningNoticeFormState();

  const productKind = normalizeProductKind(practice.product_kind);

  return {
    authorId: practice.author_id,
    title: practice.title,
    subtitle: practice.subtitle ?? "",
    description: practice.description ?? "",
    productKind,
    publicationClass: parsePublicationClass(practice.publication_class),
    musicUsagePermission:
      productKind === "music"
        ? (normalizeMusicUsagePermission(practice.music_usage_permission) ??
          MUSIC_USAGE_PERMISSION.LISTEN_ONLY)
        : null,
    formatPreset: preset,
    customFormat,
    slug: practice.slug,
    isFree: productKind === "audio_post" || practice.is_free === true,
    price:
      productKind === "audio_post"
        ? 0
        : practice.is_free === true
          ? 99
          : practice.price,
    isCatalogListed: practice.is_catalog_listed !== false,
    catalogVisibility: parseCatalogVisibility(
      practice.catalog_visibility,
      practice.is_catalog_listed,
    ),
    promoEnabled: practice.promo_enabled === true,
    promoTitle: practice.promo_title ?? "",
    promoText: practice.promo_text ?? "",
    promoButtonText: practice.promo_button_text ?? "",
    promoUrl: practice.promo_url ?? "",
    promoOpenInNewTab: practice.promo_open_in_new_tab === true,
    coverUrl: practice.cover_url,
    coverVersion: practice.cover_url ? practice.updated_at : null,
    coverImage: practice.cover_image ?? null,
    useSharedCover: practice.use_shared_cover !== false,
    listeningNoticeEnabled: practice.listening_notice_enabled !== false,
    listeningNoticeTitle:
      practice.listening_notice_title ?? listeningDefaults.listeningNoticeTitle,
    listeningNoticeText:
      practice.listening_notice_text ?? listeningDefaults.listeningNoticeText,
    status: practice.status,
    moderationStatus: practice.moderation_status ?? "not_submitted",
    moderationSubmittedAt: practice.moderation_submitted_at ?? null,
    moderationReviewComment: practice.moderation_review_comment ?? null,
    moderationAttempt: practice.moderation_attempt ?? 0,
    publishedAt: practice.published_at,
  };
}

/** Keep locally edited text; refresh server-owned metadata from API responses. */
export function mergeServerProductIntoForm(
  current: ProductFormSnapshot,
  product: AuthorProductDetail,
): ProductFormSnapshot {
  const server = productDetailToFormSnapshot(product);

  return {
    ...server,
    authorId: current.authorId || server.authorId,
    title: current.title.trim() ? current.title : server.title,
    subtitle: current.subtitle,
    description: current.description,
    productKind: current.productKind || server.productKind,
    publicationClass: current.publicationClass ?? server.publicationClass,
    musicUsagePermission:
      current.productKind === "music"
        ? (current.musicUsagePermission ?? server.musicUsagePermission)
        : null,
    formatPreset: current.formatPreset || server.formatPreset,
    customFormat: current.customFormat,
    isFree: current.productKind === "audio_post" ? true : current.isFree,
    price: current.productKind === "audio_post" ? 0 : current.price,
    isCatalogListed: current.isCatalogListed,
    catalogVisibility: current.catalogVisibility,
    promoEnabled: current.promoEnabled,
    promoTitle: current.promoTitle,
    promoText: current.promoText,
    promoButtonText: current.promoButtonText,
    promoUrl: current.promoUrl,
    promoOpenInNewTab: current.promoOpenInNewTab,
    useSharedCover: current.useSharedCover,
    listeningNoticeEnabled: current.listeningNoticeEnabled,
    listeningNoticeTitle: current.listeningNoticeTitle,
    listeningNoticeText: current.listeningNoticeText,
    coverUrl: server.coverUrl ?? current.coverUrl,
    coverVersion: server.coverUrl ? server.coverVersion : current.coverVersion,
  };
}

function findLocalAudioMatch(
  serverItem: AudioItemRow,
  serverIndex: number,
  localItems: AudioItemRow[],
  consumedLocalIds: Set<string>,
): AudioItemRow | null {
  const direct = localItems.find(
    (item) => item.id === serverItem.id && !consumedLocalIds.has(item.id),
  );

  if (direct) {
    return direct;
  }

  const byPosition = localItems.find(
    (item) =>
      item.position === serverItem.position && !consumedLocalIds.has(item.id),
  );

  if (byPosition) {
    return byPosition;
  }

  const tempItem = localItems.find(
    (item) => item.id.startsWith("temp-") && !consumedLocalIds.has(item.id),
  );

  if (tempItem && serverIndex === 0) {
    return tempItem;
  }

  const unconsumed = localItems.find((item) => !consumedLocalIds.has(item.id));

  return unconsumed ?? null;
}

/** Keep local titles/descriptions; refresh file metadata and ids from server. */
export function mergeServerAudioItems(
  localItems: AudioItemRow[],
  serverItems: AudioItemRow[],
): AudioItemRow[] {
  const consumedLocalIds = new Set<string>();

  return serverItems.map((serverItem, serverIndex) => {
    const localItem = findLocalAudioMatch(
      serverItem,
      serverIndex,
      localItems,
      consumedLocalIds,
    );

    if (!localItem) {
      return serverItem;
    }

    consumedLocalIds.add(localItem.id);

    return {
      ...serverItem,
      title: localItem.title.trim() ? localItem.title : serverItem.title,
      description: localItem.description ?? serverItem.description,
    };
  });
}

export function resolveAudioItemIdAfterDraftCreate(
  requestedId: string,
  localItemsBeforeCreate: AudioItemRow[],
  mergedItems: AudioItemRow[],
): string {
  if (!requestedId.startsWith("temp-")) {
    return requestedId;
  }

  const index = localItemsBeforeCreate.findIndex((item) => item.id === requestedId);

  if (index >= 0 && mergedItems[index]?.id) {
    return mergedItems[index].id;
  }

  return mergedItems[0]?.id ?? requestedId;
}
