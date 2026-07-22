"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import PromoPagePresentation, {
  type PromoPagePresentationProduct,
} from "@/components/promo-pages/PromoPagePresentation";
import {
  getPromoProductPlayLabel,
  usePromoPagePlayback,
} from "@/components/promo-pages/usePromoPagePlayback";
import {
  resolvePromoPageAttribution,
  trackPromoPageCompletedOnce,
  trackPromoPageCtaClicked,
  trackPromoPagePlayStartedOnce,
  trackPromoPageViewedOnce,
} from "@/lib/promo-pages/analytics-client";
import { mapPublicPromoPageCtaBlock } from "@/lib/promo-pages/public-page";
import type { PublicPromoPageDto } from "@/lib/promo-pages/types";
import { readGuestPracticeProgress } from "@/lib/promo/guest-progress";
import {
  BOTTOM_NAV_CONTENT_GAP_PX,
  BOTTOM_NAV_MAIN_HEIGHT_PX,
} from "@/lib/navigation/bottom-nav";
import { GLOBAL_MINI_PLAYER_HEIGHT_PX, useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";

type PromoPublicPageClientProps = {
  page: PublicPromoPageDto;
  bannerUrl: string | null;
};

function mapProducts(page: PublicPromoPageDto): PromoPagePresentationProduct[] {
  return page.products.map((product) => ({
    practice_id: product.practice_id,
    slug: product.slug,
    title: product.title,
    format: product.format,
    duration_minutes: product.duration_minutes,
    cover_url: product.cover_url,
    cover_image: product.cover_image,
  }));
}

export default function PromoPublicPageClient({
  page,
  bannerUrl,
}: PromoPublicPageClientProps) {
  const searchParams = useSearchParams();
  const attribution = useMemo(
    () => resolvePromoPageAttribution(searchParams),
    [searchParams],
  );
  const { showMiniPlayer } = useGlobalAudioPlayer();
  const lastStartedPracticeRef = useRef<string | null>(null);

  const products = useMemo(() => mapProducts(page), [page]);
  const productSlugs = useMemo(
    () => products.map((product) => product.slug),
    [products],
  );

  const handlePlayStarted = useCallback(
    ({ practiceId, trackId }: { practiceId: string; trackId: string | null }) => {
      if (lastStartedPracticeRef.current === practiceId) {
        return;
      }

      lastStartedPracticeRef.current = practiceId;

      trackPromoPagePlayStartedOnce(
        page.promo_page_id,
        practiceId,
        trackId,
        attribution,
      );
    },
    [attribution, page.promo_page_id],
  );

  const {
    playProduct,
    loadingProductId,
    errorMessage,
    clearErrorMessage,
    activePracticeId,
    isPlaying,
    needsGesturePlay,
  } = usePromoPagePlayback({
    authorSlug: page.author_slug,
    productSlugs,
    onPlayStarted: handlePlayStarted,
  });
  const authorName = page.products[0]?.author_name ?? null;
  const authorSlug = page.author_slug;
  const cta = useMemo(() => mapPublicPromoPageCtaBlock(page), [page]);

  useEffect(() => {
    trackPromoPageViewedOnce(page.promo_page_id, attribution);
  }, [attribution, page.promo_page_id]);

  useEffect(() => {
    if (!activePracticeId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const progress = readGuestPracticeProgress(activePracticeId);

      if (!progress?.completed) {
        return;
      }

      trackPromoPageCompletedOnce(
        page.promo_page_id,
        activePracticeId,
        progress.trackId,
        attribution,
        progress.durationSeconds,
      );
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activePracticeId, attribution, page.promo_page_id]);

  const bottomPadding = showMiniPlayer
    ? GLOBAL_MINI_PLAYER_HEIGHT_PX +
      BOTTOM_NAV_MAIN_HEIGHT_PX +
      BOTTOM_NAV_CONTENT_GAP_PX +
      16
    : BOTTOM_NAV_MAIN_HEIGHT_PX + BOTTOM_NAV_CONTENT_GAP_PX + 16;

  function handleCtaClick() {
    if (!cta) {
      return;
    }

    trackPromoPageCtaClicked(
      page.promo_page_id,
      {
        position: "after_practices",
        destination_kind: cta.kind,
        destination_host: cta.host,
        open_mode: cta.openInNewTab ? "new_tab" : "same_tab",
      },
      attribution,
    );
  }

  return (
    <div
      className="px-5 py-6 xl:px-8 xl:py-8"
      style={{ paddingBottom: `${bottomPadding}px` }}
    >
      {authorSlug ? (
        <Link
          href={`/authors/${authorSlug}`}
          className="mb-4 inline-flex text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline"
        >
          ← Профиль автора
        </Link>
      ) : null}

      <PromoPagePresentation
        publicTitle={page.public_title}
        publicDescription={page.public_description}
        footerText={page.footer_text}
        cta={cta}
        products={products}
        authorName={authorName}
        authorSlug={authorSlug}
        bannerUrl={bannerUrl}
        interactiveMode
        onCtaClick={handleCtaClick}
        onPlayProduct={(product) => {
          clearErrorMessage();
          void playProduct(product.slug, product.practice_id);
        }}
        getPlayLabel={(product) =>
          getPromoProductPlayLabel(
            product.practice_id,
            activePracticeId,
            loadingProductId === product.practice_id,
            {
              isPlaying:
                isPlaying && activePracticeId === product.practice_id,
              needsGesturePlay:
                needsGesturePlay && activePracticeId === product.practice_id,
            },
          )
        }
        loadingProductId={loadingProductId}
        activeProductId={activePracticeId}
        playErrorMessage={errorMessage}
      />
    </div>
  );
}
