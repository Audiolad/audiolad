"use client";

import { useRef, useState } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import {
  pressPlaylistCatalogPlayback,
  resolvePlaylistCatalogPlaybackState,
  startPlaylistCatalogPlayback,
  type PlaylistCatalogPlaybackState,
} from "@/lib/playlists/catalog-playback";

export type UsePlaylistCatalogPlaybackInput = {
  slug: string;
  title: string;
};

export type UsePlaylistCatalogPlaybackResult = {
  state: PlaylistCatalogPlaybackState;
  busy: boolean;
  error: string | null;
  onPress: () => void;
};

export function usePlaylistCatalogPlayback({
  slug,
  title,
}: UsePlaylistCatalogPlaybackInput): UsePlaylistCatalogPlaybackResult {
  const { activeQueue, loadPlaylistQueue } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const state = resolvePlaylistCatalogPlaybackState({
    slug,
    activeQueue,
    isPlaying: Boolean(engine?.isPlaying),
  });

  function onPress() {
    void pressPlaylistCatalogPlayback({
      state,
      handlePlayPause: async () => {
        await engine?.handlePlayPause();
      },
      startPlayback: async () => {
        if (inFlightRef.current || busy) {
          return;
        }

        inFlightRef.current = true;
        setBusy(true);
        setError(null);

        const result = await startPlaylistCatalogPlayback({
          slug,
          title,
          loadPlaylistQueue,
        });

        if (!result.ok) {
          setError(result.error);
        }

        inFlightRef.current = false;
        setBusy(false);
      },
    });
  }

  return {
    state,
    busy,
    error,
    onPress,
  };
}
