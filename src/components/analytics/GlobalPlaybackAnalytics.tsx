"use client";

import { usePathname } from "next/navigation";

import ListenAnalyticsTracker from "@/components/analytics/ListenAnalyticsTracker";
import type { LoadSessionInput } from "@/lib/listen/global-player-types";
import {
  isCatalogGlobalPlayerSession,
  isPrivateAudioSession,
} from "@/lib/listen/global-player-types";

type EngineSnapshot = {
  currentTrack: { id: string } | null | undefined;
  currentTime: number;
  displayDuration: number;
  isPlaying: boolean;
  programCompleted: boolean;
};

type GlobalPlaybackAnalyticsProps = {
  session: LoadSessionInput;
  engine: EngineSnapshot;
};

/**
 * Canonical mount for playback analytics on GlobalAudioPlayer.
 * Covers /practice, /listen, catalog, /p, /listens, playlist queue, mini-player.
 * Local ListenAnalyticsTracker mounts on those surfaces must not also emit.
 */
export function resolveGlobalPlaybackAnalyticsTarget(
  session: LoadSessionInput,
  pathname: string | null,
): { practiceId: string; path: string } | null {
  if (session.isAuthorPreview) {
    return null;
  }

  if (isPrivateAudioSession(session)) {
    return {
      practiceId: session.itemId,
      path: session.detailPath || pathname || "/",
    };
  }

  if (!isCatalogGlobalPlayerSession(session)) {
    return null;
  }

  const livePath = pathname && pathname.length > 1 ? pathname : null;
  const listenPath = `/listen/${session.authorSlug}/${session.productSlug}`;

  return {
    practiceId: session.practiceId,
    path: livePath ?? listenPath,
  };
}

export default function GlobalPlaybackAnalytics({
  session,
  engine,
}: GlobalPlaybackAnalyticsProps) {
  const pathname = usePathname();
  const target = resolveGlobalPlaybackAnalyticsTarget(session, pathname);

  if (!target) {
    return null;
  }

  return (
    <ListenAnalyticsTracker
      practiceId={target.practiceId}
      trackId={engine.currentTrack?.id ?? null}
      path={target.path}
      currentTime={engine.currentTime}
      duration={engine.displayDuration}
      isPlaying={engine.isPlaying}
      programCompleted={engine.programCompleted}
    />
  );
}
