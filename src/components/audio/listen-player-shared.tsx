"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import LibraryAddButton from "@/components/LibraryAddButton";
import ListenAnalyticsTracker from "@/components/analytics/ListenAnalyticsTracker";
import ListenPageViewTracker from "@/components/analytics/ListenPageViewTracker";
import PromoPlaybackPrompts from "@/components/promo/PromoPlaybackPrompts";
import type { CatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import type { ListenTrack } from "@/lib/listen/types";
import type { PracticeLibraryAction } from "@/lib/products/practice-access-ui";
import type { ResolvedListeningNotice } from "@/lib/products/listening-notice";

export type ListenPlayerProps = {
  practiceId: string;
  practiceTitle: string;
  authorName: string;
  format: string | null;
  tracks: ListenTrack[];
  coverSymbol: string;
  coverGradient: string;
  coverImageUrl?: string | null;
  coverImage?: unknown;
  coverUpdatedAt?: string | null;
  isAuthorPreview?: boolean;
  sessionPayload?: CatalogGlobalPlayerSession;
  promoConversionMode?: boolean;
  authorSlug?: string;
  productSlug?: string;
  listeningNotice?: ResolvedListeningNotice | null;
  libraryAction?: PracticeLibraryAction;
  librarySignInReturnPath?: string;
};

const XL_MEDIA_QUERY = "(min-width: 1280px)";

function subscribeXlMedia(onChange: () => void) {
  const media = window.matchMedia(XL_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getXlMediaSnapshot() {
  return window.matchMedia(XL_MEDIA_QUERY).matches;
}

function getXlMediaServerSnapshot() {
  return false;
}

/** Active xl breakpoint for dual listen trees; SSR assumes mobile. */
export function useIsListenDesktopXl() {
  return useSyncExternalStore(
    subscribeXlMedia,
    getXlMediaSnapshot,
    getXlMediaServerSnapshot,
  );
}

export function formatListenTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function PlayIcon({
  className = "h-9 w-9 sm:h-10 sm:w-10",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

export function PauseIcon({
  className = "h-9 w-9 sm:h-10 sm:w-10",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 5.5h3.5v13H7V5.5Zm6.5 0H17v13h-3.5V5.5Z" />
    </svg>
  );
}

export function PreviousTrackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5.5" y="5" width="2.5" height="14" rx="0.5" />
      <path d="M18 5v14L8 12Z" />
    </svg>
  );
}

export function NextTrackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 5v14l10-7Z" />
      <rect x="16" y="5" width="2.5" height="14" rx="0.5" />
    </svg>
  );
}

export function RewindFifteenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19 12H8" />
      <path d="M12 7 7 12l5 5" />
    </svg>
  );
}

export function ForwardFifteenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12h11" />
      <path d="m12 7 5 5-5 5" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NowPlayingIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="4" width="2.5" height="8" rx="0.75" />
      <rect x="6.75" y="2" width="2.5" height="12" rx="0.75" />
      <rect x="12.5" y="5" width="2.5" height="6" rx="0.75" />
    </svg>
  );
}

export function ControlCaption({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string;
}) {
  return (
    <p className="mt-1.5 max-w-[4.75rem] text-center text-[10px] leading-tight text-white/55 sm:max-w-none sm:text-[11px]">
      <span className="block">{primary}</span>
      <span className="block">{secondary}</span>
    </p>
  );
}

type ListenPlayerContextValue = {
  props: ListenPlayerProps & {
    coverImageUrl: string | null;
    coverImage: unknown;
    coverUpdatedAt: string | null;
    isAuthorPreview: boolean;
    promoConversionMode: boolean;
    authorSlug: string;
    productSlug: string;
    listeningNotice: ResolvedListeningNotice | null;
    libraryAction: PracticeLibraryAction;
    librarySignInReturnPath: string;
  };
  isEngineReady: boolean;
  isDismissedIdle: boolean;
  queueLabel: string | null;
  restartingQueue: boolean;
  setRestartingQueue: (value: boolean) => void;
  setCoverImageFailedUrl: (value: string | null) => void;
  showCoverImage: boolean;
  activeCoverUrl: string | null;
  activeCoverImage: unknown;
  activeCoverUpdatedAt: string | null;
  trimmedFormat: string;
  currentTrackTitle: string;
  showTrackTitle: boolean;
  currentDescription: string;
  isMultiTrack: boolean;
  currentTrack: ListenTrack | null;
  currentTrackIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  hasValidDuration: boolean;
  displayDuration: number;
  currentTime: number;
  playerError: string | null;
  progressError: string | null;
  playbackRate: number;
  statusMessage: string;
  programProgressPercent: number;
  programCompleted: boolean;
  isPreviousTrackDisabled: boolean;
  isNextTrackDisabled: boolean;
  src: string | null;
  handlePlayPause: () => Promise<void>;
  handleSeekOffset: (offset: number) => void;
  handleRangeChange: (value: number) => void;
  handlePreviousTrack: () => Promise<void>;
  handleNextTrack: () => Promise<void>;
  handleSelectTrack: (index: number) => Promise<void>;
  handleRetry: () => void;
  handleSpeedChange: () => void;
  handleStartOver: () => Promise<void>;
  isTrackDone: (trackId: string, durationSeconds: number | null) => boolean;
  loadSession: ReturnType<typeof useGlobalAudioPlayer>["loadSession"];
  session: ReturnType<typeof useGlobalAudioPlayer>["session"];
  activeQueue: ReturnType<typeof useGlobalAudioPlayer>["activeQueue"];
  queueCompleted: ReturnType<typeof useGlobalAudioPlayer>["queueCompleted"];
  restartPlaylistQueue: ReturnType<
    typeof useGlobalAudioPlayer
  >["restartPlaylistQueue"];
  returnToPlaylistSource: ReturnType<
    typeof useGlobalAudioPlayer
  >["returnToPlaylistSource"];
  noticeMessage: ReturnType<typeof useGlobalAudioPlayer>["noticeMessage"];
  clearNoticeMessage: ReturnType<
    typeof useGlobalAudioPlayer
  >["clearNoticeMessage"];
};

