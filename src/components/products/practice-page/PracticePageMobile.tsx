import LegalFooter from "@/components/LegalFooter";
import ListeningNoticeCard from "@/components/products/ListeningNoticeCard";
import ProductContentsSection from "@/components/products/ProductContentsSection";
import PracticeSeoContentSections from "@/components/products/PracticeSeoContentSections";
import ProductCopySections from "@/components/products/ProductCopySections";
import ProductTopicLinks from "@/components/products/ProductTopicLinks";
import { platformBottomContentPaddingClass } from "@/lib/navigation/bottom-nav";

import {
  PracticeAccessBanners,
  PracticeBackLink,
} from "./PracticePageParts";
import PracticeProductHero from "./PracticeProductHero";
import type { PracticePageViewModel } from "./types";

type PracticePageMobileProps = {
  viewModel: PracticePageViewModel;
};

export default function PracticePageMobile({ viewModel }: PracticePageMobileProps) {
  const { practice, description, seoAbout, seoContent, publicAudioItems, listeningNotice, presentation, resolvedAuthorSlug } =
    viewModel;

  return (
    <div className={`xl:hidden ${platformBottomContentPaddingClass}`}>
      <div className="pt-6">
        <PracticeBackLink />

        <PracticeAccessBanners
          presentation={viewModel.presentation}
          listenDeniedMessage={viewModel.listenDeniedMessage}
          publishPreview={viewModel.publishPreview}
        />

        <section className="mt-6">
          <PracticeProductHero viewModel={viewModel} layout="mobile" />
        </section>

        <ProductTopicLinks topics={viewModel.practiceTopics} className="mt-4" />

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

        <ProductCopySections
          description={description}
          seoAbout={seoAbout}
        />
        <PracticeSeoContentSections content={seoContent} productKind={viewModel.productKind} />

        {listeningNotice ? (
          <ListeningNoticeCard notice={listeningNotice} variant="light" />
        ) : null}
      </div>

      <LegalFooter className="mt-8" />
    </div>
  );
}
