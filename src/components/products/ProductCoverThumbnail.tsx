"use client";

import { useState } from "react";

import {
  getProductCoverGradient,
  getProductCoverSymbol,
} from "@/lib/products/cover-display";

type ProductCoverThumbnailProps = {
  slug: string;
  title: string;
  coverUrl: string | null;
  className?: string;
};

export default function ProductCoverThumbnail({
  slug,
  title,
  coverUrl,
  className = "h-20 w-20 shrink-0 rounded-[20px]",
}: ProductCoverThumbnailProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showCover = Boolean(coverUrl) && !imageFailed;
  const gradient = getProductCoverGradient(slug);
  const symbol = getProductCoverSymbol(slug);

  if (showCover && coverUrl) {
    return (
      <div className={`overflow-hidden bg-[#f4ecfb] ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${gradient} text-3xl text-white ${className}`}
      role="img"
      aria-label={title}
    >
      {symbol}
    </div>
  );
}
