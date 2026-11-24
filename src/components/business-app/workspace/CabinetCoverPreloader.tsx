"use client";

import { useEffect } from "react";

import { useBusinessGuestPlaybackOptional } from "@/components/business-app/sound/BusinessGuestPlayback";
import { useCabinetPlayerOptional } from "@/components/business-app/workspace/BusinessCabinetPlayer";
import {
  CABINET_COVER_PRELOAD_LIMIT,
  GUEST_ATMOSPHERE_COVER_LIMIT,
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
 * t1674u: the guest atmosphere (12 rows on screen) allows all its covers, current first,
 * so no row keeps the brown placeholder; still 4 fetches at a time.
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
    const limit = useCabinet ? CABINET_COVER_PRELOAD_LIMIT : GUEST_ATMOSPHERE_COVER_LIMIT;
    const urls = selectCabinetCoverPreloadUrls(tracks, index, order, limit);
    const apply = () => {
      setCabinetCoverPreloadSet(urls, limit);
    };
    if (playing) {
      apply();
      return;
    }
    return scheduleCabinetCoverPreload(apply);
  }, [useCabinet, cabinetTracks, guestAtmosphere, guestBarTracks, index, order, playing]);

  return null;
}
