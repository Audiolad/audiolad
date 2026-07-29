import type { ListenProgressEntry, ListenTrack } from "@/lib/listen/types";

export type GlobalPlayerSourceType = "catalog" | "private_audio";

type GlobalPlayerSessionBase = {
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
};

export type CatalogGlobalPlayerSession = GlobalPlayerSessionBase & {
  /** Omitted / "catalog" — catalog product listen session. */
  sourceType?: "catalog";
  practiceId: string;
  authorSlug: string;
  productSlug: string;
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

export type PrivateAudioGlobalPlayerSession = GlobalPlayerSessionBase & {
  sourceType: "private_audio";
  itemId: string;
  detailPath: string;
  authorText: string | null;
};

export type GlobalPlayerSession =
  | CatalogGlobalPlayerSession
  | PrivateAudioGlobalPlayerSession;

export type LoadSessionInput = GlobalPlayerSession;

export function isPrivateAudioSession(
  session: GlobalPlayerSession,
): session is PrivateAudioGlobalPlayerSession {
  return session.sourceType === "private_audio";
}

export function isCatalogGlobalPlayerSession(
  session: GlobalPlayerSession,
): session is CatalogGlobalPlayerSession {
  return session.sourceType !== "private_audio";
}

/** Stable identity for replace/merge/remount decisions. */
export function getGlobalPlayerSessionKey(session: GlobalPlayerSession): string {
  if (isPrivateAudioSession(session)) {
    return `private_audio:${session.itemId}`;
  }

  return `catalog:${session.practiceId}`;
}
