"use client";

import { useEffect } from "react";

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
 */
export default function CabinetCoverPreloader() {
  const player = useCabinetPlayerOptional();
  const tracks = player?.accessModel?.tracks;
  const index = player?.view.index ?? 0;
  const order = player?.queueOrder ?? null;
  const playing = player?.view.status === "playing";

  useEffect(() => {
    const urls = selectCabinetCoverPreloadUrls(tracks ?? [], index, order);
    const apply = () => {
      setCabinetCoverPreloadSet(urls);
    };
    if (playing) {
      apply();
      return;
    }
    return scheduleCabinetCoverPreload(apply);
  }, [tracks, index, order, playing]);

  return null;
}
