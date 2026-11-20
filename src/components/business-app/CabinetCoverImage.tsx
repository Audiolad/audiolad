"use client";

import { useEffect, useState } from "react";

import {
  preloadCabinetCover,
  resolveCabinetCoverSrc,
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
 */
export default function CabinetCoverImage({ src, width, height, onError }: Props) {
  const [current] = useState(() => resolveCabinetCoverSrc(src) ?? src);
  useEffect(() => {
    preloadCabinetCover(src);
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- public or same-origin cabinet cover, not the optimizer
    <img
      src={current}
      alt=""
      width={width}
      height={height}
      decoding="sync"
      onError={onError}
    />
  );
}
