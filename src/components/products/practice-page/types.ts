import type { ProductTopicLinkItem } from "@/components/products/ProductTopicLinks";
import type { PracticeAccessPresentation } from "@/lib/products/practice-access-ui";
import type { buildProductCoverResponsiveProps } from "@/lib/products/cover-display";
import type { ResolvedListeningNotice } from "@/lib/products/listening-notice";
import type { PublicAudioItem } from "@/lib/products/public-audio-items";

export type PracticePageCoverData = {
  displayUrl: string | null;
  responsive: ReturnType<typeof buildProductCoverResponsiveProps>;
  alt: string;
  gradient: string;
  symbol: string;
  displayWidth: number;
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
  resolvedAuthorSlug: string;
  authorName: string | null;
  subtitle: string | null;
  description: string | null;
  meta: string | null;
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
};
