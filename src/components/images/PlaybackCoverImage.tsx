"use client";

import { useMemo } from "react";

import { ResponsiveCoverImage } from "@/components/images/ResponsiveImage";
import { buildProductCoverResponsiveProps } from "@/lib/products/cover-display";

type PlaybackCoverImageProps = {
  coverUrl: string | null | undefined;
  coverImage?: unknown;
  updatedAt?: string | null;
  displayWidth: number;
  className?: string;
  alt?: string;
  priority?: boolean;
  onError?: () => void;
};

export default function PlaybackCoverImage({
  coverUrl,
  coverImage,
  updatedAt,
  displayWidth,
  className = "h-full w-full object-cover",
  alt = "",
  priority = false,
  onError,
}: PlaybackCoverImageProps) {
  const { src, manifest, srcSet, sizes } = useMemo(
    () =>
      buildProductCoverResponsiveProps(
        coverUrl,
        coverImage,
        updatedAt,
        displayWidth,
      ),
    [coverImage, coverUrl, displayWidth, updatedAt],
  );

  if (!src) {
    return null;
  }

  return (
    <ResponsiveCoverImage
      src={src}
      alt={alt}
      className={className}
      manifest={manifest}
      displayWidth={displayWidth}
      priority={priority}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      onError={onError}
    />
  );
}
