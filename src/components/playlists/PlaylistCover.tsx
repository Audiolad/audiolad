"use client";

import { useState } from "react";

import { buildPlaylistCoverAlt } from "@/lib/seo/cover-alt";

type PlaylistCoverProps = {
  title: string;
  customCoverUrl?: string | null;
  mosaicCoverUrls?: Array<string | null>;
  className?: string;
  gradientClassName?: string;
  decorative?: boolean;
  coverAlt?: string;
};

const FALLBACK_GRADIENTS = [
  "from-[#f5d7e7] to-[#bd91df]",
  "from-[#d9c9f3] to-[#8f73cd]",
  "from-[#f4d6aa] to-[#d399c9]",
  "from-[#6870b7] to-[#c9b7ea]",
  "from-[#f0bcd1] to-[#af7ed2]",
  "from-[#6f69b5] to-[#d6c4ee]",
];

function gradientForTitle(title: string): string {
  let hash = 0;

  for (let i = 0; i < title.length; i += 1) {
    hash = (hash + title.charCodeAt(i) * (i + 1)) % FALLBACK_GRADIENTS.length;
  }

  return FALLBACK_GRADIENTS[hash] ?? FALLBACK_GRADIENTS[0];
}

function CoverImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div className={`bg-[#ece4f8] ${className ?? ""}`} aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`h-full w-full object-cover ${className ?? ""}`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

function MosaicTile({
  url,
  alt,
  className,
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
}) {
  if (!url) {
    return <div className={`bg-[#ece4f8] ${className ?? ""}`} aria-hidden />;
  }

  return <CoverImage src={url} alt={alt} className={className} />;
}

export default function PlaylistCover({
  title,
  customCoverUrl,
  mosaicCoverUrls = [],
  className = "",
  gradientClassName,
  decorative = true,
  coverAlt,
}: PlaylistCoverProps) {
  const gradient =
    gradientClassName ?? `bg-gradient-to-br ${gradientForTitle(title)}`;
  const urls = mosaicCoverUrls.filter((url): url is string => Boolean(url));
  const resolvedAlt = coverAlt?.trim() || buildPlaylistCoverAlt(title);
  const ariaHidden = decorative ? true : undefined;

  if (customCoverUrl) {
    return (
      <div
        className={`relative aspect-square overflow-hidden ${className}`}
        aria-hidden={ariaHidden}
        aria-label={decorative ? undefined : resolvedAlt}
      >
        <CoverImage
          src={customCoverUrl}
          alt={decorative ? "" : resolvedAlt}
          className="absolute inset-0"
        />
      </div>
    );
  }

  if (urls.length === 0) {
    return (
      <div
        className={`relative flex aspect-square items-center justify-center overflow-hidden text-4xl text-white ${gradient} ${className}`}
        aria-hidden={ariaHidden}
        aria-label={decorative ? undefined : resolvedAlt}
      >
        ♫
      </div>
    );
  }

  if (urls.length === 1) {
    return (
      <div
        className={`relative aspect-square overflow-hidden ${className}`}
        aria-hidden={ariaHidden}
        aria-label={decorative ? undefined : resolvedAlt}
      >
        <MosaicTile url={urls[0]} alt="" className="absolute inset-0" />
      </div>
    );
  }

  if (urls.length === 2) {
    return (
      <div
        className={`relative grid aspect-square grid-cols-2 overflow-hidden ${className}`}
        aria-hidden={ariaHidden}
        aria-label={decorative ? undefined : resolvedAlt}
      >
        <MosaicTile url={urls[0]} alt="" />
        <MosaicTile url={urls[1]} alt="" />
      </div>
    );
  }

  if (urls.length === 3) {
    return (
      <div
        className={`relative grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden ${className}`}
        aria-hidden={ariaHidden}
        aria-label={decorative ? undefined : resolvedAlt}
      >
        <MosaicTile url={urls[0]} alt="" className="row-span-2" />
        <MosaicTile url={urls[1]} alt="" />
        <MosaicTile url={urls[2]} alt="" />
      </div>
    );
  }

  return (
    <div
      className={`relative grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden ${className}`}
      aria-hidden={ariaHidden}
      aria-label={decorative ? undefined : resolvedAlt}
    >
      <MosaicTile url={urls[0]} alt="" />
      <MosaicTile url={urls[1]} alt="" />
      <MosaicTile url={urls[2]} alt="" />
      <MosaicTile url={urls[3]} alt="" />
    </div>
  );
}
