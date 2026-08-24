import LegalFooter from "@/components/LegalFooter";
import AuthorLink from "@/components/authors/AuthorLink";
import NextStepRecommendation from "@/components/products/NextStepRecommendation";
import AudioPostBackLink from "@/components/products/audio-post/AudioPostBackLink";
import AudioPostListenAnalytics from "@/components/products/audio-post/AudioPostListenAnalytics";
import AudioPostPlayer from "@/components/products/audio-post/AudioPostPlayer";
import {
  PracticeAccessBanners,
  PracticeLibraryActionSection,
  PracticeProductCover,
  toPracticeHeartProduct,
} from "@/components/products/practice-page/PracticePageParts";
import type { PracticePageViewModel } from "@/components/products/practice-page/types";
import {
  AUDIO_POST_KIND_LABEL,
  PRODUCT_KIND,
} from "@/lib/author-products/product-kind";
import {
  formatProductDuration,
  sumDurationSeconds,
} from "@/lib/products/duration";
import type { PublicPromoRecommendation } from "@/lib/products/promo-recommendation";

export type AudioPostPageViewModel = PracticePageViewModel & {
  productKind: typeof PRODUCT_KIND.AUDIO_POST;
  authorId: string | null;
  recommendation: PublicPromoRecommendation | null;
};

type AudioPostPageProps = {
  viewModel: AudioPostPageViewModel;
};

function AudioPostRecommendation({
  viewModel,
}: {
  viewModel: AudioPostPageViewModel;
}) {
  const { practice, recommendation, resolvedAuthorSlug } = viewModel;

  if (!recommendation) {
    return null;
  }

  return (
    <div className="mt-6" data-testid="audio-post-recommendation">
      <NextStepRecommendation
        recommendation={recommendation}
        analytics={{
          practiceId: practice.id,
          productKind: viewModel.productKind,
          authorId: viewModel.authorId,
          authorSlug: resolvedAuthorSlug,
          sourcePage: viewModel.practicePagePath,
        }}
      />
    </div>
  );
}

export default function AudioPostPage({ viewModel }: AudioPostPageProps) {
  const {
    practice,
    description,
    subtitle,
    authorName,
    resolvedAuthorSlug,
    publicAudioItems,
    presentation,
  } = viewModel;

  const playbackEnabled = presentation.primaryAction.kind === "listen";
  const durationLabel =
    formatProductDuration(
      sumDurationSeconds(publicAudioItems),
      practice.duration_minutes,
    ) ?? viewModel.meta;

  const playerProps = {
    items: publicAudioItems,
    authorSlug: resolvedAuthorSlug,
    productSlug: practice.slug,
    enabled: playbackEnabled,
    durationMinutesFallback: practice.duration_minutes,
  } as const;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 sm:px-6">
      <AudioPostListenAnalytics
        practiceId={practice.id}
        authorSlug={resolvedAuthorSlug}
        productSlug={practice.slug}
        path={viewModel.practicePagePath}
      />

      {/* Mobile: featured-card layout (home large-card language) */}
      <div className="xl:hidden">
        <AudioPostBackLink />

        <PracticeAccessBanners
          presentation={viewModel.presentation}
          listenDeniedMessage={viewModel.listenDeniedMessage}
          publishPreview={viewModel.publishPreview}
        />

        <article className="featured-card mt-6 overflow-hidden rounded-[28px]">
          <div className="featured-card__cover">
            <PracticeProductCover
              cover={viewModel.mobileCover}
              priority
              className="!aspect-auto h-full w-full rounded-none shadow-none"
              heartProduct={toPracticeHeartProduct(viewModel)}
              isAuthenticated={viewModel.isAuthenticated}
              signInReturnPath={viewModel.practicePagePath}
            />
          </div>

          <div className="featured-card__content">
            <span className="inline-flex rounded-full bg-[#f4ecfb] px-3 py-1 text-xs font-medium text-[#7042c5]">
              {AUDIO_POST_KIND_LABEL}
            </span>

            <h1 className="mt-3 text-[22px] font-semibold leading-tight text-[#25135c]">
              {practice.title}
            </h1>

            {authorName ? (
              <AuthorLink
                authorSlug={resolvedAuthorSlug}
                authorName={authorName}
                className="mt-2 text-sm font-medium text-[#7042c5]"
              />
            ) : null}

            {durationLabel ? (
              <p className="mt-2 text-sm text-[#7d70a2]">{durationLabel}</p>
            ) : null}

            <AudioPostPlayer {...playerProps} variant="embedded" />

            {subtitle ? (
              <p className="mt-3 text-sm leading-6 text-[#65577f]">{subtitle}</p>
            ) : null}
          </div>
        </article>

        {description ? (
          <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <p className="whitespace-pre-line text-[15px] leading-7 text-[#65577f]">
              {description}
            </p>
          </section>
        ) : null}

        <PracticeLibraryActionSection viewModel={viewModel} className="mt-6" />

        <AudioPostRecommendation viewModel={viewModel} />

        <LegalFooter className="mt-8" />
      </div>

      {/* Desktop: existing layout (panel player, no /listen navigation) */}
      <div className="hidden xl:block">
        <AudioPostBackLink />

        <PracticeAccessBanners
          presentation={viewModel.presentation}
          listenDeniedMessage={viewModel.listenDeniedMessage}
          publishPreview={viewModel.publishPreview}
        />

        <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-start">
          <PracticeProductCover
            cover={viewModel.desktopCover}
            priority
            className="mx-auto w-full max-w-[220px] sm:mx-0"
            heartProduct={toPracticeHeartProduct(viewModel)}
            isAuthenticated={viewModel.isAuthenticated}
            signInReturnPath={viewModel.practicePagePath}
          />

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9485b4]">
              {AUDIO_POST_KIND_LABEL}
            </p>
            <h1 className="mt-2 text-[30px] font-semibold leading-[1.15] text-[#25135c] sm:text-[34px]">
              {practice.title}
            </h1>

            {subtitle ? (
              <p className="mt-3 text-[16px] leading-7 text-[#65577f]">{subtitle}</p>
            ) : null}

            {authorName ? (
              <AuthorLink
                authorSlug={resolvedAuthorSlug}
                authorName={authorName}
                className="mt-4 inline-flex text-sm font-medium text-[#7042c5]"
              />
            ) : null}

            {viewModel.meta ? (
              <p className="mt-2 text-sm text-[#7d70a2]">{viewModel.meta}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          <AudioPostPlayer {...playerProps} variant="panel" />
        </div>

        {description ? (
          <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <p className="whitespace-pre-line text-[15px] leading-7 text-[#65577f]">
              {description}
            </p>
          </section>
        ) : null}

        <PracticeLibraryActionSection viewModel={viewModel} className="mt-6" />

        <AudioPostRecommendation viewModel={viewModel} />

        <LegalFooter className="mt-8" />
      </div>
    </div>
  );
}
