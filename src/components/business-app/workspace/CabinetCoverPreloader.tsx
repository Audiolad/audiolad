"use client";

import { useEffect } from "react";

import { useBusinessGuestPlaybackOptional } from "@/components/business-app/sound/BusinessGuestPlayback";
import { useCabinetPlayerOptional } from "@/components/business-app/workspace/BusinessCabinetPlayer";
import {
  scheduleCabinetCoverPreload,
  selectCabinetCoverPreloadUrls,
  setCabinetCoverPreloadSet,
} from "@/lib/business-app/cabinet-cover-cache";

/**
 * Warm only the playing track and the next three covers. The music page unmounts
 * on every tab change; the tab-lifetime cache keeps those four instant on return.
 * Starts after the track is playing, otherwise after a short idle, so covers
 * never jump the queue ahead of audio and UI requests.
 * The guest coffee demo uses BusinessGuestPlayback (not the cabinet player);
 * an empty allowed set must not open the floodgates.
 */
export default function CabinetCoverPreloader() {
  const player = useCabinetPlayerOptional();
  const guest = useBusinessGuestPlaybackOptional();
  const cabinetTracks = player?.accessModel?.tracks;
  const useCabinet = (cabinetTracks?.length ?? 0) > 0;
  const guestAtmosphere = guest?.atmosphere;
  const guestBarTracks = guest?.barTracks;
  const index = useCabinet ? (player?.view.index ?? 0) : Math.max(0, guest?.view.index ?? 0);
  const order = useCabinet ? (player?.queueOrder ?? null) : null;
  const playing = (useCabinet ? player?.view.status : guest?.view.status) === "playing";

  useEffect(() => {
    const tracks = useCabinet
      ? (cabinetTracks ?? [])
      : (guestAtmosphere?.tracks ?? []).map((track) => ({
          coverUrl: guestBarTracks?.get(track.audioItemId)?.coverSrc ?? null,
        }));
    const urls = selectCabinetCoverPreloadUrls(tracks, index, order);
    const apply = () => {
      setCabinetCoverPreloadSet(urls);
    };
    if (playing) {
      apply();
      return;
    }
    return scheduleCabinetCoverPreload(apply);
  }, [useCabinet, cabinetTracks, guestAtmosphere, guestBarTracks, index, order, playing]);

  return null;
}
