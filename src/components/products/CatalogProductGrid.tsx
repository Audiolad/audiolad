"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import LivePublicContentSync from "@/components/public-content/LivePublicContentSync";
import CatalogProductGridCard from "@/components/products/CatalogProductGridCard";
import type { CatalogCard } from "@/lib/catalog/dto";
import {
  buildCatalogListingApiUrl,
  CATALOG_LISTING_PAGE_SIZE,
  type CatalogListingQuery,
} from "@/lib/catalog/listing-contract";
import { useFlushPendingLibrarySave } from "@/lib/library/use-catalog-library-save";
import { platformBottomContentPaddingClass } from "@/lib/navigation/bottom-nav";
import {
  catalogListingUnchanged,
  fetchCatalogListingPage,
  replaceCatalogPageOne,
  resolveNextCursorAfterPageReplace,
  restoreWindowScrollY,
} from "@/lib/public-content/live-sync";

type CatalogProductGridProps = {
  initialItems: CatalogCard[];
  initialNextCursor: string | null;
  query: Omit<CatalogListingQuery, "cursor">;
  isAuthenticated?: boolean;
  signInReturnPath?: string;
  emptyState?: ReactNode;
};

type CatalogListingResponse = {
  items?: CatalogCard[];
  nextCursor?: string | null;
};

export default function CatalogProductGrid({
  initialItems,
  initialNextCursor,
  query,
  isAuthenticated = false,
  signInReturnPath = "/catalog",
  emptyState = null,
}: CatalogProductGridProps) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const queryRef = useRef(query);
  const itemsRef = useRef(items);
  const pendingScrollRef = useRef<number | null>(null);

  useEffect(() => {
    queryRef.current = query;
    itemsRef.current = items;
  });

  useFlushPendingLibrarySave(isAuthenticated);

  const applyPublicPage = useCallback((page: { items: CatalogCard[]; nextCursor: string | null }) => {
    const pageSize = queryRef.current.limit || CATALOG_LISTING_PAGE_SIZE;
    const replaced = replaceCatalogPageOne(itemsRef.current, page.items, pageSize);

    if (catalogListingUnchanged(itemsRef.current, replaced.items)) {
      return;
    }

    pendingScrollRef.current = typeof window === "undefined" ? null : window.scrollY;
    itemsRef.current = replaced.items;
    setItems(replaced.items);
    setNextCursor((current) =>
      resolveNextCursorAfterPageReplace({
        tailCount: replaced.tailCount,
        previousCursor: current,
        freshCursor: page.nextCursor,
      }),
    );
  }, []);

  const refreshPublicPage = useCallback(async () => {
    const current = queryRef.current;
    const page = await fetchCatalogListingPage({
      q: current.q,
      topic: current.topic,
      section: current.section,
      access: current.access,
      class: current.class,
      sort: current.sort,
      limit: current.limit,
    });

    if (!page) {
      return;
    }

    applyPublicPage(page);
  }, [applyPublicPage]);

  useLayoutEffect(() => {
    const scrollY = pendingScrollRef.current;

    if (scrollY == null) {
      return;
    }

    pendingScrollRef.current = null;
    restoreWindowScrollY(scrollY);
  }, [items]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(
        buildCatalogListingApiUrl({
          ...query,
          cursor: nextCursor,
        }),
        { headers: { Accept: "application/json" } },
      );

      if (!response.ok) {
        throw new Error("catalog_page_unavailable");
      }

      const payload = (await response.json()) as CatalogListingResponse;
      const nextItems = Array.isArray(payload.items) ? payload.items : [];

      setItems((current) => {
        const seen = new Set(current.map((item) => item.publication_id));
        return [
          ...current,
          ...nextItems.filter((item) => !seen.has(item.publication_id)),
        ];
      });
      setNextCursor(payload.nextCursor ?? null);
    } catch {
      setLoadError("Не удалось загрузить ещё материалы.");
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [nextCursor, query]);

  useEffect(() => {
    const node = sentinelRef.current;

    if (!node || !nextCursor) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "480px 0px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [loadMore, nextCursor]);

  return (
    <>
      <LivePublicContentSync refresh={refreshPublicPage} />
      {items.length === 0 ? (
        emptyState
      ) : (
        <section
          className={`mt-5 ${platformBottomContentPaddingClass}`}
          aria-label="Каталог аудиопродуктов"
        >
          <ul data-catalog-product-grid className="catalog-product-grid">
            {items.map((product) => (
              <li key={product.publication_id} className="min-w-0">
                <CatalogProductGridCard
                  product={product}
                  isAuthenticated={isAuthenticated}
                  signInReturnPath={signInReturnPath}
                />
              </li>
            ))}
          </ul>

          <div ref={sentinelRef} aria-hidden="true" className="h-px" />

          {nextCursor ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={isLoading}
                className="inline-flex min-h-11 items-center rounded-full border border-[#ddcfef] bg-white px-5 py-2 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
              >
                {isLoading ? "Загрузка…" : "Загрузить ещё"}
              </button>
            </div>
          ) : null}

          {loadError ? (
            <p className="mt-3 text-center text-sm text-[#b42318]">{loadError}</p>
          ) : null}
        </section>
      )}
    </>
  );
}
