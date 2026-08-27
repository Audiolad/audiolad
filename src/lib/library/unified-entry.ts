/**
 * Unified Аудиотека entry contract (Stage 1).
 *
 * Maps existing library sources onto one discriminated list.
 * Save is a bookmark. Entitlement is listen access.
 * canListen is never derived from isSaved.
 */

import { getDisplayFormat } from "@/lib/author-products/format";
import type { CatalogDefaultOffer } from "@/lib/catalog/dto";
import { catalogMoneyFromRubles } from "@/lib/catalog/offer";
import type { LibraryCollectionItem } from "@/lib/library/collection";
import type { LibraryFilterItem } from "@/lib/library/filters";
import { getMyMaterialDisplayTitle } from "@/lib/personal-materials/client-library/display";
import { getPersonalMaterialTypeLabel } from "@/lib/personal-materials/client/status-labels";
import type {
  MyPersonalMaterialAvailability,
  MyPersonalMaterialListItemDto,
} from "@/lib/personal-materials/client-library/types";
import { buildPublicPlaylistPath } from "@/lib/playlists/public-url";
import type { PrivateAudioListItemDto } from "@/lib/private-audio/types";
import { isProductFree } from "@/lib/products/price-format";
import { buildPracticePublicPath } from "@/lib/products/paths";

export const UNIFIED_LIBRARY_PLAYLIST_LABEL = "Плейлист";
export const UNIFIED_LIBRARY_PRIVATE_AUDIO_LABEL = "Моя запись";

export type UnifiedLibraryKind =
  | "catalog"
  | "playlist"
  | "private_audio"
  | "personal";

export type UnifiedLibraryCover = {
  url: string | null;
  image?: unknown;
};

/** Explicit duration so Stage 2 does not guess minutes vs seconds. */
export type UnifiedLibraryDuration =
  | { unit: "minutes"; value: number }
  | { unit: "seconds"; value: number };

export type UnifiedLibraryAuthor = {
  name: string | null;
  slug: string | null;
};

type UnifiedLibraryEntryBase = {
  id: string;
  title: string;
  cover: UnifiedLibraryCover;
  author: UnifiedLibraryAuthor;
  displayLabel: string | null;
  duration: UnifiedLibraryDuration | null;
  href: string | null;
  isSaved: boolean;
  canListen: boolean;
  sortAt: number;
};

export type UnifiedCatalogLibraryEntry = UnifiedLibraryEntryBase & {
  kind: "catalog";
  practiceId: string;
  accessSource: string | null;
  isFree: boolean | null;
  price: number | null;
  defaultOffer: CatalogDefaultOffer;
  practice: LibraryCollectionItem["practice"];
};

export type UnifiedPlaylistLibraryEntry = UnifiedLibraryEntryBase & {
  kind: "playlist";
  playlistId: string;
  slug: string;
};

export type UnifiedPrivateAudioLibraryEntry = UnifiedLibraryEntryBase & {
  kind: "private_audio";
  privateAudioId: string;
};

export type UnifiedPersonalLibraryEntry = UnifiedLibraryEntryBase & {
  kind: "personal";
  personalMaterialId: string;
  materialType: string;
  availability: MyPersonalMaterialAvailability;
};

export type UnifiedLibraryEntry =
  | UnifiedCatalogLibraryEntry
  | UnifiedPlaylistLibraryEntry
  | UnifiedPrivateAudioLibraryEntry
  | UnifiedPersonalLibraryEntry;

export type PlaylistUnifiedSource = {
  id: string;
  slug: string;
  href?: string | null;
  title: string;
  coverUrl: string | null;
  creator: string;
  durationSeconds: number;
  savedAt?: string | null;
};

function parseTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveDuration(
  unit: UnifiedLibraryDuration["unit"],
  value: number | null | undefined,
): UnifiedLibraryDuration | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return { unit, value };
}

export function deriveCatalogDefaultOffer(
  practice: {
    isFree: boolean | null;
    price: number | null;
  } | null,
): CatalogDefaultOffer {
  if (!practice) {
    return null;
  }

  if (isProductFree(practice.isFree, practice.price)) {
    return {
      access: "free",
      claim: "free_claim",
      price: null,
    };
  }

  const price = catalogMoneyFromRubles(practice.price);

  if (!price) {
    return null;
  }

  return {
    access: "paid",
    price,
  };
}

export function mapCatalogLibraryEntry(
  item: LibraryCollectionItem,
): UnifiedCatalogLibraryEntry {
  const practice = item.practice;
  const authorSlug = practice?.authorSlug?.trim() || null;
  const productSlug = practice?.slug?.trim() || "";
  const href =
    authorSlug && productSlug
      ? buildPracticePublicPath(authorSlug, productSlug)
      : null;

  return {
    id: `catalog:${item.practiceId}`,
    kind: "catalog",
    practiceId: item.practiceId,
    title: practice?.title.trim() || "Практика временно недоступна",
    cover: {
      url: practice?.coverUrl ?? null,
      image: practice?.coverImage ?? null,
    },
    author: {
      name: practice?.authorName ?? null,
      slug: authorSlug,
    },
    displayLabel: getDisplayFormat(practice?.format) ?? null,
    duration: toPositiveDuration("minutes", practice?.durationMinutes),
    href,
    isSaved: item.isSaved,
    canListen: item.canListen,
    accessSource: item.accessSource,
    isFree: practice?.isFree ?? null,
    price: practice?.price ?? null,
    defaultOffer: deriveCatalogDefaultOffer(practice),
    practice,
    sortAt: parseTimestamp(item.grantedAt),
  };
}

