"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import LibraryMobileHeader from "@/components/listener/LibraryMobileHeader";
import MobileTopChrome from "@/components/listener/MobileTopChrome";
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
import { replaceListingSearch } from "@/lib/listener/listing-search-navigation";

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

function SearchFiltersRowSkeleton() {
  return (
    <div className="flex items-start gap-2" aria-hidden="true">
      <div className="min-h-[52px] min-w-0 flex-1 rounded-[18px] border border-[#ded1f1] bg-white" />
      <div className="h-[52px] w-[88px] shrink-0 rounded-[18px] border border-[#ded1f1] bg-white" />
    </div>
  );
}

function LibrarySearchFiltersConnected({ searchId }: { searchId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
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

    replaceListingSearch(router, href);
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

  return (
    <SearchFiltersRow
      searchId={searchId}
      searchValue={searchValue}
      filter={activeFilter}
      onSearchChange={handleSearchChange}
      onSearchSubmit={() => flushSearch()}
      onApplyFilter={selectFilter}
      onResetFilter={() => selectFilter("all")}
    />
  );
}

type MyPracticesLibraryChromeProps = {
  /** `mobile` stays in the route layout. `desktop` mounts in DesktopShellSearch. */
  surface?: "mobile" | "desktop";
};

export default function MyPracticesLibraryChrome({
  surface = "mobile",
}: MyPracticesLibraryChromeProps) {
  const searchId = useId();

  if (surface === "desktop") {
    return (
      <div className="pt-3">
        <h1 className="text-[28px] font-semibold">Аудиотека</h1>
        <p className="mt-1 text-sm text-[#7d70a2]">
          Всё, что вы сохранили, купили, добавили.
        </p>
        <div className="mt-3">
          <Suspense fallback={<SearchFiltersRowSkeleton />}>
            <LibrarySearchFiltersConnected searchId={searchId} />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <MobileTopChrome variant="library">
      <LibraryMobileHeader />
      <div className="mt-3 px-5">
        <Suspense fallback={<SearchFiltersRowSkeleton />}>
          <LibrarySearchFiltersConnected searchId={searchId} />
        </Suspense>
      </div>
    </MobileTopChrome>
  );
}
