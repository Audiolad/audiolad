"use client";

import { useState } from "react";

import {
  resolvePlaylistCoverPresentation,
  type PlaylistCoverPresentation,
} from "@/lib/playlists/cover-presentation";
import { buildPlaylistCoverAlt } from "@/lib/seo/cover-alt";

type PlaylistCoverProps = {
  title: string;
  customCoverUrl?: string | null;
  mosaicCoverUrls?: Array<string | null>;
  className?: string;
  gradientClassName?: string;
  decorative?: boolean;
  coverAlt?: string;
  editable?: boolean;
  onCoverClick?: () => void;
  coverActionLabel?: string;
  coverAriaLabel?: string;
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

function NeutralPlaylistPlaceholder({
  gradient,
  className,
  compact = false,
}: {
  gradient: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center text-white ${gradient} ${className ?? ""}`}
      aria-hidden
    >
      <span className={compact ? "text-lg" : "text-4xl"}>♫</span>
    </div>
  );
}

function MosaicTile({
  url,
  gradient,
}: {
  url: string | null;
  gradient: string;
}) {
  if (!url) {
    return <NeutralPlaylistPlaceholder gradient={gradient} compact />;
  }

  return <CoverImage src={url} alt="" />;
}

function PlaylistCoverVisual({
  presentation,
  gradient,
  className,
  ariaHidden,
  resolvedAlt,
}: {
  presentation: PlaylistCoverPresentation;
  gradient: string;
  className: string;
  ariaHidden?: boolean;
  resolvedAlt: string;
}) {
  if (presentation.kind === "custom") {
    return (
      <div
        className={`relative aspect-square overflow-hidden ${className}`}
        aria-hidden={ariaHidden}
        aria-label={ariaHidden ? undefined : resolvedAlt}
      >
        <CoverImage
          src={presentation.url}
          alt={ariaHidden ? "" : resolvedAlt}
          className="absolute inset-0"
        />
      </div>
    );
  }

  if (presentation.kind === "placeholder") {
    return (
      <div
        className={`relative aspect-square overflow-hidden ${className}`}
        aria-hidden={ariaHidden}
        aria-label={ariaHidden ? undefined : resolvedAlt}
      >
        <NeutralPlaylistPlaceholder gradient={gradient} />
      </div>
    );
  }

  return (
    <div
      className={`relative grid aspect-square grid-cols-2 grid-rows-2 gap-0 overflow-hidden ${className}`}
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : resolvedAlt}
    >
      {presentation.urls.map((url, index) => (
        <div key={index} className="h-full min-h-0 min-w-0 overflow-hidden">
          <MosaicTile url={url} gradient={gradient} />
        </div>
      ))}
    </div>
  );
}

export default function PlaylistCover({
  title,
  customCoverUrl,
  mosaicCoverUrls = [],
  className = "",
  gradientClassName,
  decorative = true,
  coverAlt,
  editable = false,
  onCoverClick,
  coverActionLabel = "Изменить обложку",
  coverAriaLabel,
}: PlaylistCoverProps) {
  const gradient =
    gradientClassName ?? `bg-gradient-to-br ${gradientForTitle(title)}`;
  const presentation = resolvePlaylistCoverPresentation(
    customCoverUrl,
    mosaicCoverUrls,
  );
  const resolvedAlt = coverAlt?.trim() || buildPlaylistCoverAlt(title);
  const ariaHidden = decorative ? true : undefined;

  const visual = (
    <PlaylistCoverVisual
      presentation={presentation}
      gradient={gradient}
      className={editable ? "h-full w-full" : className}
      ariaHidden={editable ? true : ariaHidden}
      resolvedAlt={resolvedAlt}
    />
  );

  if (!editable) {
    return visual;
  }

  return (
    <button
      type="button"
      onClick={onCoverClick}
      aria-label={coverAriaLabel ?? coverActionLabel}
      className={`group relative block cursor-pointer overflow-hidden p-0 ${className}`}
    >
      {visual}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="px-3 text-center text-sm font-semibold text-white">
          {coverActionLabel}
        </span>
      </span>
    </button>
  );
}
