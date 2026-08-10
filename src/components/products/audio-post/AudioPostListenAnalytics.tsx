"use client";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import ListenAnalyticsTracker from "@/components/analytics/ListenAnalyticsTracker";
import {
  isCatalogGlobalPlayerSession,
  type CatalogGlobalPlayerSession,
  type GlobalPlayerSession,
} from "@/lib/listen/global-player-types";
import { isInlineOnlyPlaybackSession } from "@/lib/listen/playback-navigation";

export type AudioPostListenAnalyticsContext = {
  practiceId: string;
  authorSlug: string;
  productSlug: string;
};

type AudioPostListenAnalyticsProps = AudioPostListenAnalyticsContext & {
  path: string;
};

export function getActiveInlineAudioPostSession(
  session: GlobalPlayerSession | null,
  context: AudioPostListenAnalyticsContext,
): CatalogGlobalPlayerSession | null {
  if (
    !session ||
    !isCatalogGlobalPlayerSession(session) ||
    !isInlineOnlyPlaybackSession(session) ||
    session.isAuthorPreview ||
    session.practiceId !== context.practiceId ||
    session.authorSlug !== context.authorSlug ||
    session.productSlug !== context.productSlug
  ) {
    return null;
  }

  return session;
}

export default function AudioPostListenAnalytics({
  practiceId,
  authorSlug,
  productSlug,
  path,
}: AudioPostListenAnalyticsProps) {
  const { session } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const activeSession = getActiveInlineAudioPostSession(session, {
    practiceId,
    authorSlug,
    productSlug,
  });

  if (!engine || !activeSession) {
    return null;
  }

  return (
    <ListenAnalyticsTracker
      practiceId={activeSession.practiceId}
      trackId={engine.currentTrack?.id ?? null}
      path={path}
      currentTime={engine.currentTime}
      duration={engine.displayDuration}
      isPlaying={engine.isPlaying}
      programCompleted={engine.programCompleted}
    />
  );
}
