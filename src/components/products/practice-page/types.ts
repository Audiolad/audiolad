import type { ProductTopicLinkItem } from "@/components/products/ProductTopicLinks";
import type { CatalogSlide } from "@/lib/catalog/dto";
import type { PracticeAccessPresentation } from "@/lib/products/practice-access-ui";
import type { buildProductCoverResponsiveProps } from "@/lib/products/cover-display";
import type { ResolvedListeningNotice } from "@/lib/products/listening-notice";
import type { PublicAudioItem } from "@/lib/products/public-audio-items";
import type { PublicPracticeSeoContent } from "@/lib/products/practice-seo-content";

export type PracticePageCoverData = {
  displayUrl: string | null;
  responsive: ReturnType<typeof buildProductCoverResponsiveProps>;
  alt: string;
  gradient: string;
  symbol: string;
  displayWidth: number;
};

export type PracticePagePublishPreview = {
  enabled: true;
  practiceId: string;
  editHref: string;
  publicPath: string;
  listenerViewHref: string;
  canPublish: boolean;
};

export type PracticePageViewModel = {
  practice: {
    id: string;
    slug: string;
    title: string;
    duration_minutes: number | null;
    cover_url: string | null;
    cover_image: unknown;
    updated_at: string | null;
    use_shared_cover: boolean | null;
  };
  isSaved: boolean;
  isAuthenticated: boolean;
  accessState: "free" | "paid";
  resolvedAuthorSlug: string;
  authorName: string | null;
  productTypeLabel: string | null;
  productKind: string | null;
  subtitle: string | null;
  description: string | null;
  seoContent: PublicPracticeSeoContent;
  meta: string | null;
  gallerySlides: CatalogSlide[];
  presentation: PracticeAccessPresentation;
  practicePagePath: string;
  promoListenPath: string;
  promoConversionMode: boolean;
  listenDeniedMessage: string | null;
  practiceTopics: ProductTopicLinkItem[];
  publicAudioItems: PublicAudioItem[];
  listeningNotice: ResolvedListeningNotice | null;
  mobileCover: PracticePageCoverData;
  desktopCover: PracticePageCoverData;
  priceOffer: {
    basePrice: number;
    salePrice: number | null;
    endsAt: string | null;
    expiresAt: string | null;
    promotionType: "calendar" | "personal_countdown" | null;
    aboveTimerText: string | null;
    belowButtonText: string | null;
  } | null;
  promoStartToken: string | null;
  /** Price is hidden only while a valid first-time `?promo=` start resolves. */
  promoStartPending: boolean;
  /**
   * Phase 1 UX prototype only. Phase 2 replaces this preview state with the
   * effective commercial-author and product-visibility eligibility result.
   */
  showAuthorAppreciationPrototype: boolean;
  publishPreview: PracticePagePublishPreview | null;
};
