import { getProductKindLabel } from "@/lib/author-products/product-kind";
import {
  isProductGalleryClass,
  mapLegacyProductKindToClass,
  resolvePublicationClass,
} from "@/lib/author-products/publication-class";
import { normalizeDurationSeconds } from "@/lib/products/duration";

export { mapLegacyProductKindToClass, resolvePublicationClass };

import type {
  CatalogCard,
  CatalogCardAuthor,
  CatalogCover,
  CatalogDefaultOffer,
  CatalogSlide,
  CatalogViewer,
  PublicationClass,
} from "@/lib/catalog/dto";
import { normalizeCatalogGallery } from "@/lib/catalog/gallery";
import { catalogMoneyFromRubles } from "@/lib/catalog/offer";

/**
 * Temporary read-model taken from the legacy catalog fetch.
 * Adapter-only. New catalog UI must not import this type.
 */
export type LegacyCatalogSource = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  format?: string | null;
  productKind?: string | null;
  publicationClass?: PublicationClass | string | null;
  price?: number | null;
  compareAtPrice?: number | null;
  isFree?: boolean;
  coverUrl?: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
  authorName?: string | null;
  authorSlug?: string | null;
  href: string;
  publishedAt?: string | null;
  durationSeconds?: number | null;
  durationMinutesFallback?: number | null;
  gallery?: ReadonlyArray<Partial<CatalogSlide> | null | undefined> | null;
  topics?: CatalogCard["topics"];
  isSaved?: boolean;
  hasGrant?: boolean;
};

function resolveAuthor(
  source: LegacyCatalogSource,
): CatalogCardAuthor | null {
  const name = source.authorName?.trim() || "";
  const slug = source.authorSlug?.trim() || "";

  if (!name || !slug) {
    return null;
  }

  return { name, slug };
}

function resolveDurationSeconds(source: LegacyCatalogSource): number | null {
  const fromSeconds = normalizeDurationSeconds(source.durationSeconds);

  if (fromSeconds !== null) {
    return fromSeconds;
  }

  const minutes = source.durationMinutesFallback;

  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
    return Math.ceil(minutes) * 60;
  }

  return null;
}

function resolveCover(source: LegacyCatalogSource, title: string): CatalogCover {
  return {
    url: source.coverUrl?.trim() || null,
    alt: title,
    image: source.coverImage ?? null,
    updated_at: source.updatedAt ?? null,
  };
}

function resolveDefaultOffer(
  publicationClass: PublicationClass,
  source: LegacyCatalogSource,
): CatalogDefaultOffer {
  if (publicationClass === "post") {
    return null;
  }

  if (source.isFree === true) {
    return {
      access: "free",
      claim: "free_claim",
      price: null,
    };
  }

  const price = catalogMoneyFromRubles(source.price);

  if (!price) {
    return null;
  }

  const compareAtPrice = catalogMoneyFromRubles(source.compareAtPrice);
  const compareAt =
    compareAtPrice && compareAtPrice.amount_minor > price.amount_minor
      ? compareAtPrice
      : null;

  return {
    access: "paid",
    price,
    compare_at_price: compareAt,
  };
}

/**
 * Storefront chip: author/product format string, never Publication.class names.
 * Empty format uses the same defaults the author form already writes.
 */
function resolveDisplayLabel(source: LegacyCatalogSource): string {
  const format = source.format?.trim() || "";

  if (format) {
    return format;
  }

  return getProductKindLabel(source.productKind);
}

function resolveViewer(
  publicationClass: PublicationClass,
  offer: CatalogDefaultOffer,
  isSaved: boolean,
  hasGrant: boolean,
): CatalogViewer {
  const canListen =
    publicationClass === "post" || offer?.access === "free" || hasGrant;

  return {
    can_listen: canListen,
    has_grant: hasGrant,
    is_saved: isSaved,
  };
}

export function adaptLegacyCatalogSourceToCard(
  source: LegacyCatalogSource,
): CatalogCard | null {
  const author = resolveAuthor(source);
  const slug = source.slug?.trim() || "";
  const title = source.title?.trim() || "";
  const publicationId = source.id?.trim() || "";
  const pdp = source.href?.trim() || "";

  if (!author || !slug || !title || !publicationId || !pdp) {
    return null;
  }

  const publicationClass = resolvePublicationClass(
    source.publicationClass,
    source.productKind,
  );
  const defaultOffer = resolveDefaultOffer(publicationClass, source);
  const gallery = isProductGalleryClass(publicationClass)
    ? normalizeCatalogGallery(source.gallery)
    : [];

  return {
    publication_id: publicationId,
    class: publicationClass,
    slug,
    title,
    subtitle: source.subtitle?.trim() || null,
    cover: resolveCover(source, title),
    gallery,
    author,
    topics: source.topics ?? [],
    display_label: resolveDisplayLabel(source),
    duration_seconds: resolveDurationSeconds(source),
    published_at: source.publishedAt?.trim() || null,
    paths: { pdp },
    default_offer: defaultOffer,
    viewer: resolveViewer(
      publicationClass,
      defaultOffer,
      source.isSaved === true,
      source.hasGrant === true,
    ),
    badges: [],
    progress: null,
    summary: {},
  };
}
