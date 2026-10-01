import "server-only";

import { isPublicPracticeAppreciationVisible } from "@/lib/author-appreciation/public-product-visibility";
import { resolveAuthorAppreciationSettings } from "@/lib/author-appreciation/effective-visibility";
import {
  buildPracticeHeroLightMeta,
  resolvePracticeHeroSubtitle,
} from "@/lib/catalog/product-hero-gallery";
import { GUEST_ORDINARY_CATALOG_VIEWER } from "@/lib/catalog/visibility-query";
import { isCoursePublication } from "@/lib/course-content/validators";
import { resolveMaxExactPractice, type MaxExactPracticeDeps } from "@/lib/max/exact-product";
import { mapCuratedMaxRecommendations } from "@/lib/max/product-recommendations";
import { toMaxProductContentTracks, type MaxProductDetailView } from "@/lib/max/product-view";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import {
  getPublishedCatalogProducts,
  mapPracticeRowsToCatalogProducts,
} from "@/lib/products/catalog";
import { releaseDueScheduledPublications } from "@/lib/products/release-due-scheduled-publications";
import { loadPublicAudioItems } from "@/lib/products/public-audio-items";
import { loadPublicPracticeSeoContent } from "@/lib/products/practice-seo-content";
import { loadPublicPracticeTopicsSafe } from "@/lib/products/practice-topics";
import {
  type PublicPracticeAuthor,
  type PublicPracticeRow,
} from "@/lib/products/lookup";
import { EMPTY_RATING_AGGREGATE } from "@/lib/ratings/types";
import { isRatingsUiEnabled } from "@/lib/ratings/feature";
import { getPracticeRatingAggregate } from "@/lib/ratings/read";
import { MAX_AUTHOR_RECOMMENDATIONS } from "@/lib/seo/related-product-search";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const MAX_AUTHOR_RECOMMENDATIONS_LIMIT = MAX_AUTHOR_RECOMMENDATIONS;

export type MaxProductDetail = MaxProductDetailView & {
  authorSlug: string;
  productSlug: string;
};

export type GetMaxPublishedProductFn = (
  authorSlug: string,
  productSlug: string,
  userId?: string | null,
) => ReturnType<typeof getMaxPublishedProduct>;

type MaxProductDeps = MaxExactPracticeDeps & {
  createClient?: () => ReturnType<typeof createServiceRoleClient>;
  listCatalog?: typeof getPublishedCatalogProducts;
  mapProducts?: typeof mapPracticeRowsToCatalogProducts;
  loadTracks?: typeof loadPublicAudioItems;
  loadTopics?: typeof loadPublicPracticeTopicsSafe;
  loadSeo?: typeof loadPublicPracticeSeoContent;
  releaseScheduled?: typeof releaseDueScheduledPublications;
};

let productDeps: MaxProductDeps | null = null;

export function setMaxProductDepsForTests(deps: MaxProductDeps | null) {
  productDeps = deps;
}

const MOBILE_COVER_DISPLAY_WIDTH = 640;

function oneAuthor(
  authors: PublicPracticeRow["authors"],
): PublicPracticeAuthor | null {
  if (!authors) return null;
  return Array.isArray(authors) ? authors[0] ?? null : authors;
}

let productImpl: GetMaxPublishedProductFn | null = null;

