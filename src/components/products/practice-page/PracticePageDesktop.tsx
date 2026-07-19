import LegalFooter from "@/components/LegalFooter";
import ListeningNoticeCard from "@/components/products/ListeningNoticeCard";
import ProductContentsSection from "@/components/products/ProductContentsSection";

import {
  PracticeAccessBanners,
  PracticeBackLink,
  PracticeLibraryActionSection,
  PracticeMetaSection,
  PracticePrimaryActionSection,
  PracticeProductCover,
} from "./PracticePageParts";
import type { PracticePageViewModel } from "./types";

type PracticePageDesktopProps = {
  viewModel: PracticePageViewModel;
};

export default function PracticePageDesktop({ viewModel }: PracticePageDesktopProps) {
  const { practice, description, publicAudioItems, listeningNotice, presentation, resolvedAuthorSlug } =
    viewModel;

  return (
    <div className="hidden xl:block">
      <div className="px-6 pt-3">
        <PracticeBackLink />

        <PracticeAccessBanners
          presentation={viewModel.presentation}
          practicePagePath={viewModel.practicePagePath}
          listenDeniedMessage={viewModel.listenDeniedMessage}
        />

        <section className="mt-6 grid grid-cols-[minmax(240px,280px)_minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] xl:gap-8 2xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <div className="w-full max-w-[280px] xl:max-w-[300px] 2xl:max-w-[360px]">
            <PracticeProductCover cover={viewModel.desktopCover} priority />
          </div>

          <div className="min-w-0">
            <PracticeMetaSection
              viewModel={viewModel}
              subtitleClamp={false}
              titleClassName="mt-4 text-[34px] font-semibold leading-[1.12] xl:text-[36px]"
            />

            <PracticePrimaryActionSection viewModel={viewModel} className="mt-6" />

            <PracticeLibraryActionSection viewModel={viewModel} />
          </div>
        </section>

        {description ? (
          <section className="listener-practice-description mt-8 rounded-[26px] border border-[#eadff8] bg-white p-6 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <p className="max-w-prose whitespace-pre-line text-[15px] leading-7 text-[#65577f]">
              {description}
            </p>
          </section>
        ) : null}

        <ProductContentsSection
          items={publicAudioItems}
          durationMinutesFallback={practice.duration_minutes}
          productTitle={practice.title}
          practiceCover={{
            cover_url: practice.cover_url,
            cover_image: practice.cover_image,
            updated_at: practice.updated_at,
            use_shared_cover: practice.use_shared_cover ?? true,
          }}
          playback={{
            enabled: presentation.primaryAction.kind === "listen",
            authorSlug: resolvedAuthorSlug,
            productSlug: practice.slug,
          }}
        />

        {listeningNotice ? (
          <ListeningNoticeCard notice={listeningNotice} variant="light" />
        ) : null}

        <LegalFooter className="mt-10" />
      </div>
    </div>
  );
}
