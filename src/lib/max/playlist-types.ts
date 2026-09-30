import {
  PLAYLIST_LISTING_ACCESS,
  type PlaylistListingAccess,
} from "@/lib/playlists/listing-contract";

/**
 * Safe MAX playlist catalog card. Listing internals stay on the server.
 */
export type MaxPlaylistCardModel = {
  slug: string;
  title: string;
  coverUrl: string | null;
  creator: string;
  trackCount: number;
  durationSeconds: number;
  access: PlaylistListingAccess;
  topics: string[];
};

export type MaxPlaylistDetailItem = {
  key: string;
  position: number;
  title: string;
  authorName: string | null;
  authorSlug: string | null;
  productSlug: string | null;
  audioItemId: string | null;
  formatLabel: string | null;
  durationLabel: string | null;
  durationSeconds: number | null;
  coverUrl: string | null;
  available: boolean;
};

export type MaxPlaylistDetail = {
  slug: string;
  title: string;
  description: string | null;
  ownerLabel: string;
  coverUrl: string | null;
  mosaicCoverUrls: Array<string | null>;
  itemsCount: number;
  availableCount: number;
  totalDurationLabel: string | null;
  hasUnavailable: boolean;
  allUnavailable: boolean;
  items: MaxPlaylistDetailItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeDisplayUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return null;
  }

  if (trimmed.startsWith("https://") || trimmed.startsWith("http://") || trimmed.startsWith("/")) {
    return trimmed;
  }

  return null;
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function isPlaylistAccess(value: unknown): value is PlaylistListingAccess {
  return (
    typeof value === "string" &&
    (PLAYLIST_LISTING_ACCESS as readonly string[]).includes(value)
  );
}

export function readMaxPlaylistCard(value: unknown): MaxPlaylistCardModel | null {
  if (!isRecord(value)) {
    return null;
  }

  const slug = safeText(value.slug);
  const title = safeText(value.title);
  const creator = safeText(value.creator);

  if (!slug || !title || !creator || !isPlaylistAccess(value.access)) {
    return null;
  }

  const topics = Array.isArray(value.topics)
    ? value.topics.filter((topic): topic is string => typeof topic === "string" && topic.trim().length > 0)
    : [];

  return {
    slug,
    title,
    coverUrl: safeDisplayUrl(value.coverUrl),
    creator,
    trackCount: safeCount(value.trackCount),
    durationSeconds: safeCount(value.durationSeconds),
    access: value.access,
    topics,
  };
}

export function readMaxPlaylistCatalogPayload(
  payload: unknown,
): { items: MaxPlaylistCardModel[]; nextCursor: string | null } | null {
  if (!isRecord(payload) || payload.ok !== true || !Array.isArray(payload.items)) {
    return null;
  }

  const items = payload.items
    .map((item) => readMaxPlaylistCard(item))
    .filter((item): item is MaxPlaylistCardModel => item !== null);
  const nextCursor = safeText(payload.nextCursor);

  return { items, nextCursor };
}

function readDetailItem(value: unknown, index: number): MaxPlaylistDetailItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = safeText(value.title);
  if (!title) {
    return null;
  }

  const position =
    typeof value.position === "number" && Number.isFinite(value.position)
      ? Math.floor(value.position)
      : index;

  return {
    key: `${position}:${safeText(value.authorSlug) ?? ""}:${safeText(value.productSlug) ?? ""}:${safeText(value.audioItemId) ?? ""}`,
    position,
    title,
    authorName: safeText(value.authorName),
    authorSlug: safeText(value.authorSlug),
    productSlug: safeText(value.productSlug),
    audioItemId: safeText(value.audioItemId),
    formatLabel: safeText(value.formatLabel),
    durationLabel: safeText(value.durationLabel),
    durationSeconds:
      typeof value.durationSeconds === "number" &&
      Number.isFinite(value.durationSeconds) &&
      value.durationSeconds > 0
        ? Math.floor(value.durationSeconds)
        : null,
    coverUrl: safeDisplayUrl(value.coverUrl),
    available: value.available === true,
  };
}

export function readMaxPlaylistDetailPayload(
  payload: unknown,
): MaxPlaylistDetail | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.detail)) {
    return null;
  }

  const detail = payload.detail;
  const slug = safeText(detail.slug);
  const title = safeText(detail.title);
  const ownerLabel = safeText(detail.ownerLabel);

  if (!slug || !title || !ownerLabel || !Array.isArray(detail.items)) {
    return null;
  }

  const mosaicCoverUrls = Array.isArray(detail.mosaicCoverUrls)
    ? detail.mosaicCoverUrls.map((url) => safeDisplayUrl(url))
    : [];

  return {
    slug,
    title,
    description: safeText(detail.description),
    ownerLabel,
    coverUrl: safeDisplayUrl(detail.coverUrl),
    mosaicCoverUrls,
    itemsCount: safeCount(detail.itemsCount),
    availableCount: safeCount(detail.availableCount),
    totalDurationLabel: safeText(detail.totalDurationLabel),
    hasUnavailable: detail.hasUnavailable === true,
    allUnavailable: detail.allUnavailable === true,
    items: detail.items
      .map((item, index) => readDetailItem(item, index))
      .filter((item): item is MaxPlaylistDetailItem => item !== null),
  };
}
