"use client";

import { useEffect } from "react";

import {
  preloadCabinetCover,
  resolveCabinetCoverSrc,
  scheduleCabinetCoverPreload,
} from "@/lib/business-app/cabinet-cover-cache";

type Props = {
  src: string;
  width: number;
  height: number;
  onError?: () => void;
};

/**
 * Cabinet / queue thumbnail. Uses a tab-lifetime blob URL when the cover was
 * already fetched, so a remount paints immediately instead of the brown placeholder.
 * When the track changes, the same mounted instance (mini-player / now playing)
 * must follow the new src, using the cached blob if it is already ready.
 */
export default function CabinetCoverImage({ src, width, height, onError }: Props) {
  const current = resolveCabinetCoverSrc(src) ?? src;
  useEffect(() => {
    return scheduleCabinetCoverPreload(() => {
      void preloadCabinetCover(src);
    });
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- public or same-origin cabinet cover, not the optimizer
    <img
      src={current}
      alt=""
      width={width}
      height={height}
      decoding="sync"
      fetchPriority="low"
      onError={onError}
    />
  );
}
