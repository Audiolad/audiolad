"use client";

import {
  CATALOG_PRODUCT_SORT_OPTIONS,
  type CatalogPublicSort,
} from "@/lib/catalog/listing-filters";

type MaxCatalogProductSortProps = {
  sort: CatalogPublicSort;
  onChange: (sort: CatalogPublicSort) => void;
};

export default function MaxCatalogProductSort({
  sort,
  onChange,
}: MaxCatalogProductSortProps) {
  return (
    <nav
      className="mt-3"
      aria-label="Сортировка каталога"
      data-max-catalog-product-sort
    >
      <div className="flex min-w-0 flex-wrap gap-2">
        {CATALOG_PRODUCT_SORT_OPTIONS.map((option) => {
          const isActive = option.value === sort;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
              className={`inline-flex min-h-10 items-center rounded-full border px-3 py-1.5 text-sm ${
                isActive
                  ? "border-[#7042c5] bg-[#7042c5] text-white"
                  : "border-[#ddcfef] bg-white text-[#7042c5]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}