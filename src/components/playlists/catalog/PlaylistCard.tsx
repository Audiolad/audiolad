import Link from "next/link";

import PlaylistPlayButton from "@/components/playlists/catalog/PlaylistPlayButton";
import PlaylistSaveButton from "@/components/playlists/catalog/PlaylistSaveButton";
import {
  formatPlaylistCardCreatorName,
  formatPlaylistCatalogMeta,
  PLAYLIST_CARD_TITLE_CLASS,
} from "@/lib/playlists/format-item-count";
import type { PlaylistListingItem } from "@/lib/playlists/listing-contract";
import { buildPlaylistCoverAlt } from "@/lib/seo/cover-alt";

type PlaylistCardProps = {
  item: PlaylistListingItem;
  isAuthenticated: boolean;
  signInReturnPath: string;
  onViewerSavedChange?: (saved: boolean) => void;
};

export default function PlaylistCard({
  item,
  isAuthenticated,
  signInReturnPath,
  onViewerSavedChange,
}: PlaylistCardProps) {
  const meta = formatPlaylistCatalogMeta(item.trackCount, item.durationSeconds);
  const creatorName = formatPlaylistCardCreatorName(item.creator);
  const coverAlt = buildPlaylistCoverAlt(item.title);
  const hasCover = Boolean(item.coverUrl?.trim());

  return (
    <article
      data-playlist-catalog-card
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white shadow-[0_6px_16px_rgba(91,62,145,0.06)]"
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

        <PlaylistSaveButton
          playlistId={item.id}
          saved={item.viewer.saved}
          isAuthenticated={isAuthenticated}
          signInReturnPath={signInReturnPath}
          onViewerSavedChange={onViewerSavedChange}
        />

        <PlaylistPlayButton slug={item.slug} title={item.title} />
      </div>

      <Link
        href={item.href}
        data-playlist-catalog-info-block
        className="block flex-1 px-2.5 pb-2.5 pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <h3 className={PLAYLIST_CARD_TITLE_CLASS}>
          {item.title}
        </h3>

        <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
          {creatorName || "\u00a0"}
        </p>

        <p data-playlist-catalog-card-meta className="mt-1 text-xs leading-4 text-[#7d70a2]">
          {meta}
        </p>
      </Link>
    </article>
  );
}
