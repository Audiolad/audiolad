import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

import PracticeViewTracker from "@/components/analytics/PracticeViewTracker";
import AudioPostPage from "@/components/products/audio-post/AudioPostPage";
import PracticePageContent from "@/components/products/practice-page/PracticePageContent";
import PracticePageErrorState from "@/components/products/practice-page/PracticePageErrorState";
import { BuyerPreviewExitControl } from "@/components/products/practice-page/PracticePageParts";
import type { PracticePageViewModel } from "@/components/products/practice-page/types";
import JsonLd from "@/components/seo/JsonLd";
import PromoPracticeTracker from "@/components/promo/PromoPracticeTracker";
import PromoPostSignupHandler from "@/components/promo/PromoPostSignupHandler";
import {
  buildProductCoverResponsiveProps,
  getProductCoverDisplayUrl,
  getProductCoverGradient,
  getProductCoverSymbol,
} from "@/lib/products/cover-display";
import { resolveProductCoverUrl } from "@/lib/images/resolve-display";
import { hasAcceptedCurrentAppreciationTerms } from "@/lib/author-appreciation/current-terms";
import {
  resolveAuthorAppreciationSettings,
  resolveAuthorAppreciationVisibility,
} from "@/lib/author-appreciation/effective-visibility";
import {
  getAuthorAppreciationRolloutConfig,
  isAuthorAppreciationRolloutEnabled,
} from "@/lib/author-appreciation/config";
import {
  AUDIO_POST_KIND_LABEL,
  getMusicProductTypeLabel,
  isAudioPostProductKind,
  isMusicProductKind,
  normalizeProductKind,
  PRODUCT_KIND,
} from "@/lib/author-products/product-kind";
import { resolvePublicPromoRecommendation } from "@/lib/products/promo-recommendation";
import { formatProductMeta, sumDurationSeconds } from "@/lib/products/duration";
import { loadPublicPracticeTopicsSafe } from "@/lib/products/practice-topics";
import {
  buildAuthorDashboardEditPath,
  buildPracticeAccessPresentation,
  canUseBuyerPreviewMode,
} from "@/lib/products/practice-access-ui";
import {
  isPracticePublished,
  resolveProductAccess,
} from "@/lib/products/access";
import { isFixtureMarkedPractice } from "@/lib/fixtures/test-fixture-marker";
import { isPaymentsConfigured } from "@/lib/payments/is-configured";
import { shouldShowPromoConversionFlow } from "@/lib/promo/access";
import {
  getPracticeAuthorSlug,
  getPracticeByAuthorAndSlug,
  resolveLegacyPracticePath,
  type PublicPracticeRow,
} from "@/lib/products/lookup";
import {
  buildListenPath,
  buildPracticeCanonicalUrl,
  buildPracticePublicPath,
  buildPracticePublishListenerPreviewPath,
  buildPracticePublishPreviewPath,
} from "@/lib/products/paths";
import { buildPracticePdpSocialTags } from "@/lib/products/practice-social-preview";
import {
  canActivatePublishListenerViewMode,
  canActivatePublishPreviewMode,
  canPublishFromPublishPreview,
  canRevealPublicProductPage,
  PRACTICE_UNAVAILABLE_METADATA,
  resolvePracticePageRobots,
  shouldIndexPracticePage,
  shouldTrackPracticeListenerAnalytics,
} from "@/lib/products/publish-preview";
import {
  loadPublicAudioItems,
  shouldLoadPublicAudioItemsOnProductPage,
} from "@/lib/products/public-audio-items";
import { resolvePublicListeningNotice } from "@/lib/products/listening-notice";
import { loadPublicPracticeSeoContent } from "@/lib/products/practice-seo-content";
import { buildProductCoverAlt } from "@/lib/seo/cover-alt";
import { buildPracticeJsonLd, shouldEmitPracticeJsonLd } from "@/lib/seo/json-ld";
import {
  resolveProductMetaDescription,
  resolveProductSeoTitle,
} from "@/lib/seo/product-metadata";
import { createSupabaseLibrarySavesStore } from "@/lib/library/saves";
import { createClient } from "@/lib/supabase/server";
import PricePromotionStartHandler from "@/components/pricing/PricePromotionStartHandler";
import {
  catalogGalleryForPublication,
  loadPublicationGalleriesByIds,
} from "@/lib/catalog/publication-gallery";
import {
  buildPracticeHeroLightMeta,
  isHeroPromoOfferActive,
  resolvePracticeHeroSubtitle,
} from "@/lib/catalog/product-hero-gallery";
import {
  canActivatePromoPreviewMode,
  resolveAuthorPromoPreview,
  resolvePromoPreviewPresentationFlags,
  shouldMountPricePromotionStartHandler,
} from "@/lib/pricing/author-promo-preview";
import { resolvePracticePrice } from "@/lib/pricing/resolve";
import { resolvePracticePriceRpc } from "@/lib/pricing/rpc";
import { loadPricePromotionsForPractice } from "@/lib/pricing/queries";
import { PRICE_SURFACES } from "@/lib/pricing/types";
import { readPriceVisitorId } from "@/lib/pricing/visitor";
import { isCoursePublication } from "@/lib/course-content/validators";
import { isRatingsUiEnabled } from "@/lib/ratings/feature";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{
    author_appreciation_preview?: string;
    listen?: string;
    preview?: string;
    view?: string;
    promo?: string;
    price_promo?: string;
    promo_preview?: string;
  }>;
};

