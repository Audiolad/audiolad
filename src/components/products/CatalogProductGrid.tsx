"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import LivePublicContentSync from "@/components/public-content/LivePublicContentSync";
import CatalogProductGridCard from "@/components/products/CatalogProductGridCard";
import type { CatalogCard } from "@/lib/catalog/dto";
import {
  CATALOG_LISTING_PAGE_SIZE,
  type CatalogListingQuery,
} from "@/lib/catalog/listing-contract";
import {
  consumeHistoryTraversal,
  ensureHistoryTraversalTracking,
} from "@/lib/catalog/history-traversal";
import {
  isCatalogPath,
  pickCatalogReturnSnapshot,
  writeCatalogReturnSnapshot,
} from "@/lib/catalog/return-state";
import { readCatalogScrollY, restoreCatalogScroll } from "@/lib/catalog/return-scroll";
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

if (typeof window !== "undefined") {
  // Must be listening before the visitor leaves, so Back is recognised.
  ensureHistoryTraversalTracking();
}

function currentHref(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

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
  const restoreTargetRef = useRef<{ y: number; count: number } | null>(null);
  const restoreDecidedRef = useRef(false);
  const hrefRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const exitedToRef = useRef<string | null>(null);
  const exitedAtRef = useRef<number | null>(null);
  const authRef = useRef(isAuthenticated);

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

  // Back / Forward to the same catalog URL: bring back the loaded pages and the
  // scroll position before the first paint. Fresh visits never restore.
  useLayoutEffect(() => {
    if (restoreDecidedRef.current) {
      return;
    }

    restoreDecidedRef.current = true;
    const storage = getSessionStorage();
    const href = currentHref();
    hrefRef.current = href;

    const snapshot = pickCatalogReturnSnapshot({
      storage,
      href,
      authenticated: authRef.current,
      now: Date.now(),
      isHistoryTraversal: consumeHistoryTraversal(),
    });

    if (!snapshot) {
      return;
    }

    itemsRef.current = snapshot.items;
    nextCursorRef.current = snapshot.nextCursor;
    restoreTargetRef.current = { y: snapshot.scrollY, count: snapshot.items.length };
    setItems(snapshot.items);
    setNextCursor(snapshot.nextCursor);
  }, []);

  useLayoutEffect(() => {
    const target = restoreTargetRef.current;

    if (!target || items.length < target.count) {
      return;
    }

    restoreTargetRef.current = null;
    const cancel = restoreCatalogScroll(target.y);
    // Cards may have changed while the visitor was away (price, saved heart):
    // quietly re-sync; the existing refresh keeps the scroll position.
    const timer = window.setTimeout(() => void refreshPublicPage(), 1200);

    return () => {
      cancel();
      window.clearTimeout(timer);
    };
  }, [items, refreshPublicPage]);

  // Keep the return snapshot current without serialising on every scroll tick:
  // scrolling / paging only mark the state dirty (the scroll position is a
  // cheap number kept in a ref); the JSON is written once after the visitor
  // pauses (debounce, in idle time) and synchronously when the page is left
  // (link click, pagehide, tab hidden, Back/Forward). Nothing is lost: the
  // flush always uses the latest items, cursor and scroll position.
  const scheduleSaveRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const storage = getSessionStorage();
    let dirty = false;
    let timer: number | null = null;
    let idle: number | null = null;
    let lastScrollY = readCatalogScrollY();

    const cancelPending = () => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }

      if (idle != null) {
        window.cancelIdleCallback?.(idle);
        idle = null;
      }
    };

    // `force` is for Back / Forward, where the URL already changed but the
    // grid state still belongs to `hrefRef`.
    const flush = (force = false) => {
      cancelPending();

      const href = hrefRef.current;

      if (
        !dirty ||
        !href ||
        leavingRef.current ||
        restoreTargetRef.current !== null ||
        (!force &&
          (!isCatalogPath(window.location.pathname) || currentHref() !== href))
      ) {
        return;
      }

      dirty = false;
      writeCatalogReturnSnapshot(storage, {
        v: 1,
        href,
        authenticated: authRef.current,
        items: itemsRef.current,
        nextCursor: nextCursorRef.current,
        scrollY: force ? lastScrollY : readCatalogScrollY(),
        savedAt: Date.now(),
        exitedTo: exitedToRef.current,
        exitedAt: exitedAtRef.current,
      });
    };

    const schedule = () => {
      dirty = true;

      if (timer != null || idle != null) {
        return;
      }

      timer = window.setTimeout(() => {
        timer = null;

        if (typeof window.requestIdleCallback === "function") {
          idle = window.requestIdleCallback(() => {
            idle = null;
            flush();
          }, { timeout: 1500 });
        } else {
          flush();
        }
      }, 600);
    };

    scheduleSaveRef.current = schedule;

    const onScroll = () => {
      lastScrollY = readCatalogScrollY();
      schedule();
    };
    const onUserScrollIntent = () => {
      leavingRef.current = false;
    };
    const onPageHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    const onPopState = () => flush(true);
    const onClickCapture = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest?.("a[href]");

      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") {
        return;
      }

      const url = new URL(anchor.href, window.location.href);

      if (url.origin !== window.location.origin || isCatalogPath(url.pathname)) {
        return;
      }

      // Freeze the position now: the next page may reset scroll before we unmount.
      exitedToRef.current = url.pathname;
      exitedAtRef.current = Date.now();
      dirty = true;
      flush();
      leavingRef.current = true;
    };

    // Entering (or coming back to) the catalog: one write so the previous
    // "exited to" marker is dropped as soon as the visitor is here again.
    dirty = true;
    flush();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("touchmove", onUserScrollIntent, { passive: true });
    document.addEventListener("wheel", onUserScrollIntent, { passive: true });
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("popstate", onPopState);

    return () => {
      // Unmount (client navigation away): last chance to persist pending state.
      flush(true);
      cancelPending();
      scheduleSaveRef.current = () => undefined;
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("touchmove", onUserScrollIntent);
      document.removeEventListener("wheel", onUserScrollIntent);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  // More pages loaded / refreshed: mark dirty, write later (not per render).
  useEffect(() => {
    scheduleSaveRef.current();
  }, [items, nextCursor]);

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
