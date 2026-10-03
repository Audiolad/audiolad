/**
 * Safe Stage-1 MAX Аудиотека DTO.
 * Save is a bookmark. Entitlement is listen access.
 * canListen is never derived from isSaved.
 */

import {
  getLibraryFilterEmptyCta,
  LIBRARY_COLLECTION_FILTERS,
  type LibraryFilterId,
} from "@/lib/library/filters";
import {
  UNIFIED_LIBRARY_PLAYLIST_LABEL,
  type UnifiedCatalogLibraryEntry,
  type UnifiedLibraryDuration,
  type UnifiedLibraryEntry,
  type UnifiedPlaylistLibraryEntry,
} from "@/lib/library/unified-entry";
import {
  applyUnifiedLibraryView,
  type LibrarySortId,
} from "@/lib/library/unified-query";
import type { MaxCatalogProduct } from "@/lib/max/catalog-product";
import { isProductFree } from "@/lib/products/price-format";

export type MaxLibraryDuration = UnifiedLibraryDuration;

/** Stage-1 chips. Labels stay on LIBRARY_COLLECTION_FILTERS. */
export const MAX_LIBRARY_FILTERS: readonly LibraryFilterId[] = [
  "all",
  "saved",
  "purchased",
  "gifts",
  "playlists",
];

export const MAX_LIBRARY_CATALOG_KEYS = [
  "kind",
  "practiceId",
  "title",
  "coverUrl",
  "authorName",
  "authorSlug",
  "productSlug",
  "displayLabel",
  "duration",
  "isSaved",
  "canListen",
  "accessSource",
  "isFree",
  "price",
  "priceLabel",
  "sortAt",
] as const;

export const MAX_LIBRARY_PLAYLIST_KEYS = [
  "kind",
  "slug",
  "title",
  "coverUrl",
  "creator",
  "duration",
  "sortAt",
] as const;

export type MaxLibraryCatalogItem = {
  kind: "catalog";
  practiceId: string;
  title: string;
  coverUrl: string | null;
  authorName: string | null;
  authorSlug: string | null;
  productSlug: string | null;
  displayLabel: string | null;
  duration: MaxLibraryDuration | null;
  isSaved: boolean;
  canListen: boolean;
  accessSource: string | null;
  isFree: boolean | null;
  price: number | null;
  priceLabel: string | null;
  sortAt: number;
};

export type MaxLibraryPlaylistItem = {
  kind: "playlist";
  slug: string;
  title: string;
  coverUrl: string | null;
  creator: string;
  duration: MaxLibraryDuration | null;
  sortAt: number;
};

export type MaxLibraryItem = MaxLibraryCatalogItem | MaxLibraryPlaylistItem;

export function maxLibraryFilterOptions(): readonly { id: LibraryFilterId; label: string }[] {
  return LIBRARY_COLLECTION_FILTERS.filter((item) =>
    (MAX_LIBRARY_FILTERS as readonly string[]).includes(item.id),
  );
}

export function maxLibraryEmptyTab(
  filter: LibraryFilterId,
): "catalog" | "playlists" | null {
  if (filter === "playlists") {
    return "playlists";
  }

  if (
    filter === "uploads" ||
    filter === "personal" ||
    filter === "downloaded"
  ) {
    return null;
  }

  const cta = getLibraryFilterEmptyCta(filter);
  if (!cta) {
    return null;
  }

  return "catalog";
}

export function sanitizeMaxLibraryCoverUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.includes("\\") || trimmed.includes("..")) {
    return null;
  }

  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  return null;
}

function sanitizeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, max);
}

function sanitizeSlug(value: unknown): string | null {
  const text = sanitizeText(value, 160);
  if (!text || text.includes("/") || text.includes("\\")) {
    return null;
  }

  return text;
}

