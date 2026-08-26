"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import AuthorLink from "@/components/authors/AuthorLink";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";

export type PlaylistItemRowData = {
  practiceId: string;
  audioItemId?: string | null;
  title: string;
  authorName: string | null;
  authorSlug?: string | null;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
  formatLabel?: string | null;
  metaLabel?: string | null;
  available: boolean;
  /** Listen or product href for title/cover; null when unavailable. */
  href: string | null;
  /** Direct listen href for the Play control; may differ from href. */
  listenHref: string | null;
};

export type PlaylistItemCoverPlayback = {
  isPlaying: boolean;
  onPlayPause: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type PlaylistItemRowProps = {
  item: PlaylistItemRowData;
  index: number;
  showPosition?: boolean;
  showMetaOnDesktop?: boolean;
  /** Shared playlist drag handle. */
  leadingControls?: ReactNode;
  /** Owner reorder / menu controls. */
  trailingControls?: ReactNode;
  /**
   * Public `/p/[slug]` rows: cover is the play/pause target.
   * Owner / editorial rows omit this and keep the separate Play circle.
   */
  coverPlayback?: PlaylistItemCoverPlayback;
};

function PlayIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function PauseIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7 5.5h3.5v13H7V5.5Zm6.5 0H17v13h-3.5V5.5Z" />
    </svg>
  );
}

/**
 * Compact Spotify-style playlist row (≈76–88px).
 * Interactive controls are separate — the row itself is not a single link.
 */
export default function PlaylistItemRow({
  item,
  index,
  showPosition = true,
  showMetaOnDesktop = true,
  leadingControls,
  trailingControls,
  coverPlayback,
}: PlaylistItemRowProps) {
  const playEnabled = Boolean(item.listenHref) && !coverPlayback?.disabled;
  const titleHref = item.href ?? item.listenHref;
  const coverPlaybackBusy = Boolean(coverPlayback?.loading);

  return (
    <article
      className="playlist-item-row flex min-h-[76px] max-h-[88px] items-center gap-2 rounded-[16px] border border-[#eadff8] bg-white px-2 py-1.5 sm:gap-3 sm:px-3"
      data-practice-id={item.practiceId}
      data-audio-item-id={item.audioItemId ?? undefined}
      data-playlist-row-play={coverPlayback ? "cover" : "circle"}
    >
      {leadingControls}
      {showPosition ? (
        <span
          className="hidden w-5 shrink-0 text-center text-[11px] font-medium text-[#8f82ad] sm:block"
          aria-hidden
        >
          {index + 1}
        </span>
      ) : null}

      {coverPlayback ? null : playEnabled ? (
        <Link
          href={item.listenHref!}
          aria-label={`Слушать ${item.title}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <PlayIcon />
        </Link>
      ) : (
        <button
          type="button"
          disabled
          aria-label={`Слушать ${item.title} — недоступно`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white opacity-40"
        >
          <PlayIcon />
        </button>
      )}

      {coverPlayback ? (
        <button
          type="button"
          disabled={!playEnabled || coverPlaybackBusy}
          onClick={coverPlayback.onPlayPause}
          aria-label={
            !playEnabled
              ? `Слушать ${item.title} — недоступно`
              : coverPlayback.isPlaying
                ? `Пауза: ${item.title}`
                : `Слушать ${item.title}`
          }
          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[12px] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <ProductCoverThumbnail
            slug={item.practiceId}
            title={item.title}
            coverUrl={item.coverUrl}
            coverImage={item.coverImage}
            updatedAt={item.updatedAt}
            authorName={item.authorName}
            displayWidth={56}
            className="h-full w-full rounded-[12px]"
          />
          {playEnabled ? (
            <span
              className="pointer-events-none absolute bottom-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#7042c5] text-white"
              aria-hidden
            >
              {coverPlayback.isPlaying ? (
                <PauseIcon />
              ) : (
                <PlayIcon className="h-3 w-3" />
              )}
            </span>
          ) : null}
        </button>
      ) : titleHref ? (
        <Link
          href={titleHref}
          className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          aria-label={item.title}
        >
          <ProductCoverThumbnail
            slug={item.practiceId}
            title={item.title}
            coverUrl={item.coverUrl}
            coverImage={item.coverImage}
            updatedAt={item.updatedAt}
            authorName={item.authorName}
            displayWidth={56}
            className="h-full w-full rounded-[12px]"
          />
        </Link>
      ) : (
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] opacity-70">
          <ProductCoverThumbnail
            slug={item.practiceId}
            title={item.title}
            coverUrl={item.coverUrl}
            coverImage={item.coverImage}
            updatedAt={item.updatedAt}
            authorName={item.authorName}
            displayWidth={56}
            className="h-full w-full rounded-[12px]"
          />
        </div>
      )}

      <div className="min-w-0 flex-1 py-0.5">
        {item.formatLabel ? (
          <p className={PRODUCT_FORMAT_LINE_CLASS}>{item.formatLabel}</p>
        ) : null}
        {titleHref ? (
          <Link
            href={titleHref}
            className={`line-clamp-2 text-[14px] font-semibold leading-[1.25] text-[#25135c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${item.formatLabel ? "mt-0.5" : ""}`}
          >
            {item.title}
          </Link>
        ) : (
          <p
            className={`line-clamp-2 text-[14px] font-semibold leading-[1.25] text-[#25135c] ${item.formatLabel ? "mt-0.5" : ""}`}
          >
            {item.title}
          </p>
        )}
        {item.authorName ? (
          <AuthorLink
            authorSlug={item.authorSlug}
            authorName={item.authorName}
            className="mt-0.5 block truncate text-[12px] leading-4 text-[#5c4f82]"
          />
        ) : null}
        {!item.available ? (
          <p className="mt-0.5 truncate text-[11px] leading-4 text-[#b34f63]">
            Материал сейчас недоступен
          </p>
        ) : showMetaOnDesktop && item.metaLabel ? (
          <p className="mt-0.5 hidden truncate text-[11px] leading-4 text-[#7d70a2] sm:block">
            {item.metaLabel}
          </p>
        ) : null}
      </div>

      {trailingControls ? (
        <div className="flex shrink-0 items-center gap-0.5">{trailingControls}</div>
      ) : null}
    </article>
  );
}
