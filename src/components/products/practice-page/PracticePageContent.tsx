import LegalFooter from "@/components/LegalFooter";
import AuthorAppreciationPrototype from "@/components/author-appreciation/AuthorAppreciationPrototype";
import CourseLearnerContent from "@/components/products/course-learner/CourseLearnerContent";
import AuthorRecommendationsSection from "@/components/products/AuthorRecommendationsSection";
import ListeningNoticeCard from "@/components/products/ListeningNoticeCard";
import ProductContentsSection from "@/components/products/ProductContentsSection";
import PracticeSeoContentSections from "@/components/products/PracticeSeoContentSections";
import ProductCopySections from "@/components/products/ProductCopySections";
import ProductTopicLinks from "@/components/products/ProductTopicLinks";
import { isMultiAudioProduct } from "@/lib/products/duration";
import { platformBottomContentPaddingClass } from "@/lib/navigation/bottom-nav";

import {
  PracticeAccessBanners,
  PracticeBackLink,
} from "./PracticePageParts";
import PracticeProductHero from "./PracticeProductHero";
import PracticeRatingStars from "./PracticeRatingStars";
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
    learnerCourse,
    listeningNotice,
    presentation,
    resolvedAuthorSlug,
    practiceTopics,
    authorName,
  } = viewModel;

  const showThankAuthor =
    viewModel.showAuthorAppreciationPrototype && Boolean(authorName);
  const hasTrackContents =
    !learnerCourse && isMultiAudioProduct(publicAudioItems.length);

  return (
    <div className={`min-w-0 ${platformBottomContentPaddingClass}`}>
      <div className="pt-6 xl:box-border xl:min-w-0 xl:max-w-full xl:px-6 xl:pt-3">
        <PracticeBackLink />

        <PracticeAccessBanners
          presentation={viewModel.presentation}
          listenDeniedMessage={viewModel.listenDeniedMessage}
          publishPreview={viewModel.publishPreview}
        />

        <section className="mt-6 min-w-0" data-practice-section="hero">
          <PracticeProductHero viewModel={viewModel} />
        </section>

        {viewModel.ratingsUiEnabled ? (
          <PracticeRatingStars
            authorSlug={resolvedAuthorSlug}
            productSlug={practice.slug}
            signInReturnPath={viewModel.practicePagePath}
            isAuthenticated={viewModel.isAuthenticated}
            initialAggregate={viewModel.ratingAggregate}
          />
        ) : null}

        {showThankAuthor ? (
          <div className="mt-4" data-practice-section="thank-author">
            <AuthorAppreciationPrototype
              authorName={authorName ?? ""}
              authorId={viewModel.authorId}
              practiceId={practice.id}
              isAuthenticated={viewModel.isAuthenticated}
              surface="product"
            />
          </div>
        ) : null}

        <ProductTopicLinks topics={practiceTopics} className="mt-4" />

        {learnerCourse ? (
          <CourseLearnerContent
            course={learnerCourse}
            authorSlug={resolvedAuthorSlug}
            productSlug={practice.slug}
          />
        ) : hasTrackContents ? (
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
        ) : null}

        <AuthorRecommendationsSection content={seoContent} className="mt-6" />

        {presentation.showProductAbout !== false ? (
          <ProductCopySections description={description} />
        ) : null}
        <PracticeSeoContentSections
          content={seoContent}
          productKind={viewModel.productKind}
          includeRelatedProducts={false}
        />

        {listeningNotice ? (
          <div data-practice-section="listening-notice">
            <ListeningNoticeCard notice={listeningNotice} variant="light" />
          </div>
        ) : null}

        <div data-practice-section="footer">
          <LegalFooter className="mt-8 xl:mt-10" />
        </div>
      </div>
    </div>
  );
}
