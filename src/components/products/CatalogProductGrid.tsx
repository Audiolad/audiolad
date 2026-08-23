"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CatalogProductGridCard from "@/components/products/CatalogProductGridCard";
import {
  buildCatalogListingApiUrl,
  type CatalogListingItem,
  type CatalogListingQuery,
} from "@/lib/catalog/listing-contract";

type CatalogProductGridProps = {
  initialItems: CatalogListingItem[];
  initialNextCursor: string | null;
  query: Omit<CatalogListingQuery, "cursor">;
};

type CatalogListingResponse = {
  items?: CatalogListingItem[];
  nextCursor?: string | null;
};

export default function CatalogProductGrid({
  initialItems,
  initialNextCursor,
  query,
}: CatalogProductGridProps) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);

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
        const seen = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...nextItems.filter((item) => !seen.has(item.id)),
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

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mt-5" aria-label="Каталог аудиопродуктов">
      <ul data-catalog-product-grid className="catalog-product-grid">
        {items.map((product) => (
          <li key={product.id}>
            <CatalogProductGridCard product={product} />
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
  );
}
