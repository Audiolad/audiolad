import "server-only";

import { isPublicPracticeAppreciationVisible } from "@/lib/author-appreciation/public-product-visibility";
import { resolveAuthorAppreciationSettings } from "@/lib/author-appreciation/effective-visibility";
import {
  buildPracticeHeroLightMeta,
  resolvePracticeHeroSubtitle,
} from "@/lib/catalog/product-hero-gallery";
import { GUEST_ORDINARY_CATALOG_VIEWER } from "@/lib/catalog/visibility-query";
import { isCoursePublication } from "@/lib/course-content/validators";
import { mapCuratedMaxRecommendations } from "@/lib/max/product-recommendations";
import type { MaxProductDetailView } from "@/lib/max/product-view";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";
import { getPublishedCatalogProducts } from "@/lib/products/catalog";
import { loadPublicAudioItems } from "@/lib/products/public-audio-items";
import { loadPublicPracticeSeoContent } from "@/lib/products/practice-seo-content";
import { loadPublicPracticeTopicsSafe } from "@/lib/products/practice-topics";
import {
  getPracticeByAuthorAndSlug,
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
) => ReturnType<typeof getMaxPublishedProduct>;

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
): Promise<{ ok: true; product: MaxProductDetail | null } | { ok: false }> {
  if (productImpl) return productImpl(authorSlug, productSlug);
  try {
    const normalizedAuthor = authorSlug.trim();
    const normalizedProduct = productSlug.trim();
    if (!normalizedAuthor || !normalizedProduct) return { ok: true, product: null };
    const service = createServiceRoleClient();
    const products = await getPublishedCatalogProducts(service, {
      viewer: GUEST_ORDINARY_CATALOG_VIEWER,
      throwOnStorageError: true,
    });
    const product = products.find(
      (item) =>
        item.authorSlug === normalizedAuthor && item.slug === normalizedProduct,
    );
    if (!product) return { ok: true, product: null };

    const practiceResult = await getPracticeByAuthorAndSlug(
      service,
      normalizedAuthor,
      normalizedProduct,
    );
    if (practiceResult.error) return { ok: false };
    const practice = practiceResult.practice;
    if (!practice) return { ok: true, product: null };

    const [tracks, topics, seoContent] = await Promise.all([
      loadPublicAudioItems(service, {
        practiceId: product.id,
        practiceStatus: "published",
        authorPreview: false,
        publicationClass: product.publicationClass,
        productKind: product.productKind,
      }),
      loadPublicPracticeTopicsSafe(service, product.id),
      loadPublicPracticeSeoContent(
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
        contents: tracks.map((track) => ({
          title: track.title,
          position: track.position,
          durationSeconds: track.durationSeconds,
        })),
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