function sanitizeAccessSource(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || !/^[a-z0-9_]+$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function sanitizePrice(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function sanitizeSortAt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function sanitizeDuration(value: unknown): MaxLibraryDuration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as { unit?: unknown; value?: unknown };
  if (record.unit !== "minutes" && record.unit !== "seconds") {
    return null;
  }

  if (typeof record.value !== "number" || !Number.isFinite(record.value) || record.value <= 0) {
    return null;
  }

  return { unit: record.unit, value: record.value };
}

function sanitizeFlag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function buildMaxLibraryCatalogItem(input: {
  practiceId: unknown;
  title: unknown;
  coverUrl: unknown;
  authorName: unknown;
  authorSlug: unknown;
  productSlug: unknown;
  displayLabel: unknown;
  duration: unknown;
  isSaved: unknown;
  canListen: unknown;
  accessSource: unknown;
  isFree: unknown;
  price: unknown;
  priceLabel: unknown;
  sortAt: unknown;
}): MaxLibraryCatalogItem | null {
  const practiceId = sanitizeSlug(input.practiceId);
  const title = sanitizeText(input.title, 300);
  const isSaved = sanitizeFlag(input.isSaved);
  const canListen = sanitizeFlag(input.canListen);
  const sortAt = sanitizeSortAt(input.sortAt);

  if (!practiceId || !title || isSaved === null || canListen === null || sortAt === null) {
    return null;
  }

  const isFree = input.isFree === null || input.isFree === undefined
    ? null
    : sanitizeFlag(input.isFree);

  return {
    kind: "catalog",
    practiceId,
    title,
    coverUrl: sanitizeMaxLibraryCoverUrl(input.coverUrl),
    authorName: sanitizeText(input.authorName, 200),
    authorSlug: sanitizeSlug(input.authorSlug),
    productSlug: sanitizeSlug(input.productSlug),
    displayLabel: sanitizeText(input.displayLabel, 80),
    duration: sanitizeDuration(input.duration),
    isSaved,
    canListen,
    accessSource: sanitizeAccessSource(input.accessSource),
    isFree,
    price: sanitizePrice(input.price),
    priceLabel: sanitizeText(input.priceLabel, 40),
    sortAt,
  };
}

export function buildMaxLibraryPlaylistItem(input: {
  slug: unknown;
  title: unknown;
  coverUrl: unknown;
  creator: unknown;
  duration: unknown;
  sortAt: unknown;
}): MaxLibraryPlaylistItem | null {
  const slug = sanitizeSlug(input.slug);
  const title = sanitizeText(input.title, 300);
  const sortAt = sanitizeSortAt(input.sortAt);

  if (!slug || !title || sortAt === null) {
    return null;
  }

  return {
    kind: "playlist",
    slug,
    title,
    coverUrl: sanitizeMaxLibraryCoverUrl(input.coverUrl),
    creator: sanitizeText(input.creator, 200) ?? "",
    duration: sanitizeDuration(input.duration),
    sortAt,
  };
}

export function readMaxLibraryItem(value: unknown): MaxLibraryItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as { kind?: unknown };
  if (record.kind === "catalog") {
    return buildMaxLibraryCatalogItem(value as MaxLibraryCatalogItem);
  }

  if (record.kind === "playlist") {
    return buildMaxLibraryPlaylistItem(value as MaxLibraryPlaylistItem);
  }

  return null;
}

export function readMaxLibraryPayload(payload: unknown): MaxLibraryItem[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return null;
  }

  return items.flatMap((item) => {
    const parsed = readMaxLibraryItem(item);
    return parsed ? [parsed] : [];
  });
}

export function maxLibraryItemsToUnifiedEntries(
  items: readonly MaxLibraryItem[],
): UnifiedLibraryEntry[] {
  return items.flatMap((item): UnifiedLibraryEntry[] => {
    if (item.kind === "catalog") {
      const entry: UnifiedCatalogLibraryEntry = {
        id: `catalog:${item.practiceId}`,
        kind: "catalog",
        practiceId: item.practiceId,
        title: item.title,
        cover: { url: item.coverUrl },
        author: { name: item.authorName, slug: item.authorSlug },
        displayLabel: item.displayLabel,
        duration: item.duration,
        href: null,
        isSaved: item.isSaved,
        canListen: item.canListen,
        accessSource: item.accessSource,
        isFree: item.isFree,
        price: item.price,
        defaultOffer: null,
        practice: null,
        sortAt: item.sortAt,
      };
      return [entry];
    }

    const entry: UnifiedPlaylistLibraryEntry = {
      id: `playlist:${item.slug}`,
      kind: "playlist",
      playlistId: item.slug,
      slug: item.slug,
      title: item.title,
      cover: { url: item.coverUrl },
      author: { name: item.creator || null, slug: null },
      displayLabel: UNIFIED_LIBRARY_PLAYLIST_LABEL,
      duration: item.duration,
      href: null,
      isSaved: true,
      canListen: true,
      sortAt: item.sortAt,
    };
    return [entry];
  });
}

export function selectMaxLibraryItems(
  items: readonly MaxLibraryItem[],
  input: {
    filter: LibraryFilterId;
    query: string;
    sort: LibrarySortId;
  },
): UnifiedLibraryEntry[] {
  return applyUnifiedLibraryView(maxLibraryItemsToUnifiedEntries(items), input);
}

export function maxLibraryCatalogToProduct(
  item: MaxLibraryCatalogItem,
): MaxCatalogProduct | null {
  const authorSlug = item.authorSlug?.trim() ?? "";
  const slug = item.productSlug?.trim() ?? "";
  if (!authorSlug || !slug) {
    return null;
  }

  return {
    authorSlug,
    slug,
    title: item.title,
    subtitle: null,
    coverUrl: item.coverUrl,
    authorName: item.authorName,
    formatLabel: item.displayLabel ?? "",
    priceLabel: item.priceLabel ?? "",
    isFree: isProductFree(item.isFree, item.price),
    gallery: [],
  };
}
