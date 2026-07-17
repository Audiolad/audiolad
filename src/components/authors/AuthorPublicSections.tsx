"use client";

import { useState } from "react";

import type { AuthorPublicProduct } from "@/lib/authors/public-page";
import { isProductFree } from "@/lib/products/price-format";

import AuthorPublicProductCard from "./AuthorPublicProductCard";

type AuthorFeaturedSectionProps = {
  products: AuthorPublicProduct[];
};

export default function AuthorFeaturedSection({
  products,
}: AuthorFeaturedSectionProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="mt-10" aria-labelledby="author-featured-heading">
      <h2 id="author-featured-heading" className="text-[22px] font-semibold xl:text-[24px]">
        Рекомендуем начать
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <AuthorPublicProductCard
            key={product.id}
            product={product}
            variant="featured"
          />
        ))}
      </div>
    </section>
  );
}

export type AuthorProductFilter = "all" | "free" | "programs" | "practices";

function matchesFilter(
  product: AuthorPublicProduct,
  filter: AuthorProductFilter,
): boolean {
  switch (filter) {
    case "free":
      return isProductFree(product.is_free, product.price);
    case "programs":
      return product.isProgram;
    case "practices":
      return !product.isProgram;
    default:
      return true;
  }
}

type AuthorProductsSectionProps = {
  products: AuthorPublicProduct[];
  initialCount?: number;
};

export function AuthorProductsSection({
  products,
  initialCount = 8,
}: AuthorProductsSectionProps) {
  const [activeFilter, setActiveFilter] = useState<AuthorProductFilter>("all");
  const [expanded, setExpanded] = useState(false);

  if (products.length === 0) {
    return (
      <section className="mt-10" aria-labelledby="author-products-heading">
        <h2 id="author-products-heading" className="text-[22px] font-semibold xl:text-[24px]">
          Аудиопродукты
        </h2>
        <p className="mt-4 rounded-[20px] border border-[#eadff8] bg-[#faf6ff] px-4 py-4 text-sm leading-6 text-[#7d70a2]">
          У автора пока нет опубликованных продуктов.
        </p>
      </section>
    );
  }

  const filters = (
    [
      { key: "all" as const, label: "Все" },
      { key: "free" as const, label: "Бесплатные" },
      { key: "programs" as const, label: "Программы" },
      { key: "practices" as const, label: "Практики" },
    ] satisfies Array<{ key: AuthorProductFilter; label: string }>
  ).filter((filter) =>
    products.some((product) => matchesFilter(product, filter.key)),
  );

  const filteredProducts = products.filter((product) =>
    matchesFilter(product, activeFilter),
  );

  const visibleProducts = expanded
    ? filteredProducts
    : filteredProducts.slice(0, initialCount);

  const canToggle = filteredProducts.length > initialCount;

  return (
    <section className="mt-10" aria-labelledby="author-products-heading">
      <h2 id="author-products-heading" className="text-[22px] font-semibold xl:text-[24px]">
        Аудиопродукты
      </h2>

      {filters.length > 1 ? (
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Фильтр продуктов автора"
        >
          {filters.map((filter) => {
            const isActive = activeFilter === filter.key;

            return (
              <button
                key={filter.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveFilter(filter.key);
                  setExpanded(false);
                }}
                className={`inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
                  isActive
                    ? "border-[#7042c5] bg-[#7042c5] text-white"
                    : "border-[#ddcfef] bg-white text-[#7042c5]"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleProducts.map((product) => (
          <AuthorPublicProductCard key={product.id} product={product} />
        ))}
      </div>

      {canToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[#c6afe6] px-5 py-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {expanded ? "Свернуть" : "Показать все"}
        </button>
      ) : null}
    </section>
  );
}
