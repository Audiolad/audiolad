import Link from "next/link";

import {
  PLAYLIST_CATALOG_SORT_OPTIONS,
  buildPlaylistCatalogHref,
} from "@/lib/playlists/listing-filters";
import type { PlaylistListingSort } from "@/lib/playlists/listing-contract";

type PlaylistCatalogSortProps = {
  query: string;
  sort: PlaylistListingSort;
  topic?: string | null;
};

export default function PlaylistCatalogSort({
  query,
  sort,
  topic = null,
}: PlaylistCatalogSortProps) {
  return (
    <nav className="mt-3" aria-label="Сортировка плейлистов" data-playlist-catalog-sort>
      <div className="flex gap-2">
        {PLAYLIST_CATALOG_SORT_OPTIONS.map((option) => {
          const isActive = option.value === sort;

          return (
            <Link
              key={option.value}
              href={buildPlaylistCatalogHref({
                q: query,
                sort: option.value,
                topic,
              })}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                isActive
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
