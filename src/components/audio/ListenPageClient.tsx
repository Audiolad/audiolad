"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";
import PromoPostSignupHandler, {
  PromoSignupSuccessBanner,
} from "@/components/promo/PromoPostSignupHandler";
import {
  parsePromoAttributionFromSearchParams,
  resolvePromoAttribution,
} from "@/lib/promo/attribution";
import {
  shouldRunPromoPostSignupHandler,
} from "@/lib/promo/post-signup";
import {
  guestProgressToListenEntries,
  readGuestPracticeProgress,
} from "@/lib/promo/guest-progress";
import type { CatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import {
  isCatalogGlobalPlayerSession,
} from "@/lib/listen/global-player-types";

type ListenPageClientProps = CatalogGlobalPlayerSession & {
  autoplay?: boolean;
  promoConversionMode?: boolean;
  isAuthenticated?: boolean;
};

export default function ListenPageClient({
  autoplay = false,
  practiceId,
  authorSlug,
  productSlug,
  practiceTitle,
  authorName,
  format,
  tracks,
  initialProgress,
  coverSymbol,
  coverGradient,
  coverImageUrl,
  coverImage,
  coverUpdatedAt,
  isAuthorPreview,
  promoConversionMode = false,
  isAuthenticated = false,
  guestProgressMode = false,
  guestProgressMeta,
  promoAttribution = null,
}: ListenPageClientProps) {
  const searchParams = useSearchParams();
  const [signupBannerVisible, setSignupBannerVisible] = useState(false);
  const [practiceCompletedAfterSignup, setPracticeCompletedAfterSignup] =
    useState(false);

  const resolvedAttribution = useMemo(() => {
    if (promoAttribution) {
      return promoAttribution;
    }

    return resolvePromoAttribution(
      parsePromoAttributionFromSearchParams(searchParams),
    );
  }, [promoAttribution, searchParams]);

  const mergedInitialProgress = useMemo(() => {
    if (!guestProgressMode) {
      return initialProgress;
    }

    const guestProgress = readGuestPracticeProgress(practiceId);
    const guestEntries = guestProgressToListenEntries(guestProgress);

    if (guestEntries.length === 0) {
      return initialProgress;
    }

    if (initialProgress.length === 0) {
      return guestEntries;
    }

    const byId = new Map(
      initialProgress.map((entry) => [entry.audioItemId, entry]),
    );

    for (const entry of guestEntries) {
      if (!byId.has(entry.audioItemId)) {
        byId.set(entry.audioItemId, entry);
      }
    }

    return [...byId.values()];
  }, [guestProgressMode, initialProgress, practiceId]);

  const {
    loadSession,
    session: activeSession,
    dismissedPracticeId,
    activeQueue,
    clearPlaylistQueue,
    isInternalQueueNavigation,
    confirmInternalQueueNavigation,
    isQueueDrivenPractice,
  } = useGlobalAudioPlayer();

  // Primitives only — never put the whole session object in effect deps.
  const activeCatalogPracticeId =
    activeSession && isCatalogGlobalPlayerSession(activeSession)
      ? activeSession.practiceId
      : null;
  const activeRequestAutoplay = Boolean(activeSession?.requestAutoplay);

  useEffect(() => {
    if (dismissedPracticeId === practiceId && !autoplay) {
      return;
    }

    if (isInternalQueueNavigation(practiceId)) {
      confirmInternalQueueNavigation(practiceId);
      return;
    }

    if (
      activeQueue &&
      activeCatalogPracticeId &&
      activeCatalogPracticeId !== practiceId &&
      isQueueDrivenPractice(practiceId)
    ) {
      return;
    }

    // Already on this catalog practice: only bump when autoplay is newly requested.
    // Depending on full `activeSession` caused an infinite loadSession loop
    // (private → catalog hang).
    if (
      activeCatalogPracticeId === practiceId &&
      !(autoplay && !activeRequestAutoplay)
    ) {
      return;
    }

    if (activeQueue) {
      clearPlaylistQueue();
    }

    loadSession({
      sourceType: "catalog",
      practiceId,
      authorSlug,
      productSlug,
      practiceTitle,
      authorName,
      format,
      tracks,
      initialProgress: mergedInitialProgress,
      coverSymbol,
      coverGradient,
      coverImageUrl,
      coverImage,
      coverUpdatedAt,
      isAuthorPreview,
      requestAutoplay: autoplay,
      guestProgressMode,
      guestProgressMeta,
      promoConversionMode,
      promoAttribution: resolvedAttribution,
    });
  }, [
    activeCatalogPracticeId,
    activeQueue,
    activeRequestAutoplay,
    authorName,
    authorSlug,
    autoplay,
    clearPlaylistQueue,
    confirmInternalQueueNavigation,
    coverGradient,
    coverImage,
    coverImageUrl,
    coverUpdatedAt,
    coverSymbol,
    dismissedPracticeId,
    format,
    guestProgressMeta,
    guestProgressMode,
    isAuthorPreview,
    isInternalQueueNavigation,
    isQueueDrivenPractice,
    loadSession,
    mergedInitialProgress,
    practiceId,
    practiceTitle,
    productSlug,
    promoConversionMode,
    resolvedAttribution,
    tracks,
  ]);

  return (
    <>
      {shouldRunPromoPostSignupHandler(isAuthenticated) ? (
        <PromoPostSignupHandler
          practiceId={practiceId}
          practiceSlug={productSlug}
          onCompleted={({ practiceCompleted }) => {
            setPracticeCompletedAfterSignup(practiceCompleted);
            setSignupBannerVisible(true);
          }}
        />
      ) : null}

      {signupBannerVisible ? (
        <PromoSignupSuccessBanner
          practiceCompleted={practiceCompletedAfterSignup}
          onContinueListening={() => setSignupBannerVisible(false)}
          onDismiss={() => setSignupBannerVisible(false)}
        />
      ) : null}
    </>
  );
}
