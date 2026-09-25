"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { CATALOG_SEARCH_MAX_LENGTH, normalizeCatalogSearchQuery } from "@/lib/catalog/search";
import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_CATALOG_PATH } from "@/lib/max/host";

/** Matches ordinary catalog URL debounce without importing catalog routing. */
const MAX_CATALOG_SEARCH_DEBOUNCE_MS = 300;

export type MaxCatalogProduct = {
  authorSlug: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  authorName: string | null;
  formatLabel: string;
  priceLabel: string;
  isFree: boolean;
};

type DefaultCatalogState =
  | { status: "loading" }
  | { status: "ready"; items: MaxCatalogProduct[] }
  | { status: "error" };

type SearchStatus = "idle" | "searching" | "ready" | "error";

type MaxCatalogSearchProps = {
  onSelectProduct: (product: MaxCatalogProduct) => void;
};

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function readCatalogPayload(payload: unknown): MaxCatalogProduct[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return null;
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const product = item as Partial<MaxCatalogProduct>;
    if (
      typeof product.slug !== "string" ||
      typeof product.authorSlug !== "string" ||
      typeof product.title !== "string" ||
      typeof product.formatLabel !== "string" ||
      typeof product.priceLabel !== "string" ||
      typeof product.isFree !== "boolean"
    ) {
      return [];
    }

    return [
      {
        authorSlug: product.authorSlug,
        slug: product.slug,
        title: product.title,
        subtitle: typeof product.subtitle === "string" ? product.subtitle : null,
        coverUrl: typeof product.coverUrl === "string" ? product.coverUrl : null,
        authorName:
          typeof product.authorName === "string" ? product.authorName : null,
        formatLabel: product.formatLabel,
        priceLabel: product.priceLabel,
        isFree: product.isFree,
      },
    ];
  });
}

