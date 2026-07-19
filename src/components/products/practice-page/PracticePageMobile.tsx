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

type PracticePageMobileProps = {
  viewModel: PracticePageViewModel;
};

export default function PracticePageMobile({ viewModel }: PracticePageMobileProps) {
  const { practice, description, publicAudioItems, listeningNotice, presentation, resolvedAuthorSlug } =
    viewModel;

  return (
    <div className="xl:hidden">
      <div className="pt-6">
        <PracticeBackLink />

        <PracticeAccessBanners
          presentation={viewModel.presentation}
          practicePagePath={viewModel.practicePagePath}
          listenDeniedMessage={viewModel.listenDeniedMessage}
        />

        <section className="mt-6">
          <PracticeProductCover cover={viewModel.mobileCover} priority />
        </section>

        <section className="mt-6">
          <PracticeMetaSection viewModel={viewModel} />
        </section>

        {description ? (
          <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <p className="whitespace-pre-line text-[15px] leading-7 text-[#65577f]">
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

        <PracticePrimaryActionSection viewModel={viewModel} />

        <PracticeLibraryActionSection viewModel={viewModel} />

        {listeningNotice ? (
          <ListeningNoticeCard notice={listeningNotice} variant="light" />
        ) : null}
      </div>

      <div className="pb-6">
        <LegalFooter className="mt-8" />
      </div>
    </div>
  );
}
