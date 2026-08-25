"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  PLAYLIST_CATALOG_SEARCH_DEBOUNCE_MS,
  buildPlaylistCatalogHref,
} from "@/lib/playlists/listing-filters";
import { normalizePlaylistListingSearchQuery } from "@/lib/playlists/listing-contract";
import type { PlaylistListingSort } from "@/lib/playlists/listing-contract";

type PlaylistCatalogSearchProps = {
  query: string;
  sort: PlaylistListingSort;
  topic?: string | null;
};

export default function PlaylistCatalogSearch({
  query,
  sort,
  topic = null,
}: PlaylistCatalogSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  const debounceRef = useRef<number | null>(null);
  const skipSyncRef = useRef(false);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }

    setValue(query);
  }, [query]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function replaceHref(nextQuery: string) {
    const href = buildPlaylistCatalogHref({ q: nextQuery, sort, topic });
    const currentHref = buildPlaylistCatalogHref({ q: query, sort, topic });

    if (href === currentHref) {
      return;
    }

    skipSyncRef.current = true;
    router.replace(href);
  }

  function scheduleReplace(nextQuery: string) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    if (normalizePlaylistListingSearchQuery(nextQuery) === query) {
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      replaceHref(nextQuery);
    }, PLAYLIST_CATALOG_SEARCH_DEBOUNCE_MS);
  }

  function applyNow() {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    replaceHref(value);
  }

  return (
    <form
      role="search"
      data-playlist-catalog-search
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        applyNow();
      }}
    >
      <label className="sr-only" htmlFor="playlist-catalog-search">
        Поиск плейлистов
      </label>
      <input
        id="playlist-catalog-search"
        type="search"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          scheduleReplace(nextValue);
        }}
        placeholder="Найти плейлист"
        autoComplete="off"
        className="min-h-11 w-full rounded-full border border-[#ddcfef] bg-white px-4 text-sm text-[#25135c] placeholder:text-[#7d70a2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      />
    </form>
  );
}
