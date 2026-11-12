"use client";

import { useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import { useEffect, useRef } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { shouldTrackPageView } from "@/lib/analytics/dedup";

type AuthorPageViewTrackerProps = {
  authorId: string;
  path: string;
};

export default function AuthorPageViewTracker({
  authorId,
  path,
}: AuthorPageViewTrackerProps) {
  const trackedRef = useRef(false);
  const { session } = useGlobalAudioPlayer();

  useEffect(() => {
    if (trackedRef.current) {
      return;
    }

    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId || !shouldTrackPageView(`author:${authorId}`)) {
      return;
    }

    trackedRef.current = true;

    void trackPlatformEvent({
      sessionId,
      event_name: "author_page_view",
      path,
      author_id: authorId,
      properties: session && isCatalogGlobalPlayerSession(session) &&
        session.playbackAttribution?.playback_mode === "album_radio" &&
        path === `/authors/${session.authorSlug}` ? {
          ...session.playbackAttribution,
          radio_new_artist: session.authorSlug !== session.playbackAttribution.radio_source_author_slug,
        } : {},
    });
  }, [authorId, path, session]);

  return null;
}