const ListenPlayerContext = createContext<ListenPlayerContextValue | null>(
  null,
);

export function useListenPlayer(): ListenPlayerContextValue {
  const value = useContext(ListenPlayerContext);
  if (!value) {
    throw new Error("useListenPlayer must be used within ListenPlayerProvider");
  }
  return value;
}

export function ListenPlayerLibrarySlot({
  forDesktop,
  className,
}: {
  forDesktop: boolean;
  className?: string;
}) {
  const isDesktopXl = useIsListenDesktopXl();
  const {
    props: {
      practiceId,
      productSlug,
      promoConversionMode,
      libraryAction,
      librarySignInReturnPath,
      isAuthorPreview,
    },
  } = useListenPlayer();

  if (forDesktop !== isDesktopXl) {
    return null;
  }

  if (
    isAuthorPreview ||
    libraryAction === "hidden" ||
    !productSlug ||
    !librarySignInReturnPath
  ) {
    return null;
  }

  return (
    <div className={className}>
      <LibraryAddButton
        practiceSlug={productSlug}
        practiceId={practiceId}
        promoSignup={promoConversionMode}
        signInReturnPath={librarySignInReturnPath}
        action={libraryAction}
        variant="onDark"
        className={({ inLibrary, isPending }) =>
          `w-full min-h-11 rounded-full border px-5 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60 ${
            inLibrary
              ? "border-white/35 bg-white/15 text-white"
              : "border-white/45 bg-white text-[#4b2f86] hover:bg-white/95"
          } ${isPending ? "opacity-80" : ""}`
        }
      />
    </div>
  );
}

export function ListenPlayerPromoSlot({ forDesktop }: { forDesktop: boolean }) {
  const isDesktopXl = useIsListenDesktopXl();
  const player = useListenPlayer();
  const {
    props: {
      practiceId,
      productSlug,
      authorSlug,
      promoConversionMode,
    },
    isEngineReady,
    currentTrack,
    currentTime,
    displayDuration,
    isPlaying,
    programCompleted,
    session,
    handleStartOver,
  } = player;

  if (forDesktop !== isDesktopXl) {
    return null;
  }

  if (!isEngineReady || !promoConversionMode || !authorSlug || !productSlug) {
    return null;
  }

  return (
    <PromoPlaybackPrompts
      enabled={promoConversionMode}
      practiceId={practiceId}
      practiceSlug={productSlug}
      authorSlug={authorSlug}
      productSlug={productSlug}
      trackId={currentTrack?.id ?? null}
      currentTime={currentTime}
      duration={displayDuration}
      isPlaying={isPlaying}
      programCompleted={programCompleted}
      attribution={
        session && isCatalogGlobalPlayerSession(session)
          ? session.promoAttribution ?? null
          : null
      }
      onReplay={() => void handleStartOver()}
    />
  );
}

type ListenPlayerProviderProps = ListenPlayerProps & {
  children: ReactNode;
};

