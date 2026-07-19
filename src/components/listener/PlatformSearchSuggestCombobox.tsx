"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import PlatformSearchDropdown from "@/components/listener/PlatformSearchDropdown";
import PlatformSearchField from "@/components/listener/PlatformSearchField";
import {
  PLATFORM_SEARCH_DEBOUNCE_MS,
  flattenPlatformProductSuggestOptions,
  resolvePlatformSearchEnterAction,
} from "@/lib/catalog/platform-search";
import { normalizeCatalogSearchQuery } from "@/lib/catalog/search";
import {
  buildCatalogSuggestApiUrl,
  getCatalogSuggestActiveOptionId,
  isCatalogSuggestAbortError,
  moveCatalogSuggestActiveIndex,
  shouldApplyCatalogSuggestResponse,
  shouldFetchCatalogSuggestions,
  type CatalogProductSuggestion,
  type CatalogSearchSuggestResponse,
} from "@/lib/catalog/search-suggestions";

type PlatformSearchSuggestComboboxProps = Record<string, never>;

export default function PlatformSearchSuggestCombobox({}: PlatformSearchSuggestComboboxProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const inputId = useId();
  const listboxId = useId();

  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [products, setProducts] = useState<CatalogProductSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalizedInput = normalizeCatalogSearchQuery(inputValue);
  const flatOptions = useMemo(
    () => flattenPlatformProductSuggestOptions(products),
    [products],
  );

  function closeDropdown() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function resetSuggestState() {
    abortRef.current?.abort();
    abortRef.current = null;
    setProducts([]);
    setHasError(false);
    setIsLoading(false);
    closeDropdown();
  }

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    if (!shouldFetchCatalogSuggestions(inputValue)) {
      return;
    }

    const queryForFetch = inputValue;

    debounceRef.current = window.setTimeout(() => {
      void (async () => {
        if (!shouldFetchCatalogSuggestions(queryForFetch)) {
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
          const response = await fetch(buildCatalogSuggestApiUrl(queryForFetch, null), {
            signal: controller.signal,
            cache: "no-store",
          });

          if (!shouldApplyCatalogSuggestResponse(requestId, requestIdRef.current)) {
            return;
          }

          if (!response.ok) {
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

          setProducts(Array.isArray(payload.products) ? payload.products : []);
          setHasError(false);
        } catch (error) {
          if (isCatalogSuggestAbortError(error)) {
            return;
          }

          if (!shouldApplyCatalogSuggestResponse(requestId, requestIdRef.current)) {
            return;
          }

          setProducts([]);
          setHasError(true);
        } finally {
          if (shouldApplyCatalogSuggestResponse(requestId, requestIdRef.current)) {
            setIsLoading(false);
          }
        }
      })();
    }, PLATFORM_SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue]);

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
  }, []);

  function handleInputChange(nextValue: string) {
    setInputValue(nextValue);

    if (!shouldFetchCatalogSuggestions(nextValue)) {
      resetSuggestState();
    }
  }

  function openDropdownIfCached() {
    if (
      shouldFetchCatalogSuggestions(inputValue) &&
      (products.length > 0 || isLoading || hasError)
    ) {
      setIsOpen(true);
    }
  }

  function applyEnterAction() {
    const action = resolvePlatformSearchEnterAction({
      mode: "suggest",
      rawQuery: inputValue,
      topicKey: null,
      activeIndex,
      options: flatOptions,
      isDropdownOpen: isOpen,
    });

    if (action.type === "open") {
      closeDropdown();
      router.push(action.href);
      return;
    }

    closeDropdown();
    router.push(action.href);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      applyEnterAction();
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
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyEnterAction();
  }

  function handleClearClick() {
    setInputValue("");
    resetSuggestState();
  }

  const activeDescendantId = getCatalogSuggestActiveOptionId(activeIndex, flatOptions);
  const enterHref = resolvePlatformSearchEnterAction({
    mode: "suggest",
    rawQuery: inputValue,
    topicKey: null,
    activeIndex: -1,
    options: [],
    isDropdownOpen: false,
  }).href;

  return (
    <div ref={rootRef} className="relative z-30">
      <PlatformSearchField
        inputId={inputId}
        ariaLabel="Поиск аудиопродуктов"
        inputValue={inputValue}
        showClearButton={normalizedInput.length > 0}
        showDropdown={isOpen}
        listboxId={listboxId}
        activeDescendantId={activeDescendantId}
        activeTopicKey={null}
        enterHref={enterHref}
        onInputChange={handleInputChange}
        onInputFocus={openDropdownIfCached}
        onInputClick={openDropdownIfCached}
        onInputKeyDown={handleInputKeyDown}
        onFormSubmit={handleFormSubmit}
        onClearClick={handleClearClick}
      />

      {isOpen ? (
        <PlatformSearchDropdown
          listboxId={listboxId}
          query={normalizedInput}
          products={products}
          activeIndex={activeIndex}
          isLoading={isLoading}
          hasError={hasError}
          onOptionHover={setActiveIndex}
        />
      ) : null}
    </div>
  );
}
