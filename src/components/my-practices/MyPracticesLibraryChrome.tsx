"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import LibraryMobileHeader from "@/components/listener/LibraryMobileHeader";
import MyPracticesLibraryFilters from "@/components/my-practices/MyPracticesLibraryFilters";
import MyPracticesLibrarySearch from "@/components/my-practices/MyPracticesLibrarySearch";
import type { LibraryFilterId } from "@/lib/library/filters";
import {
  LIBRARY_SEARCH_DEBOUNCE_MS,
  buildMyPracticesHref,
  parseLibraryFilter,
  parseLibrarySearchQuery,
  parseLibrarySort,
} from "@/lib/library/unified-query";

function SearchFiltersRow({
  searchId,
  searchValue,
  filter,
  onSearchChange,
  onSearchSubmit,
  onApplyFilter,
  onResetFilter,
}: {
  searchId: string;
  searchValue: string;
  filter: LibraryFilterId;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onApplyFilter: (filter: LibraryFilterId) => void;
  onResetFilter: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-h-[52px] min-w-0 flex-1">
        <MyPracticesLibrarySearch
          id={searchId}
          value={searchValue}
          onChange={onSearchChange}
          onSubmit={onSearchSubmit}
        />
      </div>
      <MyPracticesLibraryFilters
        filter={filter}
        onApply={onApplyFilter}
        onReset={onResetFilter}
      />
    </div>
  );
}

export default function MyPracticesLibraryChrome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mobileSearchId = useId();
  const desktopSearchId = useId();
  const activeFilter = parseLibraryFilter(searchParams.get("filter"));
  const activeSort = parseLibrarySort(searchParams.get("sort"));
  const queryFromUrl = parseLibrarySearchQuery(searchParams.get("q"));
  const purchasedFromUrl = searchParams.get("purchased");
  const [searchValue, setSearchValue] = useState(queryFromUrl);
  const debounceRef = useRef<number | null>(null);
  const skipSearchSyncRef = useRef(false);

  useEffect(() => {
    if (skipSearchSyncRef.current) {
      skipSearchSyncRef.current = false;
      return;
    }

    setSearchValue(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function replaceLibraryQuery(next: {
    q?: string;
    filter?: LibraryFilterId;
  }) {
    const href = buildMyPracticesHref({
      q: next.q ?? searchValue,
      filter: next.filter ?? activeFilter,
      sort: activeSort,
      purchased: purchasedFromUrl,
    });
    const currentHref = buildMyPracticesHref({
      q: queryFromUrl,
      filter: activeFilter,
      sort: activeSort,
      purchased: purchasedFromUrl,
    });

    if (href === currentHref) {
      return;
    }

    if (next.q !== undefined) {
      skipSearchSyncRef.current = true;
    }

    router.replace(href, { scroll: false });
  }

  function flushSearch(nextQuery = searchValue) {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    replaceLibraryQuery({ q: nextQuery });
  }

  function handleSearchChange(nextValue: string) {
    setSearchValue(nextValue);

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      replaceLibraryQuery({ q: nextValue });
    }, LIBRARY_SEARCH_DEBOUNCE_MS);
  }

  function selectFilter(filter: LibraryFilterId) {
    flushSearch();
    replaceLibraryQuery({ filter, q: searchValue });
  }

  const rowProps = {
    searchValue,
    filter: activeFilter,
    onSearchChange: handleSearchChange,
    onSearchSubmit: () => flushSearch(),
    onApplyFilter: selectFilter,
    onResetFilter: () => selectFilter("all"),
  };

  return (
    <>
      <div className="listener-catalog-mobile-search fixed top-0 inset-x-0 z-30 bg-platform-surface pt-[max(0.25rem,env(safe-area-inset-top,0px))] pb-0 xl:hidden">
        <LibraryMobileHeader />
        <div className="mt-3 px-5">
          <SearchFiltersRow searchId={mobileSearchId} {...rowProps} />
        </div>
      </div>
      <div
        className="listener-catalog-mobile-search-spacer invisible pointer-events-none pt-[max(0.25rem,env(safe-area-inset-top,0px))] xl:hidden"
        aria-hidden="true"
      >
        <LibraryMobileHeader />
        <div className="mt-3 px-5">
          <div className="h-[52px]" />
        </div>
      </div>
      <div className="hidden px-5 lg:px-10 xl:block xl:px-6 xl:pt-3">
        <h1 className="text-[28px] font-semibold">Аудиотека</h1>
        <p className="mt-1 text-sm text-[#7d70a2]">
          Всё, что вы сохранили, купили, добавили.
        </p>
        <div className="mt-3">
          <SearchFiltersRow searchId={desktopSearchId} {...rowProps} />
        </div>
      </div>
    </>
  );
}
