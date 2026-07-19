"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import PlatformSearchField from "@/components/listener/PlatformSearchField";
import {
  PLATFORM_SEARCH_CATALOG_URL_DEBOUNCE_MS,
  buildPlatformSearchCatalogHref,
  buildPlatformSearchClearHref,
  readPlatformSearchQueryFromParams,
  readPlatformSearchTopicFromParams,
  resolvePlatformSearchEnterAction,
} from "@/lib/catalog/platform-search";
import { normalizeCatalogSearchQuery } from "@/lib/catalog/search";

type PlatformCatalogInlineSearchProps = Record<string, never>;

export default function PlatformCatalogInlineSearch({}: PlatformCatalogInlineSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const catalogUrlDebounceRef = useRef<number | null>(null);
  const isInternalCatalogNavRef = useRef(false);

  const urlQuery = readPlatformSearchQueryFromParams(searchParams);
  const activeTopicKey = readPlatformSearchTopicFromParams(searchParams);

  const [inputValue, setInputValue] = useState(urlQuery);

  useEffect(() => {
    if (isInternalCatalogNavRef.current) {
      isInternalCatalogNavRef.current = false;
      return;
    }

    setInputValue(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    return () => {
      if (catalogUrlDebounceRef.current !== null) {
        window.clearTimeout(catalogUrlDebounceRef.current);
      }
    };
  }, []);

  function replaceCatalogUrl(rawQuery: string) {
    const nextHref = buildPlatformSearchCatalogHref(rawQuery, activeTopicKey);
    const currentHref = searchParams.toString()
      ? `/catalog?${searchParams.toString()}`
      : "/catalog";

    if (nextHref === currentHref) {
      return;
    }

    isInternalCatalogNavRef.current = true;
    router.replace(nextHref);
  }

  function scheduleCatalogUrlUpdate(rawQuery: string) {
    if (catalogUrlDebounceRef.current !== null) {
      window.clearTimeout(catalogUrlDebounceRef.current);
    }

    const nextNormalized = normalizeCatalogSearchQuery(rawQuery);
    if (nextNormalized === urlQuery) {
      return;
    }

    catalogUrlDebounceRef.current = window.setTimeout(() => {
      replaceCatalogUrl(rawQuery);
    }, PLATFORM_SEARCH_CATALOG_URL_DEBOUNCE_MS);
  }

  function handleInputChange(nextValue: string) {
    setInputValue(nextValue);
    scheduleCatalogUrlUpdate(nextValue);
  }

  function applySearchNow() {
    if (catalogUrlDebounceRef.current !== null) {
      window.clearTimeout(catalogUrlDebounceRef.current);
    }
    replaceCatalogUrl(inputValue);
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applySearchNow();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      applySearchNow();
    }
  }

  function handleClearClick() {
    setInputValue("");
    if (catalogUrlDebounceRef.current !== null) {
      window.clearTimeout(catalogUrlDebounceRef.current);
    }
    isInternalCatalogNavRef.current = true;
    router.replace(buildPlatformSearchClearHref(activeTopicKey));
  }

  const normalizedInput = normalizeCatalogSearchQuery(inputValue);
  const enterHref = resolvePlatformSearchEnterAction({
    mode: "catalog-inline",
    rawQuery: inputValue,
    topicKey: activeTopicKey,
    activeIndex: -1,
    options: [],
    isDropdownOpen: false,
  }).href;

  return (
    <PlatformSearchField
      ariaLabel="Поиск аудиопродуктов в каталоге"
      inputValue={inputValue}
      showClearButton={normalizedInput.length > 0}
      showDropdown={false}
      listboxId=""
      activeDescendantId={undefined}
      activeTopicKey={activeTopicKey}
      enterHref={enterHref}
      onInputChange={handleInputChange}
      onInputFocus={() => {}}
      onInputClick={() => {}}
      onInputKeyDown={handleInputKeyDown}
      onFormSubmit={handleFormSubmit}
      onClearClick={handleClearClick}
    />
  );
}