const MOBILE_COVER_DISPLAY_WIDTH = 640;
const DESKTOP_COVER_DISPLAY_WIDTH = 480;

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function getAuthorName(practice: PublicPracticeRow): string | null {
  const author = normalizeOne(practice.authors);
  const name = author?.name?.trim();

  return name ? name : null;
}

async function resolvePracticeRoute(segments: string[]) {
  if (segments.length === 2) {
    return {
      authorSlug: segments[0],
      productSlug: segments[1],
    };
  }

  if (segments.length === 1) {
    const supabase = await createClient();

    const resolved = await resolveLegacyPracticePath(supabase, segments[0]);

    if (!resolved) {
      return null;
    }

    permanentRedirect(
      buildPracticePublicPath(resolved.authorSlug, resolved.productSlug),
    );
  }

  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { segments } = await params;

  if (segments.length === 1) {
    const supabase = await createClient();

    try {
      const resolved = await resolveLegacyPracticePath(supabase, segments[0]);

      if (!resolved) {
        return {
          robots: { index: false, follow: false },
        };
      }

      return {
        alternates: {
          canonical: buildPracticeCanonicalUrl(
            resolved.authorSlug,
            resolved.productSlug,
          ),
        },
        robots: { index: false, follow: true },
      };
    } catch {
      return {
        robots: { index: false, follow: false },
      };
    }
  }

  if (segments.length !== 2) {
    return { ...PRACTICE_UNAVAILABLE_METADATA };
  }

  const [authorSlug, productSlug] = segments;
  const supabase = await createClient();
  const { practice, error } = await getPracticeByAuthorAndSlug(
    supabase,
    authorSlug,
    productSlug,
  );

  if (error || !practice) {
    return { ...PRACTICE_UNAVAILABLE_METADATA };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let access;

  try {
    access = await resolveProductAccess(supabase, practice, user?.id ?? null);
  } catch {
    return { ...PRACTICE_UNAVAILABLE_METADATA };
  }

  if (
    !canRevealPublicProductPage({
      practiceStatus: practice.status,
      access,
      catalogVisibility: practice.catalog_visibility,
      isCatalogListed: practice.is_catalog_listed,
    })
  ) {
    return { ...PRACTICE_UNAVAILABLE_METADATA };
  }

  const canonical = buildPracticeCanonicalUrl(authorSlug, productSlug);
  const indexable = shouldIndexPracticePage(
    practice.status,
    practice.is_catalog_listed,
    practice.catalog_visibility,
  );
  const robots = resolvePracticePageRobots(
    practice.status,
    practice.is_catalog_listed,
    practice.catalog_visibility,
  );
  const seoInput = {
    title: practice.title,
    subtitle: practice.subtitle,
    description: practice.description,
    productKind: practice.product_kind,
    seoPrimaryQuery: practice.seo_primary_query,
    seoTitle: practice.seo_title,
    seoDescription: practice.seo_description,
  };
  const metaDescription = resolveProductMetaDescription(seoInput);
  const social = buildPracticePdpSocialTags({
    productTitle: practice.title,
    description: metaDescription,
    canonical,
    cover_url: practice.cover_url,
    cover_image: practice.cover_image,
    format: practice.format,
    productKind: practice.product_kind,
    authorName: getAuthorName(practice),
  });

  return {
    title: resolveProductSeoTitle(seoInput),
    description: metaDescription,
    alternates: {
      canonical,
    },
    openGraph: social.openGraph,
    twitter: social.twitter,
    robots: indexable ? undefined : robots,
  };
}

export default async function PracticePage({ params, searchParams }: PageProps) {
  const { segments } = await params;
  const {
    listen: listenParam,
    preview: previewParam,
    view: viewParam,
    promo: promoParam,
    price_promo: pricePromoParam,
    promo_preview: promoPreviewParam,
  } = await searchParams;
  const promoStartToken = (promoParam ?? pricePromoParam)?.trim() || null;
  const promoPreviewId = promoPreviewParam?.trim() || null;
  const route = await resolvePracticeRoute(segments);

  if (!route) {
    notFound();
  }

  const { authorSlug, productSlug } = route;
  const supabase = await createClient();
  const { practice, error } = await getPracticeByAuthorAndSlug(
    supabase,
    authorSlug,
    productSlug,
  );

  if (error) {
    return <PracticePageErrorState />;
  }

  if (!practice) {
    notFound();
  }

  const resolvedAuthorSlug = getPracticeAuthorSlug(practice) ?? authorSlug;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let access;

  try {
    access = await resolveProductAccess(supabase, practice, user?.id ?? null);
  } catch {
    return <PracticePageErrorState />;
  }

  if (
    !canRevealPublicProductPage({
      practiceStatus: practice.status,
      access,
      catalogVisibility: practice.catalog_visibility,
      isCatalogListed: practice.is_catalog_listed,
    })
  ) {
    notFound();
  }

  const promoPreviewMode = canActivatePromoPreviewMode({
    promoPreviewId,
    access,
  });
  const publishPreviewActivated = canActivatePublishPreviewMode({
    previewParam,
    practiceStatus: practice.status,
    access,
  });
  const publishListenerViewActivated = canActivatePublishListenerViewMode({
    previewParam,
    viewParam,
    practiceStatus: practice.status,
    access,
  });

  const authorPreview =
    access.reason === "author_owner" && !isPracticePublished(practice.status);

  let publicAudioItems: Awaited<ReturnType<typeof loadPublicAudioItems>> = [];

  try {
    publicAudioItems = shouldLoadPublicAudioItemsOnProductPage(
      practice.publication_class,
      practice.product_kind,
    )
      ? await loadPublicAudioItems(supabase, {
          practiceId: practice.id,
          practiceStatus: practice.status,
          authorPreview,
          entitledAccess:
            access.canListen &&
            !authorPreview &&
            !isPracticePublished(practice.status),
          publicationClass: practice.publication_class,
          productKind: practice.product_kind,
        })
      : [];
  } catch {
    return <PracticePageErrorState />;
  }

  const buyerPreviewActivated =
    !publishPreviewActivated &&
    previewParam === "buyer" &&
    canUseBuyerPreviewMode(access);
  const {
    publishPreviewMode,
    publishListenerViewMode,
    buyerPreviewMode,
  } = resolvePromoPreviewPresentationFlags({
    promoPreviewMode,
    practiceStatus: practice.status,
    publishPreviewMode: publishPreviewActivated,
    publishListenerViewMode: publishListenerViewActivated,
    buyerPreviewMode: buyerPreviewActivated,
    canUseBuyerPreview: canUseBuyerPreviewMode(access),
  });
  const practicePagePath = buildPracticePublicPath(
    resolvedAuthorSlug,
    practice.slug,
  );
  const publishPreviewPath = buildPracticePublishPreviewPath(
    resolvedAuthorSlug,
    practice.slug,
  );
  const publishListenerViewPath = buildPracticePublishListenerPreviewPath(
    resolvedAuthorSlug,
    practice.slug,
  );

  let resolvedPrice = promoPreviewMode
    ? await resolveAuthorPromoPreview({
        supabase,
        practiceId: practice.id,
        promotionId: promoPreviewId ?? "",
        isFree: practice.is_free,
        basePrice: practice.price,
        isAuthorMember: access.isAuthorMember,
      })
    : null;

  if (!promoPreviewMode) {
    const visitorId = await readPriceVisitorId();
    resolvedPrice = await resolvePracticePriceRpc({
      supabase,
      practiceId: practice.id,
      surface: PRICE_SURFACES.PRODUCT,
      visitorId,
      userId: user?.id ?? null,
    });
  } else if (!resolvedPrice) {
    resolvedPrice = resolvePracticePrice({
      isFree: practice.is_free,
      basePrice: practice.price,
      promotions: [],
      starts: [],
      surface: PRICE_SURFACES.PRODUCT,
    });
  }

  const shouldStartPromo = shouldMountPricePromotionStartHandler({
    promoStartToken,
    promoPreviewMode,
  });
  const validPromoStart =
    shouldStartPromo && promoStartToken
      ? (await loadPricePromotionsForPractice(supabase, practice.id)).some(
          (promotion) => promotion.startToken === promoStartToken,
        )
      : false;

  const presentation = buildPracticeAccessPresentation({
    access,
    practice: {
      ...practice,
      displayPrice: resolvedPrice?.finalPrice ?? practice.price,
      compareAtPrice: resolvedPrice?.promotion
        ? resolvedPrice.basePrice
        : null,
      promotionEndsAt: resolvedPrice?.promotion?.endsAt ?? null,
      promotionExpiresAt: resolvedPrice?.promotion?.expiresAt ?? null,
    },
    authorSlug: resolvedAuthorSlug,
    paymentsConfigured: isPaymentsConfigured(),
    isAuthenticated: Boolean(user),
    buyerPreviewMode,
    publishPreviewMode,
    publishListenerViewMode,
    promoPreviewMode,
  });

  const totalDurationSeconds = sumDurationSeconds(publicAudioItems);
  const authorName = getAuthorName(practice);
  const productKind = normalizeProductKind(practice.product_kind);
  const isAudioPost = isAudioPostProductKind(productKind);
  const appreciationAuthor = normalizeOne(practice.authors);
  const appreciationSettings = resolveAuthorAppreciationSettings(
    appreciationAuthor?.author_appreciation_settings?.[0]
      ? {
          enabled:
            appreciationAuthor.author_appreciation_settings[0]
              .listener_appreciation_enabled,
          profileEnabled:
            appreciationAuthor.author_appreciation_settings[0]
              .listener_appreciation_profile_enabled,
          freeProductsDefault:
            appreciationAuthor.author_appreciation_settings[0]
              .listener_appreciation_free_products_default,
        }
      : null,
  );
  const rollout = getAuthorAppreciationRolloutConfig();
  const currentTermsAccepted = await hasAcceptedCurrentAppreciationTerms(
    practice.author_id,
  );
  const showAuthorAppreciationPrototype =
    isAuthorAppreciationRolloutEnabled(rollout) &&
    resolveAuthorAppreciationVisibility({
      surface: "product",
      currentTermsAccepted,
      accessStatus: appreciationAuthor?.access_status,
      settings: appreciationSettings,
      product: {
        status: practice.status,
        isFree: practice.is_free,
        publicationClass: practice.publication_class,
        productKind: practice.product_kind,
        catalogVisibility: practice.catalog_visibility,
        isCatalogListed: practice.is_catalog_listed,
        override: practice.listener_appreciation_override,
      },
    });
  const musicTypeLabel = isMusicProductKind(productKind)
    ? getMusicProductTypeLabel()
    : null;
  const typeLabel = isAudioPost
    ? AUDIO_POST_KIND_LABEL
    : (musicTypeLabel ?? practice.format);
  const formatMeta = formatProductMeta({
    format: typeLabel,
    audioCount: isAudioPost ? 1 : publicAudioItems.length,
    totalDurationSeconds,
    durationMinutesFallback: practice.duration_minutes,
  });
  const galleryMap = await loadPublicationGalleriesByIds(supabase, [practice.id]);
  const gallerySlides = catalogGalleryForPublication(
    practice.publication_class,
    practice.product_kind,
    galleryMap.get(practice.id) ?? [],
  );
  const meta = buildPracticeHeroLightMeta({
    gallerySlides,
    productTypeLabel: typeLabel,
    formatMeta,
    authorName,
  });
  const recommendation = isAudioPost
    ? resolvePublicPromoRecommendation({
        promo_enabled: practice.promo_enabled === true,
        promo_title: practice.promo_title,
        promo_text: practice.promo_text,
        promo_button_text: practice.promo_button_text,
        promo_url: practice.promo_url,
        promo_open_in_new_tab: practice.promo_open_in_new_tab === true,
      })
    : null;
  const description = practice.description?.trim() || null;
  const gradient = getProductCoverGradient(practice.slug);
  const symbol = getProductCoverSymbol(practice.slug);
  const coverAlt = buildProductCoverAlt({
    title: practice.title,
    authorName,
    format: practice.format,
    productKind,
    audioCount: publicAudioItems.length,
  });
  const subtitle = resolvePracticeHeroSubtitle(
    practice.subtitle,
    practice.description,
  );
  const listenDeniedMessage =
    listenParam === "required"
      ? "Для прослушивания необходимо приобрести доступ."
      : null;
  const trackListenerAnalytics = shouldTrackPracticeListenerAnalytics({
    practiceStatus: practice.status,
    publishPreviewMode,
  });

  const promoConversionMode =
    trackListenerAnalytics &&
    shouldShowPromoConversionFlow({
      isAuthenticated: Boolean(user),
      hasEntitlement: access.hasEntitlement,
      canListen: access.canListen,
      accessReason: access.reason,
    });

  const promoListenPath = buildListenPath(resolvedAuthorSlug, practice.slug);

  const practiceTopics = await loadPublicPracticeTopicsSafe(
    supabase,
    practice.id,
  );
  const listeningNotice = resolvePublicListeningNotice(practice);
  const seoContent = await loadPublicPracticeSeoContent(
    supabase,
    practice.id,
    practice.author_recommendations_title,
  );

  const mobileCoverDisplayUrl = getProductCoverDisplayUrl(
    practice.cover_url,
    practice.updated_at,
    practice.cover_image,
    MOBILE_COVER_DISPLAY_WIDTH,
    "lg",
  );
  const mobileCoverResponsive = buildProductCoverResponsiveProps(
    practice.cover_url,
    practice.cover_image,
    practice.updated_at,
    MOBILE_COVER_DISPLAY_WIDTH,
    "lg",
  );
  const desktopCoverDisplayUrl = getProductCoverDisplayUrl(
    practice.cover_url,
    practice.updated_at,
    practice.cover_image,
    DESKTOP_COVER_DISPLAY_WIDTH,
    "lg",
  );
  const desktopCoverResponsive = buildProductCoverResponsiveProps(
    practice.cover_url,
    practice.cover_image,
    practice.updated_at,
    DESKTOP_COVER_DISPLAY_WIDTH,
    "lg",
  );

  let isSaved = false;

  if (user) {
    try {
      const savedIds = await createSupabaseLibrarySavesStore(
        supabase,
      ).listSavedPracticeIds(user.id, [practice.id]);
      isSaved = savedIds.includes(practice.id);
    } catch {
      isSaved = false;
    }
  }

  const priceOffer =
    !practice.is_free &&
    typeof (resolvedPrice?.basePrice ?? practice.price) === "number" &&
    (resolvedPrice?.basePrice ?? practice.price ?? 0) > 0
      ? {
          basePrice: resolvedPrice?.basePrice ?? practice.price ?? 0,
          salePrice: resolvedPrice?.salePrice ?? null,
          endsAt: resolvedPrice?.promotion?.endsAt ?? null,
          expiresAt: resolvedPrice?.promotion?.expiresAt ?? null,
          promotionType: resolvedPrice?.promotion?.promotionType ?? null,
          aboveTimerText: resolvedPrice?.promotion?.aboveTimerText ?? null,
          belowButtonText: resolvedPrice?.promotion?.belowButtonText ?? null,
        }
      : null;
  const promoStartPending =
    validPromoStart && !isHeroPromoOfferActive(priceOffer);

  const viewModel: PracticePageViewModel = {
    practice: {
      id: practice.id,
      slug: practice.slug,
      title: practice.title,
      duration_minutes: practice.duration_minutes,
      cover_url: practice.cover_url,
      cover_image: practice.cover_image,
      updated_at: practice.updated_at,
      use_shared_cover: practice.use_shared_cover ?? true,
    },
    isSaved,
    isAuthenticated: Boolean(user),
    authorId: practice.author_id,
    accessState: practice.is_free === true ? "free" : "paid",
    resolvedAuthorSlug,
    authorName,
    productTypeLabel: typeLabel,
    productKind,
    subtitle,
    description,
    seoContent,
    meta,
    gallerySlides,
    presentation,
    practicePagePath,
    promoListenPath,
    promoConversionMode,
    listenDeniedMessage: publishPreviewMode ? null : listenDeniedMessage,
    practiceTopics,
    publicAudioItems,
    listeningNotice,
    mobileCover: {
      displayUrl: mobileCoverDisplayUrl,
      responsive: mobileCoverResponsive,
      alt: coverAlt,
      gradient,
      symbol,
      displayWidth: MOBILE_COVER_DISPLAY_WIDTH,
    },
    desktopCover: {
      displayUrl: desktopCoverDisplayUrl,
      responsive: {
        ...desktopCoverResponsive,
        sizes: "(min-width: 1280px) 360px, 100vw",
      },
      alt: coverAlt,
      gradient,
      symbol,
      displayWidth: DESKTOP_COVER_DISPLAY_WIDTH,
    },
    priceOffer,
    promoStartToken,
    promoStartPending,
    showAuthorAppreciationPrototype,
    ratingsUiEnabled:
      isRatingsUiEnabled() &&
      !isCoursePublication(practice.publication_class, practice.product_kind),
    isAuthorOwner: Boolean(user?.id) && user?.id === practice.author_id,
    publishPreview:
      publishPreviewMode && !publishListenerViewMode
        ? {
            enabled: true,
            practiceId: practice.id,
            editHref: buildAuthorDashboardEditPath(practice.id),
            publicPath: practicePagePath,
            listenerViewHref: publishListenerViewPath,
            canPublish: canPublishFromPublishPreview(access),
          }
        : null,
  };

  const practiceCoverUrl = resolveProductCoverUrl(
    {
      cover_url: practice.cover_url,
      cover_image: practice.cover_image,
      updated_at: practice.updated_at,
    },
    DESKTOP_COVER_DISPLAY_WIDTH,
    "lg",
  );
  const structuredData = shouldEmitPracticeJsonLd({
    status: practice.status,
    isFixtureMarked: isFixtureMarkedPractice(practice),
    isCatalogListed: practice.is_catalog_listed,
    catalogVisibility: practice.catalog_visibility,
  })
    ? buildPracticeJsonLd({
        title: practice.title,
        description: practice.description,
        authorSlug: resolvedAuthorSlug,
        authorName: authorName ?? resolvedAuthorSlug,
        authorType: normalizeOne(practice.authors)?.author_type ?? "person",
        productSlug: practice.slug,
        imageUrl: practiceCoverUrl,
        isFree: practice.is_free,
        price: resolvedPrice?.finalPrice ?? practice.price,
        tracks: publicAudioItems.map((item) => ({
          name: item.title,
          position: item.position,
          durationSeconds: item.durationSeconds,
        })),
      })
    : null;

  return (
    <>
      {shouldMountPricePromotionStartHandler({
        promoStartToken,
        promoPreviewMode,
      }) && promoStartToken ? (
        <PricePromotionStartHandler token={promoStartToken} />
      ) : null}
      <JsonLd data={structuredData} />
      {trackListenerAnalytics && user ? (
        <PromoPostSignupHandler
          practiceId={practice.id}
          practiceSlug={practice.slug}
        />
      ) : null}
      {trackListenerAnalytics && promoConversionMode ? (
        <PromoPracticeTracker
          practiceId={practice.id}
          practiceSlug={practice.slug}
        />
      ) : null}
      {trackListenerAnalytics ? (
        <PracticeViewTracker
          practiceId={practice.id}
          path={practicePagePath}
          productKind={productKind}
        />
      ) : null}
      {presentation.showBuyerPreviewExit ? (
        <BuyerPreviewExitControl
          href={
            publishListenerViewMode ? publishPreviewPath : practicePagePath
          }
          label={
            publishListenerViewMode
              ? "Вернуться в предпросмотр автора"
              : "Вернуться в режим автора"
          }
          shortLabel={
            publishListenerViewMode
              ? "Вернуться в предпросмотр автора"
              : "К режиму автора"
          }
        />
      ) : null}
      {isAudioPost ? (
        <AudioPostPage
          viewModel={{
            ...viewModel,
            productKind: PRODUCT_KIND.AUDIO_POST,
            authorId: practice.author_id,
            recommendation,
          }}
        />
      ) : (
        <PracticePageContent viewModel={viewModel} />
      )}
    </>
  );
}
