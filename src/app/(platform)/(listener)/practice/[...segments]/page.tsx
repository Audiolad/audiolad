import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

import PracticeViewTracker from "@/components/analytics/PracticeViewTracker";
import AudioPostPage from "@/components/products/audio-post/AudioPostPage";
import PracticePageDesktop from "@/components/products/practice-page/PracticePageDesktop";
import PracticePageErrorState from "@/components/products/practice-page/PracticePageErrorState";
import PracticePageMobile from "@/components/products/practice-page/PracticePageMobile";
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
import {
  canActivatePublishListenerViewMode,
  canActivatePublishPreviewMode,
  canPublishFromPublishPreview,
  shouldIndexPracticePage,
  shouldTrackPracticeListenerAnalytics,
} from "@/lib/products/publish-preview";
import { loadPublicAudioItems } from "@/lib/products/public-audio-items";
import { resolveListeningNotice } from "@/lib/products/listening-notice";
import { buildProductCoverAlt } from "@/lib/seo/cover-alt";
import { buildPracticeJsonLd, shouldEmitPracticeJsonLd } from "@/lib/seo/json-ld";
import { createClient } from "@/lib/supabase/server";
import PricePromotionStartHandler from "@/components/pricing/PricePromotionStartHandler";
import { resolvePracticePriceRpc } from "@/lib/pricing/rpc";
import { PRICE_SURFACES } from "@/lib/pricing/types";
import { readPriceVisitorId } from "@/lib/pricing/visitor";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{
    listen?: string;
    preview?: string;
    view?: string;
    promo?: string;
    price_promo?: string;
  }>;
};

const METADATA_DESCRIPTION_FALLBACK =
  "Аудиопрактика на платформе АудиоЛад.";

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

function truncateDescription(text: string, maxLength = 160): string {
  const characters = [...text];

  if (characters.length <= maxLength) {
    return text;
  }

  return `${characters.slice(0, maxLength).join("").trimEnd()}…`;
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
    return {
      title: "Аудиопродукт – АудиоЛад",
      robots: { index: false, follow: false },
    };
  }

  const [authorSlug, productSlug] = segments;
  const supabase = await createClient();
  const { practice, error } = await getPracticeByAuthorAndSlug(
    supabase,
    authorSlug,
    productSlug,
  );

  if (error || !practice) {
    return {
      title: "Аудиопродукт – АудиоЛад",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const trimmedDescription =
    typeof practice.description === "string"
      ? practice.description.trim()
      : "";
  const canonical = buildPracticeCanonicalUrl(authorSlug, productSlug);
  const indexable = shouldIndexPracticePage(
    practice.status,
    practice.is_catalog_listed,
  );
  const isMusic = isMusicProductKind(practice.product_kind);
  const isAudioPost = isAudioPostProductKind(practice.product_kind);
  const descriptionFallback = isMusic
    ? "Музыкальный продукт на платформе АудиоЛад."
    : isAudioPost
      ? "Аудиопост на платформе АудиоЛад."
      : METADATA_DESCRIPTION_FALLBACK;
  const subtitle =
    typeof practice.subtitle === "string" ? practice.subtitle.trim() : "";
  const metaDescription = trimmedDescription
    ? truncateDescription(trimmedDescription)
    : subtitle
      ? truncateDescription(subtitle)
      : descriptionFallback;

  return {
    title: isAudioPost
      ? `${practice.title} – ${AUDIO_POST_KIND_LABEL} – АудиоЛад`
      : `${practice.title} – АудиоЛад`,
    description: metaDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      url: canonical,
    },
    robots: indexable
      ? undefined
      : {
          index: false,
          follow: false,
        },
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
  } = await searchParams;
  const promoStartToken = (promoParam ?? pricePromoParam)?.trim() || null;
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

  const publishPreviewMode = canActivatePublishPreviewMode({
    previewParam,
    practiceStatus: practice.status,
    access,
  });
  const publishListenerViewMode = canActivatePublishListenerViewMode({
    previewParam,
    viewParam,
    practiceStatus: practice.status,
    access,
  });

  const authorPreview =
    access.reason === "author_owner" && !isPracticePublished(practice.status);

  let publicAudioItems: Awaited<ReturnType<typeof loadPublicAudioItems>> = [];

  try {
    publicAudioItems = await loadPublicAudioItems(supabase, {
      practiceId: practice.id,
      practiceStatus: practice.status,
      authorPreview,
      entitledAccess:
        access.canListen &&
        !authorPreview &&
        !isPracticePublished(practice.status),
    });
  } catch {
    return <PracticePageErrorState />;
  }

  const buyerPreviewMode =
    !publishPreviewMode &&
    previewParam === "buyer" &&
    canUseBuyerPreviewMode(access);
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

  const visitorId = await readPriceVisitorId();
  const resolvedPrice = await resolvePracticePriceRpc({
    supabase,
    practiceId: practice.id,
    surface: PRICE_SURFACES.PRODUCT,
    visitorId,
    userId: user?.id ?? null,
  });

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
  });

  const totalDurationSeconds = sumDurationSeconds(publicAudioItems);
  const authorName = getAuthorName(practice);
  const productKind = normalizeProductKind(practice.product_kind);
  const isAudioPost = isAudioPostProductKind(productKind);
  const musicTypeLabel = isMusicProductKind(productKind)
    ? getMusicProductTypeLabel()
    : null;
  const typeLabel = isAudioPost
    ? AUDIO_POST_KIND_LABEL
    : (musicTypeLabel ?? practice.format);
  const meta = formatProductMeta({
    format: typeLabel,
    audioCount: isAudioPost ? 1 : publicAudioItems.length,
    totalDurationSeconds,
    durationMinutesFallback: practice.duration_minutes,
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
  const subtitle = practice.subtitle?.trim() || null;
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
  const listeningNotice = resolveListeningNotice(practice);

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
    resolvedAuthorSlug,
    authorName,
    subtitle,
    description,
    meta,
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
    priceOffer:
      !practice.is_free &&
      typeof (resolvedPrice?.basePrice ?? practice.price) === "number" &&
      (resolvedPrice?.basePrice ?? practice.price ?? 0) > 0
        ? {
            basePrice: resolvedPrice?.basePrice ?? practice.price ?? 0,
            salePrice: resolvedPrice?.salePrice ?? null,
            endsAt: resolvedPrice?.promotion?.endsAt ?? null,
            expiresAt: resolvedPrice?.promotion?.expiresAt ?? null,
            promotionType: resolvedPrice?.promotion?.promotionType ?? null,
          }
        : null,
    promoStartToken,
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
      {promoStartToken ? (
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
        <>
          <PracticePageMobile viewModel={viewModel} />
          <PracticePageDesktop viewModel={viewModel} />
        </>
      )}
    </>
  );
}
