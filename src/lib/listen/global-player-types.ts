import type { ListenProgressEntry, ListenTrack } from "@/lib/listen/types";

export type GlobalPlayerSourceType = "catalog" | "private_audio";

export const GLOBAL_PLAYER_ENTRY_SURFACES = [
  "catalog",
  "home",
  "product",
  "library",
] as const;

export type GlobalPlayerEntrySurface =
  (typeof GLOBAL_PLAYER_ENTRY_SURFACES)[number];

export const GLOBAL_PLAYER_PLAYBACK_MODES = ["full", "preview"] as const;

export type GlobalPlayerPlaybackMode =
  (typeof GLOBAL_PLAYER_PLAYBACK_MODES)[number];

export type GlobalPlayerPreviewCta = {
  type: "buy";
  price: number;
  href: string;
};

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
  /**
   * Where playback was launched. Independent of sourceType
   * (`catalog` | `private_audio` still means the audio source).
   */
  entrySurface?: GlobalPlayerEntrySurface;
  /**
   * full = entitled / author listen. preview = catalog hear-before-buy.
   * Missing value is treated as full so legacy session payloads keep working.
   */
  playbackMode?: GlobalPlayerPlaybackMode;
  previewStartMs?: number;
  previewEndMs?: number;
  previewCta?: GlobalPlayerPreviewCta;
  /**
   * True when preview uses the temporary first-60s compatibility clip
   * because the author has not configured a 30–90s storefront window.
   */
  previewNeedsSetup?: boolean;
};

export type CatalogGlobalPlayerSession = GlobalPlayerSessionBase & {
  /** Omitted / "catalog" — catalog product listen session. */
  sourceType?: "catalog";
  practiceId: string;
  authorSlug: string;
  productSlug: string;
  /**
   * Kind-specific navigation policy for the global player chrome.
   * `inline_only` (audio_post): play/pause stays on-page; no /listen fullscreen.
   */
  playbackNavigation?: "inline_only" | "fullscreen";
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

export function isGlobalPlayerEntrySurface(
  value: unknown,
): value is GlobalPlayerEntrySurface {
  return (
    value === "catalog" ||
    value === "home" ||
    value === "product" ||
    value === "library"
  );
}

export function isGlobalPlayerPlaybackMode(
  value: unknown,
): value is GlobalPlayerPlaybackMode {
  return value === "full" || value === "preview";
}

export function isGlobalPlayerPreviewCta(
  value: unknown,
): value is GlobalPlayerPreviewCta {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const cta = value as Record<string, unknown>;

  return (
    cta.type === "buy" &&
    typeof cta.price === "number" &&
    Number.isFinite(cta.price) &&
    typeof cta.href === "string" &&
    cta.href.length > 0
  );
}

export function resolveGlobalPlayerPlaybackMode(
  value: unknown,
): GlobalPlayerPlaybackMode {
  return isGlobalPlayerPlaybackMode(value) ? value : "full";
}

export type GlobalPlayerPlaybackContract = {
  entrySurface?: GlobalPlayerEntrySurface;
  playbackMode?: GlobalPlayerPlaybackMode;
  previewStartMs?: number;
  previewEndMs?: number;
  previewCta?: GlobalPlayerPreviewCta;
  previewNeedsSetup?: boolean;
};

export function normalizeGlobalPlayerSessionContract<
  T extends GlobalPlayerPlaybackContract,
>(session: T): T {
  return {
    ...session,
    playbackMode: resolveGlobalPlayerPlaybackMode(session.playbackMode),
  };
}