export default function MaxCatalogSearch({ onSelectProduct }: MaxCatalogSearchProps) {
  const inputId = useId();
  const [defaultCatalog, setDefaultCatalog] = useState<DefaultCatalogState>(() =>
    readMaxInitData() ? { status: "loading" } : { status: "error" },
  );
  const [searchInput, setSearchInput] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchItems, setSearchItems] = useState<MaxCatalogProduct[] | null>(null);
  const [resultQuery, setResultQuery] = useState("");
  const searchInputRef = useRef("");
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const initData = readMaxInitData();
    if (!initData) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(MAX_CATALOG_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        const items = response.ok ? readCatalogPayload(payload) : null;
        if (!controller.signal.aborted) {
          setDefaultCatalog(items ? { status: "ready", items } : { status: "error" });
        }
      } catch {
        if (!controller.signal.aborted) {
          setDefaultCatalog({ status: "error" });
        }
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);

  function cancelPendingSearch() {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    requestGenerationRef.current += 1;
  }

  function restoreDefaultCatalog() {
    cancelPendingSearch();
    setResultQuery("");
    setSearchStatus("idle");
    setSearchItems(null);
  }

  function beginSearch(normalized: string) {
    const requestId = ++requestGenerationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearchStatus("searching");

    void (async () => {
      try {
        const initData = readMaxInitData();
        if (!initData) {
          if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
            return;
          }
          setSearchStatus("error");
          return;
        }

        const response = await fetch(MAX_CATALOG_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, query: normalized }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        const items = response.ok ? readCatalogPayload(payload) : null;
        if (!items) {
          setSearchStatus("error");
          return;
        }
        setSearchItems(items);
        setResultQuery(normalized);
        setSearchStatus("ready");
      } catch {
        if (requestId !== requestGenerationRef.current || controller.signal.aborted) {
          return;
        }
        setSearchStatus("error");
      }
    })();
  }

  function scheduleSearch(rawQuery: string) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const normalized = normalizeCatalogSearchQuery(rawQuery);
    if (!normalized) {
      restoreDefaultCatalog();
      return;
    }

    abortRef.current?.abort();
    abortRef.current = null;
    requestGenerationRef.current += 1;
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      beginSearch(normalized);
    }, MAX_CATALOG_SEARCH_DEBOUNCE_MS);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const normalized = normalizeCatalogSearchQuery(searchInputRef.current);
    if (!normalized) {
      restoreDefaultCatalog();
      return;
    }

    beginSearch(normalized);
  }

  function clearSearch() {
    searchInputRef.current = "";
    setSearchInput("");
    restoreDefaultCatalog();
  }

  function handleInputChange(nextValue: string) {
    searchInputRef.current = nextValue;
    setSearchInput(nextValue);
    scheduleSearch(nextValue);
  }

  const normalizedInput = normalizeCatalogSearchQuery(searchInput);
  const usingSearchResults = searchItems !== null && searchStatus !== "idle";
  const gridItems = usingSearchResults ? searchItems : defaultCatalog.status === "ready" ? defaultCatalog.items : [];
  const showSearchHeading = resultQuery.length > 0 && searchItems !== null && searchStatus !== "idle";
  const showSearchEmpty =
    searchItems !== null &&
    searchItems.length === 0 &&
    resultQuery.length > 0 &&
    searchStatus !== "idle";

  return (
    <>
      <form
        role="search"
        onSubmit={submitSearch}
        className="relative mt-4 flex h-[52px] min-h-[52px] max-h-[56px] min-w-0 items-center gap-2 rounded-[18px] border border-[#ded1f1] bg-white px-3 shadow-[0_2px_10px_rgba(90,60,145,0.04)] focus-within:border-[#dcc9f2] focus-within:shadow-[0_4px_14px_rgba(90,60,145,0.07)]"
      >
        <label htmlFor={inputId} className="sr-only">
          Поиск аудиопродуктов в каталоге
        </label>
        <button
          type="submit"
          tabIndex={-1}
          aria-hidden="true"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[#7042c5]"
        >
          <SearchIcon />
        </button>
        <input
          id={inputId}
          type="search"
          value={searchInput}
          onChange={(event) => handleInputChange(event.target.value)}
          placeholder="Поиск по каталогу"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={CATALOG_SEARCH_MAX_LENGTH}
          aria-label="Поиск аудиопродуктов в каталоге"
          className="min-w-0 flex-1 border-0 bg-transparent py-0 text-base leading-normal text-[#25135c] placeholder:text-[#9485b4] focus:outline-none"
        />
        {normalizedInput.length > 0 ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Очистить поиск"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[#9485b4] transition hover:bg-[#faf6ff] hover:text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <ClearIcon />
          </button>
        ) : null}
      </form>

      <h1 className="mt-5 text-[26px] font-semibold leading-tight">
        {showSearchHeading ? "Результаты поиска" : "Каталог"}
      </h1>
      {showSearchHeading ? (
        <p className="mt-1 text-sm leading-5 text-[#6c5d94]">
          По запросу „{resultQuery}“
        </p>
      ) : (
        <p className="mt-1 text-sm leading-5 text-[#6c5d94]">
          Аудиопрактики, музыка и курсы АудиоЛада
        </p>
      )}

      {searchStatus === "searching" ? (
        <p className="mt-3 text-sm text-[#6c5d94]">Ищем…</p>
      ) : null}
      {searchStatus === "error" ? (
        <p className="mt-3 text-sm text-[#6c5d94]">Не удалось выполнить поиск.</p>
      ) : null}

      {!usingSearchResults && defaultCatalog.status === "loading" ? (
        <p className="py-10 text-center text-sm text-[#6c5d94]">
          Загружаем каталог…
        </p>
      ) : null}
      {!usingSearchResults && defaultCatalog.status === "error" ? (
        <div className="mt-6 rounded-2xl border border-[#eadce7] bg-white px-5 py-6 text-center">
          <p className="text-sm font-medium text-[#5f3f9d]">
            Не удалось загрузить каталог
          </p>
          <p className="mt-2 text-sm leading-5 text-[#6c5d94]">
            Закройте и снова откройте АудиоЛад в MAX.
          </p>
        </div>
      ) : null}
      {!usingSearchResults &&
      defaultCatalog.status === "ready" &&
      defaultCatalog.items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[#e8def5] bg-white px-5 py-6 text-center">
          <p className="text-sm font-medium text-[#5f3f9d]">
            В каталоге пока нет опубликованных аудиопродуктов.
          </p>
        </div>
      ) : null}

      {showSearchEmpty ? (
        <div className="mt-6 rounded-2xl border border-[#e8def5] bg-white px-5 py-6 text-center">
          <p className="text-sm font-medium text-[#5f3f9d]">
            По запросу „{resultQuery}“ ничего не найдено.
          </p>
          <button
            type="button"
            onClick={clearSearch}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-4 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Очистить поиск
          </button>
        </div>
      ) : null}

      {gridItems.length > 0 ? (
        <CatalogGrid items={gridItems} onSelectProduct={onSelectProduct} />
      ) : null}
    </>
  );
}

function CatalogGrid({
  items,
  onSelectProduct,
}: {
  items: MaxCatalogProduct[];
  onSelectProduct: (product: MaxCatalogProduct) => void;
}) {
  return (
    <ul className="mt-5 -mx-4 grid grid-cols-2 gap-[6px] px-[6px]">
      {items.map((product) => (
        <li key={`${product.authorSlug}/${product.slug}`} className="min-w-0">
          <button
            type="button"
            onClick={() => onSelectProduct(product)}
            className="flex w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white text-left shadow-[0_6px_16px_rgba(91,62,145,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <div className="aspect-square w-full bg-[#ede6f8]">
              {product.coverUrl ? (
                <img
                  src={product.coverUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="px-2.5 pb-2.5 pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
                {product.formatLabel}
              </p>
              <p className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-[#25135c]">
                {product.title}
              </p>
              <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
                {product.authorName || "\u00a0"}
              </p>
              {!product.isFree ? (
                <p className="mt-1 whitespace-nowrap text-xs font-semibold leading-4 text-[#7042c5]">
                  {product.priceLabel}
                </p>
              ) : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
