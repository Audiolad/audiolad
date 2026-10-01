"use client";

import { useEffect, useState } from "react";

import MaxCatalogProductCard from "@/components/max/MaxCatalogProductCard";
import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_LIBRARY_PATH } from "@/lib/max/host";
import {
  maxLibraryCatalogToProduct,
  maxLibraryEmptyTab,
  maxLibraryFilterOptions,
  readMaxLibraryPayload,
  selectMaxLibraryItems,
  type MaxLibraryCatalogItem,
  type MaxLibraryItem,
  type MaxLibraryPlaylistItem,
} from "@/lib/max/library-dto";
import type { MaxCatalogProduct } from "@/lib/max/catalog-product";
import {
  MAX_SHELL_LOGIN_CTA,
  MAX_SHELL_SIGNUP_CTA,
} from "@/lib/max/session-shell";
import {
  getLibraryFilterEmptyCta,
  getLibraryFilterEmptyMessage,
  type LibraryFilterId,
} from "@/lib/library/filters";
import { UNIFIED_LIBRARY_PLAYLIST_LABEL } from "@/lib/library/unified-entry";
import {
  LIBRARY_SEARCH_DEBOUNCE_MS,
  LIBRARY_SORT_OPTIONS,
  parseLibrarySearchQuery,
  type LibrarySortId,
} from "@/lib/library/unified-query";
import { formatProductDuration } from "@/lib/products/duration";

export const MAX_LIBRARY_TITLE = "Аудиотека";
export const MAX_LIBRARY_SEARCH_PLACEHOLDER = "Поиск в аудиотеке";
export const MAX_LIBRARY_LOADING_LABEL = "Загружаем аудиотеку…";
export const MAX_LIBRARY_ERROR_LABEL = "Не удалось загрузить аудиотеку.";
export const MAX_LIBRARY_RETRY_LABEL = "Повторить";
export const MAX_LIBRARY_GUEST_MESSAGE =
  "Войдите в АудиоЛад, чтобы открыть свою Аудиотеку";

const SEARCH_MAX_LENGTH = 100;

type MaxLibraryProps = {
  title?: string;
  guestMode?: boolean;
  onRequestLogin?: () => void;
  onRequestSignup?: () => void;
  onOpenProduct: (product: MaxCatalogProduct) => void;
  onOpenPlaylist: (slug: string) => void;
  onBrowseCatalog: () => void;
  onOpenPlaylists: () => void;
};

function formatLibraryDuration(
  duration: MaxLibraryItem["duration"],
): string | null {
  if (!duration) {
    return null;
  }

  if (duration.unit === "minutes") {
    return formatProductDuration(null, duration.value);
  }

  return formatProductDuration(duration.value);
}

function openCatalogEntry(
  item: MaxLibraryCatalogItem,
  onOpenProduct: (product: MaxCatalogProduct) => void,
) {
  const product = maxLibraryCatalogToProduct(item);
  if (!product) return;
  onOpenProduct(product);
}

function openPlaylistEntry(
  item: MaxLibraryPlaylistItem,
  onOpenPlaylist: (slug: string) => void,
) {
  const slug = item.slug.trim();
  if (!slug) return;
  onOpenPlaylist(slug);
}

export function MaxLibraryGuest({
  title = MAX_LIBRARY_TITLE,
  onRequestLogin,
  onRequestSignup,
}: {
  title?: string;
  onRequestLogin?: () => void;
  onRequestSignup?: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg" data-max-library-guest>
      <h1 className="mt-5 text-[26px] font-semibold leading-tight text-[#25135c]">
        {title}
      </h1>
      <section className="mt-5 rounded-[20px] border border-[#eadff8] bg-white px-4 py-4">
        <p className="text-sm leading-5 text-[#4a3d73]">{MAX_LIBRARY_GUEST_MESSAGE}</p>
      </section>
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={onRequestLogin}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {MAX_SHELL_LOGIN_CTA}
        </button>
        <button
          type="button"
          onClick={onRequestSignup}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#7042c5] px-5 py-3 text-[17px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {MAX_SHELL_SIGNUP_CTA}
        </button>
      </div>
    </div>
  );
}

