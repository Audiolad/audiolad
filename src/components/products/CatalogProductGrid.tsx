"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import LivePublicContentSync from "@/components/public-content/LivePublicContentSync";
import CatalogProductGridCard from "@/components/products/CatalogProductGridCard";
import type { CatalogCard } from "@/lib/catalog/dto";
import {
  CATALOG_LISTING_PAGE_SIZE,
  type CatalogListingQuery,
} from "@/lib/catalog/listing-contract";
import { useFlushPendingLibrarySave } from "@/lib/library/use-catalog-library-save";
import { platformBottomContentPaddingClass } from "@/lib/navigation/bottom-nav";
import {
  catalogListingUnchanged,
  createSerialTaskQueue,
  fetchCatalogListingPage,
  fetchCatalogListingToLoadedDepth,
  mergeLoadedCatalogWindow,
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
  const loadQueuedRef = useRef(false);
  const enqueueRef = useRef(createSerialTaskQueue());
  const queryRef = useRef(query);
  const itemsRef = useRef(items);
  const nextCursorRef = useRef(nextCursor);
  const pendingScrollRef = useRef<number | null>(null);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useFlushPendingLibrarySave(isAuthenticated);

  const refreshPublicPage = useCallback(async () => {
    await enqueueRef.current(async () => {
      const current = queryRef.current;
      const loadedIds = itemsRef.current.map((item) => item.publication_id);
      const page = await fetchCatalogListingToLoadedDepth(
        {
          q: current.q,
          topic: current.topic,
          section: current.section,
          access: current.access,
          class: current.class,
          sort: current.sort,
          limit: current.limit || CATALOG_LISTING_PAGE_SIZE,
        },
        loadedIds,
      );

      if (!page) {
        return;
      }

      const nextItems = mergeLoadedCatalogWindow(page.items);
      nextCursorRef.current = page.nextCursor;

      if (catalogListingUnchanged(itemsRef.current, nextItems)) {
        setNextCursor(page.nextCursor);
        return;
      }

      pendingScrollRef.current = typeof window === "undefined" ? null : window.scrollY;
      itemsRef.current = nextItems;
      setItems(nextItems);
      setNextCursor(page.nextCursor);
    });
  }, []);

  useLayoutEffect(() => {
    const scrollY = pendingScrollRef.current;

    if (scrollY == null) {
      return;
    }

    pendingScrollRef.current = null;
    restoreWindowScrollY(scrollY);
  }, [items]);

  const loadMore = useCallback(async () => {
    if (!nextCursorRef.current || loadQueuedRef.current) {
      return;
    }

    loadQueuedRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    try {
      await enqueueRef.current(async () => {
        const cursor = nextCursorRef.current;

        if (!cursor) {
          return;
        }

        const current = queryRef.current;
        const page = await fetchCatalogListingPage({
          q: current.q,
          topic: current.topic,
          section: current.section,
          access: current.access,
          class: current.class,
          sort: current.sort,
          limit: current.limit || CATALOG_LISTING_PAGE_SIZE,
          cursor,
        });

        if (!page) {
          throw new Error("catalog_page_unavailable");
        }

        const seen = new Set(itemsRef.current.map((item) => item.publication_id));
        const nextItems = [
          ...itemsRef.current,
          ...page.items.filter((item) => item.publication_id && !seen.has(item.publication_id)),
        ];
        itemsRef.current = nextItems;
        nextCursorRef.current = page.nextCursor;
        setItems(nextItems);
        setNextCursor(page.nextCursor);
      });
    } catch {
      setLoadError("Не удалось загрузить ещё материалы.");
    } finally {
      loadQueuedRef.current = false;
      setIsLoading(false);
    }
  }, []);

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
