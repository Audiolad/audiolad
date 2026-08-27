import type { SupabaseClient } from "@supabase/supabase-js";

import { filterPublicPracticeRows } from "@/lib/fixtures/test-fixture-marker";
import { getDisplayFormat } from "@/lib/author-products/format";
import {
  getProductKindLabel,
  isAudioPostProductKind,
  isMusicProductKind,
  normalizeProductKind,
  type ProductKind,
} from "@/lib/author-products/product-kind";
import {
  isProductGalleryEligible,
  parsePublicationClass,
  type PublicationClass,
} from "@/lib/author-products/publication-class";
import type { CatalogSlide } from "@/lib/catalog/dto";
import { loadPublicationGalleriesByIds } from "@/lib/catalog/publication-gallery";
import { getProductPriceLabel } from "@/lib/products/price-format";
import { loadPricePromotionsForPractices } from "@/lib/pricing/queries";
import { resolvePracticePrice } from "@/lib/pricing/resolve";
import { PRICE_SURFACES } from "@/lib/pricing/types";
import { formatRubles } from "@/lib/products/price-format";
import { buildPracticePublicPath } from "@/lib/products/paths";
import { mapProductCoverFields, type ProductCoverFields } from "@/lib/products/cover-display";
import { parseCatalogTopicKeyList } from "@/lib/catalog/topic-filter";
import { formatCatalogProductStats, formatProductMeta } from "@/lib/products/duration";
import {
  groupAudioSummariesByPractice,
  loadPublishedAudioSummaries,
} from "@/lib/products/public-audio-items";
import {
  applyOrdinaryCatalogEligibility,
  GUEST_ORDINARY_CATALOG_VIEWER,
  type OrdinaryCatalogViewer,
} from "@/lib/catalog/visibility-query";

