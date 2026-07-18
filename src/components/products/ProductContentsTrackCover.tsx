"use client";

import { useMemo, useState } from "react";

import { ResponsiveCoverImage } from "@/components/images/ResponsiveImage";
import { buildProductCoverResponsiveProps } from "@/lib/products/cover-display";

type ProductContentsTrackCoverProps = {
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
  alt: string;
  className?: string;
  displayWidth?: number;
};

export default function ProductContentsTrackCover({
  coverUrl,
  coverImage,
  updatedAt,
  alt,
  className = "size-[76px] shrink-0 overflow-hidden rounded-[14px] bg-[#f4ecfb] md:size-[96px]",
  displayWidth = 96,
}: ProductContentsTrackCoverProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const responsive = useMemo(
    () =>
      buildProductCoverResponsiveProps(
        coverUrl,
        coverImage,
        updatedAt,
        displayWidth,
      ),
    [coverImage, coverUrl, displayWidth, updatedAt],
  );

  const resolvedUrl = responsive.src;

  if (!resolvedUrl || imageFailed) {
    return null;
  }

  return (
    <div className={className}>
      <ResponsiveCoverImage
        src={resolvedUrl}
        alt={alt}
        className="h-full w-full object-cover"
        manifest={responsive.manifest}
        displayWidth={displayWidth}
        srcSet={responsive.srcSet}
        sizes={responsive.srcSet ? responsive.sizes : undefined}
        onError={() => setImageFailed(true)}
      />
    </div>
  );
}