export function MaxLibraryView({
  title = MAX_LIBRARY_TITLE,
  items,
  onOpenProduct,
  onOpenPlaylist,
  onBrowseCatalog,
  onOpenPlaylists,
}: {
  title?: string;
  items: readonly MaxLibraryItem[];
  onOpenProduct: (product: MaxCatalogProduct) => void;
  onOpenPlaylist: (slug: string) => void;
  onBrowseCatalog: () => void;
  onOpenPlaylists: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilterId>("all");
  const [sort, setSort] = useState<LibrarySortId>("new");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = parseLibrarySearchQuery(draft).replace(/\s+/g, " ");
      setQuery((current) => (current === next ? current : next));
    }, LIBRARY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const visible = selectMaxLibraryItems(items, { filter, query, sort });
  const hasSearchQuery = query.length > 0;
  const emptyTab = maxLibraryEmptyTab(filter);
  const emptyCta = getLibraryFilterEmptyCta(filter);

  return (
    <div className="mx-auto max-w-lg" data-max-library>
      <h1 className="mt-5 text-[26px] font-semibold leading-tight">{title}</h1>
      <form
        role="search"
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(parseLibrarySearchQuery(draft).replace(/\s+/g, " "));
        }}
      >
        <label htmlFor="max-library-search" className="sr-only">
          {MAX_LIBRARY_SEARCH_PLACEHOLDER}
        </label>
        <input
          id="max-library-search"
          type="search"
          value={draft}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder={MAX_LIBRARY_SEARCH_PLACEHOLDER}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setDraft(event.target.value)}
          className="h-[52px] w-full rounded-[18px] border border-[#ded1f1] bg-white px-4 text-base text-[#25135c] placeholder:text-[#9485b4] focus:outline focus:outline-2 focus:outline-[#7042c5]"
        />
      </form>

      <div className="mt-3 flex flex-wrap gap-2" aria-label="Разделы аудиотеки">
        {maxLibraryFilterOptions().map((option) => {
          const active = option.id === filter;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              data-max-library-filter={option.id}
              onClick={() => setFilter(option.id)}
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

      <div className="mt-2 flex flex-wrap gap-2" aria-label="Сортировка аудиотеки">
        {LIBRARY_SORT_OPTIONS.map((option) => {
          const active = option.id === sort;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              data-max-library-sort={option.id}
              onClick={() => setSort(option.id)}
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

      {visible.length === 0 && hasSearchQuery ? (
        <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
          <p className="text-[17px] font-semibold">Ничего не найдено</p>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            Попробуйте другой запрос или сбросьте поиск.
          </p>
        </div>
      ) : null}

      {visible.length === 0 && !hasSearchQuery ? (
        <div className="mt-5 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-6 text-center">
          <p className="text-[17px] font-semibold">
            {filter === "all" ? "В Аудиотеке пока пусто" : "Пока пусто"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            {getLibraryFilterEmptyMessage(filter)}
          </p>
          {emptyTab && emptyCta ? (
            <button
              type="button"
              data-max-library-cta={emptyTab}
              onClick={emptyTab === "playlists" ? onOpenPlaylists : onBrowseCatalog}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              {emptyCta.label}
            </button>
          ) : null}
        </div>
      ) : null}

      {visible.length > 0 ? (
        <ul className="mt-5 -mx-4 grid grid-cols-2 gap-[6px] px-[6px]">
          {visible.map((entry) => {
            if (entry.kind === "catalog") {
              const item = items.find(
                (candidate): candidate is MaxLibraryCatalogItem =>
                  candidate.kind === "catalog" && candidate.practiceId === entry.practiceId,
              );
              if (!item) return null;
              const product = maxLibraryCatalogToProduct(item);
              return (
                <li
                  key={entry.id}
                  className="min-w-0"
                  data-max-library-kind="catalog"
                  data-max-library-can-listen={item.canListen ? "true" : "false"}
                  data-max-library-saved={item.isSaved ? "true" : "false"}
                >
                  {product ? (
                    <MaxCatalogProductCard
                      product={product}
                      onSelectProduct={() => openCatalogEntry(item, onOpenProduct)}
                    />
                  ) : (
                    <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white text-left shadow-[0_6px_16px_rgba(91,62,145,0.06)]">
                      <div className="aspect-square w-full bg-[#ede6f8]" />
                      <div className="px-2.5 pb-2.5 pt-2">
                        <p className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-[#25135c]">
                          {item.title}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            }

            if (entry.kind !== "playlist") return null;
            const item = items.find(
              (candidate): candidate is MaxLibraryPlaylistItem =>
                candidate.kind === "playlist" && candidate.slug === entry.slug,
            );
            if (!item) return null;
            const durationLabel = formatLibraryDuration(item.duration);
            return (
              <li
                key={entry.id}
                className="min-w-0"
                data-max-library-kind="playlist"
                data-max-library-slug={item.slug}
              >
                <button
                  type="button"
                  onClick={() => openPlaylistEntry(item, onOpenPlaylist)}
                  className="flex w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white text-left shadow-[0_6px_16px_rgba(91,62,145,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                >
                  <div className="aspect-square w-full bg-[#ede6f8]">
                    {item.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- listing coverUrl is already resolved
                      <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="px-2.5 pb-2.5 pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
                      {UNIFIED_LIBRARY_PLAYLIST_LABEL}
                    </p>
                    <p className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-[#25135c]">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
                      {item.creator || "\u00a0"}
                    </p>
                    {durationLabel ? (
                      <p className="mt-1 text-xs leading-4 text-[#7d70a2]">{durationLabel}</p>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function MaxLibraryLinked({
  title,
  onOpenProduct,
  onOpenPlaylist,
  onBrowseCatalog,
  onOpenPlaylists,
}: Omit<MaxLibraryProps, "guestMode" | "onRequestLogin" | "onRequestSignup">) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<MaxLibraryItem[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const initData = readMaxInitData();
    if (!initData) {
      queueMicrotask(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
      return () => controller.abort();
    }
    void fetch(MAX_LIBRARY_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error("max_library_unavailable");
        }
        const next = readMaxLibraryPayload(payload);
        if (!next) {
          throw new Error("max_library_invalid");
        }
        return next;
      })
      .then((next) => {
        if (controller.signal.aborted) return;
        setItems(next);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [attempt]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-lg" data-max-library-loading>
        <h1 className="mt-5 text-[26px] font-semibold leading-tight">{title}</h1>
        <p className="mt-6 text-sm text-[#6c5d94]">{MAX_LIBRARY_LOADING_LABEL}</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-lg" data-max-library-error>
        <h1 className="mt-5 text-[26px] font-semibold leading-tight">{title}</h1>
        <p className="mt-6 text-sm text-[#6c5d94]">{MAX_LIBRARY_ERROR_LABEL}</p>
        <button
          type="button"
          onClick={() => {
            setStatus("loading");
            setAttempt((current) => current + 1);
          }}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#ddcfef] bg-white px-5 text-sm font-medium text-[#7042c5]"
        >
          {MAX_LIBRARY_RETRY_LABEL}
        </button>
      </div>
    );
  }

  return (
    <MaxLibraryView
      title={title}
      items={items}
      onOpenProduct={onOpenProduct}
      onOpenPlaylist={onOpenPlaylist}
      onBrowseCatalog={onBrowseCatalog}
      onOpenPlaylists={onOpenPlaylists}
    />
  );
}

export function MaxLibrary({
  title = MAX_LIBRARY_TITLE,
  guestMode = false,
  onRequestLogin,
  onRequestSignup,
  onOpenProduct,
  onOpenPlaylist,
  onBrowseCatalog,
  onOpenPlaylists,
}: MaxLibraryProps) {
  if (guestMode) {
    return (
      <MaxLibraryGuest
        title={title}
        onRequestLogin={onRequestLogin}
        onRequestSignup={onRequestSignup}
      />
    );
  }

  return (
    <MaxLibraryLinked
      title={title}
      onOpenProduct={onOpenProduct}
      onOpenPlaylist={onOpenPlaylist}
      onBrowseCatalog={onBrowseCatalog}
      onOpenPlaylists={onOpenPlaylists}
    />
  );
}

export default MaxLibrary;