type CatalogPracticeRow = {
  id: string;
  author_id: string | null;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  product_kind?: string | null;
  publication_class?: string | null;
  duration_minutes: number | null;
  price: number | null;
  is_free: boolean | null;
  cover_url: string | null;
  cover_image?: unknown;
  status: string | null;
  is_catalog_listed: boolean | null;
  catalog_visibility?: string | null;
  updated_at: string | null;
  published_at: string | null;
  created_at: string | null;
  authors: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

export type CatalogProduct = ProductCoverFields & {
  id: string;
  authorId: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  /** Defaults to practice when absent (legacy callers / partial maps). */
  productKind?: ProductKind;
  /** NULL on legacy rows. Adapter prefers this over productKind. */
  publicationClass?: PublicationClass | null;
  price: number | null;
  isFree: boolean;
  authorName: string | null;
  authorSlug: string | null;
  href: string;
  meta: string | null;
  statsLabel: string | null;
  productTypeLabel: string;
  priceLabel: string;
  compareAtPriceLabel?: string | null;
  promotionEndsAt?: string | null;
  sortTimestamp: number;
  audioCount?: number;
  durationSeconds?: number | null;
  publishedAt?: string | null;
  gallery?: CatalogSlide[];
};

export type CatalogSections = {
  freeProducts: CatalogProduct[];
  paidProducts: CatalogProduct[];
};

export type CatalogQueryOptions = {
  topicKey?: string | null;
  /** When set, only return products of this kind (e.g. practice-only SEO hubs). */
  productKind?: ProductKind | null;
  /**
   * Ordinary catalog personalization. Omit (guest) for listed-only public
   * showcases: home, sitemap, topic hubs, author page.
   */
  viewer?: OrdinaryCatalogViewer;
};

export async function getPublishedPracticeIdsForTopicKey(
  supabase: SupabaseClient,
  topicKey: string,
  viewer: OrdinaryCatalogViewer = GUEST_ORDINARY_CATALOG_VIEWER,
): Promise<string[]> {
  const topicKeys = parseCatalogTopicKeyList(topicKey);

  if (topicKeys.length === 0) {
    return [];
  }

  const { data: topicRows, error: topicError } = await supabase
    .from("topics")
    .select("id")
    .eq("is_active", true)
    .in("key", topicKeys);

  if (topicError || !topicRows?.length) {
    return [];
  }

  const topicIds = topicRows.map((row) => row.id as string);

  const { data: practiceRows, error: practicesError } =
    await applyOrdinaryCatalogEligibility(
      supabase.from("practices").select("id"),
      viewer,
    );

  if (practicesError) {
    return [];
  }

  const publishedPracticeIds = new Set(
    (practiceRows ?? []).map((row) => row.id as string),
  );

  if (publishedPracticeIds.size === 0) {
    return [];
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("practice_topics")
    .select("practice_id")
    .in("topic_id", topicIds)
    .in("practice_id", [...publishedPracticeIds]);

  if (assignmentError) {
    return [];
  }

  return [
    ...new Set((assignmentRows ?? []).map((row) => row.practice_id as string)),
  ];
}

function normalizeAuthor(
  authors: CatalogPracticeRow["authors"],
): { name: string; slug: string } | null {
  const author = Array.isArray(authors) ? authors[0] : authors;

  if (!author?.slug?.trim() || !author?.name?.trim()) {
    return null;
  }

  return {
    name: author.name.trim(),
    slug: author.slug.trim(),
  };
}

const CATALOG_PROGRAM_FORMATS = new Set([
  "Программа аудиопрактик",
  "Аудиокурс",
  "Цикл практик",
]);

/**
 * Programs are not a DB product_kind. They are derived from existing
 * practice data: multi-track products or known program formats.
 */
export function isComputedProgramProduct(
  audioCount: number,
  format: string | null | undefined,
  productKind?: string | null,
): boolean {
  if (isMusicProductKind(productKind) || isAudioPostProductKind(productKind)) {
    return false;
  }

  const trimmedFormat = typeof format === "string" ? format.trim() : "";

  return audioCount >= 2 || CATALOG_PROGRAM_FORMATS.has(trimmedFormat);
}

function getProductTypeLabel(
  audioCount: number,
  format: string | null,
  productKind?: string | null,
): string {
  if (isAudioPostProductKind(productKind)) {
    return getProductKindLabel(productKind);
  }

  if (isMusicProductKind(productKind)) {
    return getProductKindLabel(productKind);
  }

  if (isComputedProgramProduct(audioCount, format, productKind)) {
    return "Программа аудиопрактик";
  }

  return "Аудиопрактика";
}

function getSortTimestamp(
  publishedAt: string | null,
  createdAt: string | null,
): number {
  const publishedTime = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  const createdTime = createdAt ? Date.parse(createdAt) : Number.NaN;

  if (Number.isFinite(publishedTime)) {
    return publishedTime;
  }

  if (Number.isFinite(createdTime)) {
    return createdTime;
  }

  return 0;
}

export async function getPublishedCatalogProducts(
  supabase: SupabaseClient,
  options?: CatalogQueryOptions,
): Promise<CatalogProduct[]> {
  const topicKey = options?.topicKey?.trim().toLowerCase() || null;
  const viewer = options?.viewer ?? GUEST_ORDINARY_CATALOG_VIEWER;
  let practiceIdsForTopic: string[] | null = null;

  if (topicKey) {
    practiceIdsForTopic = await getPublishedPracticeIdsForTopicKey(
      supabase,
      topicKey,
      viewer,
    );

    if (practiceIdsForTopic.length === 0) {
      return [];
    }
  }

  let query = applyOrdinaryCatalogEligibility(
    supabase
      .from("practices")
      .select(
        `
      id,
      author_id,
      title,
      slug,
      subtitle,
      description,
      format,
      product_kind,
      publication_class,
      duration_minutes,
      price,
      is_free,
      cover_url,
      cover_image,
      status,
      is_catalog_listed,
      catalog_visibility,
      updated_at,
      published_at,
      created_at,
      authors!practices_author_id_fkey (
        name,
        slug
      )
    `,
      ),
    viewer,
  )
    .not("slug", "is", null)
    .not("author_id", "is", null);

  if (options?.productKind) {
    query = query.eq("product_kind", options.productKind);
  }

  if (practiceIdsForTopic) {
    query = query.in("id", practiceIdsForTopic);
  }

  const { data: practices, error } = await query;

  if (error) {
    return [];
  }

  const practiceRows = filterPublicPracticeRows(
    (practices ?? []) as CatalogPracticeRow[],
  );

  return mapPracticeRowsToCatalogProducts(supabase, practiceRows);
}

export async function mapPracticeRowsToCatalogProducts(
  supabase: SupabaseClient,
  practiceRows: CatalogPracticeRow[],
): Promise<CatalogProduct[]> {
  if (practiceRows.length === 0) {
    return [];
  }

  let audioSummaryMap = new Map<
    string,
    { audioCount: number; totalDurationSeconds: number }
  >();

  try {
    const summaries = await loadPublishedAudioSummaries(
      supabase,
      practiceRows.map((practice) => practice.id),
    );
    audioSummaryMap = groupAudioSummariesByPractice(summaries);
  } catch {
    audioSummaryMap = new Map();
  }

  const promotionsByPractice = await loadPricePromotionsForPractices(
    supabase,
    practiceRows.map((practice) => practice.id),
  );

  let galleriesByPublication = new Map<string, CatalogSlide[]>();

  try {
    galleriesByPublication = await loadPublicationGalleriesByIds(
      supabase,
      practiceRows.map((practice) => practice.id),
    );
  } catch {
    galleriesByPublication = new Map();
  }

  const products = practiceRows.flatMap((practice) => {
    const author = normalizeAuthor(practice.authors);

    if (!author || !practice.author_id) {
      return [];
    }

    const audioSummary = audioSummaryMap.get(practice.id);
    const audioCount = audioSummary?.audioCount ?? 0;
    const resolved = resolvePracticePrice({
      isFree: practice.is_free,
      basePrice: practice.price,
      promotions: promotionsByPractice.get(practice.id) ?? [],
      starts: [],
      surface: PRICE_SURFACES.CATALOG,
    });
    const catalogPrice = resolved.isFree ? practice.price : resolved.finalPrice;
    const compareAtPriceLabel =
      !resolved.isFree && resolved.promotion
        ? formatRubles(resolved.basePrice)
        : null;

    return [
      {
        id: practice.id,
        authorId: practice.author_id,
        title: practice.title,
        slug: practice.slug,
        subtitle: practice.subtitle?.trim() || null,
        description: practice.description?.trim() || null,
        format: practice.format?.trim() || null,
        productKind: normalizeProductKind(practice.product_kind),
        publicationClass: parsePublicationClass(practice.publication_class),
        price: catalogPrice,
        isFree: resolved.isFree,
        ...mapProductCoverFields(practice),
        authorName: author.name,
        authorSlug: author.slug,
        href: buildPracticePublicPath(author.slug, practice.slug),
        meta: formatProductMeta({
          format: isMusicProductKind(practice.product_kind)
            ? getProductKindLabel(practice.product_kind)
            : isAudioPostProductKind(practice.product_kind)
              ? getProductKindLabel(practice.product_kind)
            : practice.format,
          audioCount,
          totalDurationSeconds: audioSummary?.totalDurationSeconds ?? 0,
          durationMinutesFallback: practice.duration_minutes,
        }),
        statsLabel: formatCatalogProductStats({
          audioCount,
          totalDurationSeconds: audioSummary?.totalDurationSeconds ?? 0,
          durationMinutesFallback: practice.duration_minutes,
        }),
        productTypeLabel:
          isMusicProductKind(practice.product_kind) ||
          isAudioPostProductKind(practice.product_kind)
          ? getProductKindLabel(practice.product_kind)
          : (getDisplayFormat(practice.format) ??
            getProductTypeLabel(audioCount, practice.format, practice.product_kind)),
        priceLabel: resolved.isFree
          ? getProductPriceLabel(practice.price, practice.is_free)
          : formatRubles(resolved.finalPrice),
        compareAtPriceLabel,
        promotionEndsAt: resolved.promotion?.endsAt ?? null,
        sortTimestamp: getSortTimestamp(
          practice.published_at,
          practice.created_at,
        ),
        audioCount,
        durationSeconds:
          (audioSummary?.totalDurationSeconds ?? 0) > 0
            ? audioSummary?.totalDurationSeconds ?? null
            : null,
        publishedAt: practice.published_at,
        gallery: isProductGalleryEligible(
          practice.publication_class,
          practice.product_kind,
        )
          ? galleriesByPublication.get(practice.id) ?? []
          : [],
      },
    ];
  });

  return products.sort((left, right) => right.sortTimestamp - left.sortTimestamp);
}

export function splitCatalogProducts(products: CatalogProduct[]): CatalogSections {
  const freeProducts: CatalogProduct[] = [];
  const paidProducts: CatalogProduct[] = [];

  for (const product of products) {
    if (product.isFree) {
      freeProducts.push(product);
    } else if (typeof product.price === "number" && product.price > 0) {
      paidProducts.push(product);
    }
  }

  return { freeProducts, paidProducts };
}

export async function getPublishedCatalogSections(
  supabase: SupabaseClient,
  options?: CatalogQueryOptions,
): Promise<CatalogSections> {
  const products = await getPublishedCatalogProducts(supabase, options);
  return splitCatalogProducts(products);
}
