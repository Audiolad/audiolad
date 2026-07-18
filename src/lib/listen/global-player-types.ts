import type { ListenProgressEntry, ListenTrack } from "@/lib/listen/types";

export type GlobalPlayerSession = {
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  practiceTitle: string;
  authorName: string;
  format: string | null;
  tracks: ListenTrack[];
  initialProgress: ListenProgressEntry[];
  coverSymbol: string;
  coverGradient: string;
  coverImageUrl: string | null;
  coverImage?: unknown;
  coverUpdatedAt?: string | null;
  isAuthorPreview: boolean;
  requestAutoplay?: boolean;
  /** When true, start at track 0 / position 0 (Play All restart). */
  forceStartAtBeginning?: boolean;
  /** Start playback on this track (position 0) instead of resume position. */
  initialTrackId?: string | null;
  /** Keep the current route when autoplay starts (e.g. product page contents). */
  suppressListenUrlSync?: boolean;
  /** Guest promo funnel: persist progress in localStorage instead of server. */
  guestProgressMode?: boolean;
  guestProgressMeta?: {
    practiceSlug: string;
    source?: string | null;
    campaign?: string | null;
  };
  /** Show signup conversion prompts in the player. */
  promoConversionMode?: boolean;
  promoAttribution?: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    source: string | null;
    campaign: string | null;
  } | null;
};

export type LoadSessionInput = GlobalPlayerSession;
