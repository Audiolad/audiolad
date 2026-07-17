"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import AuthorLink from "@/components/authors/AuthorLink";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";

export type PlaylistItemRowData = {
  practiceId: string;
  title: string;
  authorName: string | null;
  authorSlug?: string | null;
  coverDisplayUrl: string | null;
  formatLabel?: string | null;
  metaLabel?: string | null;
  available: boolean;
  /** Listen or product href for title/cover; null when unavailable. */
  href: string | null;
  /** Direct listen href for the Play control; may differ from href. */
  listenHref: string | null;
};

type PlaylistItemRowProps = {
  item: PlaylistItemRowData;
  index: number;
  showPosition?: boolean;
  showMetaOnDesktop?: boolean;
  /** Owner reorder / menu controls. */
  trailingControls?: ReactNode;
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
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
  trailingControls,
}: PlaylistItemRowProps) {
  const playEnabled = Boolean(item.listenHref);
  const titleHref = item.href ?? item.listenHref;

  return (
    <article
      className="playlist-item-row flex min-h-[76px] max-h-[88px] items-center gap-2 rounded-[16px] border border-[#eadff8] bg-white px-2 py-1.5 sm:gap-3 sm:px-3"
      data-practice-id={item.practiceId}
    >
      {showPosition ? (
        <span
          className="hidden w-5 shrink-0 text-center text-[11px] font-medium text-[#8f82ad] sm:block"
          aria-hidden
        >
          {index + 1}
        </span>
      ) : null}

      {playEnabled ? (
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

      {titleHref ? (
        <Link
          href={titleHref}
          className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          aria-label={item.title}
        >
          <ProductCoverThumbnail
            slug={item.practiceId}
            title={item.title}
            coverUrl={item.coverDisplayUrl}
            authorName={item.authorName}
            className="h-full w-full rounded-[12px]"
          />
        </Link>
      ) : (
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] opacity-70">
          <ProductCoverThumbnail
            slug={item.practiceId}
            title={item.title}
            coverUrl={item.coverDisplayUrl}
            authorName={item.authorName}
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
