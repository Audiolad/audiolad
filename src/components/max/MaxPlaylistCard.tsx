"use client";

import { formatPlaylistCardCreatorName, formatPlaylistCatalogMeta } from "@/lib/playlists/format-item-count";
import type { PlaylistListingAccess } from "@/lib/playlists/listing-contract";
import type { MaxPlaylistCardModel } from "@/lib/max/playlist-types";

const ACCESS_BADGE: Record<PlaylistListingAccess, string | null> = {
  free: null,
  paid: "Платно",
  mixed: "Смешанный",
};

type MaxPlaylistCardProps = {
  item: MaxPlaylistCardModel;
  onOpen: (slug: string) => void;
};

export default function MaxPlaylistCard({ item, onOpen }: MaxPlaylistCardProps) {
  const creatorName = formatPlaylistCardCreatorName(item.creator);
  const meta = formatPlaylistCatalogMeta(item.trackCount, item.durationSeconds);
  const accessLabel = ACCESS_BADGE[item.access];
  const hasCover = Boolean(item.coverUrl);

  return (
    <button
      type="button"
      data-max-playlist-card={item.slug}
      onClick={() => onOpen(item.slug)}
      className="flex h-full min-w-0 w-full flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white text-left shadow-[0_6px_16px_rgba(91,62,145,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
    >
      <div className="relative w-full overflow-hidden bg-[#f4ecfb]">
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element -- listing coverUrl is already resolved
          <img
            src={item.coverUrl ?? ""}
            alt=""
            className="aspect-square w-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-[#d9c9f3] to-[#8f73cd] text-4xl text-white"
            aria-hidden="true"
          >
            ♫
          </div>
        )}
        {accessLabel ? (
          <p className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold leading-4 text-[#7042c5]">{accessLabel}</p>
        ) : null}
      </div>
      <div className="min-w-0 w-full flex-1 p-3">
        <h3 className="line-clamp-2 h-10 min-h-10 break-words [overflow-wrap:anywhere] text-[14px] font-semibold leading-5 text-[#25135c]">
          {item.title}
        </h3>
        <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
          {creatorName || "\u00a0"}
        </p>
        <p className="mt-1 min-h-8 break-words text-xs leading-4 text-[#7d70a2]">{meta}</p>
      </div>
    </button>
  );
}
