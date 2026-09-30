import type {
  MaxPlaylistCardModel,
  MaxPlaylistDetail,
  MaxPlaylistDetailItem,
} from "@/lib/max/playlist-types";
import type { PlaylistListingItem } from "@/lib/playlists/listing-contract";
import type { PublicPlaylistItemView, PublicPlaylistView } from "@/lib/playlists/public-detail";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";

function displayUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.includes("\\")) {
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

export function toMaxPlaylistCard(item: PlaylistListingItem): MaxPlaylistCardModel {
  return {
    slug: item.slug,
    title: item.title,
    coverUrl: displayUrl(item.coverUrl),
    creator: item.creator,
    trackCount: item.trackCount,
    durationSeconds: item.durationSeconds,
    access: item.access,
    topics: item.topics.filter((topic) => topic.trim().length > 0),
  };
}

function toMaxPlaylistDetailItem(
  item: PublicPlaylistItemView,
): MaxPlaylistDetailItem {
  const authorSlug = item.authorSlug?.trim() || null;
  const productSlug = item.productSlug?.trim() || null;
  const audioItemId = item.audioItemId?.trim() || null;
  const coverUrl = displayUrl(
    getProductCoverDisplayUrl(item.coverUrl, item.updatedAt, item.coverImage),
  );

  return {
    key: `${item.position}:${authorSlug ?? ""}:${productSlug ?? ""}:${audioItemId ?? ""}`,
    position: item.position,
    title: item.title,
    authorName: item.authorName,
    authorSlug,
    productSlug,
    audioItemId,
    formatLabel: item.formatLabel,
    durationLabel: item.durationLabel,
    durationSeconds: item.durationSeconds,
    coverUrl,
    available: item.available && Boolean(authorSlug) && Boolean(productSlug),
  };
}

/** Public playlist view → MAX DTO. Playback ids are author, product, and audio item only. */
export function toMaxPlaylistDetail(detail: PublicPlaylistView): MaxPlaylistDetail {
  return {
    slug: detail.playlist.slug,
    title: detail.playlist.title,
    description: detail.playlist.description,
    ownerLabel: detail.ownerLabel,
    coverUrl: displayUrl(detail.coverUrl),
    mosaicCoverUrls: detail.mosaicCoverUrls.map((url) => displayUrl(url)),
    itemsCount: detail.itemsCount,
    availableCount: detail.availableCount,
    totalDurationLabel: detail.totalDurationLabel,
    hasUnavailable: detail.hasUnavailable,
    allUnavailable: detail.allUnavailable,
    items: detail.items.map(toMaxPlaylistDetailItem),
  };
}
