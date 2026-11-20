"use client";

import { useEffect } from "react";

import { useCabinetPlayerOptional } from "@/components/business-app/workspace/BusinessCabinetPlayer";
import { cabinetAlbumCoverUrl } from "@/lib/business-app/album-cover";
import { preloadCabinetCovers } from "@/lib/business-app/cabinet-cover-cache";

/**
 * Warm the cover cache while the cabinet shell stays mounted (home / documents /
 * music). The music page itself unmounts on every tab change.
 */
export default function CabinetCoverPreloader() {
  const player = useCabinetPlayerOptional();
  const tracks = player?.accessModel?.tracks;
  useEffect(() => {
    if (!tracks?.length) return;
    preloadCabinetCovers(tracks.map((track) => cabinetAlbumCoverUrl({ coverUrl: track.coverUrl })));
  }, [tracks]);
  return null;
}
