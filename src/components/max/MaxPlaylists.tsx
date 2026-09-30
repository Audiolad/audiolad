"use client";

import { useEffect, useRef, useState } from "react";

import MaxPlaylistCard from "@/components/max/MaxPlaylistCard";
import MaxPlaylistDetail from "@/components/max/MaxPlaylistDetail";
import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_PLAYLISTS_CATALOG_PATH } from "@/lib/max/host";
import {
  readMaxPlaylistCatalogPayload,
  type MaxPlaylistCardModel,
} from "@/lib/max/playlist-types";
import { PLAYLIST_CATALOG_SORT_OPTIONS } from "@/lib/playlists/listing-filters";
import {
  PLAYLIST_LISTING_ACCESS_FILTERS,
  PLAYLIST_LISTING_SEARCH_MAX_LENGTH,
  type PlaylistListingAccessFilter,
  type PlaylistListingSort,
} from "@/lib/playlists/listing-contract";

const SEARCH_DEBOUNCE_MS = 300;

const ACCESS_LABELS: Record<PlaylistListingAccessFilter, string> = {
  all: "Все",
  free: "Бесплатные",
  paid: "Платные",
  mixed: "Смешанные",
};

type CatalogStatus = "loading" | "ready" | "error";

function MaxPlaylistCatalog({
  onOpen,
}: {
  onOpen: (slug: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PlaylistListingSort>("newest");
  const [access, setAccess] = useState<PlaylistListingAccessFilter>("all");
  const [items, setItems] = useState<MaxPlaylistCardModel[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<CatalogStatus>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const requestRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inFlightMoreRef = useRef(false);
  const queryRef = useRef(query);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = draft.trim().replace(/\s+/g, " ");
      if (queryRef.current === next) {
        return;
      }
      setMoreError(false);
      setStatus("loading");
      setQuery(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();

    void fetchCatalog({ query, sort, access, cursor: null, signal: controller.signal })
      .then((page) => {
        if (requestRef.current !== requestId) {
          return;
        }
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestRef.current !== requestId) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setStatus("error");
      });

    return () => controller.abort();
  }, [access, query, sort]);

  async function loadMore() {
    if (!nextCursor || inFlightMoreRef.current || status !== "ready") {
      return;
    }

    inFlightMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(false);
    const cursor = nextCursor;

    try {
      const page = await fetchCatalog({ query, sort, access, cursor, signal: undefined });
      setItems((current) => {
        const seen = new Set(current.map((item) => item.slug));
        return [...current, ...page.items.filter((item) => !seen.has(item.slug))];
      });
      setNextCursor(page.nextCursor);
    } catch {
      setMoreError(true);
    } finally {
      inFlightMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !nextCursor || status !== "ready") {
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMoreRef.current();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [nextCursor, status]);

  const emptyLabel = query
    ? "Ничего не нашлось"
    : "Пока нет плейлистов в витрине.";

  return (
    <div data-max-playlists-catalog>
      <h1 className="mt-5 text-[26px] font-semibold leading-tight">Плейлисты</h1>
      <form
        role="search"
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim().replace(/\s+/g, " ");
          if (next === query) {
            return;
          }
          setMoreError(false);
          setStatus("loading");
          setQuery(next);
        }}
      >
        <label htmlFor="max-playlist-search" className="sr-only">
          Найти плейлист
        </label>
        <input
          id="max-playlist-search"
          type="search"
          value={draft}
          maxLength={PLAYLIST_LISTING_SEARCH_MAX_LENGTH}
          placeholder="Найти плейлист"
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setDraft(event.target.value)}
          className="h-[52px] w-full rounded-[18px] border border-[#ded1f1] bg-white px-4 text-base text-[#25135c] placeholder:text-[#9485b4] focus:outline focus:outline-2 focus:outline-[#7042c5]"
        />
      </form>

      <div className="mt-3 flex flex-wrap gap-2" aria-label="Сортировка плейлистов">
        {PLAYLIST_CATALOG_SORT_OPTIONS.map((option) => {
          const active = option.value === sort;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (option.value === sort) {
                  return;
                }
                setMoreError(false);
                setStatus("loading");
                setSort(option.value);
              }}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm ${
                active
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2" aria-label="Доступ плейлистов">
        {PLAYLIST_LISTING_ACCESS_FILTERS.map((value) => {
          const active = value === access;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (value === access) {
                  return;
                }
                setMoreError(false);
                setStatus("loading");
                setAccess(value);
              }}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm ${
                active
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {ACCESS_LABELS[value]}
            </button>
          );
        })}
      </div>

      {status === "loading" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Загружаем плейлисты…</p>
      ) : null}
      {status === "error" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Не удалось загрузить плейлисты.</p>
      ) : null}
      {status === "ready" && items.length === 0 ? (
        <p className="mt-6 text-[15px] font-medium text-[#5f3f9d]">{emptyLabel}</p>
      ) : null}
      {status === "ready" && items.length > 0 ? (
        <ul className="mt-5 -mx-4 grid grid-cols-2 gap-[6px] px-[6px]">
          {items.map((item) => (
            <li key={item.slug} className="min-w-0">
              <MaxPlaylistCard item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      ) : null}
      {nextCursor ? <div ref={sentinelRef} className="h-px" aria-hidden="true" /> : null}
      {nextCursor ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-4 min-h-11 w-full rounded-full border border-[#ddcfef] bg-white text-sm font-medium text-[#7042c5] disabled:opacity-60"
        >
          {loadingMore ? "Загружаем…" : "Показать ещё"}
        </button>
      ) : null}
      {moreError ? (
        <p className="mt-2 text-sm text-[#b34f63]">Не удалось загрузить ещё.</p>
      ) : null}
    </div>
  );
}

async function fetchCatalog(input: {
  query: string;
  sort: PlaylistListingSort;
  access: PlaylistListingAccessFilter;
  cursor: string | null;
  signal: AbortSignal | undefined;
}) {
  const initData = readMaxInitData();
  if (!initData) {
    throw new Error("max_init_data_missing");
  }

  const body: {
    initData: string;
    q?: string;
    sort?: PlaylistListingSort;
    access?: PlaylistListingAccessFilter;
    cursor?: string;
  } = { initData: initData };

  if (input.query) {
    body.q = input.query;
  }
  if (input.sort !== "newest") {
    body.sort = input.sort;
  }
  if (input.access !== "all") {
    body.access = input.access;
  }
  if (input.cursor) {
    body.cursor = input.cursor;
  }

  const response = await fetch(MAX_PLAYLISTS_CATALOG_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: input.signal,
  });
  const payload = await response.json().catch(() => null);
  const page = readMaxPlaylistCatalogPayload(payload);
  if (!response.ok || !page) {
    throw new Error("max_playlist_catalog_unavailable");
  }

  return page;
}

export default function MaxPlaylists({
  guestMode = false,
  onRequestLogin,
  onRequestSignup,
}: {
  guestMode?: boolean;
  onRequestLogin?: () => void;
  onRequestSignup?: () => void;
}) {
  const [slug, setSlug] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-lg" data-max-playlists>
      <div hidden={slug !== null}>
        <MaxPlaylistCatalog onOpen={setSlug} />
      </div>
      {slug ? (
        <MaxPlaylistDetail
          key={slug}
          slug={slug}
          guestMode={guestMode}
          onBack={() => setSlug(null)}
          onRequestLogin={onRequestLogin}
          onRequestSignup={onRequestSignup}
        />
      ) : null}
    </div>
  );
}