export function ListenPlayerProvider({
  children,
  practiceId,
  practiceTitle,
  authorName,
  format,
  tracks,
  coverSymbol,
  coverGradient,
  coverImageUrl = null,
  coverImage = null,
  coverUpdatedAt = null,
  isAuthorPreview = false,
  sessionPayload,
  promoConversionMode = false,
  authorSlug = "",
  productSlug = "",
  listeningNotice = null,
  libraryAction = "hidden",
  librarySignInReturnPath = "",
}: ListenPlayerProviderProps) {
  const {
    session,
    loadSession,
    dismissedPracticeId,
    activeQueue,
    queueCompleted,
    restartPlaylistQueue,
    returnToPlaylistSource,
    noticeMessage,
    clearNoticeMessage,
  } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const isEngineReady =
    Boolean(engine) &&
    !!session &&
    isCatalogGlobalPlayerSession(session) &&
    session.practiceId === practiceId;
  const isDismissedIdle =
    dismissedPracticeId === practiceId && !isEngineReady;

  const [coverImageFailedTrack, setCoverImageFailedTrack] = useState<{
    trackId: string | null;
    url: string;
  } | null>(null);
  const [restartingQueue, setRestartingQueue] = useState(false);
  const queueLabel =
    activeQueue && !queueCompleted
      ? `Плейлист: ${activeQueue.currentIndex + 1} из ${activeQueue.entries.length}`
      : null;

  const {
    isMultiTrack = tracks.length > 1,
    currentTrack = tracks[0] ?? null,
    currentTrackIndex = 0,
    isPlaying = false,
    isLoading = true,
    hasValidDuration = false,
    displayDuration = 0,
    currentTime = 0,
    playerError = null,
    progressError = null,
    playbackRate = 1,
    statusMessage = "Подготавливаем аудио…",
    programProgressPercent = 0,
    programCompleted = false,
    isPreviousTrackDisabled = true,
    isNextTrackDisabled = true,
    handlePlayPause = async () => {},
    handleSeekOffset = () => {},
    handleRangeChange = () => {},
    handlePreviousTrack = async () => {},
    handleNextTrack = async () => {},
    handleSelectTrack = async () => {},
    handleRetry = () => {},
    handleSpeedChange = () => {},
    handleStartOver = async () => {},
    isTrackDone = () => false,
    src = null,
  } = isEngineReady && engine ? engine : {};

  const activeCoverUrl =
    currentTrack?.coverImageUrl ?? coverImageUrl ?? null;
  const activeCoverTrackId = currentTrack?.id ?? null;
  const activeCoverImage =
    currentTrack?.coverImage ?? coverImage ?? session?.coverImage ?? null;
  const activeCoverUpdatedAt =
    currentTrack?.coverImage != null
      ? (currentTrack.updatedAt ?? null)
      : (coverUpdatedAt ?? session?.coverUpdatedAt ?? null);

  const showCoverImage =
    Boolean(activeCoverUrl) &&
    !(
      coverImageFailedTrack?.trackId === activeCoverTrackId &&
      coverImageFailedTrack.url === activeCoverUrl
    );
  const setCoverImageFailedUrl = (url: string | null) => {
    setCoverImageFailedTrack(
      url ? { trackId: activeCoverTrackId, url } : null,
    );
  };

  const trimmedFormat = typeof format === "string" ? format.trim() : "";
  const currentTrackTitle = currentTrack?.title?.trim() || practiceTitle;
  const showTrackTitle =
    isMultiTrack &&
    currentTrackTitle.toLowerCase() !== practiceTitle.trim().toLowerCase();
  const currentDescription = currentTrack?.description ?? "";

  const value: ListenPlayerContextValue = {
    props: {
      practiceId,
      practiceTitle,
      authorName,
      format,
      tracks,
      coverSymbol,
      coverGradient,
      coverImageUrl,
      coverImage,
      coverUpdatedAt,
      isAuthorPreview,
      sessionPayload,
      promoConversionMode,
      authorSlug,
      productSlug,
      listeningNotice,
      libraryAction,
      librarySignInReturnPath,
    },
    isEngineReady,
    isDismissedIdle,
    queueLabel,
    restartingQueue,
    setRestartingQueue,
    setCoverImageFailedUrl,
    showCoverImage,
    activeCoverUrl,
    activeCoverImage,
    activeCoverUpdatedAt,
    trimmedFormat,
    currentTrackTitle,
    showTrackTitle,
    currentDescription,
    isMultiTrack,
    currentTrack,
    currentTrackIndex,
    isPlaying,
    isLoading,
    hasValidDuration,
    displayDuration,
    currentTime,
    playerError,
    progressError,
    playbackRate,
    statusMessage,
    programProgressPercent,
    programCompleted,
    isPreviousTrackDisabled,
    isNextTrackDisabled,
    src,
    handlePlayPause,
    handleSeekOffset,
    handleRangeChange,
    handlePreviousTrack,
    handleNextTrack,
    handleSelectTrack,
    handleRetry,
    handleSpeedChange,
    handleStartOver,
    isTrackDone,
    loadSession,
    session,
    activeQueue,
    queueCompleted,
    restartPlaylistQueue,
    returnToPlaylistSource,
    noticeMessage,
    clearNoticeMessage,
  };

  return (
    <ListenPlayerContext.Provider value={value}>
      {children}
      {isEngineReady && !isAuthorPreview && authorSlug && productSlug ? (
        <>
          <ListenPageViewTracker
            practiceId={practiceId}
            path={`/listen/${authorSlug}/${productSlug}`}
          />
          <ListenAnalyticsTracker
            practiceId={practiceId}
            trackId={currentTrack?.id ?? null}
            path={`/listen/${authorSlug}/${productSlug}`}
            currentTime={currentTime}
            duration={displayDuration}
            isPlaying={isPlaying}
            programCompleted={programCompleted}
          />
        </>
      ) : null}
    </ListenPlayerContext.Provider>
  );
}
