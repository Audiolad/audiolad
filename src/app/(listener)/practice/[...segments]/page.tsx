import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

import PracticeViewTracker from "@/components/analytics/PracticeViewTracker";
import PracticePageDesktop from "@/components/products/practice-page/PracticePageDesktop";
import PracticePageErrorState from "@/components/products/practice-page/PracticePageErrorState";
import PracticePageMobile from "@/components/products/practice-page/PracticePageMobile";
import type { PracticePageViewModel } from "@/components/products/practice-page/types";
import PromoPracticeTracker from "@/components/promo/PromoPracticeTracker";
import PromoPostSignupHandler from "@/components/promo/PromoPostSignupHandler";
import {
  buildProductCoverResponsiveProps,
  getProductCoverDisplayUrl,
  getProductCoverGradient,
  getProductCoverSymbol,
} from "@/lib/products/cover-display";
import { formatProductMeta, sumDurationSeconds } from "@/lib/products/duration";
import { loadPublicPracticeTopicsSafe } from "@/lib/products/practice-topics";
import {
  buildPracticeAccessPresentation,
  canUseBuyerPreviewMode,
} from "@/lib/products/practice-access-ui";
import { resolveProductAccess } from "@/lib/products/access";
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
} from "@/lib/products/paths";
import { loadPublicAudioItems } from "@/lib/products/public-audio-items";
import { resolveListeningNotice } from "@/lib/products/listening-notice";
import { buildProductCoverAlt } from "@/lib/seo/cover-alt";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ listen?: string; preview?: string }>;
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
      title: "Практика – АудиоЛад",
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
      title: "Практика – АудиоЛад",
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

  return {
    title: `${practice.title} – АудиоЛад`,
    description: trimmedDescription
      ? truncateDescription(trimmedDescription)
      : METADATA_DESCRIPTION_FALLBACK,
    alternates: {
      canonical: buildPracticeCanonicalUrl(authorSlug, productSlug),
    },
    openGraph: {
      url: buildPracticeCanonicalUrl(authorSlug, productSlug),
    },
  };
}

export default async function PracticePage({ params, searchParams }: PageProps) {
  const { segments } = await params;
  const { listen: listenParam, preview: previewParam } = await searchParams;
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

  const authorPreview =
    access.reason === "author_owner" && practice.status !== "published";

  let publicAudioItems: Awaited<ReturnType<typeof loadPublicAudioItems>> = [];

  try {
    publicAudioItems = await loadPublicAudioItems(supabase, {
      practiceId: practice.id,
      practiceStatus: practice.status,
      authorPreview,
      entitledAccess:
        access.canListen &&
        !authorPreview &&
        practice.status !== "published",
    });
  } catch {
    return <PracticePageErrorState />;
  }

  const buyerPreviewMode =
    previewParam === "buyer" && canUseBuyerPreviewMode(access);
  const practicePagePath = buildPracticePublicPath(
    resolvedAuthorSlug,
    practice.slug,
  );

  const presentation = buildPracticeAccessPresentation({
    access,
    practice,
    authorSlug: resolvedAuthorSlug,
    paymentsConfigured: isPaymentsConfigured(),
    isAuthenticated: Boolean(user),
    buyerPreviewMode,
  });

  const totalDurationSeconds = sumDurationSeconds(publicAudioItems);
  const authorName = getAuthorName(practice);
  const meta = formatProductMeta({
    format: practice.format,
    audioCount: publicAudioItems.length,
    totalDurationSeconds,
    durationMinutesFallback: practice.duration_minutes,
  });
  const description = practice.description?.trim() || null;
  const gradient = getProductCoverGradient(practice.slug);
  const symbol = getProductCoverSymbol(practice.slug);
  const coverAlt = buildProductCoverAlt({
    title: practice.title,
    authorName,
    format: practice.format,
  });
  const subtitle = practice.subtitle?.trim() || null;
  const listenDeniedMessage =
    listenParam === "required"
      ? "Для прослушивания необходимо приобрести доступ."
      : null;
  const promoConversionMode = shouldShowPromoConversionFlow({
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
    listenDeniedMessage,
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
  };

  return (
    <>
      {user ? (
        <PromoPostSignupHandler
          practiceId={practice.id}
          practiceSlug={practice.slug}
        />
      ) : null}
      {promoConversionMode ? (
        <PromoPracticeTracker
          practiceId={practice.id}
          practiceSlug={practice.slug}
        />
      ) : null}
      <PracticeViewTracker
        practiceId={practice.id}
        path={`/practice/${resolvedAuthorSlug}/${practice.slug}`}
      />
      <PracticePageMobile viewModel={viewModel} />
      <PracticePageDesktop viewModel={viewModel} />
    </>
  );
}