export function mapPlaylistLibraryEntry(
  item: PlaylistUnifiedSource,
): UnifiedPlaylistLibraryEntry {
  const slug = item.slug.trim();
  const href = item.href?.trim() || (slug ? buildPublicPlaylistPath(slug) : null);

  return {
    id: `playlist:${item.id}`,
    kind: "playlist",
    playlistId: item.id,
    slug,
    title: item.title,
    cover: {
      url: item.coverUrl,
    },
    author: {
      name: item.creator || null,
      slug: null,
    },
    displayLabel: UNIFIED_LIBRARY_PLAYLIST_LABEL,
    duration: toPositiveDuration("seconds", item.durationSeconds),
    href,
    isSaved: true,
    // Opening the playlist page is allowed. This is not a track grant.
    canListen: true,
    sortAt: parseTimestamp(item.savedAt),
  };
}

export function mapPrivateAudioLibraryEntry(
  item: PrivateAudioListItemDto,
): UnifiedPrivateAudioLibraryEntry {
  const authorName = item.authorText?.trim() || null;

  return {
    id: `private:${item.id}`,
    kind: "private_audio",
    privateAudioId: item.id,
    title: item.title,
    cover: {
      url: item.coverUrl,
    },
    author: {
      name: authorName,
      slug: null,
    },
    displayLabel: UNIFIED_LIBRARY_PRIVATE_AUDIO_LABEL,
    duration: toPositiveDuration("seconds", item.durationSeconds),
    href: `/my-library/private-audio/${item.id}`,
    isSaved: false,
    canListen: true,
    sortAt: parseTimestamp(item.createdAt),
  };
}

export function mapPersonalLibraryEntry(
  item: MyPersonalMaterialListItemDto,
): UnifiedPersonalLibraryEntry {
  return {
    id: `personal:${item.id}`,
    kind: "personal",
    personalMaterialId: item.id,
    materialType: item.materialType,
    availability: item.availability,
    title: getMyMaterialDisplayTitle(item.title, item.materialType),
    cover: {
      url: null,
    },
    author: {
      name: item.author.name || null,
      slug: item.author.slug,
    },
    displayLabel: getPersonalMaterialTypeLabel(item.materialType),
    duration: toPositiveDuration("seconds", item.progress.durationSeconds),
    href: `/my-materials/${item.id}`,
    isSaved: false,
    canListen: item.availability === "available" && item.hasAudio,
    sortAt: parseTimestamp(item.claimedAt),
  };
}

export function compareUnifiedLibraryEntries(
  left: Pick<UnifiedLibraryEntry, "id" | "sortAt">,
  right: Pick<UnifiedLibraryEntry, "id" | "sortAt">,
): number {
  if (left.sortAt !== right.sortAt) {
    return right.sortAt - left.sortAt;
  }

  return left.id.localeCompare(right.id);
}

export function assembleUnifiedLibrary(input: {
  catalogItems?: LibraryCollectionItem[];
  catalogError?: boolean;
  playlistItems?: PlaylistUnifiedSource[];
  playlistError?: boolean;
  privateAudioItems?: PrivateAudioListItemDto[];
  privateAudioError?: boolean;
  personalItems?: MyPersonalMaterialListItemDto[];
  personalError?: boolean;
}): { entries: UnifiedLibraryEntry[]; error: boolean } {
  const entries = [
    ...(input.catalogItems ?? []).map(mapCatalogLibraryEntry),
    ...(input.playlistItems ?? []).map(mapPlaylistLibraryEntry),
    ...(input.privateAudioItems ?? []).map(mapPrivateAudioLibraryEntry),
    ...(input.personalItems ?? []).map(mapPersonalLibraryEntry),
  ].sort(compareUnifiedLibraryEntries);

  return {
    entries,
    error: Boolean(
      input.catalogError ||
        input.playlistError ||
        input.privateAudioError ||
        input.personalError,
    ),
  };
}

/**
 * Later-UI adapter. Does not change chip labels or matchesLibraryFilter.
 * Non-catalog kinds have no catalog practice / accessSource.
 */
export function unifiedEntryToLibraryFilterItem(
  entry: UnifiedLibraryEntry,
): LibraryFilterItem {
  if (entry.kind !== "catalog") {
    return {
      accessSource: null,
      isSaved: entry.isSaved,
      canListen: entry.canListen,
      practice: null,
    };
  }

  return {
    accessSource: entry.accessSource,
    isSaved: entry.isSaved,
    canListen: entry.canListen,
    practice: entry.practice
      ? {
          isFree: entry.practice.isFree,
          price: entry.practice.price,
        }
      : {
          isFree: entry.isFree,
          price: entry.price,
        },
  };
}
