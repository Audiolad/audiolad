import LegalFooter from "@/components/LegalFooter";
import AuthorAppreciationPrototype from "@/components/author-appreciation/AuthorAppreciationPrototype";
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

type PracticePageContentProps = {
  viewModel: PracticePageViewModel;
};

export default function PracticePageContent({ viewModel }: PracticePageContentProps) {
  const {
    practice,
    description,
    seoContent,
    publicAudioItems,
    listeningNotice,
    presentation,
    resolvedAuthorSlug,
    practiceTopics,
  } = viewModel;

  return (
    <div className={`min-w-0 ${platformBottomContentPaddingClass}`}>
      <div className="pt-6 xl:box-border xl:min-w-0 xl:max-w-full xl:px-6 xl:pt-3">
        <PracticeBackLink />

        <PracticeAccessBanners
          presentation={viewModel.presentation}
          listenDeniedMessage={viewModel.listenDeniedMessage}
          publishPreview={viewModel.publishPreview}
        />

        <section className="mt-6 min-w-0">
          <PracticeProductHero viewModel={viewModel} />
        </section>

        {viewModel.showAuthorAppreciationPrototype && viewModel.authorName ? (
          <div className="mt-4">
            <AuthorAppreciationPrototype
              authorName={viewModel.authorName}
              authorId={viewModel.authorId}
              practiceId={viewModel.practice.id}
              isAuthenticated={viewModel.isAuthenticated}
              surface="product"
              path={viewModel.practicePagePath}
            />
          </div>
        ) : null}

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

        <ProductCopySections description={description} />
        <PracticeSeoContentSections content={seoContent} productKind={viewModel.productKind} />

        {listeningNotice ? (
          <ListeningNoticeCard notice={listeningNotice} variant="light" />
        ) : null}

        <LegalFooter className="mt-8 xl:mt-10" />
      </div>
    </div>
  );
}
