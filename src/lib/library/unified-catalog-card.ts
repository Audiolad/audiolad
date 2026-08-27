/**
 * Library-only adapter: UnifiedCatalogLibraryEntry → CatalogCard.
 * Does not change /catalog listing or adaptLegacyCatalogSourceToCard.
 */

import type { CatalogCard } from "@/lib/catalog/dto";
import type { UnifiedCatalogLibraryEntry } from "@/lib/library/unified-entry";

function resolveDurationSeconds(
  entry: UnifiedCatalogLibraryEntry,
): number | null {
  if (!entry.duration) {
    return null;
  }

  if (entry.duration.unit === "seconds") {
    return entry.duration.value;
  }

  return Math.ceil(entry.duration.value) * 60;
}

export function unifiedCatalogEntryToCatalogCard(
  entry: UnifiedCatalogLibraryEntry,
): CatalogCard {
  const practice = entry.practice;
  const slug = practice?.slug?.trim() || entry.practiceId;
  const href = entry.href?.trim() || "/catalog";
  const authorName =
    entry.author.name?.trim() || practice?.authorName?.trim() || "\u00a0";
  const authorSlug =
    entry.author.slug?.trim() || practice?.authorSlug?.trim() || "author";

  return {
    publication_id: entry.practiceId,
    class: "practice",
    slug,
    title: entry.title,
    subtitle: null,
    cover: {
      url: entry.cover.url,
      alt: entry.title,
      image: entry.cover.image,
      updated_at: practice?.updatedAt ?? null,
    },
    gallery: [],
    author: {
      name: authorName,
      slug: authorSlug,
    },
    topics: [],
    display_label: entry.displayLabel ?? "",
    duration_seconds: resolveDurationSeconds(entry),
    published_at: null,
    paths: { pdp: href },
    default_offer: entry.defaultOffer,
    viewer: {
      can_listen: entry.canListen,
      has_grant: false,
      is_saved: entry.isSaved,
    },
    badges: [],
    progress: null,
    summary: {},
  };
}