export async function getMaxPublishedProduct(
  authorSlug: string,
  productSlug: string,
  userId: string | null = null,
): Promise<{ ok: true; product: MaxProductDetail | null } | { ok: false }> {
  if (productImpl) return productImpl(authorSlug, productSlug, userId);
  try {
    const normalizedAuthor = authorSlug.trim();
    const normalizedProduct = productSlug.trim();
    if (!normalizedAuthor || !normalizedProduct) return { ok: true, product: null };
    const service = productDeps?.createClient?.() ?? createServiceRoleClient();
    await (productDeps?.releaseScheduled ?? releaseDueScheduledPublications)();
    const exact = await resolveMaxExactPractice(
      service,
      normalizedAuthor,
      normalizedProduct,
      userId,
      {
        getPractice: productDeps?.getPractice,
        resolveAccess: productDeps?.resolveAccess,
      },
    );
    if (!exact.ok) {
      return exact.reason === "storage_unavailable"
        ? { ok: false }
        : { ok: true, product: null };
    }
    const listCatalog = productDeps?.listCatalog ?? getPublishedCatalogProducts;
    const products = await listCatalog(service, {
      viewer: GUEST_ORDINARY_CATALOG_VIEWER,
      throwOnStorageError: true,
    });
    let product =
      products.find(
        (item) =>
          item.authorSlug === normalizedAuthor && item.slug === normalizedProduct,
      ) ?? null;
    if (!product) {
      const mapProducts = productDeps?.mapProducts ?? mapPracticeRowsToCatalogProducts;
      const mapped = await mapProducts(service, [
        {
          id: exact.practice.id,
          author_id: exact.practice.author_id,
          title: exact.practice.title,
          slug: exact.practice.slug,
          subtitle: exact.practice.subtitle,
          description: exact.practice.description,
          format: exact.practice.format,
          product_kind: exact.practice.product_kind,
          publication_class: exact.practice.publication_class,
          duration_minutes: exact.practice.duration_minutes,
          price: exact.practice.price,
          is_free: exact.practice.is_free,
          cover_url: exact.practice.cover_url,
          cover_image: exact.practice.cover_image,
          status: exact.practice.status,
          is_catalog_listed: exact.practice.is_catalog_listed ?? null,
          catalog_visibility: exact.practice.catalog_visibility,
          updated_at: exact.practice.updated_at,
          published_at: exact.practice.published_at ?? null,
          scheduled_publish_at: exact.practice.scheduled_publish_at,
          created_at: null,
          authors: exact.practice.authors,
        },
      ]);
      product = mapped[0] ?? null;
    }
    if (!product) return { ok: true, product: null };

    const practice = exact.practice;

    const loadTracks = productDeps?.loadTracks ?? loadPublicAudioItems;
    const loadTopics = productDeps?.loadTopics ?? loadPublicPracticeTopicsSafe;
    const loadSeo = productDeps?.loadSeo ?? loadPublicPracticeSeoContent;
    const [tracks, topics, seoContent] = await Promise.all([
      loadTracks(service, {
        practiceId: product.id,
        practiceStatus: "published",
        authorPreview: false,
        publicationClass: product.publicationClass,
        productKind: product.productKind,
      }),
      loadTopics(service, product.id),
      loadSeo(
        service,
        product.id,
        practice.author_recommendations_title,
      ),
    ]);

    const catalogById = new Map(
      products.map((item) => [
        item.id,
        {
          id: item.id,
          authorSlug: item.authorSlug,
          slug: item.slug,
          subtitle: item.subtitle,
          authorName: item.authorName,
          productTypeLabel: item.productTypeLabel,
          coverUrl: item.coverUrl,
          priceLabel: item.priceLabel,
          isFree: item.isFree,
        },
      ]),
    );
    const recommendations = mapCuratedMaxRecommendations({
      currentPracticeId: product.id,
      related: seoContent.relatedProducts,
      catalogById,
    });

    const ratingsEnabled =
      isRatingsUiEnabled() &&
      !isCoursePublication(product.publicationClass, product.productKind);
    let ratingAggregate = EMPTY_RATING_AGGREGATE;
    if (ratingsEnabled) {
      try {
        ratingAggregate = await getPracticeRatingAggregate(product.id, service);
      } catch {
        ratingAggregate = EMPTY_RATING_AGGREGATE;
      }
    }

    const appreciationAuthor = oneAuthor(practice.authors);
    const settingsRow = appreciationAuthor?.author_appreciation_settings?.[0];
    const authorName = product.authorName?.trim() || appreciationAuthor?.name?.trim() || null;
    const appreciationVisible = authorName
      ? await isPublicPracticeAppreciationVisible({
          authorId: practice.author_id,
          accessStatus: appreciationAuthor?.access_status,
          settings: resolveAuthorAppreciationSettings(
            settingsRow
              ? {
                  enabled: settingsRow.listener_appreciation_enabled,
                  profileEnabled: settingsRow.listener_appreciation_profile_enabled,
                  freeProductsDefault:
                    settingsRow.listener_appreciation_free_products_default,
                }
              : null,
          ),
          product: {
            status: practice.status,
            isFree: practice.is_free,
            publicationClass: practice.publication_class,
            productKind: practice.product_kind,
            catalogVisibility: practice.catalog_visibility,
            isCatalogListed: practice.is_catalog_listed,
            override: practice.listener_appreciation_override,
          },
        })
      : false;

    const coverUrl =
      getProductCoverDisplayUrl(
        product.coverUrl,
        product.updatedAt,
        product.coverImage,
        MOBILE_COVER_DISPLAY_WIDTH,
        "lg",
      ) ?? product.coverUrl;

    return {
      ok: true,
      product: {
        authorSlug: normalizedAuthor,
        productSlug: product.slug,
        title: product.title,
        subtitle: resolvePracticeHeroSubtitle(product.subtitle, product.description),
        formatLabel: product.productTypeLabel,
        coverUrl,
        metaLine: buildPracticeHeroLightMeta({
          gallerySlides: product.gallery,
          productTypeLabel: null,
          formatMeta: product.statsLabel,
          authorName,
        }),
        priceLabel: product.priceLabel,
        isFree: product.isFree,
        gallery: (product.gallery ?? []).map((slide) => ({
          id: slide.id,
          image_url: slide.image_url,
          alt: slide.alt,
        })),
        topics,
        contents: toMaxProductContentTracks(tracks),
        recommendationsTitle: seoContent.authorRecommendationsTitle,
        recommendations,
        rating: {
          enabled: ratingsEnabled,
          aggregate: ratingAggregate,
        },
        appreciation: appreciationVisible && authorName ? { authorName } : null,
      },
    };
  } catch {
    return { ok: false };
  }
}

export function setGetMaxPublishedProductForTests(fn: GetMaxPublishedProductFn | null) {
  productImpl = fn;
}
