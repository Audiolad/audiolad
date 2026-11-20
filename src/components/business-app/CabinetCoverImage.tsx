"use client";

import { useEffect, useState } from "react";

import {
  isCabinetCoverCached,
  preloadCabinetCover,
  resolveCabinetCoverSrc,
  scheduleCabinetCoverPreload,
  subscribeCabinetCoverCache,
} from "@/lib/business-app/cabinet-cover-cache";

type Props = {
  src: string;
  width: number;
  height: number;
  onError?: () => void;
};

/**
 * Cabinet / queue thumbnail. Bytes are fetched only through the shared
 * four-at-a-time scheduler (low priority, after idle). Until a blob is ready
 * the brown placeholder stays; a remount paints the cached blob immediately.
 * A still-mounted mini-player follows a new src when the track changes.
 */
export default function CabinetCoverImage({ src, width, height, onError }: Props) {
  const [current, setCurrent] = useState<string | null>(() =>
    isCabinetCoverCached(src) ? resolveCabinetCoverSrc(src) : null,
  );

  useEffect(() => {
    setCurrent(isCabinetCoverCached(src) ? resolveCabinetCoverSrc(src) : null);
    const unsubscribe = subscribeCabinetCoverCache((ready) => {
      if (ready !== src) return;
      setCurrent(resolveCabinetCoverSrc(src));
    });
    const cancel = scheduleCabinetCoverPreload(() => {
      void preloadCabinetCover(src);
    });
    return () => {
      unsubscribe();
      cancel();
    };
  }, [src]);

  if (!current) return null;

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
