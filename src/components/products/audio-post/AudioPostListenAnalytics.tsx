"use client";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
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

/**
 * Legacy mount point for audio_post pages.
 * Playback events (audio_play_started / milestones / audio_completed) are emitted
 * by GlobalPlaybackAnalytics inside GlobalAudioPlayer — this component stays as a
 * no-op so product pages do not double-count, while getActiveInlineAudioPostSession
 * remains available for unit helpers.
 */
export default function AudioPostListenAnalytics(
  _props: AudioPostListenAnalyticsProps,
) {
  // Touch hooks so the page still sits under the global player context contract.
  // Playback events come from GlobalPlaybackAnalytics — keep this mount as a no-op.
  useGlobalAudioPlayer();
  useOptionalPlayerEngine();
  void _props;
  return null;
}
