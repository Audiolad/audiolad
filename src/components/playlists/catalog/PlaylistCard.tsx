import Link from "next/link";

import { formatPlaylistCatalogMeta } from "@/lib/playlists/format-item-count";
import type { PlaylistListingItem } from "@/lib/playlists/listing-contract";
import { buildPlaylistCoverAlt } from "@/lib/seo/cover-alt";
import { PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

type PlaylistCardProps = {
  item: PlaylistListingItem;
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

export default function PlaylistCard({ item }: PlaylistCardProps) {
  const meta = formatPlaylistCatalogMeta(item.trackCount, item.durationSeconds);
  const coverAlt = buildPlaylistCoverAlt(item.title);
  const hasCover = Boolean(item.coverUrl?.trim());

  return (
    <article
      data-playlist-catalog-card
      className="overflow-hidden rounded-[20px] border border-[#eadff8] bg-white shadow-[0_6px_16px_rgba(91,62,145,0.06)]"
    >
      <div data-playlist-catalog-media-zone className="relative overflow-hidden bg-[#f4ecfb]">
        <Link
          href={item.href}
          aria-label={hasCover ? coverAlt : "Нет обложки"}
          className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element -- listing coverUrl is already resolved
            <img
              src={item.coverUrl ?? ""}
              alt={coverAlt}
              className="aspect-square w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              data-playlist-catalog-cover-placeholder
              className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-[#d9c9f3] to-[#8f73cd] text-4xl text-white"
              aria-hidden="true"
            >
              ♫
            </div>
          )}
        </Link>

        <button
          type="button"
          data-playlist-catalog-heart-button
          data-playlist-catalog-heart-saved={item.viewer.saved ? "true" : "false"}
          aria-label="Сохранить"
          aria-pressed={item.viewer.saved}
          className={`absolute top-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[18px] leading-none shadow-[0_4px_12px_rgba(36,19,63,0.28)] before:absolute before:-inset-1 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            item.viewer.saved ? "text-[#7042c5]" : "text-[#4b2f86]"
          }`}
        >
          <span aria-hidden="true">{item.viewer.saved ? "♥" : "♡"}</span>
        </button>

        <button
          type="button"
          data-playlist-catalog-play-button
          aria-label={PLAY_ACTION_LABEL}
          className="absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#4b2f86] shadow-[0_4px_12px_rgba(36,19,63,0.28)] before:absolute before:-inset-1 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <PlayIcon />
        </button>
      </div>

      <Link
        href={item.href}
        data-playlist-catalog-info-block
        className="block px-2.5 pb-2.5 pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <h3 className="line-clamp-3 text-[14px] font-semibold leading-5 text-[#25135c] sm:text-[15px] sm:leading-5">
          {item.title}
        </h3>

        <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
          {item.creator || "\u00a0"}
        </p>

        <p data-playlist-catalog-card-meta className="mt-1 text-xs leading-4 text-[#7d70a2]">
          {meta}
        </p>
      </Link>
    </article>
  );
}
