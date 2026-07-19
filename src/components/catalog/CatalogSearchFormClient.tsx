"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import CatalogSearchDropdown from "@/components/catalog/CatalogSearchDropdown";
import { buildCatalogClearSearchHref } from "@/lib/catalog/topic-filter";
import { normalizeCatalogSearchQuery } from "@/lib/catalog/search";
import {
  buildCatalogSuggestApiUrl,
  flattenCatalogSuggestOptions,
  getCatalogSuggestActiveOptionId,
  isCatalogSuggestAbortError,
  isCatalogSuggestResponseEmpty,
  moveCatalogSuggestActiveIndex,
  resolveCatalogSuggestEnterAction,
  shouldApplyCatalogSuggestResponse,
  shouldFetchCatalogSuggestions,
  type CatalogAuthorSuggestion,
  type CatalogProductSuggestion,
  type CatalogSearchSuggestResponse,
} from "@/lib/catalog/search-suggestions";

const SUGGEST_DEBOUNCE_MS = 275;

type CatalogSearchFormClientProps = {
  initialQuery: string;
  activeTopicKey: string | null;
};

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-[#7042c5]"
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

export default function CatalogSearchFormClient({
  initialQuery,
  activeTopicKey,
}: CatalogSearchFormClientProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const inputId = useId();
  const listboxId = useId();

  const [inputValue, setInputValue] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [authors, setAuthors] = useState<CatalogAuthorSuggestion[]>([]);
  const [products, setProducts] = useState<CatalogProductSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalizedInput = normalizeCatalogSearchQuery(inputValue);
  const clearHref = buildCatalogClearSearchHref(activeTopicKey);
  const showClearButton = normalizedInput.length > 0;

  const flatOptions = useMemo(
    () => flattenCatalogSuggestOptions({ authors, products }),
    [authors, products],
  );

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const resetSuggestState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAuthors([]);
    setProducts([]);
    setHasError(false);
    setIsLoading(false);
    closeDropdown();
  }, [closeDropdown]);

  const fetchSuggestions = useCallback(
    async (rawQuery: string) => {
      if (!shouldFetchCatalogSuggestions(rawQuery)) {
        resetSuggestState();
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;

      setIsLoading(true);
      setHasError(false);
      setIsOpen(true);
      setActiveIndex(-1);

      try {
        const response = await fetch(buildCatalogSuggestApiUrl(rawQuery, activeTopicKey), {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!shouldApplyCatalogSuggestResponse(requestId, requestIdRef.current)) {
          return;
        }

        if (!response.ok) {
          setAuthors([]);
          setProducts([]);
          setHasError(true);
          return;
        }

        const payload = (await response.json()) as CatalogSearchSuggestResponse & {
          error?: string;
        };

        if (!shouldApplyCatalogSuggestResponse(requestId, requestIdRef.current)) {
          return;
        }

        setAuthors(Array.isArray(payload.authors) ? payload.authors : []);
        setProducts(Array.isArray(payload.products) ? payload.products : []);
        setHasError(false);
      } catch (error) {
        if (isCatalogSuggestAbortError(error)) {
          return;
        }

        if (!shouldApplyCatalogSuggestResponse(requestId, requestIdRef.current)) {
          return;
        }

        setAuthors([]);
        setProducts([]);
        setHasError(true);
      } finally {
        if (shouldApplyCatalogSuggestResponse(requestId, requestIdRef.current)) {
          setIsLoading(false);
        }
      }
    },
    [activeTopicKey, resetSuggestState],
  );

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    if (!shouldFetchCatalogSuggestions(inputValue)) {
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(inputValue);
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [fetchSuggestions, inputValue]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [closeDropdown]);

  function handleInputChange(nextValue: string) {
    setInputValue(nextValue);

    if (!shouldFetchCatalogSuggestions(nextValue)) {
      resetSuggestState();
    }
  }

  function openDropdownIfCached() {
    if (
      shouldFetchCatalogSuggestions(inputValue) &&
      (!isCatalogSuggestResponseEmpty({ authors, products }) ||
        isLoading ||
        hasError)
    ) {
      setIsOpen(true);
    }
  }

  function handleInputFocus() {
    openDropdownIfCached();
  }

  function handleInputClick() {
    openDropdownIfCached();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
      return;
    }

    if (!isOpen || flatOptions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        moveCatalogSuggestActiveIndex(current, "down", flatOptions.length),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        moveCatalogSuggestActiveIndex(current, "up", flatOptions.length),
      );
      return;
    }

    if (event.key === "Enter") {
      const action = resolveCatalogSuggestEnterAction({
        activeIndex,
        options: flatOptions,
      });

      if (action.type === "open") {
        event.preventDefault();
        closeDropdown();
        router.push(action.href);
      }
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    const action = resolveCatalogSuggestEnterAction({
      activeIndex: isOpen ? activeIndex : -1,
      options: isOpen ? flatOptions : [],
    });

    if (action.type === "open") {
      event.preventDefault();
      closeDropdown();
      router.push(action.href);
    }
  }

  const activeDescendantId = getCatalogSuggestActiveOptionId(
    activeIndex,
    flatOptions,
  );

  return (
    <div ref={rootRef} className="relative z-30 mt-6">
      <form
        method="get"
        action="/catalog"
        role="search"
        onSubmit={handleFormSubmit}
        className="relative flex items-center gap-2 rounded-[22px] border border-[#ded1f1] bg-white px-3 py-2 shadow-[0_2px_10px_rgba(90,60,145,0.04)] sm:gap-3 sm:px-4 sm:py-2.5"
      >
        <label htmlFor={inputId} className="sr-only">
          Поиск аудиопродуктов и авторов
        </label>

        <span className="pl-1 text-[#7042c5]">
          <SearchIcon />
        </span>

        <input
          id={inputId}
          name="q"
          type="search"
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          onKeyDown={handleInputKeyDown}
          placeholder="Поиск аудиопродуктов и авторов"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendantId}
          className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[15px] text-[#25135c] placeholder:text-[#9485b4] focus:outline-none"
        />

        {activeTopicKey ? (
          <input type="hidden" name="topic" value={activeTopicKey} />
        ) : null}

        {showClearButton ? (
          <Link
            href={clearHref}
            aria-label="Очистить поиск"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#9485b4] transition hover:bg-[#faf6ff] hover:text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <ClearIcon />
          </Link>
        ) : (
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#7042c5] px-4 text-sm font-medium text-white transition hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Найти
          </button>
        )}

        {showClearButton ? (
          <button
            type="submit"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          >
            Найти
          </button>
        ) : null}
      </form>

      {isOpen ? (
        <CatalogSearchDropdown
          listboxId={listboxId}
          query={normalizedInput}
          activeTopicKey={activeTopicKey}
          authors={authors}
          products={products}
          activeIndex={activeIndex}
          authorOffset={authors.length}
          isLoading={isLoading}
          hasError={hasError}
          onOptionHover={setActiveIndex}
        />
      ) : null}
    </div>
  );
}
