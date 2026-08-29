import LegalFooter from "@/components/LegalFooter";
import ListeningNoticeCard from "@/components/products/ListeningNoticeCard";
import ProductContentsSection from "@/components/products/ProductContentsSection";
import PracticeSeoContentSections from "@/components/products/PracticeSeoContentSections";

import ProductTopicLinks from "@/components/products/ProductTopicLinks";

import {
  PracticeAccessBanners,
  PracticeBackLink,
} from "./PracticePageParts";
import PracticeProductHero from "./PracticeProductHero";
import type { PracticePageViewModel } from "./types";

type PracticePageDesktopProps = {
  viewModel: PracticePageViewModel;
};

export default function PracticePageDesktop({ viewModel }: PracticePageDesktopProps) {
  const {
    practice,
    description,
    seoAbout,
    seoContent,
    publicAudioItems,
    listeningNotice,
    presentation,
    resolvedAuthorSlug,
    practiceTopics,
  } = viewModel;

  return (
    <div className="hidden min-w-0 xl:block">
      <div className="box-border min-w-0 max-w-full px-6 pt-3">
        <PracticeBackLink />

        <PracticeAccessBanners
          presentation={viewModel.presentation}
          listenDeniedMessage={viewModel.listenDeniedMessage}
          publishPreview={viewModel.publishPreview}
        />

        <section className="mt-6 min-w-0">
          <PracticeProductHero viewModel={viewModel} layout="desktop" />
        </section>

        <ProductTopicLinks topics={practiceTopics} className="mt-4" />

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

        {description ? (
          <section className="listener-practice-description mt-8 rounded-[26px] border border-[#eadff8] bg-white p-6 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <p className="w-full max-w-none whitespace-pre-line text-[15px] leading-7 text-[#65577f]">
              {description}
            </p>
          </section>
        ) : null}

        {seoAbout ? (
          <section className="mt-6 rounded-[26px] border border-[#eadff8] bg-white p-6 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
            <h2 className="text-lg font-semibold text-[#2b2140]">О продукте</h2>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-[#65577f]">
              {seoAbout}
            </p>
          </section>
        ) : null}
        <PracticeSeoContentSections content={seoContent} productKind={viewModel.productKind} />

        {listeningNotice ? (
          <ListeningNoticeCard notice={listeningNotice} variant="light" />
        ) : null}

        <LegalFooter className="mt-10" />
      </div>
    </div>
  );
}
