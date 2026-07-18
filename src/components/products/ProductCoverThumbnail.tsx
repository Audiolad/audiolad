"use client";

import { useMemo, useState } from "react";

import { ResponsiveCoverImage } from "@/components/images/ResponsiveImage";
import {
  getProductCoverGradient,
  getProductCoverSymbol,
  getProductCoverDisplayUrl,
  getProductCoverPlaceholder,
} from "@/lib/products/cover-display";
import { buildProductCoverAlt } from "@/lib/seo/cover-alt";
import type { ImageVariantKey } from "@/lib/images/image-types";
import {
  buildImageSrcSetFromManifest,
  resolvePracticeCoverPublicUrl,
} from "@/lib/images/image-url";
import { sanitizePublicImageManifest } from "@/lib/images/image-manifest";

type ProductCoverThumbnailProps = {
  slug: string;
  title: string;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
  className?: string;
  authorName?: string | null;
  format?: string | null;
  coverAlt?: string;
  displayWidth?: number;
  variant?: ImageVariantKey;
  priority?: boolean;
};

function resolveCoverAlt({
  title,
  authorName,
  format,
  coverAlt,
}: Pick<
  ProductCoverThumbnailProps,
  "title" | "authorName" | "format" | "coverAlt"
>): string {
  if (coverAlt?.trim()) {
    return coverAlt.trim();
  }

  return buildProductCoverAlt({
    title,
    authorName,
    format,
  });
}

export default function ProductCoverThumbnail({
  slug,
  title,
  coverUrl,
  coverImage,
  updatedAt,
  className = "h-20 w-20 shrink-0 rounded-[20px]",
  authorName,
  format,
  coverAlt,
  displayWidth = 168,
  variant,
  priority = false,
}: ProductCoverThumbnailProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedUrl = useMemo(
    () =>
      getProductCoverDisplayUrl(
        coverUrl,
        updatedAt,
        coverImage,
        displayWidth,
        variant,
      ),
    [coverImage, coverUrl, displayWidth, updatedAt, variant],
  );
  const manifest = useMemo(
    () => sanitizePublicImageManifest(coverImage),
    [coverImage],
  );
  const srcSet = useMemo(
    () =>
      manifest
        ? buildImageSrcSetFromManifest(manifest, resolvePracticeCoverPublicUrl)
        : null,
    [manifest],
  );
  const sizes = `${displayWidth}px`;
  const showCover = Boolean(resolvedUrl) && !imageFailed;
  const gradient = getProductCoverGradient(slug);
  const symbol = getProductCoverSymbol(slug);
  const alt = resolveCoverAlt({ title, authorName, format, coverAlt });
  const placeholder = getProductCoverPlaceholder(coverImage);

  if (showCover && resolvedUrl) {
    return (
      <div className={`overflow-hidden bg-[#f4ecfb] ${className}`}>
        <ResponsiveCoverImage
          src={resolvedUrl}
          alt={alt}
          className="h-full w-full object-cover"
          manifest={manifest}
          displayWidth={displayWidth}
          priority={priority}
          srcSet={srcSet}
          sizes={srcSet ? sizes : undefined}
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  if (placeholder && !imageFailed) {
    return (
      <div
        className={`overflow-hidden bg-[#f4ecfb] ${className}`}
        style={{
          backgroundImage: `url(${placeholder})`,
          backgroundSize: "cover",
        }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${gradient} text-3xl text-white ${className}`}
      role="img"
      aria-label={alt}
    >
      {symbol}
    </div>
  );
}
