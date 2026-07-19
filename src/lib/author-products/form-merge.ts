import {
  parsePracticeFormat,
} from "@/lib/author-products/format";
import {
  createDefaultListeningNoticeFormState,
} from "@/lib/products/listening-notice";
import type {
  AuthorProductDetail,
  AudioItemRow,
} from "@/lib/author-products/types";

export type ProductFormSnapshot = {
  authorId: string;
  title: string;
  subtitle: string;
  description: string;
  formatPreset: string;
  customFormat: string;
  slug: string;
  isFree: boolean;
  price: number;
  coverUrl: string | null;
  coverVersion: string | null;
  coverImage?: unknown;
  useSharedCover: boolean;
  listeningNoticeEnabled: boolean;
  listeningNoticeTitle: string;
  listeningNoticeText: string;
  status: string;
  publishedAt: string | null;
};

export function productDetailToFormSnapshot(
  product: AuthorProductDetail,
): ProductFormSnapshot {
  const practice = product.practice;
  const { preset, customFormat } = parsePracticeFormat(practice.format);
  const listeningDefaults = createDefaultListeningNoticeFormState();

  return {
    authorId: practice.author_id,
    title: practice.title,
    subtitle: practice.subtitle ?? "",
    description: practice.description ?? "",
    formatPreset: preset,
    customFormat,
    slug: practice.slug,
    isFree: practice.is_free === true,
    price: practice.is_free === true ? 99 : practice.price,
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
    formatPreset: current.formatPreset || server.formatPreset,
    customFormat: current.customFormat,
    isFree: current.isFree,
    price: current.price,
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
