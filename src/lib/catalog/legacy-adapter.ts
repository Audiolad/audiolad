import { normalizeProductKind } from "@/lib/author-products/product-kind";
import { normalizeDurationSeconds } from "@/lib/products/duration";

import type {
  CatalogCard,
  CatalogCardAuthor,
  CatalogCover,
  CatalogDefaultOffer,
  CatalogSlide,
  CatalogViewer,
  PublicationClass,
} from "@/lib/catalog/dto";
import { getCatalogClassLabel } from "@/lib/catalog/dto";
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
  productKind?: string | null;
  price?: number | null;
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
};

const LEGACY_PRODUCT_KIND_TO_CLASS = {
  practice: "practice",
  music: "release",
  audio_post: "post",
} as const;

export function mapLegacyProductKindToClass(
  productKind: string | null | undefined,
): PublicationClass {
  const normalized = normalizeProductKind(productKind);

  return LEGACY_PRODUCT_KIND_TO_CLASS[normalized];
}

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

  return {
    access: "paid",
    price,
  };
}

function resolveViewer(
  publicationClass: PublicationClass,
  offer: CatalogDefaultOffer,
  isSaved: boolean,
): CatalogViewer {
  const canListen =
    publicationClass === "post" || offer?.access === "free";

  return {
    can_listen: canListen,
    has_grant: false,
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

  const publicationClass = mapLegacyProductKindToClass(source.productKind);
  const defaultOffer = resolveDefaultOffer(publicationClass, source);
  const gallery = normalizeCatalogGallery(source.gallery);

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
    display_label: getCatalogClassLabel(publicationClass),
    duration_seconds: resolveDurationSeconds(source),
    published_at: source.publishedAt?.trim() || null,
    paths: { pdp },
    default_offer: defaultOffer,
    viewer: resolveViewer(
      publicationClass,
      defaultOffer,
      source.isSaved === true,
    ),
    badges: [],
    progress: null,
    summary: {},
  };
}
